# Palier 1 — Spécification technique : CRM, Devis & Facturation

*Document technique complémentaire à la stratégie & roadmap — Septembre 2026*

Ce palier s'appuie entièrement sur le socle du Palier 0 : chaque nouvelle table porte un `entrepriseId`, et les fonctions `peut()` / `portee()` déjà écrites gouvernent qui voit et modifie quoi, sans rien réinventer. C'est aussi le palier qui génère vos premiers revenus — l'objectif est qu'il soit vendable seul, avant même que les paliers suivants existent.

## 1. Ce qui se construit ici

Le pipeline commercial (CRM), la création de devis, leur conversion en facture, l'encaissement (avec le lien Mobile Money), et les relances automatiques des impayés. C'est l'équivalent fonctionnel de Zoho CRM + Zoho Books simplifié + Zoho Checkout, réunis en un seul module cohérent plutôt que trois produits séparés.

## 2. Une étape préalable obligatoire : compléter l'entreprise avec ses informations légales

Avant qu'une entreprise cliente puisse émettre le moindre devis, il faut lui demander ses informations fiscales — sans elles, aucune facture émise ne serait valide au regard de la DGI. J'ai vérifié les mentions exactement exigées sur une facture au Cameroun : le NIU (Numéro d'Identifiant Unique) est, dans les mots des guides spécialisés, "la mention la plus surveillée par la DGI" — sans lui, une entreprise n'existe pas fiscalement — accompagné du RCCM (registre du commerce), de la raison sociale complète, de l'adresse, et pour une facture B2B, du NIU du client également. Le taux de TVA camerounais est 19,25% (et non 20% comme au Maroc ou en Europe) et doit apparaître explicitement sur chaque ligne, avec la mention "TVA non applicable" pour les entreprises sous régime simplifié ou exonérées.

```prisma
// Extension du modèle Entreprise défini au Palier 0
model Entreprise {
  // ...champs existants (id, nom, secteurProfil, planAbonnement, statutAbonnement, creeLe)...

  niu               String?  // obligatoire avant le premier devis — bloquer la création sinon
  rccm              String?
  adresse           String?
  ville             String?
  assujettiTVA      Boolean  @default(true)
  compteurFactures  Int      @default(0) // voir section 5, numérotation séquentielle
  compteurDevis     Int      @default(0)

  prospects         Prospect[]
  devis             Devis[]
  factures          Facture[]
}
```

Concrètement, l'application doit bloquer la création d'un premier devis tant que `niu` n'est pas renseigné — un contrôle simple, mais qui évite qu'un client génère par erreur des documents non conformes dès le premier jour.

## 3. Modèle de données — CRM

```prisma
enum StatutProspect {
  NOUVEAU
  QUALIFIE
  PROPOSITION
  GAGNE
  PERDU
}

model Prospect {
  id                String         @id @default(cuid())
  entrepriseId      String
  entreprise        Entreprise     @relation(fields: [entrepriseId], references: [id])
  nom               String
  societeCliente    String?
  niu               String?        // NIU du client — nécessaire dès qu'on facture une entreprise (B2B)
  telephone         String         // numéro WhatsApp en priorité, cohérent avec le reste du produit
  email             String?
  statut            StatutProspect @default(NOUVEAU)
  notes             String?        @db.Text // remplace Zoho Notebook dans ce contexte

  assigneAId        String
  assigneA          Utilisateur    @relation(fields: [assigneAId], references: [id])

  interactions      Interaction[]
  devis             Devis[]
  factures          Facture[]
  creeLe            DateTime       @default(now())

  @@index([entrepriseId])
  @@index([assigneAId])
}

model Interaction {
  id          String   @id @default(cuid())
  prospectId  String
  prospect    Prospect @relation(fields: [prospectId], references: [id])
  type        String   // "appel" | "whatsapp" | "email" | "rendez-vous" | "note"
  contenu     String   @db.Text
  auteurId    String
  creeLe      DateTime @default(now())

  @@index([prospectId])
}
```

Le champ `assigneAId` est ce qui permet de réutiliser directement `portee()` du Palier 0 : un Employé ne verra que les prospects où il est l'assigné, un Manager ceux de son équipe, un Administrateur tous — exactement le même mécanisme déjà construit, appliqué à une nouvelle table.

## 4. Modèle de données — Devis & Facturation

```prisma
enum StatutDevis {
  BROUILLON
  ENVOYE
  ACCEPTE
  REFUSE
  EXPIRE
}

model Devis {
  id             String       @id @default(cuid())
  entrepriseId   String
  entreprise     Entreprise   @relation(fields: [entrepriseId], references: [id])
  numero         String       // ex: "DEV-2026-000042" — voir section 5
  prospectId     String
  prospect       Prospect     @relation(fields: [prospectId], references: [id])
  statut         StatutDevis  @default(BROUILLON)
  dateValidite   DateTime
  lignes         LigneDevis[]
  montantHT      Decimal
  montantTVA     Decimal
  montantTTC     Decimal
  creeParId      String
  creeLe         DateTime     @default(now())
  facture        Facture?     // un devis accepté engendre une facture

  @@unique([entrepriseId, numero])
  @@index([entrepriseId])
}

model LigneDevis {
  id           String  @id @default(cuid())
  devisId      String
  devis        Devis   @relation(fields: [devisId], references: [id])
  designation  String
  quantite     Decimal
  prixUnitaire Decimal
  tauxTVA      Decimal @default(19.25)
}

enum StatutFacture {
  EMISE
  PARTIELLEMENT_PAYEE
  PAYEE
  EN_RETARD
  ANNULEE
}

model Facture {
  id              String         @id @default(cuid())
  entrepriseId    String
  entreprise      Entreprise     @relation(fields: [entrepriseId], references: [id])
  numero          String         // séquentiel, sans trou — voir section 5
  prospectId      String
  prospect        Prospect       @relation(fields: [prospectId], references: [id])
  devisOrigineId  String?
  devisOrigine    Devis?         @relation(fields: [devisOrigineId], references: [id])
  statut          StatutFacture  @default(EMISE)
  lignes          LigneFacture[]
  montantHT       Decimal
  montantTVA      Decimal
  montantTTC      Decimal
  dateEmission    DateTime       @default(now())
  dateEcheance    DateTime
  paiements       Paiement[]
  avoir           AvoirFacture?

  @@unique([entrepriseId, numero])
  @@index([entrepriseId])
  @@index([statut])
}

model LigneFacture {
  id           String  @id @default(cuid())
  factureId    String
  facture      Facture @relation(fields: [factureId], references: [id])
  designation  String
  quantite     Decimal
  prixUnitaire Decimal
  tauxTVA      Decimal @default(19.25)
}

model Paiement {
  id                    String   @id @default(cuid())
  factureId             String
  facture               Facture  @relation(fields: [factureId], references: [id])
  montant               Decimal
  moyenPaiement         String   // "orange_money" | "mtn_momo" | "especes" | "virement" | "manuel"
  referenceTransaction  String?  // renvoyée par l'orchestrateur Mobile Money — absente en saisie manuelle
  saisiParId            String?  // utilisateur qui a pointé un paiement manuel (traçabilité)
  datePaiement          DateTime @default(now())
}

// Aucune facture n'est jamais supprimée (règle posée au Palier 0) —
// une annulation crée cette trace à la place.
model AvoirFacture {
  id         String   @id @default(cuid())
  factureId  String   @unique
  facture    Facture  @relation(fields: [factureId], references: [id])
  motif      String
  creeLe     DateTime @default(now())
}
```

## 5. Le point le plus strict : la numérotation séquentielle sans trou

La règle vérifiée est explicite : la numérotation d'une facture doit être "unique, continue et chronologique — sans aucun trou dans la séquence." Ce n'est pas une bonne pratique optionnelle, c'est un point de contrôle fiscal direct, et il va devenir encore plus strict avec la validation en temps réel de la DGI prévue par la loi de finances 2026. Deux pièges à éviter absolument : générer le numéro trop tôt (par exemple dès l'ouverture du formulaire, avant que l'utilisateur ait fini ou annulé) ce qui crée des trous, et laisser deux requêtes simultanées obtenir le même numéro (deux employés qui valident une facture au même instant).

```typescript
async function genererNumeroFacture(entrepriseId: string): Promise<string> {
  const annee = new Date().getFullYear();

  // La mise à jour du compteur et la lecture de sa nouvelle valeur
  // doivent être une seule opération atomique en base de données,
  // jamais un "lire puis écrire" en deux temps côté application
  // (qui laisserait deux requêtes concurrentes lire la même valeur).
  const entreprise = await db.entreprise.update({
    where: { id: entrepriseId },
    data: { compteurFactures: { increment: 1 } },
  });

  return `FAC-${annee}-${String(entreprise.compteurFactures).padStart(6, "0")}`;
}
```

Le numéro n'est généré qu'au moment exact où la facture passe à l'état `EMISE` — jamais avant, jamais à la création d'un brouillon. Une facture annulée garde son numéro d'origine pour toujours (il n'est ni réutilisé, ni comblé) ; c'est justement pour ça que l'annulation crée un `AvoirFacture` plutôt que de supprimer la ligne.

