import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { candidature, entreprise, modeleEmail, parametreRecrutement, posteOuvert, utilisateur } from "@/db/schema";
import { changerStatutEtPreparerEmail, construireEmailStatut, typeModelePourStatut, type StatutCandidature } from "@/lib/recrutement/notification";
import { modeleParDefaut, TYPES_MODELE_CANDIDATURE } from "@/lib/email/modeles";
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

describe("Modèles d'email des candidatures", () => {
  const vars = { candidat: "Awa", poste: "Comptable", entreprise: "Beau & Bon" };

  test("chaque statut (sauf « Reçue ») a un modèle par défaut qui nomme le candidat, le poste et l'entreprise ; « Reçue » n'en a aucun", () => {
    for (const statut of ["EN_EXAMEN", "ENTRETIEN", "OFFRE", "EMBAUCHE", "REJETEE"] as const) {
      const type = typeModelePourStatut(statut);
      expect(type, statut).not.toBeNull();
      const { subject, html } = construireEmailStatut(modeleParDefaut(type!), vars);
      expect(subject, statut).toContain("Comptable");
      expect(html, statut).toContain("Bonjour Awa");
      expect(html, statut).toContain("Beau &amp; Bon");
    }
    expect(typeModelePourStatut("RECUE")).toBeNull();
    expect(TYPES_MODELE_CANDIDATURE).toHaveLength(5);
  });

  test("tout texte saisi par un utilisateur est échappé dans le HTML, y compris dans un modèle personnalisé", () => {
    const g = construireEmailStatut({ objet: "Objet {{poste}}", corps: "Salut {{candidat}}, <i>{{poste}}</i> chez {{entreprise}}" }, { candidat: "<img src=x onerror=alert(1)>", poste: "<script>x</script>", entreprise: "<b>Ent</b>" });
    expect(g.html).not.toContain("<script>");
    expect(g.html).not.toContain("<img");
    expect(g.html).not.toContain("<b>Ent</b>");
    expect(g.html).not.toContain("<i>"); // le HTML écrit dans le modèle lui-même est aussi neutralisé
  });

  test("l'objet tient sur une seule ligne (aucun saut de ligne dans un en-tête d'email)", () => {
    const g = construireEmailStatut({ objet: "Ligne 1\r\nBcc: pirate@exemple.test", corps: "x" }, vars);
    expect(g.subject).not.toMatch(/[\r\n]/);
  });

  test("une variable inconnue reste telle quelle plutôt que de disparaître", () => {
    expect(construireEmailStatut({ objet: "{{inconnue}} {{poste}}", corps: "x" }, vars).subject).toBe("{{inconnue}} Comptable");
  });

  test("le rejet par défaut reste courtois : remerciement, pas de motif inventé", () => {
    const g = construireEmailStatut(modeleParDefaut("CANDIDATURE_REJETEE"), vars);
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

  test("un modèle personnalisé par l'entreprise remplace le texte par défaut ; le supprimer rétablit le défaut", async () => {
    await avecEntreprise(entrepriseA, (tx) =>
      tx.insert(modeleEmail).values({ entrepriseId: entrepriseA, type: "CANDIDATURE_ENTRETIEN", objet: "Rendez-vous pour {{poste}}", corps: "Cher(e) {{candidat}}, passez nous voir chez {{entreprise}}." })
    );
    const id = await creerCandidature("Personnalise", "pe@exemple.test");
    const email = await changer(id, "ENTRETIEN");
    expect(email!.subject).toBe("Rendez-vous pour Comptable <b>senior</b>");
    expect(email!.html).toContain("Cher(e) Personnalise, passez nous voir chez");

    await avecEntreprise(entrepriseA, (tx) => tx.delete(modeleEmail).where(eq(modeleEmail.entrepriseId, entrepriseA)));
    const id2 = await creerCandidature("Defaut", "de@exemple.test");
    const email2 = await changer(id2, "ENTRETIEN");
    expect(email2!.subject).toBe("Entretien pour le poste « Comptable <b>senior</b> »");
  });

  test("FUITE MULTI-TENANT : le modèle personnalisé d'une entreprise n'est jamais utilisé pour une autre", async () => {
    await avecEntreprise(entrepriseB, (tx) => tx.insert(modeleEmail).values({ entrepriseId: entrepriseB, type: "CANDIDATURE_OFFRE", objet: "SECRET B", corps: "texte de B" }));
    const id = await creerCandidature("Voisin", "vo@exemple.test");
    const email = await changer(id, "OFFRE"); // candidature de A
    expect(email!.subject).not.toContain("SECRET B");
    expect(email!.html).not.toContain("texte de B");
  });

  test("FUITE MULTI-TENANT : une autre entreprise ne peut ni changer le statut ni déclencher un email pour une candidature qui n'est pas la sienne", async () => {
    const id = await creerCandidature("Cible A", "cible@exemple.test");
    const resultat = await avecEntreprise(entrepriseB, (tx) => changerStatutEtPreparerEmail(tx, { entrepriseId: entrepriseB, utilisateurId: adminB, candidatureId: id, statut: "REJETEE", prevenir: true }));
    expect(resultat).toBeNull();
    expect(await statutDe(id)).toBe("RECUE"); // intact
  });
});
