import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";

// « server-only » interdit l'import hors d'un composant serveur : sans effet pour un test Node.
vi.mock("server-only", () => ({}));

import { db, avecEntreprise } from "@/db/client";
import { entreprise, groupe, utilisateur, contact, devis } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recupererDevisPourClient } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import { mentionGroupe, nomGroupeAAfficher } from "@/lib/pdf/groupe";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Les documents PDF d'une entreprise rattachée à un groupe affichent « Une entreprise du groupe X » (en-tête et pied de
 * page) ; l'entreprise qui porte le même nom que son groupe, ou qui n'en a pas, n'affiche rien. Données réelles (base de
 * test), seul le PDF final est généré en mémoire.
 */
const NOM_MERE = "TEST Pdf Groupe Mere";
const NOM_FILIALE = "TEST Pdf Groupe Filiale";
const NOM_SANS_GROUPE = "TEST Pdf Groupe Seule";
const groupesACreer: string[] = [];
const ids: Record<string, { entrepriseId: string; devisId: string }> = {};

async function creerEntrepriseAvecDevis(nom: string, groupeId: string | null) {
  const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence", groupeId }).returning({ id: entreprise.id });
  const [u] = await db.insert(utilisateur).values({ entrepriseId: e.id, email: `${e.id}@test.local`, nomComplet: "Admin Test", role: "ADMIN" }).returning({ id: utilisateur.id });
  const devisId = await avecEntreprise(e.id, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId: e.id, nom: "Client Test", telephone: "690000000", assigneAId: u.id }).returning({ id: contact.id });
    const [d] = await tx
      .insert(devis)
      .values({ entrepriseId: e.id, numero: "DEV-TEST-0001", contactId: c.id, assigneAId: u.id, creeParId: u.id, dateValidite: new Date(Date.now() + 864e5), montantHT: 1000, montantTVA: 0, montantTTC: 1000 })
      .returning({ id: devis.id });
    return d.id;
  });
  return { entrepriseId: e.id, devisId };
}

describe("PDF — mention du groupe", () => {
  beforeAll(async () => {
    const [g] = await db.insert(groupe).values({ nom: NOM_MERE }).returning({ id: groupe.id });
    groupesACreer.push(g.id);
    ids.filiale = await creerEntrepriseAvecDevis(NOM_FILIALE, g.id);
    ids.mere = await creerEntrepriseAvecDevis(NOM_MERE, g.id);
    ids.seule = await creerEntrepriseAvecDevis(NOM_SANS_GROUPE, null);
  }, 60_000);

  afterAll(async () => {
    for (const nom of [NOM_FILIALE, NOM_MERE, NOM_SANS_GROUPE]) await supprimerEntrepriseDeTest(nom);
    for (const id of groupesACreer) await db.delete(groupe).where(eq(groupe.id, id));
  }, 60_000);

  test("la filiale reçoit le nom du groupe, la maison mère et l'entreprise seule n'en reçoivent pas", async () => {
    const donnees = async (cle: string) => avecEntreprise(ids[cle].entrepriseId, (tx) => recupererDevisPourClient(tx, ids[cle].entrepriseId, ids[cle].devisId));
    expect((await donnees("filiale"))?.entreprise.groupeNom).toBe(NOM_MERE);
    expect((await donnees("mere"))?.entreprise.groupeNom).toBeNull();
    expect((await donnees("seule"))?.entreprise.groupeNom).toBeNull();
  }, 60_000);

  test("le PDF de la filiale se génère avec la mention (et sans elle)", async () => {
    const d = await avecEntreprise(ids.filiale.entrepriseId, (tx) => recupererDevisPourClient(tx, ids.filiale.entrepriseId, ids.filiale.devisId));
    const props = { typeDocument: "DEVIS" as const, numero: "DEV-TEST-0001", dateEmission: new Date(), dateEcheanceOuValidite: new Date(), labelDateSecondaire: "Valable jusqu'au", client: d!.client, lignes: [], montantHT: 1000, montantTVA: 0, montantTTC: 1000 };
    const avec = await rendreDocumentCommercialPDF({ ...props, entreprise: { ...d!.entreprise } });
    const sans = await rendreDocumentCommercialPDF({ ...props, entreprise: { ...d!.entreprise, groupeNom: null } });
    expect(avec.subarray(0, 4).toString()).toBe("%PDF");
    expect(sans.subarray(0, 4).toString()).toBe("%PDF");
    // le document avec la mention contient du texte en plus : il est plus volumineux
    expect(avec.length).toBeGreaterThan(sans.length);
  }, 60_000);

  test("logique pure : mention, accents, casse, absence de groupe", () => {
    expect(mentionGroupe("Global Mobility", "Vertex Technology")).toBe("Une entreprise du groupe Vertex Technology");
    expect(mentionGroupe("Vertex Technology", "VERTEX  technology")).toBeNull();
    expect(mentionGroupe("Café Étoile", "cafe etoile")).toBeNull();
    expect(mentionGroupe("Global Mobility", null)).toBeNull();
    expect(mentionGroupe("Global Mobility", "  ")).toBeNull();
    expect(nomGroupeAAfficher("A", "B")).toBe("B");
  });
});