### 5bis. Envoi par email — ajout réel au-delà du sketch initial

Le sketch de modèle ci-dessus (section 4) ne prévoyait pas la personnalisation du message d'envoi ; en implémentation, une table dédiée a été ajoutée pour permettre à chaque entreprise de personnaliser l'objet et le corps du message sans exiger de configuration préalable (repli sur un modèle par défaut codé dans `src/lib/email/modeles.ts`) :

```prisma
enum TypeModeleEmail {
  ENVOI_DEVIS
  ENVOI_FACTURE
}

model ModeleEmail {
  id            String          @id @default(cuid())
  entrepriseId  String
  entreprise    Entreprise      @relation(fields: [entrepriseId], references: [id])
  type          TypeModeleEmail
  objet         String
  corps         String          @db.Text

  @@unique([entrepriseId, type])
  @@index([entrepriseId])
}
```

Envoyer un devis ou une facture (`envoyerDevis`/`envoyerFacture`, `src/lib/actions/{devis,facture}.ts`) génère le PDF à la volée (même rendu que le téléchargement, `src/lib/pdf/rendu.tsx`), l'attache à un email dont le texte interpole `{{client}}`, `{{numero}}`, `{{montant}}`, `{{entreprise}}` dans le modèle (personnalisé ou par défaut), et envoie via Resend. Le statut d'un devis ne passe à `ENVOYE` que si l'envoi réussit réellement — un échec (client sans email, Resend indisponible) est remonté à l'écran plutôt que silencieusement ignoré. Une facture n'a pas d'état "envoyée" dans `StatutFacture` : l'envoi n'y touche pas au statut, qui ne reflète que l'état de règlement.

