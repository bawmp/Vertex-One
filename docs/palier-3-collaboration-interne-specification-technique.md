# Palier 3 — Spécification technique : Collaboration interne (chat, documents, annonces)

*Document technique complémentaire à la stratégie & roadmap — Septembre 2026*

Ce palier s'appuie sur le Palier 0 (comptes, rôles) et sur le Palier 2 (un canal de discussion et un espace documentaire sont automatiquement créés par Projet). Rappel du modèle économique : verrouillé au forfait **Pro**, comme les Dossiers/Projets.

## 1. Ce qui se construit ici, et ce qui ne se construit pas ici

La messagerie d'équipe (équivalent Zoho Cliq), le partage de documents attaché à chaque dossier/projet (équivalent Zoho WorkDrive), et un fil d'annonces internes façon intranet (équivalent simplifié de Zoho Connect). La prise de notes (Zoho Notebook) ne revient pas ici : elle a déjà été absorbée par le champ `notes` du Prospect (Palier 1) et les `Commentaire` de Dossier/Projet (Palier 2) — inutile de construire un quatrième endroit où écrire du texte libre.

## 2. Rappel du choix "construire vs. intégrer" pour la messagerie

Comme décidé dans l'architecture générale : construire un moteur de chat temps réel fiable (livraison des messages, présence en ligne, notifications push) prend des mois si on part de zéro. Ce palier intègre donc un service de chat-as-a-service existant (par exemple Stream Chat, qui a un plan gratuit adapté au démarrage) derrière votre propre interface, plutôt que de réinventer cette infrastructure. Votre base de données ne stocke pas les messages eux-mêmes — le prestataire s'en charge — elle stocke uniquement la correspondance entre vos objets (Projet, équipe) et les canaux créés chez le prestataire.

## 3. Un point de vigilance propre à ce palier : l'isolation multi-tenant ne se fait plus dans votre base

Toute la conception depuis le Palier 0 repose sur une isolation stricte par `entrepriseId`, appliquée deux fois (code + Row-Level Security) à l'intérieur de votre propre base de données. Dès qu'un module délègue une partie du travail à un service externe partagé entre tous vos clients — c'est le cas ici avec le prestataire de chat — cette protection automatique disparaît : le prestataire ne sait rien de vos entreprises clientes, il ne voit que des utilisateurs et des canaux. La responsabilité de ne jamais mélanger deux entreprises clientes vous revient alors entièrement, à chaque appel à son API.

La parade est simple mais non négociable : **préfixer systématiquement tout identifiant envoyé au prestataire avec l'`entrepriseId`**, aussi bien pour les utilisateurs que pour les canaux :

```typescript
function idExterneUtilisateur(utilisateur: Utilisateur): string {
  return `${utilisateur.entrepriseId}__${utilisateur.id}`;
}

function idExterneCanal(entrepriseId: string, ancre: string): string {
  return `${entrepriseId}__${ancre}`; // ancre = ex. l'id du Projet
}
```

Même si une erreur de code tentait d'ajouter un utilisateur de Garage Mbarga à un canal d'Agence Kiro, les identifiants ne se croiseraient jamais chez le prestataire, exactement dans l'esprit de la barrière indépendante déjà posée avec la Row-Level Security au Palier 0 — seulement ici, c'est une convention de nommage stricte plutôt qu'une politique de base de données, parce que le prestataire externe n'offre pas ce mécanisme.

## 4. Modèle de données

