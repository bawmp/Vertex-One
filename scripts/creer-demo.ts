import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Crée le tenant de démonstration commerciale "Atelier Kalyss" — exécuté une
 * seule fois (`npx tsx scripts/creer-demo.ts`), idempotent par email admin :
 * si ADMIN_EMAIL existe déjà, le script s'arrête sans rien recréer.
 *
 * DATABASE_URL vient de .env.local par défaut (base de dev). Pour cibler la
 * production, positionner DATABASE_URL dans l'environnement AVANT d'exécuter
 * cette commande (dotenv ne réécrit jamais une variable déjà présente) :
 *   DATABASE_URL="<url restreinte NOBYPASSRLS de production>" npx tsx scripts/creer-demo.ts
 * Ne jamais coller cette URL dans un fichier du dépôt.
 *
 * Import dynamique après config() — même raison que src/worker/run.ts : un
 * import statique serait hissé par ESM et évalué avant que DATABASE_URL
 * n'existe, donc src/db/client.ts construirait son Pool avec une chaîne de
 * connexion vide.
 */
async function main() {
  const { hashPassword } = await import("better-auth/crypto");
  const { createLocalAccountIssuer } = await import("@better-auth/core/db");
  const { eq } = await import("drizzle-orm");
  const { db, avecEntreprise } = await import("../src/db/client");
  const {
    entreprise,
    utilisateur,
    compte,
    compteClient,
    contact,
    lead,
    deal,
    produit,
    devis,
    ligneDevis,
    facture,
    paiement,
    canal,
    messageCanal,
    annonce,
    tache,
    entreeTemps,
    projet,
  } = await import("../src/db/schema");
  const { creerUtilisateurChat, idExterneCanal } = await import("../src/lib/chat/client");
  const { assurerCanalGeneral } = await import("../src/lib/messagerie/acces");
  const { calculerMontants } = await import("../src/lib/facturation/calcul");
  const { genererNumeroDevis } = await import("../src/lib/facturation/numerotation");
  const { accepterDevisEtCreerFacture } = await import("../src/lib/facturation/acceptation-devis");
  const { genererEcrituresPaiement } = await import("../src/lib/comptabilite/ecritures");
  const { EMAIL_DEMO, MOT_DE_PASSE_DEMO } = await import("../src/lib/demo");

  const ADMIN_EMAIL = EMAIL_DEMO;
  const ADMIN_MOT_DE_PASSE = MOT_DE_PASSE_DEMO;

  const [existant] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, ADMIN_EMAIL));
  if (existant) {
    console.log(`Le tenant démo existe déjà (utilisateur ${ADMIN_EMAIL}) — rien à faire.`);
    process.exit(0);
  }

  const motDePasseHash = await hashPassword(ADMIN_MOT_DE_PASSE);
  const hier = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dansDixAns = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

  // 1. Entreprise + Admin + compte de connexion — même transaction que creerEntreprise().
  const { entrepriseId, adminId } = await db.transaction(async (tx) => {
    const [nouvelleEntreprise] = await tx
      .insert(entreprise)
      .values({
        nom: "Atelier Kalyss",
        secteurProfil: "agence",
        essaiFinLe: hier,
        abonnementEcheanceLe: dansDixAns,
        niu: "M012600000000A",
        rccm: "RC/DLA/2020/B/0000",
        adresse: "Rue Njo-Njo, Bonapriso",
        ville: "Douala",
      })
      .returning({ id: entreprise.id });

    const [admin] = await tx
      .insert(utilisateur)
      .values({
        entrepriseId: nouvelleEntreprise.id,
        email: ADMIN_EMAIL,
        nomComplet: "Admin Démo",
        role: "ADMIN",
        statut: "ACTIF",
      })
      .returning({ id: utilisateur.id });

    await tx.insert(compte).values({
      userId: admin.id,
      providerId: "credential",
      issuer: createLocalAccountIssuer("credential"),
      accountId: admin.id,
      password: motDePasseHash,
    });

    return { entrepriseId: nouvelleEntreprise.id, adminId: admin.id };
  });

  await creerUtilisateurChat(entrepriseId, adminId, "Admin Démo");

  // 2. Tout le reste, dans avecEntreprise() comme toute donnée métier.
  await avecEntreprise(entrepriseId, async (tx) => {
    await assurerCanalGeneral(tx, entrepriseId);
    const [canalGeneral] = await tx
      .select({ id: canal.id })
      .from(canal)
      .where(eq(canal.idFournisseurChat, idExterneCanal(entrepriseId, "general")));

    // CRM — comptes clients, contacts, leads, deals.
    const nomsComptes = ["BTP Cameroun SARL", "Boutique Mode Akwa", "Restaurant Le Flamboyant"];
    const comptesClients = await tx
      .insert(compteClient)
      .values(nomsComptes.map((nom) => ({ entrepriseId, nom })))
      .returning({ id: compteClient.id, nom: compteClient.nom });

    const contactsData = [
      { nom: "Jean-Paul Mbarga", telephone: "690 12 34 56", email: "jp.mbarga@btpcameroun.cm", compteId: comptesClients[0].id, fonction: "Directeur général" },
      { nom: "Marie-Claire Ngo Bakoa", telephone: "677 22 33 44", email: "mc.ngobakoa@boutiqueakwa.cm", compteId: comptesClients[1].id, fonction: "Gérante" },
      { nom: "Samuel Eto'o Fils", telephone: "699 55 66 77", email: "s.etoofils@flamboyant.cm", compteId: comptesClients[2].id, fonction: "Propriétaire" },
      { nom: "Aïcha Oumarou", telephone: "655 88 99 00", email: "aicha.oumarou@gmail.com", compteId: null },
      { nom: "Paul Biya Ndoumbe", telephone: "691 44 55 66", email: "p.ndoumbe@gmail.com", compteId: null },
    ];
    const contacts = await tx
      .insert(contact)
      .values(contactsData.map((c) => ({ entrepriseId, nom: c.nom, telephone: c.telephone, email: c.email, fonction: c.fonction, compteId: c.compteId, assigneAId: adminId })))
      .returning({ id: contact.id, nom: contact.nom });

    await tx.insert(lead).values([
      { entrepriseId, nom: "Fabrice Kamga", societeCliente: "Kamga Distribution", telephone: "693 11 22 33", statut: "NOUVEAU", assigneAId: adminId },
      { entrepriseId, nom: "Sandrine Talla", societeCliente: "Talla Événements", telephone: "678 44 55 66", statut: "CONTACTE", assigneAId: adminId },
      { entrepriseId, nom: "Bertrand Fokou", societeCliente: "Fokou Immobilier", telephone: "696 77 88 99", statut: "QUALIFIE", assigneAId: adminId },
      { entrepriseId, nom: "Christelle Manga", societeCliente: "Manga Beauté", telephone: "674 33 22 11", statut: "DISQUALIFIE", assigneAId: adminId },
    ]);

    await tx.insert(deal).values([
      { entrepriseId, titre: "Refonte site vitrine — BTP Cameroun", montant: 850_000, contactId: contacts[0].id, compteId: comptesClients[0].id, statut: "PROPOSITION", assigneAId: adminId },
      { entrepriseId, titre: "Campagne réseaux sociaux — Boutique Akwa", montant: 350_000, contactId: contacts[1].id, compteId: comptesClients[1].id, statut: "NEGOCIATION", assigneAId: adminId },
      { entrepriseId, titre: "Identité visuelle — Le Flamboyant", montant: 500_000, contactId: contacts[2].id, compteId: comptesClients[2].id, statut: "QUALIFICATION", assigneAId: adminId },
      { entrepriseId, titre: "Application mobile — Aïcha Oumarou", montant: 1_200_000, contactId: contacts[3].id, statut: "GAGNE", assigneAId: adminId },
      { entrepriseId, titre: "Support technique annuel", montant: 200_000, contactId: contacts[4].id, statut: "PERDU", assigneAId: adminId },
    ]);

    // Facturation — produits, deux devis (un accepté puis payé, un envoyé).
    const produitsData = [
      { nom: "Conception de site web vitrine", description: "Site 5 pages, responsive, hébergement inclus la première année", prixVente: 450_000 },
      { nom: "Gestion de réseaux sociaux (mensuel)", description: "Facebook + Instagram, 12 publications/mois", prixVente: 150_000 },
      { nom: "Création de logo et charte graphique", description: "Logo, palette de couleurs, typographie, déclinaisons", prixVente: 250_000 },
    ];
    const produits = await tx
      .insert(produit)
      .values(produitsData.map((p) => ({ entrepriseId, nom: p.nom, description: p.description, prixVente: p.prixVente, type: "SERVICE" as const, creeParId: adminId })))
      .returning({ id: produit.id, prixVente: produit.prixVente });

    const dateValidite = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Devis 1 : site web pour BTP Cameroun — sera accepté puis payé.
    const lignesDevis1 = [{ produitId: produits[0].id, designation: produitsData[0].nom, quantite: 1, prixUnitaire: produits[0].prixVente, tauxTVA: 19.25 }];
    const montants1 = calculerMontants(lignesDevis1);
    const numeroDevis1 = await genererNumeroDevis(tx, entrepriseId);
    const [devis1] = await tx
      .insert(devis)
      .values({
        entrepriseId,
        numero: numeroDevis1,
        contactId: contacts[0].id,
        compteId: comptesClients[0].id,
        assigneAId: adminId,
        dateValidite,
        montantHT: montants1.montantHT,
        montantTVA: montants1.montantTVA,
        montantTTC: montants1.montantTTC,
        creeParId: adminId,
      })
      .returning({ id: devis.id });
    await tx.insert(ligneDevis).values(lignesDevis1.map((l) => ({ entrepriseId, devisId: devis1.id, ...l })));

    // Devis 2 : logo pour Le Flamboyant — reste ENVOYE (pipeline visible).
    const lignesDevis2 = [{ produitId: produits[2].id, designation: produitsData[2].nom, quantite: 1, prixUnitaire: produits[2].prixVente, tauxTVA: 19.25 }];
    const montants2 = calculerMontants(lignesDevis2);
    const numeroDevis2 = await genererNumeroDevis(tx, entrepriseId);
    const [devis2] = await tx
      .insert(devis)
      .values({
        entrepriseId,
        numero: numeroDevis2,
        contactId: contacts[2].id,
        compteId: comptesClients[2].id,
        assigneAId: adminId,
        dateValidite,
        statut: "ENVOYE",
        montantHT: montants2.montantHT,
        montantTVA: montants2.montantTVA,
        montantTTC: montants2.montantTTC,
        creeParId: adminId,
      })
      .returning({ id: devis.id });
    await tx.insert(ligneDevis).values(lignesDevis2.map((l) => ({ entrepriseId, devisId: devis2.id, ...l })));

    // Acceptation du devis 1 → facture + Dossier/Projet/canal projet créés automatiquement.
    const factureId = await accepterDevisEtCreerFacture(tx, entrepriseId, devis1.id);
    if (!factureId) throw new Error("Échec inattendu : la facture de démonstration n'a pas été créée.");

    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, factureId));
    const datePaiement = new Date();
    const [nouveauPaiement] = await tx
      .insert(paiement)
      .values({ entrepriseId, factureId, montant: laFacture.montantTTC, moyenPaiement: "manuel", saisiParId: adminId, datePaiement })
      .returning({ id: paiement.id });
    await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, factureId));
    await genererEcrituresPaiement(tx, {
      entrepriseId,
      factureId,
      paiementId: nouveauPaiement.id,
      numeroFacture: laFacture.numero,
      montant: laFacture.montantTTC,
      moyenPaiement: "manuel",
      datePaiement,
    });

    // Projet/dossier/tâches/feuille de temps sur le projet auto-créé par l'acceptation du devis.
    const [leProjet] = await tx.select({ id: projet.id }).from(projet).where(eq(projet.devisOrigineId, devis1.id));
    const [canalProjet] = await tx.select({ id: canal.id }).from(canal).where(eq(canal.projetId, leProjet.id));

    await tx.insert(tache).values([
      { entrepriseId, projetId: leProjet.id, titre: "Maquette de la page d'accueil", statut: "TERMINEE", assigneAId: adminId, creeParId: adminId, ordre: 0, termineeLe: new Date() },
      { entrepriseId, projetId: leProjet.id, titre: "Intégration responsive", statut: "EN_COURS", assigneAId: adminId, creeParId: adminId, ordre: 1 },
      { entrepriseId, projetId: leProjet.id, titre: "Mise en ligne et nom de domaine", statut: "A_FAIRE", assigneAId: adminId, creeParId: adminId, ordre: 2 },
    ]);

    await tx.insert(entreeTemps).values([
      { entrepriseId, projetId: leProjet.id, utilisateurId: adminId, date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), dureeHeures: 4, facturable: true, tauxHoraire: 15_000, note: "Maquette page d'accueil" },
      { entrepriseId, projetId: leProjet.id, utilisateurId: adminId, date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), dureeHeures: 3, facturable: true, tauxHoraire: 15_000, note: "Intégration responsive" },
    ]);

    // One Chat — quelques messages dans Général et dans le canal du projet.
    await tx.insert(messageCanal).values([
      { entrepriseId, canalId: canalGeneral.id, auteurId: adminId, contenu: "Bienvenue sur Vertex One ! 🎉" },
      { entrepriseId, canalId: canalGeneral.id, auteurId: adminId, contenu: "Le devis pour BTP Cameroun vient d'être accepté, le projet est lancé." },
    ]);
    await tx.insert(messageCanal).values([
      { entrepriseId, canalId: canalProjet.id, auteurId: adminId, contenu: "Projet créé automatiquement à l'acceptation du devis." },
      { entrepriseId, canalId: canalProjet.id, auteurId: adminId, contenu: "Maquette de la page d'accueil validée avec le client, on passe à l'intégration." },
    ]);

    // Annonce épinglée.
    await tx.insert(annonce).values({ entrepriseId, auteurId: adminId, contenu: "Bienvenue sur Vertex One — votre suite de gestion tout-en-un.", epinglee: true });
  });

  console.log("Tenant de démonstration créé avec succès.");
  console.log(`Entreprise : Atelier Kalyss (${entrepriseId})`);
  console.log(`Connexion  : ${ADMIN_EMAIL} / ${ADMIN_MOT_DE_PASSE}`);
  process.exit(0);
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
