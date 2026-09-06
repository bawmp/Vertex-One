# Palier 2 — Spécification technique : Dossiers clients & Projets

*Document technique complémentaire à la stratégie & roadmap — Septembre 2026 (révisé : Dossier et Projet sont deux entités distinctes)*

Ce palier s'appuie sur le Palier 0 (rôles/portée, isolation par entreprise) et se raccorde directement au Palier 1 (un devis accepté engendre automatiquement du travail à suivre). Rappel du modèle économique posé à l'étape précédente : ce module est verrouillé à partir du forfait **Pro**.

## 1. La correction de conception par rapport à la première version de ce document

La première version de ce palier fusionnait Dossier et Projet en un seul objet générique, simplement renommé selon le secteur ("chantier", "dossier", "projet"). Ce n'était pas correct : ce sont deux réalités différentes, à deux échelles de temps différentes.

**Le Dossier client est permanent.** Il représente la relation avec un client donné et vit tant que cette relation existe — documents échangés, historique complet, factures liées. Un dossier ne "se termine" pas au sens où un projet se termine ; il reste ouvert (ou passe en archive si la relation cesse), et peut accueillir un travail après l'autre pendant des mois ou des années.

**Le Projet est borné dans le temps.** Il représente un travail précis à accomplir pour ce client — avec des tâches, une échéance, un responsable — et se termine véritablement une fois livré. Un même Dossier peut contenir plusieurs Projets successifs (un cabinet comptable ouvre un dossier client une fois, puis y rattache un projet "déclaration TVA de mars", un autre "audit annuel", etc.).

Cette distinction change le vocabulaire par secteur : pour un artisan, le "chantier" borné dans le temps correspond en réalité à un **Projet**, tandis que le **Dossier** devient simplement sa "Fiche client". Pour un cabinet juridique ou comptable, le mot "Dossier" garde son sens habituel (le dossier client), et le travail concret qui s'y déroule (une procédure, une déclaration) devient un **Projet**, même si le mot affiché pourrait être "Mission" ou "Affaire" selon le cas.

```typescript
const VOCABULAIRE_DOSSIER: Record<string, { singulier: string; pluriel: string }> = {
  artisan:   { singulier: "Fiche client", pluriel: "Fiches clients" },
  cabinet:   { singulier: "Dossier",      pluriel: "Dossiers" },
  agence:    { singulier: "Compte client", pluriel: "Comptes clients" },
  generique: { singulier: "Dossier",      pluriel: "Dossiers" },
};

const VOCABULAIRE_PROJET: Record<string, { singulier: string; pluriel: string }> = {
  artisan:   { singulier: "Chantier", pluriel: "Chantiers" },
  cabinet:   { singulier: "Mission",  pluriel: "Missions" },
  agence:    { singulier: "Projet",   pluriel: "Projets" },
  generique: { singulier: "Projet",   pluriel: "Projets" },
};
```

## 2. Modèle de données

```prisma
enum StatutDossier {
  ACTIF
  ARCHIVE
}

model Dossier {
  id              String        @id @default(cuid())
  entrepriseId    String
  entreprise      Entreprise    @relation(fields: [entrepriseId], references: [id])
  prospectId      String        // le client concerné (Palier 1) — un dossier appartient à un seul client
  prospect        Prospect      @relation(fields: [prospectId], references: [id])
  titre           String        // par défaut, le nom du client
  statut          StatutDossier @default(ACTIF)

  responsableId   String        // le "compte" est suivi par une personne, par défaut celle qui a gagné le client
  responsable     Utilisateur   @relation("ResponsableDossier", fields: [responsableId], references: [id])

  dateOuverture   DateTime      @default(now())

  projets         Projet[]
  commentaires    Commentaire[] // historique de la relation, indépendant d'un projet précis

  @@unique([entrepriseId, prospectId]) // un seul dossier actif par client
  @@index([entrepriseId])
  @@index([responsableId])
}

enum StatutProjet {
  A_FAIRE
  EN_COURS
  EN_REVISION
  TERMINE
  ANNULE
}

model Projet {
  id                String       @id @default(cuid())
  entrepriseId      String       // dénormalisé volontairement, pour simplifier RLS et les filtres — voir note plus bas
  entreprise        Entreprise   @relation(fields: [entrepriseId], references: [id])
  dossierId         String
  dossier           Dossier      @relation(fields: [dossierId], references: [id])
  titre             String
  description       String?      @db.Text
  statut            StatutProjet @default(A_FAIRE)

  devisOrigineId    String?      // renseigné automatiquement si créé depuis un devis accepté
  devisOrigine      Devis?       @relation(fields: [devisOrigineId], references: [id])

  responsablePrincipalId String
  responsablePrincipal   Utilisateur @relation("ResponsableProjet", fields: [responsablePrincipalId], references: [id])

  dateDebut         DateTime?
  dateEcheance      DateTime?
  champsPersonnalises Json?      // échappatoire volontaire, voir Palier 0/section Creator

  taches            Tache[]
  commentaires      Commentaire[]
  creeLe            DateTime     @default(now())

  @@index([entrepriseId])
  @@index([dossierId])
  @@index([responsablePrincipalId])
}

enum StatutTache {
  A_FAIRE
  EN_COURS
  TERMINEE
}

model Tache {
  id            String      @id @default(cuid())
  projetId      String
  projet        Projet      @relation(fields: [projetId], references: [id])
  titre         String
  statut        StatutTache @default(A_FAIRE)

  assigneAId    String
  assigneA      Utilisateur @relation(fields: [assigneAId], references: [id])

  echeance      DateTime?
  ordre         Int         @default(0)
  creeParId     String
  creeLe        DateTime    @default(now())
  termineeLe    DateTime?   // renseignée automatiquement au passage à TERMINEE — sert de base au suivi d'équipe du Palier 5

  @@index([projetId])
  @@index([assigneAId])
}

// Rattaché soit à un Dossier (historique de la relation client dans son
// ensemble), soit à un Projet précis (avancement d'un travail donné) —
// jamais aux deux à la fois.
model Commentaire {
  id          String   @id @default(cuid())
  dossierId   String?
  dossier     Dossier? @relation(fields: [dossierId], references: [id])
  projetId    String?
  projet      Projet?  @relation(fields: [projetId], references: [id])
  auteurId    String
  contenu     String   @db.Text
  creeLe      DateTime @default(now())

  @@index([dossierId])
  @@index([projetId])
}
```