```prisma
enum TypeCanal {
  PROJET
  EQUIPE
  LIBRE
}

model Canal {
  id                String    @id @default(cuid())
  entrepriseId      String
  entreprise        Entreprise @relation(fields: [entrepriseId], references: [id])
  nom               String
  type              TypeCanal
  projetId          String?    // renseigné si le canal est rattaché à un Projet (Palier 2)
  projet            Projet?    @relation(fields: [projetId], references: [id])
  idFournisseurChat String     @unique // identifiant du canal chez le prestataire externe
  creeLe            DateTime   @default(now())

  @@index([entrepriseId])
}

enum CategorieDocument {
  GENERAL          // contrats, photos de chantier, pièces administratives courantes
  PIECE_IDENTITE   // passeport, CNI, tout document d'identité d'un client
  DONNEES_SANTE    // si un secteur client en manipule (cliniques, par exemple)
  AUTRE_SENSIBLE
}

model Document {
  id             String            @id @default(cuid())
  entrepriseId   String
  entreprise     Entreprise        @relation(fields: [entrepriseId], references: [id])
  dossierId      String?           // c'est ici que vit le passeport de Jean : rattaché à SON dossier permanent
  dossier        Dossier?          @relation(fields: [dossierId], references: [id])
  projetId       String?
  projet         Projet?           @relation(fields: [projetId], references: [id])
  categorie      CategorieDocument @default(GENERAL)
  nom            String
  cleStockage    String            // chemin de l'objet dans Cloudflare R2
  typeMime       String
  tailleOctets   Int
  televerseParId String
  creeLe         DateTime          @default(now())

  journalAcces   JournalAccesDocument[]

  @@index([entrepriseId])
  @@index([dossierId])
  @@index([projetId])
}

// Traçabilité des consultations de documents sensibles — exigée par la
// loi camerounaise de protection des données personnelles (voir section 10)
model JournalAccesDocument {
  id             String   @id @default(cuid())
  documentId     String
  document       Document @relation(fields: [documentId], references: [id])
  utilisateurId  String
  action         String   // "consultation" | "telechargement" | "suppression"
  creeLe         DateTime @default(now())

  @@index([documentId])
}

model Annonce {
  id           String   @id @default(cuid())
  entrepriseId String
  entreprise   Entreprise @relation(fields: [entrepriseId], references: [id])
  auteurId     String
  contenu      String   @db.Text
  epinglee     Boolean  @default(false)
  creeLe       DateTime @default(now())

  @@index([entrepriseId])
}
```

