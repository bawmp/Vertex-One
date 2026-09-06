# Palier 4 — Spécification technique : Signature électronique, Contrats, Comptabilité complète

*Document technique complémentaire à la stratégie & roadmap — Septembre 2026*

Ce palier s'appuie sur le Document du Palier 3 (un Devis/Contrat à signer est un `Document` rattaché à un `Dossier`) et sur la Facturation du Palier 1 (la comptabilité complète en dérive plutôt que de repartir de zéro). Rappel du modèle économique : verrouillé au forfait **Business**, et c'est le palier le plus sensible juridiquement de toute la suite — la prudence prime ici sur la vitesse.

## 1. Ce qui se construit ici

Trois sous-modules distincts mais reliés : la signature électronique de devis/contrats (équivalent Zoho Sign), le suivi du cycle de vie des contrats — échéances, renouvellements (équivalent Zoho Contracts, traité comme une extension plutôt qu'un produit séparé, comme annoncé dans la vision d'ensemble), et l'extension de la facturation vers une comptabilité complète conforme SYSCOHADA (équivalent Zoho Books, au-delà de la simple facturation déjà construite au Palier 1).

## 2. Signature électronique : l'approche à deux vitesses, rendue concrète

Rappel du choix posé dans l'architecture générale : une signature "simple" native suffisante pour la majorité des devis et contrats, avec une valeur probatoire réelle sous le régime de la preuve électronique camerounais/OHADA, et une option de signature "certifiée" via une autorité accréditée ANTIC pour les documents à forts enjeux. Ce qui donne une vraie valeur probatoire à la signature simple, ce n'est pas le clic lui-même, mais tout ce qui l'entoure et qui prouve l'identité du signataire et l'intégrité du document :

```prisma
enum TypeSignature {
  SIMPLE
  CERTIFIEE
}

enum StatutSignature {
  EN_ATTENTE
  SIGNE
  REFUSE
  EXPIRE
}

model DemandeSignature {
  id                String          @id @default(cuid())
  entrepriseId      String
  entreprise        Entreprise      @relation(fields: [entrepriseId], references: [id])
  documentId        String          // le PDF à signer, un Document du Palier 3
  document          Document        @relation(fields: [documentId], references: [id])
  type              TypeSignature   @default(SIMPLE)
  statut            StatutSignature @default(EN_ATTENTE)
  empreinteDocument String          // SHA-256 du PDF au moment de l'envoi — preuve qu'il n'a pas été modifié depuis
  signataires       Signataire[]
  creeParId         String
  creeLe            DateTime        @default(now())
}

model Signataire {
  id                 String          @id @default(cuid())
  demandeSignatureId String
  demandeSignature   DemandeSignature @relation(fields: [demandeSignatureId], references: [id])
  nom                String
  telephone          String          // le client final n'est pas forcément un Utilisateur du système
  email              String?
  statut             StatutSignature @default(EN_ATTENTE)

  // Le journal d'audit qui donne sa valeur probatoire à la signature simple
  codeVerificationEnvoye Boolean     @default(false) // OTP envoyé par WhatsApp/SMS avant signature
  signeLe            DateTime?
  adresseIP          String?
  navigateurUtilisateur String?      // user-agent, complète le faisceau de preuves
  consentementExplicite Boolean      @default(false) // case "je consens à signer électroniquement"
  jetonAcces         String          @unique // lien unique, à durée limitée

  referenceCertificatANTIC String?   // renseigné uniquement pour TypeSignature.CERTIFIEE
}
```

**Le déroulé pour une signature simple** (le cas par défaut, largement suffisant pour un devis ou un contrat de service standard) : le document est envoyé avec un lien unique à durée limitée par WhatsApp ou email ; au moment de signer, un code de vérification à usage unique est envoyé séparément sur le numéro déclaré du signataire — c'est ce deuxième canal qui authentifie réellement l'identité, un simple clic sur un lien étant une preuve plus faible qu'un clic combiné à un code reçu sur un numéro de téléphone vérifié ; le signataire coche un consentement explicite ; le serveur enregistre l'heure, l'adresse IP et le user-agent. Une fois tous les signataires passés à `SIGNE`, un certificat d'audit (résumé lisible de qui a signé, quand, avec quelles preuves) est généré et joint au document final — c'est ce certificat, pas seulement le PDF signé, qui constitue la preuve en cas de litige.

**Le déroulé pour une signature certifiée** (à proposer en option, pas par défaut, pour les contrats à forts enjeux) : au lieu du code de vérification interne, le signataire est redirigé vers le prestataire de certification accrédité ANTIC pour une authentification forte, et `referenceCertificatANTIC` est renseigné au retour — c'est cette référence externe, pas votre propre infrastructure, qui porte la valeur légale d'équivalence à une signature manuscrite.

