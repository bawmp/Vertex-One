# Palier 5 — Spécification technique : Ressources Humaines

*Document technique complémentaire à la stratégie & roadmap — Septembre 2026*

Ce palier s'appuie sur le compte `Utilisateur` du Palier 0 (un salarié dans l'entreprise cliente est déjà un compte du système) et reprend, pour les données sensibles, la même logique de restriction posée au Palier 3 pour les documents d'identité. Rappel du modèle économique : verrouillé au forfait **Business**, comme la Signature électronique et la Comptabilité complète.

## 1. Ce qui se construit ici, et ce qui en est délibérément écarté

Le dossier employé, les congés/absences, le suivi de présence, les évaluations, et à terme un suivi de recrutement léger (équivalent Zoho People + Recruit). **La paie n'est pas construite dans ce palier** — la raison, déjà annoncée dans la vision d'ensemble, se précise à la section 6 avec des chiffres concrets qui montrent pourquoi ce n'est pas une prudence excessive.

## 2. Le choix de conception : le Dossier RH étend le compte Utilisateur, il ne le duplique pas — et il se crée tout seul

Un salarié de votre client est déjà un `Utilisateur` (Palier 0) avec un rôle et des droits. Le Dossier RH ajoute les informations propres à l'emploi, sans recréer une identité séparée :

```prisma
enum TypeContrat {
  CDI
  CDD
  STAGE
  PRESTATAIRE
}

model DossierRH {
  id              String      @id @default(cuid())
  entrepriseId    String
  entreprise      Entreprise  @relation(fields: [entrepriseId], references: [id])
  utilisateurId   String      @unique
  utilisateur     Utilisateur @relation(fields: [utilisateurId], references: [id])

  poste           String      @default("Non renseigné")
  typeContrat     TypeContrat @default(CDI)
  dateEmbauche    DateTime    // saisie par la personne qui crée l'invitation (Palier 0), jamais une date système
  dateFinContrat  DateTime?   // pour un CDD
  salaireBase     Decimal?    // jamais rempli automatiquement, champ le plus sensible — voir section 5
  nombrePersonnesACharge Int  @default(0) // utile plus tard pour l'abattement IRPP, voir section 6
  soldeConges     Decimal     @default(0) // en jours

  demandesConges  DemandeConge[]
  pointages       Pointage[]
  evaluations     Evaluation[]
  creeLe          DateTime    @default(now())

  @@index([entrepriseId])
}
```

**Ce dossier n'est pas créé par un formulaire séparé : il se crée automatiquement dès que le compte de l'employé devient actif**, en reprenant le poste, le type de contrat et la date d'embauche saisis par la personne qui a créé l'invitation — la mécanique exacte, y compris pourquoi elle ne dépend pas du forfait de l'entreprise, est détaillée dans la spécification du Palier 0, section 8 (`surUtilisateurActive`). Un Dossier RH n'existe que pour les comptes qui sont réellement des salariés de l'entreprise cliente — un compte `CLIENT` (portail restreint, Palier 4) n'en reçoit jamais. Ces trois champs restent modifiables ensuite par un Administrateur si une correction est nécessaire ; en revanche, le salaire n'est jamais rempli automatiquement — c'est une donnée qu'un Administrateur saisit lui-même, au moment qui lui convient, jamais déduite d'une valeur par défaut.

## 2bis. Suivi d'équipe : voir ce que chaque employé a fait, et quand

