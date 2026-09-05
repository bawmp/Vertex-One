# Palier 6 — Spécification technique : Marketing, visioconférence, facturation d'abonnements

*Document technique complémentaire à la stratégie & roadmap — Septembre 2026*

Ce palier regroupe les modules complémentaires les moins prioritaires de la vision d'ensemble — à ne construire, comme rappelé dès le départ, qu'une fois une vraie demande observée chez vos clients pilotes, pas par anticipation. Il reprend systématiquement des briques déjà construites (WhatsApp, Facturation, la file d'attente planifiée) plutôt que d'en ajouter de nouvelles.

## 1. Ce qui se construit ici, dans l'ordre de priorité probable

Chez Zoho, Campaigns, Marketing Automation, Social et LandingPage sont quatre produits séparés ; ici, un seul module Marketing. S'y ajoutent la visioconférence (Zoho Meeting) et, en option à la carte plutôt qu'inclus dans un forfait, la facturation d'abonnements récurrents pour les clients qui vendent eux-mêmes par abonnement (Zoho Billing).

## 2. Marketing : campagnes et automatisations simples

```prisma
enum CanalCampagne { EMAIL WHATSAPP }
enum StatutCampagne { BROUILLON ENVOYEE }

model Campagne {
  id            String         @id @default(cuid())
  entrepriseId  String
  entreprise    Entreprise     @relation(fields: [entrepriseId], references: [id])
  nom           String
  canal         CanalCampagne
  contenu       String         @db.Text
  segment       Json           // critère simple, ex: { statut: "PERDU" } ou { sansProjetDepuisJours: 90 }
  statut        StatutCampagne @default(BROUILLON)
  envoyeeLe     DateTime?
  creeParId     String
  creeLe        DateTime       @default(now())
}
```

Le `segment` reste volontairement un simple critère (statut du prospect, ancienneté sans activité) plutôt qu'un constructeur de requêtes complexe façon Creator — cohérent avec toutes les décisions similaires prises aux paliers précédents. L'envoi lui-même réutilise l'API WhatsApp Business et l'envoi d'email déjà en place depuis le Palier 1, seulement appliqués à une liste de prospects plutôt qu'à un seul.

**Les automatisations simples ne sont pas un moteur de règles générique** — encore un endroit où la tentation de construire un petit Creator serait mauvaise. Ce sont des déclencheurs fixes et prédéfinis, écoutant des évènements qui existent déjà dans le système :

```typescript
// Relance automatique d'un prospect resté trop longtemps sans interaction
async function verifierProspectsInactifs(entrepriseId: string) {
  const seuil = joursAvant(7);
  const prospects = await db.prospect.findMany({
    where: {
      entrepriseId,
      statut: "PROPOSITION",
      interactions: { none: { creeLe: { gte: seuil } } },
    },
  });
  for (const prospect of prospects) {
    await envoyerWhatsApp(prospect.telephone, MODELE_RELANCE_PROPOSITION);
  }
}

// Relance d'un client sans nouveau projet depuis longtemps — réutilise
// directement l'indicateur déjà construit au Palier 2 pour le tableau de bord
async function verifierClientsEnSommeil(entrepriseId: string) {
  const dossiers = await dossiersSansProjetActif(entrepriseId); // fonction du Palier 2
  for (const dossier of dossiers) {
    await envoyerWhatsApp(dossier.prospect.telephone, MODELE_RELANCE_CLIENT);
  }
}
```

Ces deux fonctions rejoignent la même tâche planifiée quotidienne déjà utilisée pour les factures et tâches en retard (Paliers 1 et 2) — une troisième et quatrième vérification ajoutées à une infrastructure qui existe déjà, pas un nouveau système de planification.

## 3. Page d'atterrissage : capter des leads directement dans le CRM

```prisma
model PageAtterrissage {
  id            String   @id @default(cuid())
  entrepriseId  String
  entreprise    Entreprise @relation(fields: [entrepriseId], references: [id])
  slug          String   @unique // ex: "garage-mbarga" → votredomaine.com/p/garage-mbarga
  titre         String
  texte         String   @db.Text
  imageUrl      String?
  texteBouton   String   @default("Nous contacter")
  publiee       Boolean  @default(false)
  creeLe        DateTime @default(now())
}
```

Une poignée de modèles préconçus (texte, image, un bouton d'appel à l'action) suffit très largement — encore une fois, pas d'éditeur visuel libre à construire. La soumission du formulaire de contact sur cette page crée directement un `Prospect` avec `statut: "NOUVEAU"`, exactement comme s'il avait été saisi à la main dans le CRM (Palier 1) — la page d'atterrissage n'est qu'une deuxième porte d'entrée vers la même donnée, pas un système parallèle.

## 4. Visioconférence : un lien généré, pas un moteur construit

Comme décidé dans l'architecture générale, construire un moteur de visioconférence serait disproportionné. Jitsi Meet permet de créer une salle de réunion instantanément à partir d'une simple URL, sans compte ni clé d'API à gérer — un choix encore plus simple que Google Meet, qui demanderait une intégration OAuth avec l'API Google Calendar pour un bénéfice équivalent pour vos clients :

```typescript
function genererLienVisio(entrepriseId: string, prospectId: string): string {
  const salle = `${entrepriseId}-${prospectId}-${Date.now()}`;
  return `https://meet.jit.si/${salle}`;
}
```

Ce lien s'attache simplement à une `Interaction` de type "rendez-vous" (Palier 1) et se partage par WhatsApp — aucun nouveau modèle de données n'est nécessaire.

## 5. Facturation d'abonnements récurrents : un add-on à la carte, pas un palier de forfait

Ce sous-module ne concerne qu'un profil de client précis — une agence ou un prestataire qui facture lui-même ses propres clients de façon récurrente (une maintenance mensuelle de site, un forfait d'accompagnement). Ce n'est pas un besoin universel comme la facturation ponctuelle du Palier 1, donc ce n'est pas rattaché à un palier de forfait (Starter/Pro/Business) mais activable à la carte, avec son propre supplément — cohérent avec la ligne "Modules complémentaires — en options à l'unité" déjà posée dans le modèle de tarification.

```prisma
model AbonnementClient {
  id                String   @id @default(cuid())
  entrepriseId      String
  entreprise        Entreprise @relation(fields: [entrepriseId], references: [id])
  prospectId        String   // le client final qui paie l'abonnement
  prospect          Prospect @relation(fields: [prospectId], references: [id])
  libelle           String   // ex: "Maintenance mensuelle du site"
  montant           Decimal
  frequence         String   // "mensuel" | "trimestriel" | "annuel"
  prochaineEcheance DateTime
  statut            String   @default("actif") // "actif" | "suspendu" | "resilie"
  creeLe            DateTime @default(now())
}
```

La tâche planifiée quotidienne, encore elle, vérifie chaque jour les abonnements dont l'échéance est atteinte et **génère automatiquement une nouvelle Facture** en réutilisant telle quelle la mécanique du Palier 1 (numérotation séquentielle comprise) — la facturation d'abonnement n'a pas son propre moteur de facturation, elle ne fait que déclencher celui qui existe déjà, à intervalles réguliers plutôt que sur une action manuelle :

```typescript
async function genererFacturesAbonnements() {
  const echus = await db.abonnementClient.findMany({
    where: { statut: "actif", prochaineEcheance: { lte: new Date() } },
  });
  for (const abonnement of echus) {
    await creerFactureDepuisAbonnement(abonnement); // réutilise la Facturation du Palier 1
    await db.abonnementClient.update({
      where: { id: abonnement.id },
      data: { prochaineEcheance: ajouterPeriode(abonnement.prochaineEcheance, abonnement.frequence) },
    });
  }
}
```

**Le mécanisme de verrouillage change de nature ici** : ce n'est plus un palier de forfait mais un module payant à la carte, indépendant du plan d'abonnement de l'entreprise :

```prisma
model AddonActif {
  id           String   @id @default(cuid())
  entrepriseId String
  entreprise   Entreprise @relation(fields: [entrepriseId], references: [id])
  addon        String   // "FACTURATION_ABONNEMENTS", et d'autres à l'avenir
  prixMensuel  Decimal
  activeLe     DateTime @default(now())

  @@unique([entrepriseId, addon])
}
```

```typescript
// disponible() du Palier 1 étendu pour vérifier aussi les add-ons à la carte,
// en plus de la matrice par forfait — sans rien casser de ce qui existe déjà.
export async function disponible(entreprise: EntrepriseAvecPlan, fonctionnalite: Fonctionnalite): Promise<boolean> {
  if (entreprise.statutAbonnement === "suspendu") return false;
  if (FONCTIONNALITES_PAR_PLAN[entreprise.planAbonnement]?.includes(fonctionnalite)) return true;

  const addon = await db.addonActif.findUnique({
    where: { entrepriseId_addon: { entrepriseId: entreprise.id, addon: fonctionnalite } },
  });
  return Boolean(addon);
}
```

Un client Starter peut ainsi acheter uniquement la Facturation d'abonnements sans avoir à monter au forfait Pro ou Business — utile pour une petite agence qui n'a besoin de rien d'autre que du CRM, de la facturation de base, et de ce complément précis.

## 6. Ce que je recommande de ne pas construire sans demande explicite : Social

Zoho Social publie sur les réseaux sociaux via les API propres à chaque plateforme (Facebook, Instagram, LinkedIn), chacune avec ses propres règles d'accès, ses propres révisions d'application, et ses propres limites de fréquence — un chantier d'intégration à part entière, sans commune mesure avec le reste de ce palier. Pour vos clients cibles (agences, artisans, cabinets), publier sur les réseaux sociaux n'est presque jamais le besoin le plus urgent. Je recommande de ne pas construire ce sous-module du tout tant qu'un client pilote ne le réclame pas explicitement et concrètement — et si la demande apparaît, d'intégrer un agrégateur tiers spécialisé dans la publication multi-réseaux plutôt que de développer une intégration par plateforme sociale.

## 7. Ordre de construction concret pour ce palier

1. Campagnes (email/WhatsApp) sur un segment simple — le sous-module le plus directement réutilisable de tout ce qui existe déjà.
2. Automatisations de relance (prospects inactifs, clients en sommeil), ajoutées à la tâche planifiée existante.
3. Page d'atterrissage avec quelques modèles préconçus, formulaire relié directement à la création de `Prospect`.
4. Lien de visioconférence Jitsi, attaché aux interactions de type rendez-vous.
5. Facturation d'abonnements récurrents, avec le mécanisme `AddonActif` — à ne construire que si un client pilote a explicitement ce profil d'activité (agence, prestataire récurrent).
6. Social : à ne pas construire à ce stade, sauf demande explicite et concrète d'un client, avec une préférence pour un agrégateur tiers plutôt qu'une intégration par réseau.

Avec ce palier, les six paliers de la vision d'ensemble sont tous spécifiés — de la fondation des rôles et permissions jusqu'aux modules les plus périphériques, chacun vendable et construit dans l'ordre où il apporte de la valeur, plutôt que comme un grand tout à livrer d'un coup.