## 3. Contrats : une extension du Document, pas un produit séparé

```prisma
model Contrat {
  id                 String    @id @default(cuid())
  entrepriseId       String
  entreprise         Entreprise @relation(fields: [entrepriseId], references: [id])
  dossierId          String     // rattaché au Dossier client permanent (Palier 2)
  dossier            Dossier    @relation(fields: [dossierId], references: [id])
  demandeSignatureId String?    // renseigné si signé via ce module
  demandeSignature   DemandeSignature? @relation(fields: [demandeSignatureId], references: [id])
  titre              String
  dateDebut          DateTime
  dateFin            DateTime?
  renouvellementAuto Boolean   @default(false)
  preavisJours       Int?      @default(30) // alerte avant échéance
  statut             String    @default("actif") // "actif" | "expire" | "resilie"
  creeLe             DateTime  @default(now())

  @@index([entrepriseId])
  @@index([dossierId])
}
```

La tâche planifiée déjà utilisée pour les factures en retard (Palier 1) et les tâches en retard (Palier 2) s'étend une troisième fois : elle vérifie chaque jour les contrats dont `dateFin - preavisJours` est atteinte et prévient le responsable du Dossier — encore une fois, aucune nouvelle infrastructure de tâches planifiées à construire, seulement une source de données supplémentaire à surveiller.

## 4. Comptabilité complète : dériver plutôt que ressaisir

C'est le point le plus important de tout ce palier. Vous avez déjà, depuis le Palier 1, toutes les `Facture` et tous les `Paiement` de chaque entreprise cliente — la bonne architecture n'est pas de demander à l'utilisateur de ressaisir sa comptabilité ailleurs, mais de générer automatiquement les écritures comptables à partir de ce qui existe déjà.

```prisma
// Plan comptable SYSCOHADA — à importer comme données de référence
// depuis la nomenclature officielle plutôt que ressaisi à la main ici.
model CompteComptable {
  id        String @id @default(cuid())
  numero    String @unique // ex: "411000" (Clients), "706000" (Prestations de services), "443200" (TVA collectée)
  libelle   String
  classe    Int    // 1 à 8, selon la classification SYSCOHADA
}

model EcritureComptable {
  id             String   @id @default(cuid())
  entrepriseId   String
  entreprise     Entreprise @relation(fields: [entrepriseId], references: [id])
  dateEcriture   DateTime
  libelle        String
  compteId       String
  compte         CompteComptable @relation(fields: [compteId], references: [id])
  debit          Decimal  @default(0)
  credit         Decimal  @default(0)
  factureId      String?  // traçabilité : quelle facture a généré cette ligne
  paiementId     String?
  creeLe         DateTime @default(now())

  @@index([entrepriseId])
  @@index([compteId])
}
```

**Génération automatique.** Chaque événement déjà existant au Palier 1 déclenche ses écritures :

```typescript
async function surFactureEmise(facture: Facture) {
  await creerEcritures(facture.entrepriseId, facture.dateEmission, [
    { compte: "411000", libelle: `Facture ${facture.numero}`, debit: facture.montantTTC },
    { compte: "706000", libelle: `Facture ${facture.numero}`, credit: facture.montantHT },
    { compte: "443200", libelle: `TVA ${facture.numero}`, credit: facture.montantTVA },
  ]);
}

async function surPaiementEnregistre(paiement: Paiement, facture: Facture) {
  const compteTresorerie = paiement.moyenPaiement === "manuel" ? "571000" /* Caisse */ : "512000" /* Banque */;
  await creerEcritures(facture.entrepriseId, paiement.datePaiement, [
    { compte: compteTresorerie, libelle: `Règlement ${facture.numero}`, debit: paiement.montant },
    { compte: "411000", libelle: `Règlement ${facture.numero}`, credit: paiement.montant },
  ]);
}
```

L'utilisateur n'a jamais besoin d'ouvrir un écran de saisie comptable pour ses ventes courantes : la comptabilité se construit toute seule à mesure qu'il facture et encaisse, exactement comme il le faisait déjà au Palier 1.