Un besoin exprimé directement par vous : un Manager (ou l'Administrateur) doit pouvoir suivre son équipe et consulter, pour un employé donné, les tâches qu'il a effectuées à une date précise — pas seulement son solde de congés ou son poste. Cette capacité ne s'ajoute pas ici : elle existe déjà dans les données du Palier 2 (`Tache`, avec son champ `termineeLe` qui date le passage réel au statut `TERMINEE` — voir la spécification du Palier 2), il ne manque qu'un moyen de l'interroger par employé et par période :

```typescript
async function activiteEmploye(demandeur: UtilisateurConnecte, employeId: string, dateDebut: Date, dateFin: Date) {
  if (!(demandeur.role === "ADMIN" || estDansSonEquipe(demandeur, employeId) || demandeur.id === employeId)) {
    throw new AccesRefuse();
  }

  return db.tache.findMany({
    where: {
      assigneAId: employeId,
      projet: { entrepriseId: demandeur.entrepriseId },
      termineeLe: { gte: dateDebut, lt: dateFin },
    },
    include: { projet: { include: { dossier: true } } },
    orderBy: { termineeLe: "desc" },
  });
}

// Vue d'ensemble pour un Manager : le nombre de tâches terminées par
// chacun de ses employés sur une période, avant de creuser le détail.
async function tableauEquipe(manager: UtilisateurConnecte, dateDebut: Date, dateFin: Date) {
  const membres = await getMembresEquipe(manager.id); // relation déjà posée au Palier 0
  return Promise.all(membres.map(async (membre) => ({
    employe: membre,
    tachesTerminees: await db.tache.count({
      where: { assigneAId: membre.id, termineeLe: { gte: dateDebut, lt: dateFin } },
    }),
  })));
}
```

Un point important sur le verrouillage par abonnement : **ce suivi d'équipe ne nécessite pas le forfait Business.** Il ne fait qu'interroger différemment des données de Projets/Tâches déjà accessibles à un Manager avec la portée `EQUIPE` posée au Palier 2, donc déjà couvertes par le forfait Pro. Ce n'est que lorsque ce suivi se combine à des informations propres au Dossier RH (temps de présence, congés pris sur la même période) que le forfait Business devient nécessaire — la distinction à faire au moment de construire l'écran : un tableau "tâches effectuées par mon équipe" est du Pro, un tableau qui croise ça avec les présences et absences est du Business.

## 3. Congés, présence, évaluations

```prisma
enum TypeConge { CONGE_PAYE MALADIE SANS_SOLDE AUTRE }
enum StatutDemande { EN_ATTENTE APPROUVEE REFUSEE }

model DemandeConge {
  id            String        @id @default(cuid())
  dossierRHId   String
  dossierRH     DossierRH     @relation(fields: [dossierRHId], references: [id])
  type          TypeConge
  dateDebut     DateTime
  dateFin       DateTime
  nombreJours   Decimal
  statut        StatutDemande @default(EN_ATTENTE)
  approuveParId String?
  motif         String?       // à traiter comme une donnée de santé si TypeConge = MALADIE — voir section 7
  creeLe        DateTime      @default(now())

  @@index([dossierRHId])
}

model Pointage {
  id           String   @id @default(cuid())
  dossierRHId  String
  dossierRH    DossierRH @relation(fields: [dossierRHId], references: [id])
  date         DateTime @db.Date
  heureArrivee DateTime?
  heureDepart  DateTime?
  statut       String   // "present" | "absent" | "retard" | "conge"

  @@unique([dossierRHId, date])
}

model Evaluation {
  id           String   @id @default(cuid())
  dossierRHId  String
  dossierRH    DossierRH @relation(fields: [dossierRHId], references: [id])
  evaluateurId String
  periode      String   // ex: "2026-S1"
  commentaire  String?  @db.Text
  creeLe       DateTime @default(now())

  @@index([dossierRHId])
}
```

Pour le pointage, la solution la plus réaliste pour une TPE de service n'est pas un boîtier biométrique mais un bouton "Je suis arrivé" / "Je pars" dans l'application, accessible depuis un téléphone — cohérent avec un produit pensé mobile d'abord, et suffisant pour l'immense majorité de vos clients cibles.

## 4. Recrutement : une extension légère, à construire une fois le cœur RH stabilisé

```prisma
model OffreEmploi {
  id           String   @id @default(cuid())
  entrepriseId String
  titre        String
  description  String   @db.Text
  statut       String   @default("ouverte") // "ouverte" | "pourvue" | "fermee"
  candidatures Candidature[]
  creeLe       DateTime @default(now())
}

model Candidature {
  id           String   @id @default(cuid())
  offreId      String
  offre        OffreEmploi @relation(fields: [offreId], references: [id])
  nomCandidat  String
  telephone    String
  cvCleStockage String? // document stocké dans Cloudflare R2, comme au Palier 3
  statut       String   @default("recue") // "recue" | "entretien" | "retenue" | "rejetee"
  creeLe       DateTime @default(now())
}
```

Volontairement sommaire : la vision d'ensemble plaçait déjà ce sous-module "à terme", et il n'y a pas de raison d'y investir plus tant que le cœur RH (Dossier, congés, présence) n'a pas de vrais utilisateurs qui le réclament.

## 5. Rôles et portée : une restriction de champ, pas seulement de ligne

La portée habituelle s'applique à qui peut voir *quel dossier* (un Employé voit le sien, un Manager ceux de son équipe, un Administrateur tous) — mais certains *champs* à l'intérieur d'un dossier par ailleurs visible restent plus sensibles que d'autres, exactement comme au Palier 3 pour les documents d'identité :

```typescript
function peutVoirSalaire(utilisateur: UtilisateurConnecte, dossierRH: DossierRH): boolean {
  return utilisateur.role === "ADMIN" || utilisateur.id === dossierRH.utilisateurId;
}
```

Un Manager qui approuve légitimement les demandes de congé de son équipe (portée `EQUIPE` sur `DemandeConge`) ne voit pas pour autant le salaire de ses subordonnés — seul l'Administrateur et la personne concernée elle-même y accèdent. C'est le même principe de restriction de champ que celui posé pour les pièces d'identité, appliqué ici à une deuxième catégorie de donnée sensible.

## 6. Pourquoi la paie reste hors de ce palier — avec des chiffres, pas seulement un principe de prudence

La prudence annoncée dans la vision d'ensemble se justifie concrètement une fois qu'on regarde le détail des cotisations camerounaises : l'employeur cotise à la CNPS sur un salaire plafonné à 300 000 FCFA pour les allocations familiales (7%, entièrement à sa charge) et la retraite (2,8% employeur + 1,4% salarié), plus une cotisation accidents du travail qui varie selon la catégorie de risque de l'entreprise (1,75%, 2,5% ou 5%) — sans compter la retraite complémentaire (CRC, 6% partagé, plafonnée à 2 000 000 FCFA) et la cotisation emploi-formation (CNE, 1,2%). L'IRPP retenu à la source suit un barème progressif (exonéré jusqu'à 2 000 000 FCFA annuels, puis 10%, 15%, 25% par tranche) avec un abattement de 20 000 FCFA par personne à charge, plafonné à 6 personnes. À cela s'ajoutent des échéances de déclaration précises (CNPS entre le 15 et le 20 du mois suivant, déclaration annuelle des salaires avant le 31 janvier) et des pénalités de retard.

