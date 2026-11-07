import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Tenant de TEST pour l'audit responsive : plein de valeurs TRÈS longues
 * (noms de 60+ caractères sans espace, numéros de 40 chiffres, emails longs,
 * titres et notes interminables) pour révéler les débordements de texte.
 *
 *   npx tsx scripts/creer-test-long.ts                 -> crée le tenant (idempotent par email admin)
 *   ONLY=contacts,achats npx tsx scripts/creer-test-long.ts  -> rejoue seulement certaines sections sur le tenant existant
 *
 * Base de dev uniquement (DATABASE_URL de .env.local). Aucun email, WhatsApp,
 * paiement ni appel externe ; aucun fichier R2 (seules les métadonnées).
 * Le nom de l'entreprise commence par "TEST " : nettoyable par le nettoyage
 * habituel (entreprise where nom like 'TEST %').
 */
async function main() {
  const { hashPassword } = await import("better-auth/crypto");
  const { createLocalAccountIssuer } = await import("@better-auth/core/db");
  const { eq, and, isNull, inArray } = await import("drizzle-orm");
  const { createId } = await import("@paralleldrive/cuid2");
  const { db, avecEntreprise } = await import("../src/db/client");
  const S = await import("../src/db/schema");
  const { creerUtilisateurChat, idExterneCanal } = await import("../src/lib/chat/client");
  const { assurerCanalGeneral } = await import("../src/lib/messagerie/acces");
  const { calculerMontants } = await import("../src/lib/facturation/calcul");
  const N = await import("../src/lib/facturation/numerotation");
  const V = await import("../src/lib/vault/crypto");

  const ADMIN_EMAIL = "audit-long@vertexone.test";
  const MOT_DE_PASSE = "mot-de-passe-test-12345";
  const NOM_ENTREPRISE =
    "TEST Audit Noms Longs Société Anonyme Camerounaise de Travaux Publics et de Génie Civil du Littoral et de l'Ouest";

  // ---- Générateurs de valeurs longues -----------------------------------
  const mot = (n: number, graine = "Nkoulou-Mbarga-Atangana-Essomba-Ngono-Biyong-") => {
    let s = "";
    while (s.length < n) s += graine;
    return s.slice(0, n).replace(/-$/, "x");
  };
  const NOM70 = "Jean-Baptiste-Emmanuel-Nkoulou-Mbarga-Atangana-Essomba-Ngono-Biyong";
  const NOM_SOCIETE =
    "Société Anonyme Camerounaise de Travaux Publics, de Bâtiment et de Génie Civil de la Région du Littoral";
  const TEL40 = "6901234567890123456789012345678901234567";
  const email = (k: string) => `${mot(48, `${k}-prenom-nom-`)}@${mot(40, "domaine-tres-long-")}.example.test`;
  const PARAGRAPHE =
    "Ceci est une note volontairement très longue pour tester le retour à la ligne dans les cartes, les tableaux et les formulaires : " +
    mot(120) +
    " puis encore du texte normal avec des espaces pour vérifier que les deux cohabitent correctement sur mobile. " +
    "https://www.exemple-de-site-avec-une-adresse-vraiment-tres-longue.example.test/chemin/tres/long/" +
    mot(80, "segment-de-chemin-");
  const JOUR = 24 * 3600 * 1000;
  const dans = (j: number) => new Date(Date.now() + j * JOUR);

  // ---- Tenant -----------------------------------------------------------
  const seulement = (process.env.ONLY ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const [existant] = await db
    .select({ id: S.utilisateur.id, entrepriseId: S.utilisateur.entrepriseId })
    .from(S.utilisateur)
    .where(eq(S.utilisateur.email, ADMIN_EMAIL));
  if (existant && seulement.length === 0) {
    console.log(`Le tenant de test existe déjà (${ADMIN_EMAIL}) — rien à faire. (ONLY=section1,section2 pour rejouer des sections.)`);
    process.exit(0);
  }

  let entrepriseId: string;
  let adminId: string;
  let managerId: string;
  let employeId: string;
  let employe2Id: string;

  const hash = await hashPassword(MOT_DE_PASSE);

  if (!existant) {
    const dixAns = dans(3650);
    const r = await db.transaction(async (tx) => {
      const [ent] = await tx
        .insert(S.entreprise)
        .values({
          nom: NOM_ENTREPRISE,
          secteurProfil: "generique",
          gereStock: true,
          statutAbonnement: "actif",
          planAbonnement: "business",
          essaiFinLe: dans(-30),
          abonnementEcheanceLe: dixAns,
          niu: mot(40, "M0126000000"),
          rccm: "RC/DLA/2020/B/" + mot(40, "0123456789"),
          adresse: mot(90, "Rue-tres-longue-sans-espace-Bonapriso-Akwa-"),
          ville: "Douala",
          managersVoientTout: true,
        })
        .returning({ id: S.entreprise.id });
      const ids: Record<string, string> = {};
      const defs = [
        { cle: "admin", email: ADMIN_EMAIL, nom: `Admin ${NOM70}`, role: "ADMIN" as const },
        { cle: "manager", email: email("manager"), nom: `Manager ${mot(62, "Tchoumbou-Fotso-")}`, role: "MANAGER" as const },
        { cle: "employe", email: email("employe"), nom: `Employé ${mot(70, "Ouandji-Kamdem-")}`, role: "EMPLOYE" as const },
        { cle: "employe2", email: email("employe2"), nom: mot(75, "Abena-Mvondo-Zambo-"), role: "EMPLOYE" as const },
      ];
      for (const d of defs) {
        const [u] = await tx
          .insert(S.utilisateur)
          .values({ entrepriseId: ent.id, email: d.email, nomComplet: d.nom, role: d.role, statut: "ACTIF" })
          .returning({ id: S.utilisateur.id });
        await tx.insert(S.compte).values({
          userId: u.id,
          providerId: "credential",
          issuer: createLocalAccountIssuer("credential"),
          accountId: u.id,
          password: hash,
        });
        ids[d.cle] = u.id;
      }
      await tx.update(S.utilisateur).set({ managerId: ids.manager }).where(inArray(S.utilisateur.id, [ids.employe, ids.employe2]));
      return { entrepriseId: ent.id, ids };
    });
    entrepriseId = r.entrepriseId;
    adminId = r.ids.admin;
    managerId = r.ids.manager;
    employeId = r.ids.employe;
    employe2Id = r.ids.employe2;
    for (const [cle, id] of Object.entries(r.ids)) await creerUtilisateurChat(entrepriseId, id, cle).catch(() => {});
  } else {
    entrepriseId = existant.entrepriseId;
    adminId = existant.id;
    const equipe = await avecEntreprise(entrepriseId, (tx) =>
      tx.select({ id: S.utilisateur.id, role: S.utilisateur.role }).from(S.utilisateur).where(eq(S.utilisateur.entrepriseId, entrepriseId))
    );
    managerId = equipe.find((u) => u.role === "MANAGER")!.id;
    const emps = equipe.filter((u) => u.role === "EMPLOYE");
    employeId = emps[0].id;
    employe2Id = (emps[1] ?? emps[0]).id;
  }

  // ---- Sections (chacune dans son propre point de sauvegarde) -------------
  const ctx: Record<string, any> = {};
  const resultats: string[] = [];

  async function section(nom: string, fn: (tx: any) => Promise<void>, lecture?: (tx: any) => Promise<void>) {
    if (seulement.length && !seulement.includes(nom)) {
      // Section non rejouée : on recharge seulement les ids dont les suivantes ont besoin.
      if (lecture) await avecEntreprise(entrepriseId, (tx) => lecture(tx));
      return;
    }
    try {
      await avecEntreprise(entrepriseId, async (tx) => {
        await fn(tx);
      });
      resultats.push(`OK    ${nom}`);
    } catch (e: any) {
      resultats.push(`ECHEC ${nom} : ${String(e?.cause?.message ?? e?.message ?? e).slice(0, 300)}`);
    }
  }

  const E = entrepriseId;

  // 1. CRM
  await section(
    "crm",
    async (tx) => {
      const comptes = await tx
        .insert(S.compteClient)
        .values([
          { entrepriseId: E, nom: NOM_SOCIETE, niu: mot(40, "M0126") },
          { entrepriseId: E, nom: mot(80, "Groupe-Industriel-") },
          { entrepriseId: E, nom: "Boutique Mode Akwa" },
        ])
        .returning({ id: S.compteClient.id });
      ctx.comptes = comptes.map((c: any) => c.id);
      const contacts = await tx
        .insert(S.contact)
        .values([
          { entrepriseId: E, nom: NOM70, telephone: TEL40, email: email("contact1"), fonction: "Directeur général adjoint chargé du développement des partenariats stratégiques et de la coordination régionale", notes: PARAGRAPHE, compteId: ctx.comptes[0], assigneAId: adminId },
          { entrepriseId: E, nom: mot(80, "Mvondo-Ayissi-"), telephone: "+237" + TEL40, email: email("contact2"), fonction: mot(70, "Responsable-"), notes: PARAGRAPHE, compteId: ctx.comptes[1], assigneAId: managerId },
          { entrepriseId: E, nom: "Marie-Claire Ngo Bakoa-Essomba-Tchakounté-Fouda-Mbassi-Nkodo", telephone: "690 11 12 22", email: email("contact3"), compteId: ctx.comptes[2], assigneAId: adminId },
          { entrepriseId: E, nom: "Aïcha Oumarou", telephone: "655 88 99 00", assigneAId: employeId },
        ])
        .returning({ id: S.contact.id });
      ctx.contacts = contacts.map((c: any) => c.id);
      await tx.insert(S.lead).values([
        { entrepriseId: E, nom: NOM70, societeCliente: NOM_SOCIETE, telephone: TEL40, email: email("lead1"), statut: "NOUVEAU", notes: PARAGRAPHE, assigneAId: adminId },
        { entrepriseId: E, nom: mot(66, "Fokou-Kamga-"), societeCliente: mot(85, "Entreprise-"), telephone: "6" + TEL40.slice(1, 30), statut: "CONTACTE", assigneAId: managerId },
        { entrepriseId: E, nom: "Bertrand Fokou", societeCliente: "Fokou Immobilier", telephone: "696 77 88 99", statut: "QUALIFIE", assigneAId: adminId },
      ]);
      await tx.insert(S.deal).values([
        { entrepriseId: E, titre: "Refonte complète du système d'information et migration des données historiques — " + mot(70, "Projet-"), montant: 987_654_321, contactId: ctx.contacts[0], compteId: ctx.comptes[0], statut: "PROPOSITION", assigneAId: adminId },
        { entrepriseId: E, titre: mot(90, "Opportunite-"), montant: 1_234_567_890, contactId: ctx.contacts[1], compteId: ctx.comptes[1], statut: "NEGOCIATION", assigneAId: managerId },
        { entrepriseId: E, titre: "Identité visuelle", montant: 500_000, contactId: ctx.contacts[2], statut: "GAGNE", assigneAId: adminId },
      ]);
      await tx.insert(S.tacheCrm).values([
        { entrepriseId: E, objet: "Rappeler le client au sujet de " + mot(70, "dossier-"), assigneAId: adminId, creeParId: adminId, contactId: ctx.contacts[0], priorite: "HAUTE" },
        { entrepriseId: E, objet: PARAGRAPHE.slice(0, 200), assigneAId: managerId, creeParId: adminId, contactId: ctx.contacts[1] },
      ]);
      await tx.insert(S.reunionCrm).values([
        { entrepriseId: E, titre: "Réunion de cadrage " + mot(70, "reunion-"), dateDebut: dans(2), dateFin: dans(2.05), assigneAId: adminId, creeParId: adminId, contactId: ctx.contacts[0] },
      ]);
      await tx.insert(S.interaction).values([
        { entrepriseId: E, contactId: ctx.contacts[0], type: "NOTE", contenu: PARAGRAPHE, auteurId: adminId },
        { entrepriseId: E, contactId: ctx.contacts[1], type: "APPEL", contenu: mot(150), auteurId: adminId },
      ]);
    },
    async (tx) => {
      ctx.contacts = (await tx.select({ id: S.contact.id }).from(S.contact)).map((c: any) => c.id);
      ctx.comptes = (await tx.select({ id: S.compteClient.id }).from(S.compteClient)).map((c: any) => c.id);
    }
  );

  // 2. Produits, familles, dépôts, stock
  await section(
    "produits",
    async (tx) => {
      const familles = await tx
        .insert(S.familleProduit)
        .values([{ entrepriseId: E, nom: mot(70, "Famille-") }, { entrepriseId: E, nom: "Matériaux de construction et fournitures de chantier diverses" }])
        .returning({ id: S.familleProduit.id });
      const depots = await tx
        .insert(S.depot)
        .values([{ entrepriseId: E, nom: mot(70, "Depot-Central-"), principal: true }, { entrepriseId: E, nom: "Entrepôt secondaire de la zone industrielle de Bassa à Douala" }])
        .returning({ id: S.depot.id });
      ctx.depots = depots.map((d: any) => d.id);
      const produits = await tx
        .insert(S.produit)
        .values([
          { entrepriseId: E, nom: mot(80, "Produit-Tres-Long-"), description: PARAGRAPHE, prixVente: 987_654_321, prixAchat: 500_000_000, type: "BIEN", suiviStock: true, stockActuel: 123456, seuilAlerte: 10, familleId: familles[0].id, unite: "unité", codeBarres: "1234567890123456789012345678901234567890", creeParId: adminId },
          { entrepriseId: E, nom: "Prestation de conseil en organisation et accompagnement du changement sur douze mois", description: mot(160), prixVente: 450_000, type: "SERVICE", familleId: familles[1].id, creeParId: adminId },
          { entrepriseId: E, nom: "Ciment", description: "Sac de 50 kg", prixVente: 6_500, prixAchat: 5_000, type: "BIEN", suiviStock: true, stockActuel: 40, seuilAlerte: 50, creeParId: adminId },
        ])
        .returning({ id: S.produit.id, nom: S.produit.nom, prixVente: S.produit.prixVente });
      ctx.produits = produits;
      await tx.insert(S.stockDepot).values([
        { entrepriseId: E, produitId: produits[0].id, depotId: ctx.depots[0], quantite: 100000 },
        { entrepriseId: E, produitId: produits[0].id, depotId: ctx.depots[1], quantite: 23456 },
      ]);
    },
    async (tx) => {
      ctx.produits = await tx.select({ id: S.produit.id, nom: S.produit.nom, prixVente: S.produit.prixVente }).from(S.produit);
      ctx.depots = (await tx.select({ id: S.depot.id }).from(S.depot)).map((d: any) => d.id);
    }
  );

  // 3. Ventes : devis, factures, bons de commande
  await section("ventes", async (tx) => {
    const lignes = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        produitId: ctx.produits?.[i % 3]?.id ?? null,
        designation: i === 0 ? mot(90, "Designation-de-ligne-") : `Prestation longue numéro ${i + 1} — ${mot(60, "detail-")} avec description étendue`,
        quantite: 3 + i,
        prixUnitaire: 12_345_678 * (i + 1),
        tauxTVA: 19.25,
      }));
    for (let i = 0; i < 3; i++) {
      const c = ctx.contacts[i % ctx.contacts.length];
      const l = lignes(i + 2);
      const m = calculerMontants(l);
      const numero = await N.genererNumeroDevis(tx, E);
      const [d] = await tx
        .insert(S.devis)
        .values({ entrepriseId: E, numero, contactId: c, compteId: ctx.comptes[i % 3], assigneAId: adminId, dateValidite: dans(30), statut: (["BROUILLON", "ENVOYE", "REFUSE"] as const)[i], motifRefus: i === 2 ? PARAGRAPHE : null, montantHT: m.montantHT, montantTVA: m.montantTVA, montantTTC: m.montantTTC, creeParId: adminId })
        .returning({ id: S.devis.id });
      await tx.insert(S.ligneDevis).values(l.map((x) => ({ entrepriseId: E, devisId: d.id, ...x })));

      const lf = lignes(i + 2);
      const mf = calculerMontants(lf);
      const nf = await N.genererNumeroFacture(tx, E);
      const [f] = await tx
        .insert(S.facture)
        .values({ entrepriseId: E, numero: nf, contactId: c, compteId: ctx.comptes[i % 3], assigneAId: adminId, statut: (["EMISE", "EN_RETARD", "PAYEE"] as const)[i], dateEcheance: dans(i === 1 ? -10 : 30), montantHT: mf.montantHT, montantTVA: mf.montantTVA, montantTTC: mf.montantTTC, motifContestation: i === 1 ? PARAGRAPHE : null })
        .returning({ id: S.facture.id });
      await tx.insert(S.ligneFacture).values(lf.map((x) => ({ entrepriseId: E, factureId: f.id, ...x })));
      if (i === 2) await tx.insert(S.paiement).values({ entrepriseId: E, factureId: f.id, montant: mf.montantTTC, moyenPaiement: "manuel", referenceTransaction: mot(60, "REF-"), saisiParId: adminId });

      const lb = lignes(2);
      const mb = calculerMontants(lb);
      const nb = await N.genererNumeroBonCommandeVente(tx, E);
      const [b] = await tx
        .insert(S.bonCommandeVente)
        .values({ entrepriseId: E, numero: nb, contactId: c, compteId: ctx.comptes[i % 3], assigneAId: adminId, montantHT: mb.montantHT, montantTVA: mb.montantTVA, montantTTC: mb.montantTTC, creeParId: adminId })
        .returning({ id: S.bonCommandeVente.id });
      await tx.insert(S.ligneBonCommandeVente).values(lb.map((x) => ({ entrepriseId: E, bonCommandeVenteId: b.id, ...x })));
    }
  });

  // 4. Dossiers, projets, tâches, contrats, documents, signatures
  await section("projets-documents", async (tx) => {
    const dossiers = await tx
      .insert(S.dossier)
      .values([
        { entrepriseId: E, contactId: ctx.contacts[0], titre: "Dossier " + mot(90, "titre-dossier-"), responsableId: adminId },
        { entrepriseId: E, contactId: ctx.contacts[1], titre: "Dossier de suivi complet du client pour l'exercice en cours et les trois précédents", responsableId: managerId },
        { entrepriseId: E, contactId: ctx.contacts[2], titre: "Dossier court", responsableId: adminId },
      ])
      .returning({ id: S.dossier.id });
    const projets = await tx
      .insert(S.projet)
      .values([
        { entrepriseId: E, dossierId: dossiers[0].id, titre: "Projet " + mot(90, "projet-"), description: PARAGRAPHE, responsablePrincipalId: adminId, statut: "EN_COURS", dateDebut: dans(-10), dateEcheance: dans(60), tauxHoraireParDefaut: 15000 },
        { entrepriseId: E, dossierId: dossiers[1].id, titre: "Déploiement national du système avec formation des équipes de toutes les régions", responsablePrincipalId: managerId, statut: "A_FAIRE" },
        { entrepriseId: E, dossierId: dossiers[2].id, titre: "Petit projet", responsablePrincipalId: adminId, statut: "TERMINE" },
      ])
      .returning({ id: S.projet.id });
    ctx.projets = projets.map((p: any) => p.id);
    await tx.insert(S.tache).values([
      { entrepriseId: E, projetId: ctx.projets[0], titre: "Tâche " + mot(100, "tache-"), statut: "A_FAIRE", assigneAId: employeId, creeParId: adminId, ordre: 0, echeance: dans(5) },
      { entrepriseId: E, projetId: ctx.projets[0], titre: "Rédiger la documentation technique détaillée de l'ensemble des modules et des interfaces", statut: "EN_COURS", assigneAId: employe2Id, creeParId: adminId, ordre: 1 },
      { entrepriseId: E, projetId: ctx.projets[0], titre: mot(70, "Ouandji-"), statut: "TERMINEE", assigneAId: managerId, creeParId: adminId, ordre: 2, termineeLe: new Date() },
      { entrepriseId: E, projetId: ctx.projets[1], titre: "Courte", statut: "A_FAIRE", assigneAId: adminId, creeParId: adminId, ordre: 0 },
    ]);
    await tx.insert(S.entreeTemps).values([
      { entrepriseId: E, projetId: ctx.projets[0], utilisateurId: employeId, date: dans(-1), dureeHeures: 3.5, facturable: true, tauxHoraire: 15000, note: PARAGRAPHE },
    ]);
    await tx.insert(S.commentaire).values([
      { entrepriseId: E, projetId: ctx.projets[0], auteurId: adminId, contenu: PARAGRAPHE },
      { entrepriseId: E, dossierId: dossiers[0].id, auteurId: managerId, contenu: mot(200) },
    ]);
    await tx.insert(S.contrat).values([
      { entrepriseId: E, dossierId: dossiers[0].id, titre: "Contrat-cadre " + mot(90, "contrat-"), dateDebut: dans(-30), dateFin: dans(335), renouvellementAuto: true, preavisJours: 30 },
      { entrepriseId: E, dossierId: dossiers[1].id, titre: "Contrat de maintenance et d'assistance technique annuelle avec clauses particulières", dateDebut: dans(-400), dateFin: dans(-35), statut: "EXPIRE" },
      { entrepriseId: E, dossierId: dossiers[2].id, titre: "Contrat résilié", dateDebut: dans(-100), statut: "RESILIE" },
    ]);
    const docs = await tx
      .insert(S.document)
      .values([
        { entrepriseId: E, nom: mot(90, "Contrat-signe-version-finale-") + ".pdf", cleStockage: `${E}/test-long/${createId()}.pdf`, typeMime: "application/pdf", tailleOctets: 123456, televerseParId: adminId, dossierId: dossiers[0].id },
        { entrepriseId: E, nom: "Rapport d'audit financier complet de l'exercice 2025 - version définitive validée par le comité.docx", cleStockage: `${E}/test-long/${createId()}.docx`, typeMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", tailleOctets: 987654, televerseParId: managerId, dossierId: dossiers[1].id },
        { entrepriseId: E, nom: mot(70, "Piece-identite-") + ".jpg", cleStockage: `${E}/test-long/${createId()}.jpg`, typeMime: "image/jpeg", tailleOctets: 55555, televerseParId: adminId, contactId: ctx.contacts[0], categorie: "PIECE_IDENTITE" },
      ])
      .returning({ id: S.document.id });
    await tx.insert(S.journalAccesDocument).values([{ entrepriseId: E, documentId: docs[2].id, utilisateurId: adminId, action: "CONSULTATION" }]);
    const statuts = ["EN_ATTENTE", "SIGNE", "REFUSE"] as const;
    for (let i = 0; i < 3; i++) {
      const [ds] = await tx
        .insert(S.demandeSignature)
        .values({ entrepriseId: E, documentId: docs[i].id, empreinteDocument: createId() + createId(), creeParId: adminId, statut: i === 0 ? "EN_ATTENTE" : i === 1 ? "SIGNE" : "REFUSE" })
        .returning({ id: S.demandeSignature.id });
      await tx.insert(S.signataire).values([
        { entrepriseId: E, demandeSignatureId: ds.id, nom: NOM70, telephone: TEL40, email: email(`sign${i}`), jetonAcces: createId() + createId(), statut: statuts[i], signeLe: i === 1 ? new Date() : null, motifRefus: i === 2 ? PARAGRAPHE : null, refuseLe: i === 2 ? new Date() : null },
        { entrepriseId: E, demandeSignatureId: ds.id, nom: "Co-signataire " + mot(60, "Tchinda-"), telephone: "699 00 11 22", jetonAcces: createId() + createId(), statut: "EN_ATTENTE" },
      ]);
    }
  });

  // 5. Achats
  await section("achats", async (tx) => {
    const [cpt] = await tx.select({ id: S.compteComptable.id }).from(S.compteComptable).where(and(isNull(S.compteComptable.entrepriseId), eq(S.compteComptable.classe, 6))).limit(1);
    if (!cpt) throw new Error("Aucun compte de classe 6 global dans la base.");
    const fournisseurs = await tx
      .insert(S.fournisseur)
      .values([
        { entrepriseId: E, nom: "Fournisseur " + NOM_SOCIETE, telephone: TEL40, email: email("fourn1"), adresse: mot(90, "Adresse-"), niu: mot(40, "P0"), notes: PARAGRAPHE },
        { entrepriseId: E, nom: mot(80, "Grossiste-"), telephone: "677 22 33 44", email: email("fourn2") },
        { entrepriseId: E, nom: "Quincaillerie du Centre", telephone: "699 11 22 33" },
      ])
      .returning({ id: S.fournisseur.id });
    ctx.fournisseurs = fournisseurs.map((f: any) => f.id);
    for (let i = 0; i < 3; i++) {
      const l = [{ designation: mot(90, "Achat-de-"), quantite: 5, prixUnitaire: 23_456_789, tauxTVA: 19.25 }, { designation: "Fourniture complémentaire livrée sur site avec frais de transport inclus", quantite: 2, prixUnitaire: 150_000, tauxTVA: 19.25 }];
      const m = calculerMontants(l);
      const nb = await N.genererNumeroBonCommandeAchat(tx, E);
      const [bc] = await tx
        .insert(S.bonCommandeAchat)
        .values({ entrepriseId: E, numero: nb, fournisseurId: ctx.fournisseurs[i], compteComptableId: cpt.id, montantHT: m.montantHT, montantTVA: m.montantTVA, montantTTC: m.montantTTC, assigneAId: adminId, creeParId: adminId })
        .returning({ id: S.bonCommandeAchat.id });
      await tx.insert(S.ligneBonCommandeAchat).values(l.map((x) => ({ entrepriseId: E, bonCommandeAchatId: bc.id, ...x })));
      const [ff] = await tx
        .insert(S.factureFournisseur)
        .values({ entrepriseId: E, numero: `FF-${mot(50, "LONG-")}-${i}`, fournisseurId: ctx.fournisseurs[i], compteComptableId: cpt.id, dateFacture: dans(-5), dateEcheance: dans(25), montantHT: m.montantHT, montantTVA: m.montantTVA, montantTTC: m.montantTTC, statut: (["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "PAYEE"] as const)[i], assigneAId: adminId, creeParId: adminId })
        .returning({ id: S.factureFournisseur.id });
      await tx.insert(S.ligneFactureFournisseur).values(l.map((x) => ({ entrepriseId: E, factureFournisseurId: ff.id, ...x })));
      await tx.insert(S.depense).values({ entrepriseId: E, libelle: "Dépense " + mot(90, "libelle-"), compteComptableId: cpt.id, montantHT: 80_000_000, montantTVA: 15_400_000, montantTTC: 95_400_000, moyenPaiement: "especes", datePaiement: dans(-i), fournisseurId: ctx.fournisseurs[i], assigneAId: adminId, creeParId: adminId });
    }
  });

  // 6. Comptabilité : compte tiers, journal manuel, budget
  await section("comptabilite", async (tx) => {
    const [perso] = await tx
      .insert(S.compteComptable)
      .values({ entrepriseId: E, numero: "4119001", libelle: "Compte client auxiliaire " + mot(90, "libelle-compte-"), classe: 4 })
      .returning({ id: S.compteComptable.id });
    const globaux = await tx.select({ id: S.compteComptable.id, classe: S.compteComptable.classe }).from(S.compteComptable).where(isNull(S.compteComptable.entrepriseId));
    const c6 = globaux.find((c: any) => c.classe === 6)!;
    const c7 = globaux.find((c: any) => c.classe === 7)!;
    const numJ = await N.genererNumeroJournalManuel(tx, E);
    const [j] = await tx
      .insert(S.journalManuel)
      .values({ entrepriseId: E, numero: numJ, libelle: "Écriture manuelle " + mot(90, "libelle-journal-"), dateEcriture: new Date(), creeParId: adminId })
      .returning({ id: S.journalManuel.id });
    await tx.insert(S.ecritureComptable).values([
      { entrepriseId: E, dateEcriture: new Date(), libelle: "Débit " + mot(80, "ecriture-"), compteId: c6.id, debit: 123_456_789, credit: 0, journalManuelId: j.id },
      { entrepriseId: E, dateEcriture: new Date(), libelle: "Crédit " + mot(80, "ecriture-"), compteId: c7.id, debit: 0, credit: 123_456_789, journalManuelId: j.id },
    ]);
    const [b] = await tx
      .insert(S.budget)
      .values({ entrepriseId: E, nom: "Budget " + mot(90, "annuel-"), dateDebut: dans(-30), dateFin: dans(335), creeParId: adminId })
      .returning({ id: S.budget.id });
    await tx.insert(S.budgetLigne).values([
      { entrepriseId: E, budgetId: b.id, compteId: c6.id, montant: 987_654_321 },
      { entrepriseId: E, budgetId: b.id, compteId: perso.id, montant: 1_000 },
    ]);
  });

  // 7. RH
  await section("rh", async (tx) => {
    const [sh] = await tx
      .insert(S.shift)
      .values([{ entrepriseId: E, nom: "Équipe " + mot(70, "shift-"), heureDebut: "08:00:00", heureFin: "17:00:00", creeParId: adminId }, { entrepriseId: E, nom: "Nuit", heureDebut: "20:00:00", heureFin: "06:00:00", creeParId: adminId }])
      .returning({ id: S.shift.id });
    const [pol] = await tx
      .insert(S.politiqueConge)
      .values({ entrepriseId: E, nom: "Politique " + mot(80, "conges-"), type: "FIXE", joursBaseParAn: 18, creeParId: adminId })
      .returning({ id: S.politiqueConge.id });
    const dossiers = await tx
      .insert(S.dossierRH)
      .values([
        { entrepriseId: E, utilisateurId: adminId, poste: "Directeur général " + mot(70, "poste-"), typeContrat: "CDI", dateEmbauche: dans(-900), telephone: TEL40, adresse: mot(90, "Adresse-"), urgenceNom: NOM70, urgenceTelephone: TEL40, salaireBase: 987_654_321, dateNaissance: "1980-03-15", shiftId: sh.id, politiqueCongeId: pol.id },
        { entrepriseId: E, utilisateurId: managerId, poste: "Responsable de l'exploitation et de la coordination des équipes terrain", typeContrat: "CDI", dateEmbauche: dans(-500), telephone: "690 12 34 56", salaireBase: 800_000, dateNaissance: "1985-11-02" },
        { entrepriseId: E, utilisateurId: employeId, poste: mot(70, "Ingenieur-"), typeContrat: "CDD", dateEmbauche: dans(-100), dateFinContrat: dans(100), telephone: TEL40, salaireBase: 450_000 },
        { entrepriseId: E, utilisateurId: employe2Id, poste: "Stagiaire", typeContrat: "STAGE", dateEmbauche: dans(-20), dateFinContrat: dans(70) },
      ])
      .returning({ id: S.dossierRH.id });
    ctx.dossiersRH = dossiers.map((d: any) => d.id);
    await tx.insert(S.demandeConge).values([
      { entrepriseId: E, dossierRHId: ctx.dossiersRH[2], type: "CONGE_PAYE", dateDebut: dans(10), dateFin: dans(20), nombreJours: 8, motif: PARAGRAPHE },
      { entrepriseId: E, dossierRHId: ctx.dossiersRH[1], type: "MALADIE", dateDebut: dans(-3), dateFin: dans(-1), nombreJours: 3, statut: "APPROUVEE", approuveParId: adminId, motif: mot(150) },
      { entrepriseId: E, dossierRHId: ctx.dossiersRH[3], type: "AUTRE", dateDebut: dans(30), dateFin: dans(31), nombreJours: 2, statut: "REFUSEE", motif: "Raison personnelle" },
    ]);
    await tx.insert(S.pointage).values([
      { entrepriseId: E, dossierRHId: ctx.dossiersRH[2], date: dans(-1), statut: "RETARD", remarque: PARAGRAPHE, saisiParId: managerId },
      { entrepriseId: E, dossierRHId: ctx.dossiersRH[3], date: dans(-1), statut: "ABSENT", saisiParId: managerId },
    ]);
    await tx.insert(S.evaluation).values([{ entrepriseId: E, dossierRHId: ctx.dossiersRH[2], evaluateurId: managerId, periode: "T1 2026 " + mot(60, "periode-"), commentaire: PARAGRAPHE }]);
    const cats = await tx
      .insert(S.categorieTicketRH)
      .values([{ entrepriseId: E, nom: "Catégorie " + mot(70, "rh-"), agentId: adminId }, { entrepriseId: E, nom: "Paie et avantages sociaux", agentId: managerId }])
      .returning({ id: S.categorieTicketRH.id });
    const tickets = await tx
      .insert(S.ticketRH)
      .values([
        { entrepriseId: E, categorieId: cats[0].id, demandeurId: employeId, titre: "Demande " + mot(100, "ticket-rh-"), description: PARAGRAPHE, statut: "OUVERT", assigneAId: adminId },
        { entrepriseId: E, categorieId: cats[1].id, demandeurId: employe2Id, titre: "Question sur le calcul des heures supplémentaires du mois dernier et leur paiement", statut: "EN_COURS", assigneAId: managerId },
        { entrepriseId: E, categorieId: cats[1].id, demandeurId: employeId, titre: "Résolu", statut: "RESOLU" },
      ])
      .returning({ id: S.ticketRH.id });
    await tx.insert(S.messageTicketRH).values([{ entrepriseId: E, ticketId: tickets[0].id, auteurId: employeId, contenu: PARAGRAPHE }, { entrepriseId: E, ticketId: tickets[0].id, auteurId: adminId, contenu: mot(180) }]);
    await tx.insert(S.stagiaireAcademique).values([
      { entrepriseId: E, nom: NOM70, etablissement: "Institut Universitaire de la Côte " + mot(60, "ecole-"), dateDebut: dans(-30), dateFin: dans(60), creeParId: adminId, telephone: TEL40, email: email("stagiaire"), filiere: mot(70, "Filiere-"), mission: PARAGRAPHE, evaluation: PARAGRAPHE },
      { entrepriseId: E, nom: "Stagiaire Court", etablissement: "ENSET", dateDebut: dans(-5), dateFin: dans(85), creeParId: managerId },
    ]);
  });

  // 8. Recrutement
  await section("recrutement", async (tx) => {
    const postes = await tx
      .insert(S.posteOuvert)
      .values([
        { entrepriseId: E, titre: "Poste " + mot(100, "offre-"), description: PARAGRAPHE, lieu: mot(70, "Lieu-"), typeContrat: "CDI", creeParId: adminId },
        { entrepriseId: E, titre: "Ingénieur logiciel senior spécialisé en systèmes distribués et haute disponibilité", description: "Court", lieu: "Douala", typeContrat: "CDD", creeParId: adminId },
      ])
      .returning({ id: S.posteOuvert.id });
    const statuts = ["RECUE", "EN_EXAMEN", "ENTRETIEN", "OFFRE", "REJETEE"] as const;
    await tx.insert(S.candidature).values(
      statuts.map((st, i) => ({
        entrepriseId: E,
        posteId: postes[i % 2].id,
        nom: i % 2 === 0 ? NOM70 : mot(80, "Candidat-"),
        telephone: i % 2 === 0 ? TEL40 : "690 00 11 22",
        email: email(`cand${i}`),
        message: PARAGRAPHE,
        statut: st,
        cvCleStockage: `${E}/test-long/cv-${i}.pdf`,
        cvNomFichier: mot(90, "CV-tres-long-") + ".pdf",
        cvTypeMime: "application/pdf",
        cvTailleOctets: 100000,
        assigneAId: adminId,
      }))
    );
  });

  // 9. Réservations
  await section("reservations", async (tx) => {
    await tx.insert(S.parametreReservation).values({ entrepriseId: E, slug: `audit-long-${E.slice(0, 10)}`, titre: "Réservation " + mot(90, "titre-"), texte: PARAGRAPHE, publie: true });
    const services = await tx
      .insert(S.serviceReservable)
      .values([
        { entrepriseId: E, nom: "Service " + mot(90, "reservable-"), description: PARAGRAPHE, dureeMinutes: 60, prixFcfa: 987_654, creeParId: adminId },
        { entrepriseId: E, nom: "Consultation initiale approfondie avec bilan complet et plan d'action personnalisé", dureeMinutes: 90, prixFcfa: 25_000, creeParId: adminId },
      ])
      .returning({ id: S.serviceReservable.id });
    const interv = await tx
      .insert(S.intervenantReservation)
      .values([{ entrepriseId: E, utilisateurId: managerId }, { entrepriseId: E, utilisateurId: employeId }])
      .returning({ id: S.intervenantReservation.id });
    await tx.insert(S.disponibiliteReservation).values([
      { entrepriseId: E, intervenantId: interv[0].id, jourSemaine: "LUNDI", heureDebut: "08:00:00", heureFin: "12:00:00" },
      { entrepriseId: E, intervenantId: interv[1].id, jourSemaine: "MARDI", heureDebut: "09:00:00", heureFin: "17:00:00" },
    ]);
    for (let i = 0; i < 3; i++) {
      await tx.insert(S.reservation).values({
        entrepriseId: E,
        numero: `RDV-LONG-${createId().slice(0, 8)}`,
        serviceId: services[i % 2].id,
        intervenantId: interv[i % 2].id,
        dateDebut: dans(i + 1),
        dateFin: dans(i + 1.04),
        dureeMinutesReservee: 60,
        prixFcfaReserve: 987_654,
        clientNom: i === 0 ? NOM70 : mot(80, "Client-"),
        clientTelephone: TEL40,
        clientEmail: email(`rdv${i}`),
        notes: PARAGRAPHE,
        statut: (["CONFIRMEE", "ANNULEE", "TERMINEE"] as const)[i],
      });
    }
  });

  // 10. Support
  await section("support", async (tx) => {
    const cats = await tx
      .insert(S.categorieTicketSupport)
      .values([{ entrepriseId: E, nom: "Support " + mot(70, "categorie-"), agentId: adminId }, { entrepriseId: E, nom: "Facturation et paiements", agentId: managerId }])
      .returning({ id: S.categorieTicketSupport.id });
    const tickets = await tx
      .insert(S.ticketSupport)
      .values([
        { entrepriseId: E, categorieId: cats[0].id, contactId: ctx.contacts[0], titre: "Problème " + mot(100, "ticket-support-"), description: PARAGRAPHE, statut: "OUVERT", assigneAId: adminId },
        { entrepriseId: E, categorieId: cats[1].id, contactId: ctx.contacts[1], titre: "Impossible de télécharger la facture au format PDF depuis le portail client depuis hier soir", statut: "EN_COURS", assigneAId: managerId },
        { entrepriseId: E, categorieId: cats[1].id, contactId: ctx.contacts[2], titre: "Terminé", statut: "FERME" },
      ])
      .returning({ id: S.ticketSupport.id });
    await tx.insert(S.messageTicketSupport).values([
      { entrepriseId: E, ticketId: tickets[0].id, contenu: PARAGRAPHE, auteurContactId: ctx.contacts[0] },
      { entrepriseId: E, ticketId: tickets[0].id, contenu: mot(200), auteurUtilisateurId: adminId },
    ]);
  });

  // 11. Marketing : campagnes + page d'atterrissage (aucun envoi : statut BROUILLON / ENVOYEE posé à la main)
  await section("marketing", async (tx) => {
    await tx.insert(S.campagne).values([
      { entrepriseId: E, nom: "Campagne " + mot(90, "marketing-"), canal: "EMAIL", contenu: PARAGRAPHE, segment: {}, creeParId: adminId },
      { entrepriseId: E, nom: "Offre de lancement exceptionnelle de fin d'année pour tous nos clients fidèles", canal: "WHATSAPP", contenu: mot(180), segment: { statut: "NOUVEAU" }, creeParId: adminId, statut: "ENVOYEE", envoyeeLe: new Date() },
      { entrepriseId: E, nom: "Courte", canal: "EMAIL", contenu: "Bonjour", segment: {}, creeParId: adminId },
    ]);
    const pre = createId().slice(0, 8);
    await tx.insert(S.pageAtterrissage).values([
      { entrepriseId: E, slug: `page-longue-${pre}-a`, titre: "Page " + mot(100, "atterrissage-"), texte: PARAGRAPHE, texteBouton: mot(60, "Cliquez-ici-"), publiee: true },
      { entrepriseId: E, slug: `page-${pre}-b`, titre: "Découvrez notre offre exclusive réservée aux entreprises de la région", texte: "Court texte", publiee: false },
    ]);
  });

  // 12. One Form
  await section("formulaires", async (tx) => {
    const pre = createId().slice(0, 8);
    const [f] = await tx
      .insert(S.formulaire)
      .values({ entrepriseId: E, titre: "Formulaire " + mot(90, "titre-"), slug: `formulaire-long-${pre}`, description: PARAGRAPHE, publie: true, messageConfirmation: PARAGRAPHE, creeParId: adminId })
      .returning({ id: S.formulaire.id });
    await tx.insert(S.formulaire).values({ entrepriseId: E, titre: "Enquête de satisfaction annuelle de nos clients et partenaires", slug: `formulaire-b-${pre}`, creeParId: adminId });
    const champs = await tx
      .insert(S.champFormulaire)
      .values([
        { entrepriseId: E, formulaireId: f.id, type: "TEXTE_COURT", libelle: "Votre nom complet tel qu'il apparaît sur votre pièce d'identité " + mot(70, "nom-"), obligatoire: true, ordre: 0 },
        { entrepriseId: E, formulaireId: f.id, type: "EMAIL", libelle: mot(90, "Adresse-email-"), ordre: 1 },
        { entrepriseId: E, formulaireId: f.id, type: "TEXTE_LONG", libelle: "Décrivez votre besoin", ordre: 2 },
        { entrepriseId: E, formulaireId: f.id, type: "CHOIX_UNIQUE", libelle: "Choisissez une option", options: [mot(70, "Option-un-"), "Option courte", "Une option avec un libellé vraiment très long qui devrait passer à la ligne"] as any, ordre: 3 },
      ])
      .returning({ id: S.champFormulaire.id });
    for (let i = 0; i < 3; i++) {
      const [r] = await tx.insert(S.reponseFormulaire).values({ entrepriseId: E, formulaireId: f.id }).returning({ id: S.reponseFormulaire.id });
      await tx.insert(S.valeurChampReponse).values([
        { entrepriseId: E, reponseFormulaireId: r.id, champFormulaireId: champs[0].id, valeur: NOM70 },
        { entrepriseId: E, reponseFormulaireId: r.id, champFormulaireId: champs[1].id, valeur: email(`rep${i}`) },
        { entrepriseId: E, reponseFormulaireId: r.id, champFormulaireId: champs[2].id, valeur: PARAGRAPHE },
        { entrepriseId: E, reponseFormulaireId: r.id, champFormulaireId: champs[3].id, valeur: mot(70, "Option-un-") },
      ]);
    }
  });

  // 13. One Vault
  await section("vault", async (tx) => {
    const blob = (t: string) => (V.vaultConfigure() ? V.chiffrerContenuSecret({ motDePasse: t, notes: PARAGRAPHE }) : "AAAA" + mot(60, "contenu-non-chiffre-"));
    const secrets = await tx
      .insert(S.secretVault)
      .values([
        { entrepriseId: E, titre: "Secret " + mot(90, "vault-"), contenuChiffre: blob("mot-de-passe-1"), identifiant: email("vault"), url: "https://www.exemple.example.test/" + mot(90, "chemin-"), partage: true, creeParId: adminId },
        { entrepriseId: E, titre: "Accès au serveur de production principal de la région Afrique centrale", contenuChiffre: blob("mot-de-passe-2"), identifiant: mot(70, "identifiant-"), creeParId: managerId },
        { entrepriseId: E, titre: "Wifi", contenuChiffre: blob("x"), creeParId: adminId },
      ])
      .returning({ id: S.secretVault.id });
    await tx.insert(S.journalAccesSecretVault).values(secrets.map((s: any) => ({ entrepriseId: E, secretId: s.id, utilisateurId: adminId, action: "CONSULTATION" })));
  });

  // 14. Messagerie + annonces
  await section("messagerie", async (tx) => {
    await assurerCanalGeneral(tx, E);
    const canaux = await tx
      .insert(S.canal)
      .values([
        { entrepriseId: E, nom: mot(70, "canal-libre-"), type: "LIBRE", idFournisseurChat: idExterneCanal(E, `libre-${createId()}`), creeParId: adminId },
        { entrepriseId: E, nom: "Annonces générales pour toute l'équipe commerciale", type: "EQUIPE", idFournisseurChat: idExterneCanal(E, `equipe-${createId()}`), creeParId: adminId },
        { entrepriseId: E, nom: "Groupe privé " + mot(60, "prive-"), type: "PRIVE", idFournisseurChat: idExterneCanal(E, `prive-${createId()}`), creeParId: adminId },
      ])
      .returning({ id: S.canal.id });
    await tx.insert(S.membreCanal).values([{ entrepriseId: E, canalId: canaux[2].id, utilisateurId: adminId }, { entrepriseId: E, canalId: canaux[2].id, utilisateurId: managerId }]);
    const [general] = await tx.select({ id: S.canal.id }).from(S.canal).where(eq(S.canal.idFournisseurChat, idExterneCanal(E, "general")));
    const cibles = [general?.id, canaux[0].id, canaux[1].id, canaux[2].id].filter(Boolean);
    for (const cid of cibles) {
      const [m1] = await tx.insert(S.messageCanal).values({ entrepriseId: E, canalId: cid, auteurId: adminId, contenu: mot(300) }).returning({ id: S.messageCanal.id });
      await tx.insert(S.messageCanal).values([
        { entrepriseId: E, canalId: cid, auteurId: managerId, contenu: PARAGRAPHE },
        { entrepriseId: E, canalId: cid, auteurId: adminId, contenu: "https://www.exemple.example.test/" + mot(200, "lien-"), citeMessageId: m1.id },
        { entrepriseId: E, canalId: cid, auteurId: managerId, contenu: "Réponse en fil " + mot(120), parentId: m1.id },
        { entrepriseId: E, canalId: cid, auteurId: adminId, contenu: "OK", pieceJointeCle: `${E}/test-long/pj.pdf`, pieceJointeNom: mot(90, "piece-jointe-") + ".pdf", pieceJointeType: "application/pdf", pieceJointeTaille: 2048 },
      ]);
    }
    await tx.insert(S.annonce).values([
      { entrepriseId: E, auteurId: adminId, contenu: PARAGRAPHE + " " + mot(250), epinglee: true },
      { entrepriseId: E, auteurId: managerId, contenu: "Annonce " + mot(100, "sans-espace-") },
      { entrepriseId: E, auteurId: adminId, contenu: "Bonne année à toutes et à tous !" },
    ]);
    await tx.insert(S.notePersonnelle).values({ entrepriseId: E, utilisateurId: adminId, contenu: PARAGRAPHE });
  });

  console.log("\n--- Résultat par section ---");
  for (const r of resultats) console.log(r);
  console.log("\nEntreprise : " + NOM_ENTREPRISE + " (" + E + ")");
  console.log(`Connexion  : ${ADMIN_EMAIL} / ${MOT_DE_PASSE}`);
  process.exit(0);
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