Note sur `entrepriseId` dupliqué au niveau du Projet alors qu'il pourrait se déduire de `dossier.entrepriseId` : c'est un choix délibéré pour que les politiques RLS (Palier 0, section 6) et les filtres de portée s'appliquent directement sur `Projet` sans devoir systématiquement remonter jusqu'au `Dossier` parent dans chaque requête — un léger compromis de normalisation en échange d'un code de filtrage plus simple et plus rapide, courant dans ce genre d'architecture multi-tenant.

## 3. Le pont automatique depuis le Palier 1, corrigé

Un devis accepté ne crée plus un objet unique : il vérifie d'abord si le client a déjà un Dossier ouvert (un client fidèle qui commande une deuxième fois n'a pas besoin d'un deuxième dossier), puis crée toujours un nouveau Projet à l'intérieur :

```typescript
async function surDevisAccepte(devis: Devis) {
  let dossier = await db.dossier.findUnique({
    where: { entrepriseId_prospectId: { entrepriseId: devis.entrepriseId, prospectId: devis.prospectId } },
  });

  if (!dossier) {
    dossier = await db.dossier.create({
      data: {
        entrepriseId: devis.entrepriseId,
        prospectId: devis.prospectId,
        titre: devis.prospect.nom,
        responsableId: devis.creeParId, // par défaut, celui qui a gagné le client
      },
    });
  }

  await db.projet.create({
    data: {
      entrepriseId: devis.entrepriseId,
      dossierId: dossier.id,
      titre: `${VOCABULAIRE_PROJET[devis.entreprise.secteurProfil]?.singulier ?? "Projet"} — ${devis.numero}`,
      devisOrigineId: devis.id,
      responsablePrincipalId: devis.creeParId,
      statut: "A_FAIRE",
    },
  });
}
```

Un deuxième devis accepté plus tard pour le même client retrouve son Dossier existant et y ajoute simplement un nouveau Projet — c'est exactement ce que permet la distinction que vous avez soulevée, et que la version précédente de ce document ne permettait pas de représenter correctement.

## 4. "Mes tâches" (inchangé dans son principe, adapté au nouveau modèle)

```typescript
async function mesTaches(utilisateur: UtilisateurConnecte) {
  return db.tache.findMany({
    where: {
      assigneAId: utilisateur.id,
      projet: { entrepriseId: utilisateur.entrepriseId },
      statut: { not: "TERMINEE" },
    },
    include: { projet: { include: { dossier: true } } },
    orderBy: { echeance: "asc" },
  });
}
```

## 5. Rôles et portée : deux modules désormais, pas un seul

La matrice de permissions du Palier 0 reçoit deux entrées distinctes, `DOSSIERS` et `PROJETS`, plutôt qu'une seule `PROJETS` fusionnée :

- **Portée sur un Dossier** : `TOUT` (Admin), `EQUIPE` (Manager — dossiers dont le responsable fait partie de son équipe), `PROPRE` (Employé — dossiers dont il est responsable, ou dont un projet lui appartient).
- **Portée sur un Projet** : la même logique, mais évaluée sur `responsablePrincipalId` et les `Tache.assigneAId` du projet plutôt que sur le `Dossier` parent — un Employé peut très bien voir un Projet particulier à l'intérieur d'un Dossier qu'il ne "possède" pas dans son ensemble.

