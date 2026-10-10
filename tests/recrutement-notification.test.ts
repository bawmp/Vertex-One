import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { candidature, entreprise, parametreRecrutement, posteOuvert, utilisateur } from "@/db/schema";
import { changerStatutEtPreparerEmail, gabaritStatutCandidature, type StatutCandidature } from "@/lib/recrutement/notification";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Recrutement Notif A ${suffixe}`;
const nomB = `TEST Recrutement Notif B ${suffixe}`;

let entrepriseA = "";
let entrepriseB = "";
let adminA = "";
let adminB = "";
let posteA = "";

async function creerCandidature(nom: string, email: string | null) {
  const [c] = await avecEntreprise(entrepriseA, (tx) =>
    tx
      .insert(candidature)
      .values({ entrepriseId: entrepriseA, posteId: posteA, nom, telephone: "690111222", email, cvCleStockage: `cv-${nom}`, cvNomFichier: "cv.pdf", cvTypeMime: "application/pdf", cvTailleOctets: 10 })
      .returning({ id: candidature.id })
  );
  return c.id;
}

const statutDe = (id: string) => avecEntreprise(entrepriseA, async (tx) => (await tx.select({ s: candidature.statut }).from(candidature).where(eq(candidature.id, id)))[0]?.s);

const changer = (id: string, statut: StatutCandidature, prevenir = true) =>
  avecEntreprise(entrepriseA, (tx) => changerStatutEtPreparerEmail(tx, { entrepriseId: entrepriseA, utilisateurId: adminA, candidatureId: id, statut, prevenir }));

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  entrepriseA = a.id;
  entrepriseB = b.id;
  const [ua] = await db.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `rh-a-${suffixe}@vertexone.test`, nomComplet: "RH A", role: "ADMIN" }).returning({ id: utilisateur.id });
  const [ub] = await db.insert(utilisateur).values({ entrepriseId: entrepriseB, email: `rh-b-${suffixe}@vertexone.test`, nomComplet: "RH B", role: "ADMIN" }).returning({ id: utilisateur.id });
  adminA = ua.id;
  adminB = ub.id;
  const [p] = await avecEntreprise(entrepriseA, (tx) => tx.insert(posteOuvert).values({ entrepriseId: entrepriseA, titre: "Comptable <b>senior</b>", creeParId: adminA }).returning({ id: posteOuvert.id }));
  posteA = p.id;
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Gabarit — email de changement de statut", () => {
  test("chaque statut (sauf « Reçue ») produit un email qui nomme le poste et l'entreprise, et « Reçue » n'en produit aucun", () => {
    for (const statut of ["EN_EXAMEN", "ENTRETIEN", "OFFRE", "EMBAUCHE", "REJETEE"] as const) {
      const g = gabaritStatutCandidature({ nomCandidat: "Awa", titrePoste: "Comptable", nomEntreprise: "Beau & Bon", statut });
      expect(g, statut).not.toBeNull();
      expect(g!.subject, statut).toContain("Comptable");
      expect(g!.html, statut).toContain("Bonjour Awa");
      expect(g!.html, statut).toContain("Beau &amp; Bon");
    }
    expect(gabaritStatutCandidature({ nomCandidat: "Awa", titrePoste: "Comptable", nomEntreprise: "X", statut: "RECUE" })).toBeNull();
  });

  test("tout texte saisi par un utilisateur est échappé dans le HTML", () => {
    const g = gabaritStatutCandidature({ nomCandidat: "<img src=x onerror=alert(1)>", titrePoste: "<script>x</script>", nomEntreprise: "<b>Ent</b>", statut: "ENTRETIEN" })!;
    expect(g.html).not.toContain("<script>");
    expect(g.html).not.toContain("<img");
    expect(g.html).not.toContain("<b>Ent</b>");
  });

  test("le rejet reste courtois : remerciement, pas de motif inventé", () => {
    const g = gabaritStatutCandidature({ nomCandidat: "Awa", titrePoste: "Comptable", nomEntreprise: "Beau", statut: "REJETEE" })!;
    expect(g.html).toContain("Nous vous remercions");
    expect(g.html).not.toMatch(/insuffisant|incompétent|trop/i);
  });
});

describe("Changement de statut — email au candidat (base réelle)", () => {
  test("un changement de statut prépare l'email du candidat, adressé à lui, au nom de l'entreprise, avec « répondre à » le recruteur", async () => {
    const id = await creerCandidature("Awa Test", "awa@exemple.test");
    const email = await changer(id, "ENTRETIEN");
    expect(await statutDe(id)).toBe("ENTRETIEN");
    expect(email).not.toBeNull();
    expect(email!.to).toBe("awa@exemple.test");
    expect(email!.nomExpediteur).toBe(nomA);
    expect(email!.replyTo).toBe(`rh-a-${suffixe}@vertexone.test`);
    expect(email!.subject).toContain("Comptable");
    expect(email!.html).not.toContain("<b>senior</b>"); // le titre du poste est échappé
    expect(email!.html).toContain("&lt;b&gt;senior&lt;/b&gt;");
  });

  test("un statut inchangé n'envoie rien", async () => {
    const id = await creerCandidature("Sans Changement", "sc@exemple.test");
    await changer(id, "EN_EXAMEN");
    expect(await changer(id, "EN_EXAMEN")).toBeNull();
  });

  test("revenir à « Reçue » (rétablissement) n'envoie rien", async () => {
    const id = await creerCandidature("Retour Recue", "rr@exemple.test");
    await changer(id, "REJETEE", false);
    expect(await changer(id, "RECUE")).toBeNull();
    expect(await statutDe(id)).toBe("RECUE");
  });

  test("« ne pas prévenir » (annulation) change le statut mais n'envoie rien", async () => {
    const id = await creerCandidature("Annulee", "an@exemple.test");
    expect(await changer(id, "REJETEE", false)).toBeNull();
    expect(await statutDe(id)).toBe("REJETEE");
  });

  test("un candidat sans adresse email change de statut sans erreur et sans email", async () => {
    const id = await creerCandidature("Sans Email", null);
    expect(await changer(id, "OFFRE")).toBeNull();
    expect(await statutDe(id)).toBe("OFFRE");
  });

  test("l'entreprise qui coupe les notifications n'envoie rien, le statut change quand même", async () => {
    await avecEntreprise(entrepriseA, (tx) => tx.insert(parametreRecrutement).values({ entrepriseId: entrepriseA, slug: `notif-${suffixe}`, notifierCandidats: false }));
    const id = await creerCandidature("Coupe", "co@exemple.test");
    expect(await changer(id, "EMBAUCHE")).toBeNull();
    expect(await statutDe(id)).toBe("EMBAUCHE");
    await avecEntreprise(entrepriseA, (tx) => tx.update(parametreRecrutement).set({ notifierCandidats: true }).where(eq(parametreRecrutement.entrepriseId, entrepriseA)));
    const id2 = await creerCandidature("Reactive", "re@exemple.test");
    expect(await changer(id2, "EN_EXAMEN")).not.toBeNull();
  });

  test("FUITE MULTI-TENANT : une autre entreprise ne peut ni changer le statut ni déclencher un email pour une candidature qui n'est pas la sienne", async () => {
    const id = await creerCandidature("Cible A", "cible@exemple.test");
    const resultat = await avecEntreprise(entrepriseB, (tx) => changerStatutEtPreparerEmail(tx, { entrepriseId: entrepriseB, utilisateurId: adminB, candidatureId: id, statut: "REJETEE", prevenir: true }));
    expect(resultat).toBeNull();
    expect(await statutDe(id)).toBe("RECUE"); // intact
  });
});
