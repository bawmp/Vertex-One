import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, serviceReservable } from "@/db/schema";
import { modifierServiceReservable } from "@/lib/actions/reservations";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

/**
 * Modifier un service de réservation déjà créé : Administrateur seul, jamais le service d'une AUTRE entreprise (même en
 * connaissant son identifiant), validation des valeurs, et le reste du service reste intact en cas de refus.
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Service Modif A ${suffixe}`;
const nomB = `TEST Service Modif B ${suffixe}`;
let a = "", b = "", adminA = "", employeA = "", adminB = "", serviceA = "", serviceB = "";

const formulaire = (champs: Record<string, string>) => {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) f.set(cle, valeur);
  return f;
};
// Table protégée par RLS : toute lecture passe par l'entreprise propriétaire (le service d'une autre entreprise reste invisible).
const lire = async (id: string, entrepriseId = a) => (await avecEntreprise(entrepriseId, (tx) => tx.select().from(serviceReservable).where(eq(serviceReservable.id, id))))[0];

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  const u = async (entrepriseId: string, prefixe: string, role: "ADMIN" | "EMPLOYE") =>
    (await db.insert(utilisateur).values({ entrepriseId, email: `${prefixe}-${suffixe}@vertexone.test`, nomComplet: prefixe, role }).returning({ id: utilisateur.id }))[0].id;
  adminA = await u(a, "admin-a", "ADMIN");
  employeA = await u(a, "employe-a", "EMPLOYE");
  adminB = await u(b, "admin-b", "ADMIN");
  [{ id: serviceA }] = await avecEntreprise(a, (tx) =>
    tx
      .insert(serviceReservable)
      .values({ entrepriseId: a, nom: "Coupe homme", description: "Coupe classique", dureeMinutes: 30, dureeTamponMinutes: 5, prixFcfa: 3000, creeParId: adminA })
      .returning({ id: serviceReservable.id })
  );
  [{ id: serviceB }] = await avecEntreprise(b, (tx) =>
    tx.insert(serviceReservable).values({ entrepriseId: b, nom: "Massage", dureeMinutes: 60, prixFcfa: 10000, creeParId: adminB }).returning({ id: serviceReservable.id })
  );
}, 90_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 90_000);

describe("Réservations — modifier un service existant", () => {
  test("l'Administrateur modifie nom, description, durée, battement et prix", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const resultat = await modifierServiceReservable(
      formulaire({ serviceId: serviceA, nom: "  Coupe homme premium  ", description: "Avec shampoing", dureeMinutes: "45", dureeTamponMinutes: "10", prixFcfa: "4500" })
    );
    expect(resultat).toBeNull();
    const s = await lire(serviceA);
    expect(s).toMatchObject({ nom: "Coupe homme premium", description: "Avec shampoing", dureeMinutes: 45, dureeTamponMinutes: 10, prixFcfa: 4500, actif: true });
  }, 90_000);

  test("une description vidée est effacée (null), le service reste actif", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    expect(await modifierServiceReservable(formulaire({ serviceId: serviceA, nom: "Coupe homme premium", description: "", dureeMinutes: "45", dureeTamponMinutes: "10", prixFcfa: "4500" }))).toBeNull();
    const s = await lire(serviceA);
    expect(s.description).toBeNull();
    expect(s.actif).toBe(true);
  }, 90_000);

  test("un Employé ne peut pas modifier un service (réservé à l'Administrateur)", async () => {
    connecte = { utilisateurId: employeA, entrepriseId: a, role: "EMPLOYE" };
    const resultat = await modifierServiceReservable(formulaire({ serviceId: serviceA, nom: "Piraté", dureeMinutes: "5", prixFcfa: "0" }));
    expect(resultat?.erreur).toContain("Administrateur");
    expect((await lire(serviceA)).nom).toBe("Coupe homme premium");
  }, 90_000);

  test("valeurs invalides refusées : nom vide, durée inférieure à 5 minutes, prix négatif — rien n'est modifié", async () => {
    connecte = { utilisateurId: adminA, entrepriseId: a, role: "ADMIN" };
    const base = { serviceId: serviceA, nom: "X", dureeMinutes: "30", dureeTamponMinutes: "0", prixFcfa: "1000" };
    expect((await modifierServiceReservable(formulaire({ ...base, nom: "   " })))?.erreur).toBeTruthy();
    expect((await modifierServiceReservable(formulaire({ ...base, dureeMinutes: "3" })))?.erreur).toContain("5 minutes");
    expect((await modifierServiceReservable(formulaire({ ...base, prixFcfa: "-1" })))?.erreur).toContain("prix");
    expect(await lire(serviceA)).toMatchObject({ nom: "Coupe homme premium", dureeMinutes: 45, prixFcfa: 4500 });
  }, 90_000);

  test("FUITE ENTRE ENTREPRISES : l'Administrateur d'une autre entreprise ne peut pas modifier ce service, même avec son identifiant", async () => {
    connecte = { utilisateurId: adminB, entrepriseId: b, role: "ADMIN" };
    const resultat = await modifierServiceReservable(formulaire({ serviceId: serviceA, nom: "Détourné", dureeMinutes: "5", dureeTamponMinutes: "0", prixFcfa: "1" }));
    expect(resultat?.erreur).toBe("Service introuvable.");
    expect(await lire(serviceA)).toMatchObject({ nom: "Coupe homme premium", dureeMinutes: 45, prixFcfa: 4500 });
    // Et son propre service reste modifiable.
    expect(await modifierServiceReservable(formulaire({ serviceId: serviceB, nom: "Massage relaxant", dureeMinutes: "60", dureeTamponMinutes: "0", prixFcfa: "12000" }))).toBeNull();
    expect((await lire(serviceB, b)).nom).toBe("Massage relaxant");
  }, 90_000);

  test("sans session, l'action redirige vers la connexion", async () => {
    connecte = null;
    await expect(modifierServiceReservable(formulaire({ serviceId: serviceA, nom: "X", dureeMinutes: "30" }))).rejects.toThrow("REDIRECT /connexion");
  }, 90_000);
});
