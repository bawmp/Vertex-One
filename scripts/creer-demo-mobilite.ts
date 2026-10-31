import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Crée l'entreprise de démonstration commerciale « DEMO Mobilité » (profil immigration et mobilité internationale), pour les démonstrations
 * de vente du secteur mobilité et voyage — voir docs/guide-commercial-demo-et-messages.md. Idempotent par email admin : si le compte existe
 * déjà, le script s'arrête sans rien recréer.
 *
 * Différences avec scripts/creer-demo.ts (« Atelier Kalyss », démo PUBLIQUE de profil agence) :
 * - cette entreprise est PRIVÉE, réservée à l'équipe : son mot de passe n'est jamais écrit dans le dépôt ni affiché. Il est tiré au hasard
 *   et écrit dans un fichier à l'extérieur du dépôt (variable DEMO_FICHIER_IDENTIFIANTS, par défaut le Bureau) ;
 * - son nom commence par « DEMO » : la Console interne (Acquisition) l'exclut ainsi des chiffres d'acquisition. Jamais « TEST » : les outils
 *   de nettoyage suppriment ces entreprises ;
 * - le profil « immigration » donne le vocabulaire Dossier / Démarche et les champs Nationalité, Pays de destination, Type de visa et Date du
 *   rendez-vous consulaire ; les clients de la démo les ont remplis.
 *
 * Utilisation : `npx tsx scripts/creer-demo-mobilite.ts` (base de développement, DATABASE_URL de .env.local). Pour la production,
 * positionner DATABASE_URL dans l'environnement AVANT (dotenv ne réécrit jamais une variable déjà présente) ; ne jamais coller cette URL dans
 * un fichier du dépôt. Import dynamique après config() : même raison que src/worker/run.ts.
 */