```typescript
const idsProjetsVisibles = await db.projet.findMany({
  where: {
    entrepriseId: utilisateur.entrepriseId,
    OR: [
      { responsablePrincipalId: utilisateur.id },
      { taches: { some: { assigneAId: utilisateur.id } } },
    ],
  },
  select: { id: true },
});

// Un Dossier reste visible à un Employé s'il en est responsable,
// OU s'il a accès à au moins un Projet qu'il contient.
const dossiersVisibles = await db.dossier.findMany({
  where: {
    entrepriseId: utilisateur.entrepriseId,
    OR: [
      { responsableId: utilisateur.id },
      { projets: { some: { id: { in: idsProjetsVisibles.map(p => p.id) } } } },
    ],
  },
});
```

## 6. Verrouillage par abonnement

Comme dans la première version de ce palier, l'accès est vérifié au niveau de la route plutôt que d'une action isolée — mais désormais sur les deux modules :

```typescript
if (!disponible(utilisateur.entreprise, "DOSSIERS") || !disponible(utilisateur.entreprise, "PROJETS")) {
  return reponseErreur(403, "Les Dossiers et Projets nécessitent le forfait Pro ou supérieur.");
}
```

Les deux modules sont verrouillés ensemble au même palier (Pro) pour l'instant — rien n'empêche de les séparer plus tard si un profil de client se révèle vouloir l'un sans l'autre (un cabinet qui veut des dossiers clients sans suivi de tâches détaillé, par exemple), mais ce n'est pas un besoin identifié à ce stade.

## 7. Nouvelles requêtes pour le tableau de bord

```typescript
// Projets actifs par statut
const projetsParStatut = await db.projet.groupBy({
  by: ["statut"],
  where: { entrepriseId, statut: { not: "TERMINE" } },
  _count: true,
});

// Tâches en retard, tous projets confondus
const tachesEnRetard = await db.tache.findMany({
  where: { projet: { entrepriseId }, statut: { not: "TERMINEE" }, echeance: { lt: new Date() } },
  include: { assigneA: true, projet: { include: { dossier: true } } },
});

// Dossiers actifs sans aucun projet en cours — un signal utile pour
// un Manager (client "en sommeil" à relancer commercialement)
const dossiersSansProjetActif = await db.dossier.findMany({
  where: {
    entrepriseId,
    statut: "ACTIF",
    projets: { none: { statut: { in: ["A_FAIRE", "EN_COURS", "EN_REVISION"] } } },
  },
});
```

Ce dernier indicateur est un bénéfice direct de la séparation Dossier/Projet : il n'aurait pas pu exister avec le modèle fusionné de la première version, puisqu'il n'y avait alors aucune façon de distinguer "un client sans travail en cours" d'"un client qui n'a jamais existé dans le système".

## 8. Ordre de construction concret pour ce palier

1. Modèle `Dossier`/`Projet`/`Tache`/`Commentaire`, avec les deux vocabulaires configurables à l'affichage.
2. Création automatique du Dossier à la première commande d'un client (ou manuellement, pour un client existant avant la mise en place du produit).
3. Le pont corrigé `devis.accepte → Dossier (créé si besoin) + nouveau Projet`, testé notamment avec un deuxième devis pour un client déjà connu.
4. Vue Dossier (fiche client avec ses projets passés et en cours, son historique) et vue Projet (tâches, échéances, kanban).
5. Vue "Mes tâches" transverse.
6. Verrouillage des deux modules au niveau des routes pour le forfait Starter.
7. Ajout des requêtes de tableau de bord ci-dessus, y compris l'indicateur de clients sans projet actif.

Merci d'avoir relevé cette confusion avant la construction plutôt qu'après — c'est exactement le genre de correction qui coûte quelques minutes maintenant et des semaines de refonte une fois du code réel écrit dessus.

## 9. Écarts réels avec ce document, constatés à la construction

- **`entrepriseId` ajouté sur `Tache` et `Commentaire`**, absents du sketch Prisma de la section 2 (qui ne portait que `projetId`/`dossierId`+`projetId`). Même raisonnement que `LigneDevis`/`LigneFacture` au Palier 1 (voir CLAUDE.md, règle "sans exception") : une politique RLS directe sur la table plutôt qu'une sous-requête vers le Projet/Dossier parent à chaque lecture/écriture.
- **Verrouillage Pro appliqué uniquement aux routes de consultation**, jamais au pont `devis.accepte → Dossier/Projet` lui-même (conforme à la section 6 : "l'accès est vérifié au niveau de la route") — un Dossier/Projet peut donc exister en base pour une entreprise Starter (créé avant un éventuel downgrade, ou si le pont s'exécute avant toute vérification), simplement invisible tant que le forfait ne le permet pas. Comportement voulu, pas un oubli.
- **Kanban simplifié en liste + sélecteur de statut** pour la vue Projet (section 4, "Vue Projet... kanban") : un `<select>` par tâche suffit tant qu'aucun utilisateur réel n'a demandé le drag & drop, cohérent avec l'esprit du projet de ne pas construire au-delà du besoin exprimé.
- **Contrainte "jamais dossierId et projetId en même temps" sur `Commentaire`** appliquée à la couche action (`src/lib/actions/{dossier,projet}.ts`), pas par une contrainte SQL — cohérent avec le reste du produit, qui ne valide pas ce type de règle en base.