## 6. Le workflow complet, du prospect à l'encaissement

1. Un employé crée une fiche `Prospect` (nom, téléphone WhatsApp, éventuellement NIU si c'est déjà une entreprise identifiée), assignée à lui-même par défaut.
2. Il fait progresser le statut du prospect (`NOUVEAU` → `QUALIFIE` → `PROPOSITION`) au fil des échanges, chacun consigné comme `Interaction`.
3. Il crée un `Devis` avec ses lignes (désignation, quantité, prix unitaire HT, taux de TVA), calculé automatiquement en HT/TVA/TTC, et l'envoie — par email et/ou par WhatsApp, cohérent avec le reste du produit.
4. Le prospect accepte : le devis passe à `ACCEPTE`, ce qui déclenche la création automatique d'une `Facture` reprenant les mêmes lignes (avec génération du numéro séquentiel à ce moment précis), et — une fois le Palier 2 construit — l'ouverture du Dossier client s'il n'existe pas encore, avec un nouveau Projet créé à l'intérieur pour ce travail précis (le Dossier reste permanent d'une commande à l'autre, le Projet est propre à celle-ci — voir la spécification du Palier 2 pour cette distinction). Ce point d'accroche est à prévoir dès maintenant sous forme d'un évènement interne (`devis.accepte`) même si rien ne l'écoute encore.
5. **La suite dépend du forfait de l'entreprise cliente**, vérifié via `disponible(entreprise, "PAIEMENTS_EN_LIGNE")` (mécanisme détaillé dans le document de stratégie, section Architecture) :
   - **Forfait Pro et au-dessus** : la facture est envoyée avec un lien de paiement Mobile Money généré via l'orchestrateur (Orange Money / MTN MoMo) — l'équivalent de Zoho Checkout, adapté au rail de paiement local. À la réception du paiement (confirmation renvoyée par l'orchestrateur), un `Paiement` est enregistré automatiquement (`moyenPaiement: "orange_money"` ou `"mtn_momo"`, avec `referenceTransaction`).
   - **Forfait Starter** : la facture est envoyée sans lien de paiement intégré (le client paie par le canal habituel — espèces, virement, ou même Mobile Money mais négocié hors plateforme) ; l'utilisateur enregistre lui-même le règlement via un bouton "Marquer comme payée", qui crée un `Paiement` avec `moyenPaiement: "manuel"` et `saisiParId` renseigné pour garder une traçabilité de qui a pointé le règlement.
   - Dans les deux cas, le statut de la facture passe à `PAYEE` (ou `PARTIELLEMENT_PAYEE` si le montant ne couvre pas le total) — le reste du système (tableau de bord, relances) ne fait aucune différence entre un paiement automatisé et un paiement pointé manuellement, seule la façon dont le `Paiement` a été créé diffère.
6. Une tâche planifiée (la file d'attente légère sur Postgres retenue dans l'architecture) vérifie chaque jour les factures dont la date d'échéance est dépassée sans paiement complet, les passe en `EN_RETARD`, et envoie une relance automatique par WhatsApp — disponible pour tous les forfaits, y compris Starter, puisqu'elle ne dépend pas du module Paiements en ligne.

Ce point de bascule (étape 5) est le seul endroit de tout ce palier où le plan d'abonnement de l'entreprise influence le comportement du produit — le reste (CRM, devis, numérotation, relances) est strictement identique quel que soit le forfait, ce qui garde le code simple : un seul `if` sur `disponible()`, pas une divergence de logique dispersée dans tout le module.

## 7. Rôles et portée appliqués à ce palier (rien de nouveau à construire)

La matrice définie au Palier 0 s'applique telle quelle : un Employé crée et modifie ses propres prospects et devis (portée `PROPRE`), un Manager voit ceux de son équipe (`EQUIPE`), un Administrateur voit tout (`TOUT`). Sur la Facturation, rappel de la règle posée au Palier 0 : personne ne supprime une facture, quel que soit son rôle — seule l'annulation (création d'un `AvoirFacture`) est possible, et uniquement par un Manager ou un Administrateur (un Employé peut créer un devis ou une facture, mais ne devrait pas pouvoir l'annuler seul — un ajustement mineur à la matrice existante, à faire au moment de coder ce palier).

## 8. Les requêtes qui alimentent le tableau de bord

Trois indicateurs suffisent pour la première version du tableau de bord — inutile de viser plus large avant d'avoir des utilisateurs réels qui demandent autre chose :

```typescript
// Chiffre d'affaires encaissé du mois en cours
const caduMois = await db.paiement.aggregate({
  where: { facture: { entrepriseId }, datePaiement: { gte: debutDuMois } },
  _sum: { montant: true },
});

// Factures en retard, avec leur montant total
const facturesEnRetard = await db.facture.findMany({
  where: { entrepriseId, statut: "EN_RETARD" },
  include: { prospect: true },
});

// Répartition du pipeline commercial par statut
const pipeline = await db.prospect.groupBy({
  by: ["statut"],
  where: { entrepriseId },
  _count: true,
});
```

## 9. Ordre de construction concret pour ce palier

1. Extension du modèle `Entreprise` (NIU, RCCM, adresse) + écran de complétion obligatoire avant le premier devis.
2. CRM : modèle `Prospect`/`Interaction`, liste filtrée par `portee()`, fiche prospect avec historique.
3. Devis : création, calcul HT/TVA/TTC, génération PDF avec les mentions légales complètes, envoi par email/WhatsApp.
4. Facturation : conversion devis → facture avec numérotation séquentielle (le point à tester le plus rigoureusement, y compris en simulant deux créations simultanées), génération PDF conforme.
5. Intégration Mobile Money : lien de paiement sur chaque facture, réception de la confirmation, création automatique du `Paiement`.
6. Tâche planifiée de relance des factures en retard.
7. Tableau de bord avec les trois indicateurs ci-dessus.

Une fois ces sept étapes en production et testées avec vos premiers clients pilotes, ce palier est vendable seul — c'est le moment de commencer à facturer vos premiers abonnements, sans attendre que le Palier 2 (Projets/Dossiers) soit terminé.

Sources consultées pour les mentions légales de facturation au Cameroun :
- [Règles de Facturation au Cameroun : Guide de Conformité — Yorine](https://yorine.app/blog/facturation-cameroun/)
- [Fiscalité des entreprises au Cameroun 2026 — LeFisk](https://www.lefisk.cm/blog/fiscalite-entreprises-cameroun-guide-complet)