Un `Document` se rattache soit à un Dossier (une pièce qui concerne la relation client dans son ensemble — un contrat-cadre, une pièce d'identité), soit à un Projet précis (les photos d'avancement d'un chantier donné), jamais aux deux, sur le même principe que `Commentaire` au Palier 2.

## 5. Le pont automatique depuis le Palier 2 : un canal par projet

Comme un devis accepté crée automatiquement un Projet, la création d'un Projet crée automatiquement son canal de discussion :

```typescript
async function surProjetCree(projet: Projet) {
  const idExterne = idExterneCanal(projet.entrepriseId, projet.id);

  await prestataireChat.creerCanal({
    id: idExterne,
    nom: projet.titre,
    membres: [idExterneUtilisateur(await getUtilisateur(projet.responsablePrincipalId))],
  });

  await db.canal.create({
    data: {
      entrepriseId: projet.entrepriseId,
      nom: projet.titre,
      type: "PROJET",
      projetId: projet.id,
      idFournisseurChat: idExterne,
    },
  });
}
```

Les employés ajoutés comme assignés à une tâche du projet (Palier 2) sont ajoutés au canal correspondant au même moment — encore une fois, personne n'a besoin de créer un groupe de discussion à la main pour chaque nouveau travail.

## 6. Provisionnement des utilisateurs (raccordement au Palier 0)

Le flux d'invitation du Palier 0 gagne une étape supplémentaire : au moment où un compte `Utilisateur` devient `ACTIF`, il est également créé chez le prestataire de chat avec son identifiant préfixé, pour être immédiatement disponible dans les canaux de son entreprise.

```typescript
async function surUtilisateurActive(utilisateur: Utilisateur) {
  await prestataireChat.creerUtilisateur({
    id: idExterneUtilisateur(utilisateur),
    nom: utilisateur.nomComplet,
  });
}
```

Un utilisateur désactivé (`DESACTIVE`, Palier 0) doit symétriquement être retiré de tous les canaux de son entreprise chez le prestataire — un détail facile à oublier mais qui évite qu'un ancien employé continue de recevoir des messages après son départ.

## 7. Rôles et portée : trois nouveaux modules

- **MESSAGERIE** — un Employé n'accède qu'aux canaux des Projets où il est impliqué (portée `PROPRE`, cohérente avec le Palier 2) ; un Manager, ceux de son équipe ; un Administrateur, tous, avec en plus un canal `EQUIPE` général visible par toute l'entreprise.
- **DOCUMENTS** — même logique de portée que les Dossiers/Projets auxquels chaque document est rattaché : pas de permission séparée à inventer, un utilisateur qui voit un Projet voit ses documents.
- **ANNONCES** — portée toujours `TOUT` en lecture (tout le monde dans l'entreprise voit les annonces), mais la création est réservée aux rôles Manager et Administrateur — un Employé lit, il ne publie pas.

## 8. Verrouillage par abonnement

Les trois sous-modules sont vérifiés ensemble au forfait Pro, au même niveau que les Dossiers/Projets (Palier 2) :

```typescript
if (!disponible(utilisateur.entreprise, "CHAT_INTERNE")) {
  return reponseErreur(403, "La messagerie d'équipe nécessite le forfait Pro ou supérieur.");
}
```

## 9. Documents sensibles et loi camerounaise de protection des données personnelles

C'est un point que j'ai vérifié suite à votre question, et il est important : le Cameroun s'est doté d'une loi de protection des données à caractère personnel (23 décembre 2024), avec une période de transition de 18 mois qui s'est achevée le 23 juin 2026 — **c'est-à-dire déjà passée à la date de ce document**. L'autorité de contrôle (l'APDP, Agence/Autorité de Protection des Données Personnelles) dispose désormais de son plein pouvoir d'application, avec des sanctions administratives pouvant atteindre plusieurs dizaines de millions de FCFA ou un pourcentage du chiffre d'affaires pour les manquements les plus graves, et une responsabilité pénale possible des dirigeants en cas de collecte frauduleuse ou de négligence grave. Ce n'est donc pas une échéance à anticiper : c'est une obligation déjà en vigueur au moment où vous commencerez à commercialiser le produit.

Ce que cela signifie concrètement pour le stockage du passeport de Jean :

**Votre rôle juridique.** Vos entreprises clientes sont responsables des données de leurs propres clients (Jean appartient à l'entreprise de votre client, pas à vous). Votre plateforme agit comme sous-traitant de ces données en les hébergeant et en les traitant pour leur compte. Cette distinction a peu d'effet sur le code lui-même, mais elle doit se traduire dans vos conditions d'utilisation (un contrat de sous-traitance des données avec chaque entreprise cliente) — un point à traiter avec un juriste local avant le lancement commercial, pas seulement dans le produit.

**Le consentement.** La loi exige un consentement explicite pour les données sensibles. Une pièce d'identité entre clairement dans cette catégorie. Concrètement, `Dossier` reçoit un champ pour tracer ce consentement :

```prisma
model Dossier {
  // ...champs existants du Palier 2...
  consentementDonneesLe DateTime? // renseigné quand le client a consenti à l'enregistrement de ses pièces
}
```

L'application doit avertir l'utilisateur qui tente de téléverser un document en catégorie `PIECE_IDENTITE` ou `DONNEES_SANTE` si ce champ n'est pas renseigné — pas nécessairement bloquer (le produit n'a pas à se substituer entièrement à la diligence de votre client), mais rendre l'absence de consentement visible plutôt que silencieuse.

**Un accès plus restreint que le reste des documents du Projet.** La portée normale des Documents (section 7) suit celle du Dossier/Projet auquel ils sont rattachés — mais un document classé `PIECE_IDENTITE` ou `DONNEES_SANTE` mérite une restriction supplémentaire, indépendante du rôle habituel :

```typescript
function peutVoirDocumentSensible(utilisateur: UtilisateurConnecte, document: Document, dossier: Dossier): boolean {
  if (document.categorie === "GENERAL") return true; // la portée normale suffit
  return utilisateur.role === "ADMIN" || utilisateur.id === dossier.responsableId;
}
```

Un Employé qui voit par ailleurs très bien le Dossier de Jean (parce qu'il y a un Projet en cours qui lui est assigné) ne voit pas nécessairement son passeport — seul le responsable du Dossier et un Administrateur y accèdent par défaut.

**Traçabilité des accès.** Chaque consultation ou téléchargement d'un document classé sensible crée une ligne dans `JournalAccesDocument` — c'est ce registre de traitement que la loi impose, et c'est aussi ce qui vous permettra de répondre sereinement si un client final (Jean) demande un jour qui a consulté son passeport et quand.

**Le droit à l'effacement.** Contrairement à une facture (jamais supprimée, pour des raisons de traçabilité fiscale — Palier 1), un document personnel comme une pièce d'identité doit pouvoir être réellement effacé sur demande légitime du client final ou de votre entreprise cliente — c'est une fonctionnalité de conformité à part entière, pas une simple case à cocher :

```typescript
async function effacerDocumentClient(documentId: string, demandePar: UtilisateurConnecte) {
  const document = await db.document.findUniqueOrThrow({ where: { id: documentId } });
  await stockageR2.supprimer(document.cleStockage); // suppression réelle du fichier, pas une archive
  await db.journalAccesDocument.create({
    data: { documentId, utilisateurId: demandePar.id, action: "suppression" },
  });
  await db.document.delete({ where: { id: documentId } });
}
```

**Chiffrement au repos.** Cloudflare R2 chiffre déjà les données au repos par défaut, ce qui couvre l'essentiel pour un premier lancement. Un chiffrement applicatif supplémentaire spécifique aux documents `PIECE_IDENTITE`/`DONNEES_SANTE` (chiffrés avant l'envoi, déchiffrés seulement à l'affichage pour un utilisateur autorisé) est une amélioration à prévoir si un client à forte sensibilité (une clinique, un cabinet juridique manipulant des dossiers judiciaires) le demande explicitement, plutôt qu'un prérequis bloquant pour le lancement.

Un dernier point à valoriser commercialement plutôt qu'à subir : vos futures entreprises clientes sont, elles aussi, en pleine obligation de mise en conformité depuis juin 2026. Un produit qui gère déjà le consentement, la traçabilité des accès et le droit à l'effacement pour elles est un argument de vente concret, au même titre que la conformité à la facturation électronique DGI.

Sources consultées sur la loi camerounaise de protection des données personnelles :
- [Protection des données au Cameroun : la course contre la montre avant juin 2026 — CIO Mag](https://cio-mag.com/protection-des-donnees-au-cameroun-la-course-contre-la-montre-avant-juin-2026/)
- [Comprendre en 10 questions la nouvelle loi sur la protection des données à caractère personnel — Village Justice](https://www.village-justice.com/articles/cameroun-comprendre-questions-nouvelle-loi-sur-protection-des-donnees-caractere,52122.html)

## 10. Ordre de construction concret pour ce palier

1. Choix définitif du prestataire de chat, création d'un compte de test, et mise en place de la convention de préfixage des identifiants (section 3) avant d'écrire quoi que ce soit d'autre — c'est la seule chose ici qu'il serait coûteux de corriger après coup.
2. Provisionnement automatique des utilisateurs à l'activation de leur compte (section 6).
3. Modèle `Canal` + création automatique d'un canal à chaque nouveau Projet (section 5), avec ajout/retrait des membres au fil des assignations de tâches.
4. Interface de messagerie côté produit (liste des canaux visibles selon la portée, fenêtre de discussion via le SDK du prestataire).
5. Modèle `Document` + téléversement vers Cloudflare R2, rattaché à un Dossier ou un Projet, avec le champ `categorie` dès le départ (section 9) plutôt qu'ajouté après coup une fois des pièces d'identité déjà stockées sans distinction.
6. Restriction d'accès supplémentaire pour les catégories `PIECE_IDENTITE`/`DONNEES_SANTE` (section 9), champ de consentement sur `Dossier`, et journal d'accès.
7. Fonction d'effacement réel d'un document (section 9), distincte de la règle de non-suppression des factures.
8. Modèle `Annonce` + fil d'actualité interne, création réservée aux Managers/Administrateurs.
9. Verrouillage des trois sous-modules au forfait Pro.
10. Test délibéré de l'isolation : tenter d'ajouter un utilisateur d'une entreprise de test à un canal d'une autre doit être rendu impossible par la convention de préfixage — le même esprit de test que celui déjà recommandé pour la Row-Level Security au Palier 0, appliqué cette fois à un service externe plutôt qu'à votre propre base de données.