Ce n'est pas un calcul complexe à écrire une fois — c'est un calcul dont les taux, plafonds et barèmes changent au fil des lois de finances successives, avec une obligation de déclaration à des échéances précises. Une erreur ou un taux obsolète a un impact financier direct sur votre client et sur ses salariés, bien plus grave qu'un bug dans un tableau de bord.

**L'approche retenue** : le Dossier RH construit ici (section 2) collecte tout ce dont un calcul de paie a besoin — salaire de base, jours travaillés, absences, congés pris, nombre de personnes à charge — et l'exporte dans un format exploitable, plutôt que de calculer lui-même le bulletin de paie et les cotisations. Deux chemins pour la suite, à décider selon la demande réelle de vos clients Business : un partenariat avec un logiciel de paie camerounais déjà conforme (il en existe au moins un acteur local spécialisé, Omamori, positionné précisément sur CNPS/IRPP/DIPE), ou le développement d'un module de paie dédié plus tard, comme un chantier à part entière avec sa propre vigilance réglementaire — jamais comme une simple extension ajoutée en fin de sprint à ce palier.

## 7. Un rappel de gouvernance des données, pas un nouveau mécanisme

Le salaire, et le motif d'une demande de congé maladie, sont des données personnelles sensibles au sens de la loi camerounaise de protection des données déjà traitée au Palier 3 — sauf qu'ici, la personne concernée est un salarié de votre client, pas un client final de votre client. Le principe reste identique et ne demande rien de nouveau à construire : restriction de champ (section 5), et la même vigilance sur la traçabilité des accès si un client Business le demande explicitement pour ses données RH, en réutilisant `JournalAccesDocument` du Palier 3 plutôt qu'un mécanisme parallèle.

## 8. Verrouillage par abonnement

```typescript
if (!disponible(utilisateur.entreprise, "RH")) {
  return reponseErreur(403, "Les Ressources Humaines nécessitent le forfait Business.");
}
```

## 9. Ordre de construction concret pour ce palier

1. `DossierRH` rattaché à un `Utilisateur`, créé automatiquement à l'activation du compte (Palier 0, section 8) — pas de formulaire séparé à remplir par un Administrateur pour l'ouverture du dossier lui-même, seulement pour l'enrichir ensuite (salaire, personnes à charge).
2. Demandes de congés avec workflow d'approbation (Manager sur son équipe, Administrateur sur tous), et mise à jour du solde de congés.
3. Pointage simple par bouton, avec vue d'équipe pour un Manager.
4. Restriction de champ sur le salaire (section 5), testée explicitement : un Manager doit pouvoir approuver un congé sans jamais voir le salaire associé au même dossier.
5. Évaluations, en texte libre pour la première version plutôt qu'un système de notation structuré à construire.
6. Verrouillage du module au forfait Business.
7. Export du Dossier RH dans un format exploitable par un partenaire paie, sans aucun calcul de cotisation ou d'IRPP dans le produit lui-même à ce stade.
8. Recrutement (section 4), seulement une fois une demande réelle observée chez vos premiers clients Business.

Sources consultées sur les cotisations sociales et l'IRPP au Cameroun :
- [Charges sociales et impôts employeur au Cameroun — Africarrières](https://africarrieres.com/cameroun/fr/guide/employeur-entreprise/charges-employeur)
- [Logiciel de paie Cameroun — CNPS, IRPP, DIPE — Omamori](https://omamori.cm/en_US/paie)