**Rapprochement bancaire.** Un import de relevé (CSV ou OFX selon ce que les banques et Orange Money/MTN MoMo permettent d'exporter) rapproché avec les `Paiement` déjà enregistrés — l'essentiel du travail consiste à proposer des correspondances probables (même montant, date proche) plutôt qu'à demander un pointage entièrement manuel.

**États financiers — la limite volontaire à poser ici.** Le Bilan et le Compte de résultat se calculent en agrégeant les soldes d'`EcritureComptable` par classe de compte — techniquement direct une fois les écritures en place. La recommandation posée dans l'architecture générale reste valable et se précise ici : générer ces états comme un **brouillon exportable**, à faire valider par un professionnel comptable avant tout dépôt officiel auprès de la DGI, plutôt que de présenter le produit comme un outil de télédéclaration fiscale autonome. C'est la différence entre "vous faire gagner 90% du travail comptable" (ce que ce palier fait très bien) et "se substituer à un comptable" (ce qui engagerait votre responsabilité sur un terrain où une erreur a des conséquences directes pour vos clients). Un partenariat avec un cabinet comptable local, ou une passerelle d'export vers une solution déjà conforme comme CassKai, reste l'option la plus sage pour cette dernière étape plutôt que de la construire entièrement en interne dès la première version.

## 5. Rôles et permissions : la comptabilité mérite une restriction à part

Contrairement aux autres modules où un Manager a une portée `EQUIPE`, l'accès aux écritures comptables et aux états financiers est réservé à l'**Administrateur seul** par défaut — une vue d'ensemble des finances de l'entreprise n'a pas la même sensibilité qu'un dossier client individuel, et une fuite ou une erreur y a des conséquences plus larges. La Signature et les Contrats suivent en revanche la portée habituelle (Manager sur son équipe, Employé sur ses propres dossiers).

```typescript
MATRICE_PERMISSIONS.MANAGER.COMPTABILITE = { actions: [], portee: "PROPRE" };
MATRICE_PERMISSIONS.EMPLOYE.COMPTABILITE = { actions: [], portee: "PROPRE" };
MATRICE_PERMISSIONS.ADMIN.COMPTABILITE   = { actions: ["VOIR", "CREER", "MODIFIER"], portee: "TOUT" };
```

Une limite honnête à noter : avec seulement quatre rôles fixes (Palier 0), une entreprise qui voudrait déléguer sa comptabilité à un collaborateur dédié sans lui donner tous les droits d'Administrateur ne le peut pas encore dans cette version. C'est un début légitime d'argument pour un cinquième rôle ("Comptable") si des clients du forfait Business le réclament explicitement — à traiter comme une évolution mesurée plutôt qu'à anticiper sans demande réelle, dans le même esprit que la décision prise au Palier 0 de ne pas construire un éditeur de rôles personnalisés dès le départ.

## 6. Verrouillage par abonnement

```typescript
if (!disponible(utilisateur.entreprise, "SIGNATURE_ELECTRONIQUE")) {
  return reponseErreur(403, "La signature électronique nécessite le forfait Business.");
}
if (!disponible(utilisateur.entreprise, "COMPTABILITE_COMPLETE")) {
  return reponseErreur(403, "La comptabilité complète nécessite le forfait Business.");
}
```

Les Contrats sont verrouillés avec la Signature électronique plutôt qu'indépendamment, puisqu'ils en sont une extension directe (section 3).

## 7. Ordre de construction concret pour ce palier

1. Signature électronique simple (empreinte du document, code de vérification, journal d'audit, certificat final) — le sous-module le plus autonome et le plus rapidement vendable de ce palier, à livrer en premier.
2. Contrats : rattachement au Dossier, extension de la tâche planifiée existante pour les alertes de renouvellement.
3. Import du plan comptable SYSCOHADA comme données de référence (ne pas le ressaisir à la main, importer une nomenclature officielle existante).
4. Génération automatique des écritures depuis `Facture`/`Paiement` déjà en production depuis le Palier 1 — testée en rejouant l'historique réel de vos premiers clients pilotes pour vérifier que les totaux calculés correspondent à ce qu'ils attendent.
5. Rapprochement bancaire (import + proposition de correspondances).
6. États financiers en brouillon exportable, avec la mention claire "à faire valider par votre comptable" plutôt qu'un dépôt automatique.
7. Restriction d'accès comptable à l'Administrateur seul, verrouillage des trois sous-modules au forfait Business.
8. Intégration de la signature certifiée ANTIC, comme option secondaire une fois la signature simple éprouvée en production — pas un prérequis pour lancer ce palier.

Une fois ce palier construit, les sept paliers couvrent l'essentiel de ce que vous avez vu chez Zoho, à l'exception délibérée du RH (Palier 5, à venir) et des modules complémentaires (Palier 6) qui ne se justifient qu'une fois une vraie demande observée chez vos clients.

## 8. Écarts réels avec ce document, constatés à la construction

- **`entrepriseId` ajouté sur `Signataire`**, absent du sketch initial (qui ne portait que `demandeSignatureId`) — même raisonnement que `JournalAccesDocument` au Palier 3 : une politique RLS directe plutôt qu'une sous-requête vers `DemandeSignature` à chaque lecture.
- **`Signataire` a une politique RLS asymétrique** : lecture et modification permissives quand `app.entreprise_id` n'est pas positionné (le signataire accède à `/signature/[jeton]` avant toute session, exactement comme `invitation` au Palier 0), mais création et suppression toujours strictes. Voir `src/db/schema.ts`.
- **Débit/crédit stockés en entier (FCFA)**, pas en `Decimal` comme le sketch Prisma le suggère — cohérent avec le choix déjà fait pour toutes les sommes d'argent du produit depuis le Palier 1 (voir CLAUDE.md).
- **`compte_comptable` échappe délibérément à la règle « toute table porte `entrepriseId` et une politique RLS »** : c'est un référentiel global (la nomenclature SYSCOHADA est identique pour toutes les entreprises camerounaises), documenté comme exception explicite à côté des tables Better-Auth dans `src/db/schema.ts`.
- **Plan comptable MVP réduit à 33 comptes** (classes 1 à 7, les plus utilisés par la facturation/trésorerie courante) plutôt que la nomenclature SYSCOHADA complète — suffisant pour générer les écritures de facturation/paiement et un Bilan/Compte de résultat de brouillon ; à étendre si un client a besoin d'un compte absent de cette liste.
- **OTP de signature envoyé par email, pas par WhatsApp/SMS** comme le déroulé de la section 2 le décrit : l'API Cloud WhatsApp Business n'est pas encore branchée dans ce produit (même stub documenté que la relance de facture, Palier 1) et aucune passerelle SMS n'existe. Un signataire sans email renseigné ne peut donc pas encore recevoir de code — message d'erreur explicite plutôt qu'un blocage silencieux, en attendant l'intégration WhatsApp.
- **Un seul signataire par `DemandeSignature` dans l'action `creerDemandeSignature`** — le modèle de données supporte plusieurs `Signataire` par demande, mais le cas dominant (devis/contrat à faire signer par un client) n'en a besoin que d'un ; l'UI n'a pas encore de formulaire multi-signataires.
- **Certificat d'audit généré à la demande (page `/app/signatures/[id]`), jamais stocké comme un `Document` séparé ou un PDF joint à l'email** : les données sources (empreinte, journal d'audit par signataire) sont déjà immuables une fois `SIGNE`, donc reconstruire ce résumé à l'affichage donne exactement le même contenu qu'un PDF généré une fois — un export PDF de cette page reste possible plus tard si un usage réel le demande (impression navigateur en attendant).
- **`CONTRATS` a sa propre clé `Fonctionnalite`** dans `src/lib/plans.ts` plutôt que d'être verrouillé uniquement via `SIGNATURE_ELECTRONIQUE` comme la section 6 le suggère — les deux clés n'existent aujourd'hui que dans le forfait `business`, donc le comportement observable est identique ; la séparation suit simplement le fait que `permissions.ts` traite déjà `SIGNATURE` et `CONTRATS` comme deux modules distincts.
- **`Contrat.alerteEcheanceEnvoyeeLe` ajouté**, absent du sketch initial — sans ce champ, la tâche planifiée quotidienne aurait renvoyé l'alerte de préavis chaque jour tant que le contrat reste actif et non renouvelé/résilié.
- **Rapprochement bancaire limité au CSV** (colonnes `date,libelle,montant`), l'import OFX mentionné dans la section 4 est différé faute de format de banque camerounaise précis à cibler — même traitement "stub documenté" que les autres intégrations externes de ce projet (voir CLAUDE.md). `Paiement.rapprocheLe` ajouté pour suivre l'état de rapprochement, absent du sketch initial.
- **Bilan/Compte de résultat groupés par classe de compte SYSCOHADA**, pas la présentation officielle complète (soldes intermédiaires de gestion, etc.) — un brouillon au sens strict de la section 4, jamais présenté comme conforme à un dépôt DGI (bandeau d'avertissement affiché sur `/app/comptabilite`).
- **Portée de `/app/signatures` filtrée sur `creeParId`** (qui a créé la demande) plutôt que sur le responsable du Dossier — la section 5 ne précise pas ce cas, ce choix reste cohérent avec la portée EQUIPE/PROPRE déjà définie pour `SIGNATURE` dans `permissions.ts`. **Limite connue** : pour le rôle CLIENT, ce filtre par `creeParId` ne montrera jamais rien, puisqu'un client final n'est jamais l'auteur d'une demande — `Signataire` n'a pas de lien vers `Utilisateur` (voir `src/db/schema.ts`, commentaire sur `jetonAcces`), donc "la consultation de ses propres demandes une fois connecté au portail" évoquée dans `permissions.ts` n'est pas encore implémentée pour ce rôle ; un client suit sa signature uniquement via le lien `/signature/[jeton]` reçu par email, pas via `/app/signatures`.
- **Signature certifiée ANTIC non implémentée** (item 8 de la section 7) — explicitement une option secondaire différée par le document lui-même, pas un prérequis pour ce palier.