async function main() {
  const { randomBytes } = await import("node:crypto");
  const { writeFileSync } = await import("node:fs");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
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
    contactChampPersonnalise,
    contactChampValeur,
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
    projet,
  } = await import("../src/db/schema");
  const { creerUtilisateurChat, idExterneCanal } = await import("../src/lib/chat/client");
  const { assurerCanalGeneral } = await import("../src/lib/messagerie/acces");
  const { calculerMontants } = await import("../src/lib/facturation/calcul");
  const { genererNumeroDevis } = await import("../src/lib/facturation/numerotation");
  const { accepterDevisEtCreerFacture } = await import("../src/lib/facturation/acceptation-devis");
  const { genererEcrituresPaiement } = await import("../src/lib/comptabilite/ecritures");
  const { semerChampsDuProfil } = await import("../src/lib/profils/immigration");

  const NOM = "DEMO Mobilité";
  const ADMIN_EMAIL = "demo-mobilite@vertex-one-demo.local";

  const [existant] = await db.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, ADMIN_EMAIL));
  if (existant) {
    console.log(`L'entreprise « ${NOM} » existe déjà (utilisateur ${ADMIN_EMAIL}) — rien à faire.`);
    process.exit(0);
  }

  const motDePasse = randomBytes(12).toString("base64url");
  const motDePasseHash = await hashPassword(motDePasse);
  const JOUR = 24 * 60 * 60 * 1000;
  const hier = new Date(Date.now() - JOUR);
  const dansDixAns = new Date(Date.now() + 10 * 365 * JOUR);

  // 1. Entreprise + Administrateur + compte de connexion — même transaction que creerEntreprise().
  const { entrepriseId, adminId } = await db.transaction(async (tx) => {
    const [nouvelleEntreprise] = await tx
      .insert(entreprise)
      .values({
        nom: NOM,
        secteurProfil: "immigration",
        // Jamais suspendue : un essai terminé et un abonnement échu dans dix ans (même patron que la démo publique).
        essaiFinLe: hier,
        abonnementEcheanceLe: dansDixAns,
        niu: "M012600000001B",
        rccm: "RC/DLA/2021/B/0001",
        adresse: "Avenue de la Liberté, Akwa",
        ville: "Douala",
      })
      .returning({ id: entreprise.id });

    const [admin] = await tx
      .insert(utilisateur)
      .values({ entrepriseId: nouvelleEntreprise.id, email: ADMIN_EMAIL, nomComplet: "Conseiller Démo", role: "ADMIN", statut: "ACTIF" })
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

  await creerUtilisateurChat(entrepriseId, adminId, "Conseiller Démo");

  // 2. Tout le reste, dans avecEntreprise() comme toute donnée métier.
  await avecEntreprise(entrepriseId, async (tx) => {
    // Champs de départ du profil (Nationalité, Pays de destination, Type de visa, Date du rendez-vous consulaire).
    await semerChampsDuProfil(tx, entrepriseId, "immigration");
    const champs = await tx.select({ id: contactChampPersonnalise.id, libelle: contactChampPersonnalise.libelle }).from(contactChampPersonnalise).where(eq(contactChampPersonnalise.entrepriseId, entrepriseId));
    const champId = (libelle: string) => champs.find((c) => c.libelle === libelle)!.id;

    await assurerCanalGeneral(tx, entrepriseId);
    const [canalGeneral] = await tx.select({ id: canal.id }).from(canal).where(eq(canal.idFournisseurChat, idExterneCanal(entrepriseId, "general")));

    // Les « Dossiers » (comptes clients), les clients et leurs informations de voyage.
    const dossiers = await tx
      .insert(compteClient)
      .values(["Amina Bello — études en France", "Famille Nkoulou — Canada", "Tchoumi & Fils — voyage d'affaires"].map((nom) => ({ entrepriseId, nom })))
      .returning({ id: compteClient.id });

    const clients = [
      { nom: "Amina Bello", telephone: "690 21 43 65", email: "amina.bello@exemple.cm", fonction: "Étudiante", dossier: 0, nationalite: "Camerounaise", pays: "France", visa: "Études", rdv: "2026-12-04" },
      { nom: "Joseph Nkoulou", telephone: "677 18 29 30", email: "j.nkoulou@exemple.cm", fonction: "Ingénieur", dossier: 1, nationalite: "Camerounaise", pays: "Canada", visa: "Regroupement familial", rdv: "2026-12-18" },
      { nom: "Cyrille Tchoumi", telephone: "699 77 88 11", email: "c.tchoumi@exemple.cm", fonction: "Directeur", dossier: 2, nationalite: "Camerounaise", pays: "Émirats arabes unis", visa: "Affaires", rdv: "2026-11-25" },
      { nom: "Estelle Mvondo", telephone: "655 40 50 60", email: "e.mvondo@exemple.cm", fonction: "Infirmière", dossier: -1, nationalite: "Camerounaise", pays: "Allemagne", visa: "Travail", rdv: "" },
    ];
    const contacts = await tx
      .insert(contact)
      .values(clients.map((c) => ({ entrepriseId, nom: c.nom, telephone: c.telephone, email: c.email, fonction: c.fonction, compteId: c.dossier >= 0 ? dossiers[c.dossier].id : null, assigneAId: adminId })))
      .returning({ id: contact.id });
    await tx.insert(contactChampValeur).values(
      clients.flatMap((c, i) => [
        { entrepriseId, contactId: contacts[i].id, champId: champId("Nationalité"), valeur: c.nationalite },
        { entrepriseId, contactId: contacts[i].id, champId: champId("Pays de destination"), valeur: c.pays },
        { entrepriseId, contactId: contacts[i].id, champId: champId("Type de visa"), valeur: c.visa },
        ...(c.rdv ? [{ entrepriseId, contactId: contacts[i].id, champId: champId("Date du rendez-vous consulaire"), valeur: c.rdv }] : []),
      ]),
    );

    await tx.insert(lead).values([
      { entrepriseId, nom: "Patricia Essomba", societeCliente: "Étudiante — Master à Lyon", telephone: "693 10 20 30", statut: "NOUVEAU", assigneAId: adminId },
      { entrepriseId, nom: "Hervé Dongmo", societeCliente: "Voyage touristique — Turquie", telephone: "678 55 66 77", statut: "CONTACTE", assigneAId: adminId },
      { entrepriseId, nom: "Sylvie Ngassa", societeCliente: "Regroupement familial — Belgique", telephone: "696 12 12 12", statut: "QUALIFIE", assigneAId: adminId },
    ]);

    await tx.insert(deal).values([
      { entrepriseId, titre: "Visa études France — Amina Bello", montant: 250_000, contactId: contacts[0].id, compteId: dossiers[0].id, statut: "GAGNE", assigneAId: adminId },
      { entrepriseId, titre: "Regroupement familial Canada — Famille Nkoulou", montant: 400_000, contactId: contacts[1].id, compteId: dossiers[1].id, statut: "NEGOCIATION", assigneAId: adminId },
      { entrepriseId, titre: "Visa affaires Dubaï — Tchoumi & Fils", montant: 180_000, contactId: contacts[2].id, compteId: dossiers[2].id, statut: "GAGNE", assigneAId: adminId },
      { entrepriseId, titre: "Visa de travail Allemagne — Estelle Mvondo", montant: 300_000, contactId: contacts[3].id, statut: "QUALIFICATION", assigneAId: adminId },
    ]);

    // Les services vendus.
    const produitsData = [
      { nom: "Constitution du dossier de visa études", description: "Liste des pièces, vérification, formulaires, prise de rendez-vous", prixVente: 250_000 },
      { nom: "Accompagnement au rendez-vous consulaire", description: "Préparation de l'entretien et suivi jusqu'à la décision", prixVente: 75_000 },
      { nom: "Assistance billet d'avion et hébergement", description: "Recherche du billet, réservation d'hôtel, assurance voyage", prixVente: 120_000 },
    ];
    const produits = await tx
      .insert(produit)
      .values(produitsData.map((p) => ({ entrepriseId, nom: p.nom, description: p.description, prixVente: p.prixVente, type: "SERVICE" as const, creeParId: adminId })))
      .returning({ id: produit.id, prixVente: produit.prixVente });

    const dateValidite = new Date(Date.now() + 30 * JOUR);
    async function nouveauDevis(contactIndex: number, dossierIndex: number, produitIndex: number, statut?: "ENVOYE") {
      const lignes = [{ produitId: produits[produitIndex].id, designation: produitsData[produitIndex].nom, quantite: 1, prixUnitaire: produits[produitIndex].prixVente, tauxTVA: 19.25 }];
      const montants = calculerMontants(lignes);
      const numero = await genererNumeroDevis(tx, entrepriseId);
      const [d] = await tx
        .insert(devis)
        .values({
          entrepriseId,
          numero,
          contactId: contacts[contactIndex].id,
          compteId: dossiers[dossierIndex].id,
          assigneAId: adminId,
          dateValidite,
          ...(statut ? { statut } : {}),
          montantHT: montants.montantHT,
          montantTVA: montants.montantTVA,
          montantTTC: montants.montantTTC,
          creeParId: adminId,
        })
        .returning({ id: devis.id });
      await tx.insert(ligneDevis).values(lignes.map((l) => ({ entrepriseId, devisId: d.id, ...l })));
      return d.id;
    }

    // Devis 1 (Amina) : accepté → facture + Démarche créées → PAYÉE À MOITIÉ (acompte reçu).
    const devisAmina = await nouveauDevis(0, 0, 0);
    // Devis 2 (Tchoumi) : accepté → facture EN RETARD (la relance et la promesse de paiement se montrent dessus).
    const devisTchoumi = await nouveauDevis(2, 2, 2);
    // Devis 3 (Nkoulou) : envoyé, en attente de la réponse du client.
    await nouveauDevis(1, 1, 1, "ENVOYE");

    const factureAmina = await accepterDevisEtCreerFacture(tx, entrepriseId, devisAmina);
    if (!factureAmina) throw new Error("Échec inattendu : la facture d'Amina n'a pas été créée.");
    const [fa] = await tx.select().from(facture).where(eq(facture.id, factureAmina));
    const acompte = Math.round(fa.montantTTC / 2);
    const datePaiement = new Date(Date.now() - 3 * JOUR);
    const [p] = await tx.insert(paiement).values({ entrepriseId, factureId: factureAmina, montant: acompte, moyenPaiement: "orange_money", saisiParId: adminId, datePaiement }).returning({ id: paiement.id });
    await tx.update(facture).set({ statut: "PARTIELLEMENT_PAYEE" }).where(eq(facture.id, factureAmina));
    await genererEcrituresPaiement(tx, { entrepriseId, factureId: factureAmina, paiementId: p.id, numeroFacture: fa.numero, montant: acompte, moyenPaiement: "orange_money", datePaiement });

    const factureTchoumi = await accepterDevisEtCreerFacture(tx, entrepriseId, devisTchoumi);
    if (!factureTchoumi) throw new Error("Échec inattendu : la facture de Tchoumi n'a pas été créée.");
    await tx
      .update(facture)
      .set({ statut: "EN_RETARD", dateEmission: new Date(Date.now() - 30 * JOUR), dateEcheance: new Date(Date.now() - 12 * JOUR) })
      .where(eq(facture.id, factureTchoumi));

    // La Démarche d'Amina (créée à l'acceptation du devis) : étapes et messages.
    const [demarche] = await tx.select({ id: projet.id }).from(projet).where(eq(projet.devisOrigineId, devisAmina));
    const [canalDemarche] = await tx.select({ id: canal.id }).from(canal).where(eq(canal.projetId, demarche.id));
    await tx.insert(tache).values([
      { entrepriseId, projetId: demarche.id, titre: "Rassembler les pièces du dossier", statut: "TERMINEE", assigneAId: adminId, creeParId: adminId, ordre: 0, termineeLe: new Date() },
      { entrepriseId, projetId: demarche.id, titre: "Prendre le rendez-vous consulaire", statut: "EN_COURS", assigneAId: adminId, creeParId: adminId, ordre: 1 },
      { entrepriseId, projetId: demarche.id, titre: "Préparer l'entretien avec la cliente", statut: "A_FAIRE", assigneAId: adminId, creeParId: adminId, ordre: 2 },
      { entrepriseId, projetId: demarche.id, titre: "Dépôt du dossier et suivi de la décision", statut: "A_FAIRE", assigneAId: adminId, creeParId: adminId, ordre: 3 },
    ]);

    await tx.insert(messageCanal).values([
      { entrepriseId, canalId: canalGeneral.id, auteurId: adminId, contenu: "Bienvenue ! Le devis d'Amina Bello est accepté, la démarche est lancée." },
      { entrepriseId, canalId: canalDemarche.id, auteurId: adminId, contenu: "Démarche créée automatiquement à l'acceptation du devis. Acompte de 50 % reçu par Orange Money." },
      { entrepriseId, canalId: canalDemarche.id, auteurId: adminId, contenu: "Pièces reçues et vérifiées. Prochaine étape : le rendez-vous consulaire du 4 décembre." },
    ]);
    await tx.insert(annonce).values({ entrepriseId, auteurId: adminId, contenu: "Rappel : chaque dossier reçoit un suivi hebdomadaire jusqu'à la décision.", epinglee: true });
  });

  // Les identifiants vont dans un fichier hors du dépôt : jamais affichés ici, jamais dans l'historique.
  const fichier = process.env.DEMO_FICHIER_IDENTIFIANTS ?? join(homedir(), "Desktop", "identifiants-demo-mobilite.txt");
  writeFileSync(
    fichier,
    `DEMO Mobilité — réservé à l'équipe, ne pas partager\r\nAdresse : https://vertexone.cm/connexion\r\nEmail : ${ADMIN_EMAIL}\r\nMot de passe : ${motDePasse}\r\n`,
    "utf8",
  );
  console.log(`Entreprise « ${NOM} » créée (${entrepriseId}).`);
  console.log(`Identifiants écrits dans : ${fichier}`);
  process.exit(0);
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
