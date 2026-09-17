import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and, asc, count } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, formulaire, champFormulaire, reponseFormulaire, valeurChampReponse, lead } from "@/db/schema";

/**
 * src/lib/actions/one-form.ts importe recupererUtilisateurConnecte()
 * (src/lib/session.ts, protégé par "server-only") au niveau module — même en
 * appelant uniquement soumettreReponseFormulaire() (sa seule action sans
 * vérification de session), l'import du fichier entier échoue hors requête
 * HTTP réelle. Comme tests/minuteur-logique.test.ts et les autres tests
 * *-logique de ce dépôt (aucun n'importe depuis src/lib/actions/*),
 * `soumettreReponseFormulaire` est donc reproduite ici à l'identique plutôt
 * qu'importée.
 */
async function soumettreReponseFormulaire(slug: string, formData: FormData): Promise<{ erreur?: string }> {
  const [formulaireCible] = await db.select().from(formulaire).where(and(eq(formulaire.slug, slug), eq(formulaire.publie, true)));
  if (!formulaireCible) return { erreur: "Ce formulaire n'existe pas ou n'est plus disponible." };

  const maintenant = new Date();
  if (formulaireCible.ouvertureLe && maintenant < formulaireCible.ouvertureLe) {
    return { erreur: "Ce formulaire n'est pas encore ouvert aux réponses." };
  }
  if (formulaireCible.fermetureLe && maintenant > formulaireCible.fermetureLe) {
    return { erreur: "Ce formulaire n'accepte plus de réponses." };
  }
  if (formulaireCible.limiteReponses !== null) {
    const total = await avecEntreprise(formulaireCible.entrepriseId, async (tx) => {
      const [{ valeur }] = await tx.select({ valeur: count() }).from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, formulaireCible.id));
      return valeur;
    });
    if (total >= formulaireCible.limiteReponses) {
      return { erreur: "Ce formulaire a atteint son nombre maximal de réponses." };
    }
  }
  // verifierTurnstile() (src/lib/turnstile/client.ts) est fail-open tant que
  // TURNSTILE_SECRET_KEY n'est pas configurée — non reproduite ici, aucun
  // effet en environnement de test sans cette clé.

  const champs = await db.select().from(champFormulaire).where(eq(champFormulaire.formulaireId, formulaireCible.id)).orderBy(asc(champFormulaire.ordre));

  const valeurs: Record<string, string> = {};
  for (const champ of champs) {
    const brut = formData.getAll(champ.id).map(String).filter(Boolean);
    const valeur = brut.join(", ");
    if (champ.obligatoire && !valeur) {
      return { erreur: `Le champ "${champ.libelle}" est obligatoire.` };
    }
    if (valeur) valeurs[champ.id] = valeur;
  }

  await avecEntreprise(formulaireCible.entrepriseId, async (tx) => {
    const [reponse] = await tx
      .insert(reponseFormulaire)
      .values({ entrepriseId: formulaireCible.entrepriseId, formulaireId: formulaireCible.id })
      .returning({ id: reponseFormulaire.id });

    for (const [champId, valeur] of Object.entries(valeurs)) {
      await tx.insert(valeurChampReponse).values({ entrepriseId: formulaireCible.entrepriseId, reponseFormulaireId: reponse.id, champFormulaireId: champId, valeur });
    }

    if (formulaireCible.creerLeadALaReponse) {
      const champTelephone = champs.find((c) => c.type === "TELEPHONE");
      const valeurTelephone = champTelephone ? valeurs[champTelephone.id] : undefined;
      if (valeurTelephone) {
        const champNom = champs.find((c) => c.type === "TEXTE_COURT");
        const champEmail = champs.find((c) => c.type === "EMAIL");
        const [nouveauLead] = await tx
          .insert(lead)
          .values({
            entrepriseId: formulaireCible.entrepriseId,
            nom: (champNom && valeurs[champNom.id]) || formulaireCible.titre,
            telephone: valeurTelephone,
            email: (champEmail && valeurs[champEmail.id]) || undefined,
            assigneAId: formulaireCible.creeParId,
          })
          .returning({ id: lead.id });
        await tx.update(reponseFormulaire).set({ leadId: nouveauLead.id }).where(eq(reponseFormulaire.id, reponse.id));
      }
    }
  });

  return {};
}
describe("One Form — logique métier", () => {
  let entrepriseId: string;
  let utilisateurId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST OneForm Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-oneform-logique@vertexone.test", nomComplet: "Admin OneForm Logique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(valeurChampReponse).where(eq(valeurChampReponse.entrepriseId, entrepriseId));
      await tx.delete(reponseFormulaire).where(eq(reponseFormulaire.entrepriseId, entrepriseId));
      await tx.delete(lead).where(eq(lead.entrepriseId, entrepriseId));
      await tx.delete(champFormulaire).where(eq(champFormulaire.entrepriseId, entrepriseId));
      await tx.delete(formulaire).where(eq(formulaire.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("réordonner les champs recalcule l'ordre de chacun (reproduit reordonnerChamps)", async () => {
    const [form] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(formulaire).values({ entrepriseId, titre: "TEST Ordre", slug: `test-ordre-${entrepriseId}`, creeParId: utilisateurId }).returning({ id: formulaire.id })
    );
    const champs = await avecEntreprise(entrepriseId, async (tx) => {
      const [c1] = await tx.insert(champFormulaire).values({ entrepriseId, formulaireId: form.id, type: "TEXTE_COURT", libelle: "Nom", ordre: 0 }).returning({ id: champFormulaire.id });
      const [c2] = await tx.insert(champFormulaire).values({ entrepriseId, formulaireId: form.id, type: "EMAIL", libelle: "Email", ordre: 1 }).returning({ id: champFormulaire.id });
      return [c1, c2];
    });

    const nouvelOrdre = [champs[1].id, champs[0].id];
    await avecEntreprise(entrepriseId, async (tx) => {
      for (let i = 0; i < nouvelOrdre.length; i++) {
        await tx.update(champFormulaire).set({ ordre: i }).where(eq(champFormulaire.id, nouvelOrdre[i]));
      }
    });

    const releves = await avecEntreprise(entrepriseId, (tx) => tx.select({ id: champFormulaire.id, ordre: champFormulaire.ordre }).from(champFormulaire).where(eq(champFormulaire.formulaireId, form.id)));
    expect(releves.find((r) => r.id === champs[1].id)?.ordre).toBe(0);
    expect(releves.find((r) => r.id === champs[0].id)?.ordre).toBe(1);
  });

  test("soumission publique : refuse quand un champ obligatoire est vide", async () => {
    const [form] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(formulaire).values({ entrepriseId, titre: "TEST Obligatoire", slug: `test-obligatoire-${entrepriseId}`, publie: true, creeParId: utilisateurId }).returning({ id: formulaire.id })
    );
    await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(champFormulaire).values({ entrepriseId, formulaireId: form.id, type: "TEXTE_COURT", libelle: "Votre nom", obligatoire: true, ordre: 0 })
    );

    const resultat = await soumettreReponseFormulaire(`test-obligatoire-${entrepriseId}`, new FormData());
    expect(resultat.erreur).toContain("obligatoire");

    const reponses = await avecEntreprise(entrepriseId, (tx) => tx.select().from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, form.id)));
    expect(reponses).toHaveLength(0);
  });

  test("soumission publique : enregistre la réponse et ses valeurs, sans créer de Lead si l'option est désactivée", async () => {
    const [form] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(formulaire).values({ entrepriseId, titre: "TEST Reponse", slug: `test-reponse-${entrepriseId}`, publie: true, creeParId: utilisateurId, creerLeadALaReponse: false }).returning({ id: formulaire.id })
    );
    const [champNom] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(champFormulaire).values({ entrepriseId, formulaireId: form.id, type: "TEXTE_COURT", libelle: "Votre nom", ordre: 0 }).returning({ id: champFormulaire.id })
    );

    const donnees = new FormData();
    donnees.set(champNom.id, "Jean Test");
    const resultat = await soumettreReponseFormulaire(`test-reponse-${entrepriseId}`, donnees);
    expect(resultat.erreur).toBeUndefined();

    const [reponse] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, form.id)));
    expect(reponse).toBeDefined();
    expect(reponse.leadId).toBeNull();

    const [valeur] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(valeurChampReponse).where(eq(valeurChampReponse.reponseFormulaireId, reponse.id)));
    expect(valeur.valeur).toBe("Jean Test");
  });

  test("soumission publique : crée un Lead quand l'option est activée et qu'un champ Téléphone est rempli", async () => {
    const [form] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(formulaire).values({ entrepriseId, titre: "TEST Lead", slug: `test-lead-${entrepriseId}`, publie: true, creeParId: utilisateurId, creerLeadALaReponse: true }).returning({ id: formulaire.id })
    );
    const [champNom, champTel] = await avecEntreprise(entrepriseId, async (tx) => {
      const [n] = await tx.insert(champFormulaire).values({ entrepriseId, formulaireId: form.id, type: "TEXTE_COURT", libelle: "Votre nom", ordre: 0 }).returning({ id: champFormulaire.id });
      const [t] = await tx.insert(champFormulaire).values({ entrepriseId, formulaireId: form.id, type: "TELEPHONE", libelle: "Téléphone", ordre: 1 }).returning({ id: champFormulaire.id });
      return [n, t];
    });

    const donnees = new FormData();
    donnees.set(champNom.id, "Marie Test");
    donnees.set(champTel.id, "+237600000001");
    const resultat = await soumettreReponseFormulaire(`test-lead-${entrepriseId}`, donnees);
    expect(resultat.erreur).toBeUndefined();

    const [reponse] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, form.id)));
    expect(reponse.leadId).not.toBeNull();

    const [leadCree] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(lead).where(eq(lead.id, reponse.leadId as string)));
    expect(leadCree.nom).toBe("Marie Test");
    expect(leadCree.telephone).toBe("+237600000001");
    expect(leadCree.assigneAId).toBe(utilisateurId);
  });

  test("soumission publique : n'essaie pas de créer de Lead si aucun champ Téléphone n'a de valeur, même si l'option est activée", async () => {
    const [form] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(formulaire).values({ entrepriseId, titre: "TEST Lead Sans Tel", slug: `test-lead-sans-tel-${entrepriseId}`, publie: true, creeParId: utilisateurId, creerLeadALaReponse: true }).returning({ id: formulaire.id })
    );
    const [champNom] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(champFormulaire).values({ entrepriseId, formulaireId: form.id, type: "TEXTE_COURT", libelle: "Votre nom", ordre: 0 }).returning({ id: champFormulaire.id })
    );

    const donnees = new FormData();
    donnees.set(champNom.id, "Sans Téléphone");
    const resultat = await soumettreReponseFormulaire(`test-lead-sans-tel-${entrepriseId}`, donnees);
    expect(resultat.erreur).toBeUndefined();

    const [reponse] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, form.id)));
    expect(reponse.leadId).toBeNull();
  });

  test("soumission publique : refuse pour un formulaire inconnu ou non publié", async () => {
    const resultat = await soumettreReponseFormulaire("slug-inexistant", new FormData());
    expect(resultat.erreur).toBeDefined();
  });

  test("soumission publique : refuse avant la date d'ouverture", async () => {
    const [form] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(formulaire)
        .values({ entrepriseId, titre: "TEST Pas Encore Ouvert", slug: `test-pas-ouvert-${entrepriseId}`, publie: true, creeParId: utilisateurId, ouvertureLe: new Date(Date.now() + 3_600_000) })
        .returning({ id: formulaire.id })
    );

    const resultat = await soumettreReponseFormulaire(`test-pas-ouvert-${entrepriseId}`, new FormData());
    expect(resultat.erreur).toContain("pas encore ouvert");

    const reponses = await avecEntreprise(entrepriseId, (tx) => tx.select().from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, form.id)));
    expect(reponses).toHaveLength(0);
  });

  test("soumission publique : refuse après la date de fermeture", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(formulaire)
        .values({ entrepriseId, titre: "TEST Ferme", slug: `test-ferme-${entrepriseId}`, publie: true, creeParId: utilisateurId, fermetureLe: new Date(Date.now() - 3_600_000) })
        .returning({ id: formulaire.id })
    );

    const resultat = await soumettreReponseFormulaire(`test-ferme-${entrepriseId}`, new FormData());
    expect(resultat.erreur).toContain("n'accepte plus");
  });

  test("soumission publique : refuse une fois la limite de réponses atteinte", async () => {
    const [form] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(formulaire)
        .values({ entrepriseId, titre: "TEST Limite", slug: `test-limite-${entrepriseId}`, publie: true, creeParId: utilisateurId, limiteReponses: 1 })
        .returning({ id: formulaire.id })
    );

    const premiere = await soumettreReponseFormulaire(`test-limite-${entrepriseId}`, new FormData());
    expect(premiere.erreur).toBeUndefined();

    const seconde = await soumettreReponseFormulaire(`test-limite-${entrepriseId}`, new FormData());
    expect(seconde.erreur).toContain("nombre maximal");

    const reponses = await avecEntreprise(entrepriseId, (tx) => tx.select().from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, form.id)));
    expect(reponses).toHaveLength(1);
  });

  // L'envoi effectif de l'email (envoyerEmail(), src/lib/email/client.ts)
  // n'est pas reproduit ici — non testable sans mocker Resend, et déjà
  // couvert par le degré de dégradation propre documenté dans CLAUDE.md
  // (RESEND_API_KEY absente ⇒ avertissement, jamais un crash). Ce test
  // vérifie seulement qu'activer notifierParEmail n'empêche pas la
  // soumission de réussir.
  test("un formulaire avec notifierParEmail activé accepte toujours les réponses", async () => {
    const [form] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(formulaire)
        .values({ entrepriseId, titre: "TEST Notification", slug: `test-notification-${entrepriseId}`, publie: true, creeParId: utilisateurId, notifierParEmail: true })
        .returning({ id: formulaire.id })
    );

    const resultat = await soumettreReponseFormulaire(`test-notification-${entrepriseId}`, new FormData());
    expect(resultat.erreur).toBeUndefined();

    const reponses = await avecEntreprise(entrepriseId, (tx) => tx.select().from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, form.id)));
    expect(reponses).toHaveLength(1);
  });
});
