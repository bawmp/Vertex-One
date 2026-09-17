import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Users, UserPlus, Building2, Handshake, Receipt, FolderKanban, FileText, MessageSquare, Megaphone, Settings, FileSignature, Calculator, IdCard, Rocket, ShoppingCart, Package, Landmark, Wallet, BarChart3, Clock, ClipboardList, Repeat, CreditCard, Undo2, BookText, BookOpenText, PiggyBank, ShieldCheck, CalendarClock, LifeBuoy, ClipboardCheck, CalendarCheck, Briefcase, Mail, UserCog, Lock, KeyRound } from "lucide-react";
import { db } from "@/db/client";
import { utilisateur, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, type Module, type RoleSysteme } from "@/lib/permissions";
import { LogoEntreprise } from "@/components/logo-entreprise";
import { traduire } from "@/lib/i18n/traduire";
import { LangueProvider } from "@/lib/i18n/contexte";
import { traduireNav, traduireCategorie } from "@/lib/i18n/nav";
import { calculerEtatAbonnement } from "@/lib/abonnement/etat";
import { BanniereAbonnement } from "./banniere-abonnement";
import { NavLink, NavGroup } from "./nav-link";
import { MenuUtilisateur } from "./menu-utilisateur";

type IconeComposant = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
// module optionnel — un lien de sous-menu peut appartenir à un module
// différent de celui du parent (ex. le raccourci "Documents" sous CRM >
// Ventes reste gouverné par le module DOCUMENTS, pas CRM) ; absent, il
// hérite implicitement de la visibilité du groupe parent.
// reserveAdmin : certains liens (Shifts/Politiques de congé) sont gardés par
// une vérification de rôle directe dans la page elle-même, pas par un module
// de permission dédié (contrairement à Comptabilité, réservée à
// l'Administrateur via peut()) — reproduit ici le même filtre pour ne pas
// afficher un lien qui mènerait systématiquement à un écran d'accès refusé
// pour un Manager/Employé.
type LienMenu = { libelle: string; href: string; Icone: IconeComposant; module?: Module; reserveAdmin?: boolean };
type GroupeMenu = { categorie?: string; liens: LienMenu[] };
type ItemMenu =
  // module absent (ex. "Mon compte") : visible à tout utilisateur connecté,
  // aucune vérification peut() — un réglage personnel n'est jamais gouverné
  // par la matrice de permissions par module. reserveAdmin (ex. "Espace
  // personnel", Tranche 4) : même garde directe par rôle déjà utilisée pour
  // certains sous-liens (Shifts/Politiques de congé) — un espace privé de
  // l'Admin n'a pas de module de permission dédié.
  | { module?: Module; libelle: string; href: string; Icone: IconeComposant; groupes?: undefined; reserveAdmin?: boolean }
  // module optionnel ici : CRM a un seul module qui gouverne tout le groupe
  // (les liens y ajoutent le leur seulement pour un raccourci ponctuel vers
  // un module différent, ex. Documents/Campagnes). FACO n'a pas de module
  // unique équivalent — Facturation/Achats/Produits/Comptabilité sont 4
  // permissions distinctes avec des visibilités différentes par rôle (ex.
  // Comptabilité réservée à l'Administrateur) — donc chaque lien porte le
  // sien et l'entrée n'est visible que si au moins un lien l'est (voir
  // menuVisible ci-dessous).
  | { module?: Module; libelle: string; href?: undefined; hrefAccueil?: string; Icone: IconeComposant; groupes: GroupeMenu[] };

// CRM reste un seul module dans la sidebar, avec ses entités regroupées en
// sous-menu — exactement comme les onglets d'un même module dans Zoho CRM,
// jamais éclatées en items racine séparés (retour utilisateur, 2026-09-06 :
// "CRM c'est tout un module, vous ne pouvez pas tout mélanger, ça rend la
// navigation touffue"). Les entités sont elles-mêmes rangées par catégorie
// (« Ventes ») comme dans la vraie arborescence Zoho CRM que l'utilisateur a
// listée intégralement (Ventes/Activités/Inventaire/Support/...) — seule la
// catégorie Ventes existe pour l'instant, les autres n'ont pas d'équivalent
// construit dans Vertex One (portée volontairement limitée à une
// réorganisation de la nav, pas à la construction de nouveaux modules).
const MODULES_MENU: ItemMenu[] = [
  {
    module: "CRM",
    libelle: "CRM",
    hrefAccueil: "/app/crm",
    Icone: Users,
    groupes: [
      {
        categorie: "Ventes",
        liens: [
          { libelle: "Leads", href: "/app/leads", Icone: UserPlus },
          { libelle: "Contacts", href: "/app/contacts", Icone: Users },
          { libelle: "Comptes", href: "/app/comptes", Icone: Building2 },
          { libelle: "Deals", href: "/app/deals", Icone: Handshake },
          // Raccourcis vers des modules qui existent déjà ailleurs dans la
          // sidebar (Documents du Palier 3, Campagnes au sein de Marketing du
          // Palier 6) — présents dans "Ventes" chez Zoho, donc dupliqués ici
          // plutôt que déplacés, pour ne retirer l'accès direct à personne
          // (retour utilisateur, 2026-09-06).
          { libelle: "Documents", href: "/app/documents", Icone: FileText, module: "DOCUMENTS" },
          { libelle: "Campagnes", href: "/app/marketing", Icone: Megaphone, module: "MARKETING" },
        ],
      },
    ],
  },
  // FACO regroupe l'équivalent Zoho Books de Vertex One sous une seule entrée
  // à liste déroulante, comme CRM regroupe Leads/Contacts/Comptes/Deals —
  // retour utilisateur du 2026-09-07 ("organise Books comme tu as organisé
  // CRM"), ces modules existaient jusque-là en items racine séparés. Les
  // catégories reprennent l'arborescence réelle de Zoho Books communiquée
  // par l'utilisateur (Articles/Ventes/Achats/Suivi des heures/Banque/
  // Comptable/Rapports/Documents), y compris "Suivi des heures" (échange du
  // 2026-09-07, "CONSTRUIT CELA") — Feuille de temps sur un Projet existant,
  // voir src/db/schema.ts (entreeTemps) et src/lib/actions/entree-temps.ts.
  // Plusieurs catégories pointent vers la même page qu'une autre (Comptable/Rapports →
  // /app/comptabilite, qui affiche à la fois le Plan comptable et le
  // Bilan/Compte de résultat) : même principe de raccourci dupliqué déjà
  // utilisé pour Documents/Campagnes sous CRM > Ventes, pour rester fidèle
  // aux intitulés attendus sans construire de nouvelle page. hrefAccueil
  // pointe vers /app/facturation (échange du 2026-09-07, "l'accueil de FACO
  // a un tableau de bord") : cette page héberge désormais un vrai tableau de
  // bord (src/app/app/facturation/tableau-de-bord.tsx) dont chaque section
  // vérifie sa propre permission — jamais une page entièrement verrouillée à
  // l'Administrateur comme /app/comptabilite l'est.
  {
    libelle: "FACO",
    hrefAccueil: "/app/facturation",
    Icone: Landmark,
    groupes: [
      {
        categorie: "Articles",
        liens: [{ libelle: "Produits", href: "/app/produits", Icone: Package, module: "PRODUITS" }],
      },
      {
        // Les 8 onglets exacts de Zoho Books > Ventes (échange du
        // 2026-09-07) — tous sauf Clients pointent vers une ancre d'une
        // section de /app/facturation (une seule page qui liste tous les
        // documents Ventes, pas une page dédiée par type de document, voir
        // src/app/app/facturation/page.tsx). "Paiements reçus"/"Factures
        // d'avoir" (tables paiement/avoirFacture, déjà construites au
        // Palier 1 mais jusque-là seulement visibles depuis la fiche
        // Facture) gagnent ici leur première liste agrégée dédiée.
        categorie: "Ventes",
        liens: [
          // Raccourci vers un module qui existe déjà ailleurs dans la
          // sidebar (Contacts, sous CRM) — Zoho Books a ses propres
          // "Clients", dupliqué ici plutôt que déplacé, même principe que
          // Documents/Campagnes sous CRM > Ventes.
          { libelle: "Clients", href: "/app/contacts", Icone: Users, module: "CRM" },
          { libelle: "Devis", href: "/app/facturation#devis", Icone: FileText, module: "FACTURATION" },
          { libelle: "Commandes client", href: "/app/facturation#commandes-client", Icone: ClipboardList, module: "FACTURATION" },
          { libelle: "Factures", href: "/app/facturation#factures", Icone: Receipt, module: "FACTURATION" },
          { libelle: "Tickets de vente", href: "/app/facturation#tickets-de-vente", Icone: Wallet, module: "FACTURATION" },
          { libelle: "Factures périodiques", href: "/app/facturation#factures-periodiques", Icone: Repeat, module: "FACTURATION" },
          { libelle: "Paiements reçus", href: "/app/facturation#paiements-recus", Icone: CreditCard, module: "FACTURATION" },
          { libelle: "Factures d'avoir", href: "/app/facturation#factures-avoir", Icone: Undo2, module: "FACTURATION" },
        ],
      },
      {
        // 6 des 8 onglets Zoho Books > Achats (échange du 2026-09-07) — tous
        // pointent vers une ancre de /app/achats (même patron que Ventes ci-
        // dessus). "Dépenses périodiques" et "Factures fournisseurs
        // périodiques" n'ont pas d'équivalent construit (pas de récurrence
        // achats, contrairement à factureRecurrente côté Ventes) — omis ici
        // plutôt qu'un lien mort, voir docs/crm-roadmap-post-commercialisation.md.
        categorie: "Achats",
        liens: [
          { libelle: "Dépenses", href: "/app/achats#depenses", Icone: ShoppingCart, module: "ACHATS" },
          { libelle: "Bons de commande", href: "/app/achats#bons-de-commande", Icone: ClipboardList, module: "ACHATS" },
          { libelle: "Factures fournisseurs", href: "/app/achats#factures-fournisseurs", Icone: FileText, module: "ACHATS" },
          { libelle: "Paiements effectués", href: "/app/achats#paiements-effectues", Icone: CreditCard, module: "ACHATS" },
          { libelle: "Avoirs fournisseur", href: "/app/achats#avoirs-fournisseur", Icone: Undo2, module: "ACHATS" },
          { libelle: "Fournisseurs", href: "/app/achats#fournisseurs", Icone: UserPlus, module: "ACHATS" },
        ],
      },
      // Suivi des heures (échange du 2026-09-07) — anciennement omis faute
      // de page équivalente, désormais construit : une entrée de temps sur
      // un Projet (module PROJETS existant), facturable sur une vraie
      // Facture. "Projets" est un raccourci vers le module qui existe déjà
      // en item racine séparé, même principe que Clients ci-dessus.
      {
        categorie: "Suivi des heures",
        liens: [
          { libelle: "Projets", href: "/app/projets", Icone: FolderKanban, module: "PROJETS" },
          { libelle: "Feuille de temps", href: "/app/projets/feuille-temps", Icone: Clock, module: "PROJETS" },
        ],
      },
      {
        categorie: "Banque",
        liens: [{ libelle: "Rapprochement bancaire", href: "/app/comptabilite/rapprochement", Icone: Wallet, module: "COMPTABILITE" }],
      },
      // 5 des 6 onglets Zoho Books > Comptable (échange du 2026-09-07) —
      // seuls "Mise à jour en bloc"/"Ajustements de la devise" restent sans
      // équivalent (devise unique XAF, pas de multi-devise). "Journal" et
      // "Verrouillage" pointent vers des sections de /app/comptabilite ;
      // "Journaux manuels"/"Plan comptable"/"Budgets" sont des pages dédiées
      // — voir docs/crm-roadmap-post-commercialisation.md.
      {
        categorie: "Comptable",
        liens: [
          { libelle: "Journal", href: "/app/comptabilite#journal", Icone: Calculator, module: "COMPTABILITE" },
          { libelle: "Journaux manuels", href: "/app/comptabilite/journaux-manuels", Icone: BookOpenText, module: "COMPTABILITE" },
          { libelle: "Plan comptable", href: "/app/comptabilite/plan-comptable", Icone: BookText, module: "COMPTABILITE" },
          { libelle: "Budgets", href: "/app/comptabilite/budgets", Icone: PiggyBank, module: "COMPTABILITE" },
          { libelle: "Verrouillage", href: "/app/comptabilite#verrouillage", Icone: ShieldCheck, module: "COMPTABILITE" },
        ],
      },
      {
        categorie: "Rapports",
        liens: [{ libelle: "Bilan & résultat", href: "/app/comptabilite", Icone: BarChart3, module: "COMPTABILITE" }],
      },
      {
        categorie: "Documents",
        liens: [{ libelle: "Documents financiers", href: "/app/comptabilite/documents", Icone: FileText, module: "COMPTABILITE" }],
      },
    ],
  },
  { module: "PROJETS", libelle: "Projets", href: "/app/projets", Icone: FolderKanban },
  { module: "DOCUMENTS", libelle: "Documents", href: "/app/documents", Icone: FileText },
  { module: "MESSAGERIE", libelle: "Messagerie", href: "/app/messagerie", Icone: MessageSquare },
  { module: "ANNONCES", libelle: "Annonces", href: "/app/annonces", Icone: Megaphone },
  { module: "SIGNATURE", libelle: "Signatures", href: "/app/signatures", Icone: FileSignature },
  // RH regroupe l'équivalent Zoho People de Vertex One sous une seule entrée
  // à liste déroulante, comme CRM/FACO — retour utilisateur ("organise le RH
  // comme tu as organisé CRM et FACO"), le module existait jusque-là en item
  // racine unique. Catégories alignées sur les vraies zones Zoho People
  // (Attendance/Leave/Cases/Surveys/Reports) telles qu'identifiées pendant la
  // construction du module (voir docs/crm-roadmap-post-commercialisation.md,
  // sections 18-26) — un seul module RH gouverne toute l'entrée (comme CRM),
  // portée/visibilité déjà uniformes sur tout le module. hrefAccueil pointe
  // vers /app/rh, qui reste le tableau de bord (demandes en attente, dossiers
  // d'équipe) — les catégories ci-dessous ne répètent donc pas ce contenu,
  // seulement les pages dédiées qui existent en plus.
  {
    module: "RH",
    libelle: "Ressources Humaines",
    hrefAccueil: "/app/rh",
    Icone: IdCard,
    groupes: [
      {
        categorie: "Présence",
        liens: [{ libelle: "Shifts", href: "/app/rh/shifts", Icone: Clock, reserveAdmin: true }],
      },
      {
        categorie: "Congés",
        liens: [{ libelle: "Politiques de congé", href: "/app/rh/politiques-conges", Icone: CalendarClock, reserveAdmin: true }],
      },
      {
        categorie: "Assistance",
        liens: [{ libelle: "Tickets RH", href: "/app/rh/tickets", Icone: LifeBuoy }],
      },
      {
        categorie: "Sondages",
        liens: [{ libelle: "Sondages", href: "/app/rh/sondages", Icone: ClipboardCheck }],
      },
      {
        categorie: "Rapports",
        liens: [{ libelle: "Rapports RH", href: "/app/rh/rapports", Icone: BarChart3 }],
      },
    ],
  },
  { module: "MARKETING", libelle: "Marketing", href: "/app/marketing", Icone: Rocket },
  // Booking (échange du 2026-09-13, addon à la carte comme Marketing) — item
  // racine plat, pas de regroupement en sous-menu pour ce v1 (portée assez
  // restreinte pour rester une seule entrée, comme Projets/Documents) ; les
  // pages Services/Personnel/Paramètres restent atteignables depuis l'accueil
  // /app/reservations lui-même.
  { module: "RESERVATIONS", libelle: "Réservations", href: "/app/reservations", Icone: CalendarCheck },
  // Recrutement (échange du 2026-09-13, addon à la carte comme
  // Marketing/Réservations) — item racine plat, même raisonnement que
  // Réservations pour ce v1.
  { module: "RECRUTEMENT", libelle: "Recrutement", href: "/app/recrutement", Icone: Briefcase },
  // Assistance client (échange du 2026-09-13, addon à la carte) — item
  // racine plat, même raisonnement que Réservations/Recrutement. Ne
  // gouverne que le côté agent (/app/support) ; le portail (/portail)
  // n'apparaît jamais dans cette sidebar, réservé au rôle CLIENT.
  { module: "SUPPORT", libelle: "Assistance client", href: "/app/support", Icone: LifeBuoy },
  // One Form (addon à la carte) — item racine plat, même raisonnement que
  // Réservations/Recrutement/Assistance client.
  { module: "ONE_FORM", libelle: "One Form", href: "/app/one-form", Icone: ClipboardList },
  // One Vault (addon à la carte) — item racine plat, même raisonnement que
  // One Form/Réservations/Recrutement/Assistance client.
  { module: "ONE_VAULT", libelle: "One Vault", href: "/app/one-vault", Icone: KeyRound },
  // Réorganisé en groupe (retour utilisateur, 2026-09-13 : "je vois aussi
  // l'onglet paramètres dans Zoho, mais chez vertexone ce n'est pas
  // configuré") — le lien plat pointait vers /app/parametres, qui n'avait
  // aucune page.tsx propre (seulement 3 sous-pages isolées) : un clic
  // menait droit au 404 générique de Next.js. hrefAccueil pointe maintenant
  // vers un vrai tableau de bord (identité de l'entreprise, add-ons
  // réellement activables) plutôt qu'une redirection creuse.
  {
    module: "PARAMETRES",
    libelle: "Paramètres",
    hrefAccueil: "/app/parametres",
    Icone: Settings,
    groupes: [
      {
  liens: [
          { libelle: "Entreprise", href: "/app/parametres/entreprise", Icone: Building2 },
          { libelle: "Équipe", href: "/app/parametres/equipe", Icone: Users },
          { libelle: "Modèles d'email", href: "/app/parametres/modeles-email", Icone: Mail },
          { libelle: "Abonnement", href: "/app/parametres/abonnement", Icone: CreditCard },
        ],
      },
    ],
  },
  // Tranche 2 (2026-09-13) — accessible à tout utilisateur connecté, pas
  // seulement l'Admin (contrairement à Paramètres) : aucun `module` de
  // permission, seulement recupererUtilisateurConnecte(). Filtré à part dans
  // itemVisible ci-dessous (jamais gouverné par peut(), qui exige un module).
  { libelle: "Mon compte", href: "/app/mon-compte", Icone: UserCog },
  // Espace personnel Admin (Tranche 4, 2026-09-14) — reserveAdmin plutôt
  // qu'un module de permission dédié : un espace privé de l'Admin (tâches,
  // documents, tableau de bord sensible, bloc-notes) n'a pas d'équivalent
  // dans la matrice peut()/portee().
  { libelle: "Espace personnel", href: "/app/mon-espace", Icone: Lock, reserveAdmin: true },
];


// Un item plat, ou groupé avec un module unifiant (CRM), reste gouverné par
// ce seul module. Un item groupé sans module unique (FACO) n'est visible que
// si au moins un de ses liens l'est. Un item sans module (ex. "Mon compte")
// est toujours visible à un utilisateur connecté. Exporté pour réutilisation
// sur /app/mon-compte (réordonnancement personnel, Tranche 3) — même liste
// que celle affichée dans la sidebar, jamais recalculée différemment.
export function itemMenuVisible(role: RoleSysteme, item: ItemMenu): boolean {
  if (!item.groupes) {
    if (item.reserveAdmin && role !== "ADMIN") return false;
    return !item.module || peut(role, item.module, "VOIR");
  }
  if (item.module) return peut(role, item.module, "VOIR");
  return item.groupes.some((groupe) => groupe.liens.some((lien) => lien.module && peut(role, lien.module, "VOIR")));
}

export function libellesMenuVisibles(role: RoleSysteme): string[] {
  return MODULES_MENU.filter((item) => itemMenuVisible(role, item)).map((item) => item.libelle);
}

// Deuxième vérification de session, indépendante de proxy.ts (défense en
// profondeur — voir docs/palier-0-*, section 7 : le serveur ne fait jamais
// confiance à ce que le navigateur prétend, uniquement à sa propre session.
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const menuVisible = MODULES_MENU.filter((item) => itemMenuVisible(utilisateurConnecte.role, item));

  // Réorganisation personnelle de la sidebar (Tranche 3, 2026-09-13) — la clé
  // stable est item.libelle (français, toujours présent, déjà utilisé comme
  // React key ci-dessous) plutôt qu'un identifiant de module : FACO et "Mon
  // compte" n'ont pas de `module` unique. Array.prototype.sort est stable
  // (garanti depuis ES2019) : deux entrées absentes de l'ordre enregistré
  // (indexOf === -1) gardent leur ordre relatif d'origine, toujours en fin de
  // liste — un nouveau module ajouté après coup n'est donc jamais masqué.
  const ordrePersonnel = utilisateurConnecte.ordreModules;
  const menuOrdonne = ordrePersonnel
    ? [...menuVisible].sort((a, b) => {
        const iA = ordrePersonnel.indexOf(a.libelle);
        const iB = ordrePersonnel.indexOf(b.libelle);
        if (iA === -1 && iB === -1) return 0;
        if (iA === -1) return 1;
        if (iB === -1) return -1;
        return iA - iB;
      })
    : menuVisible;

  const t = traduire(utilisateurConnecte.langue);

  // Une seule requête jointe plutôt que deux round-trips séparés — ce layout
  // s'exécute à chaque navigation complète vers /app/*, et CLAUDE.md
  // documente déjà la sensibilité de ce projet à la latence Neon : un
  // round-trip de moins ici compte réellement (cf. le test E2E palier-0 qui
  // a dépassé son budget de 60s après l'ajout d'un deuxième round-trip
  // parallèle). Table utilisateur en RLS permissive (Better-Auth) et
  // entreprise sans RLS — lecture directe sans avecEntreprise(), cohérent
  // avec le reste du produit (voir CLAUDE.md).
  const [ligne] = await db
    .select({
      nomComplet: utilisateur.nomComplet,
      email: utilisateur.email,
      entrepriseNom: entreprise.nom,
      logoCleStockage: entreprise.logoCleStockage,
      couleurMarque: entreprise.couleurMarque,
      statutAbonnement: entreprise.statutAbonnement,
      essaiFinLe: entreprise.essaiFinLe,
      abonnementEcheanceLe: entreprise.abonnementEcheanceLe,
    })
    .from(utilisateur)
    .innerJoin(entreprise, eq(entreprise.id, utilisateur.entrepriseId))
    .where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));

  // Abonnement plat 50 000 FCFA/mois (2026-09-14) — un tenant suspendu ne
  // voit jamais la sidebar/le contenu, redirigé vers une page hors de
  // /app/* (pour ne jamais être elle-même interceptée par cette même
  // redirection). En dehors de la suspension, une bannière non bloquante
  // prévient d'une échéance proche, jamais dans la sidebar elle-même.
  if (ligne?.statutAbonnement === "suspendu") redirect("/abonnement-expire");
  const { evenement } = ligne ? calculerEtatAbonnement({ essaiFinLe: ligne.essaiFinLe, abonnementEcheanceLe: ligne.abonnementEcheanceLe }, new Date()) : { evenement: null };

  // Personnalisation (échange du 2026-09-13) — surcharge --primary et les
  // jetons propres à la sidebar (--sidebar-primary/--sidebar-ring),
  // volontairement découplés de --primary dans globals.css (barre latérale
  // toujours sombre, indépendante du mode clair/sombre) : sans surcharger
  // les deux, la couleur de marque n'apparaîtrait que dans le contenu,
  // jamais dans l'accent de la sidebar.
  const styleMarque = ligne?.couleurMarque
    ? ({ "--primary": ligne.couleurMarque, "--sidebar-primary": ligne.couleurMarque, "--sidebar-ring": ligne.couleurMarque, "--ring": ligne.couleurMarque } as React.CSSProperties)
    : undefined;

  return (
    <LangueProvider dictionnaire={t}>
    <div className="flex min-h-screen bg-background" style={styleMarque}>
      <nav className="sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-4">
        <div className="mb-1 flex items-center justify-between px-2">
          <LogoEntreprise entrepriseId={utilisateurConnecte.entrepriseId} logoCleStockage={ligne?.logoCleStockage ?? null} nomEntreprise={ligne?.entrepriseNom} sombre />
        </div>
        <div className="mb-5 flex items-center px-2">
          <p className="truncate text-sm text-sidebar-foreground/60">{ligne?.entrepriseNom}</p>
        </div>

        <p className="mb-1 px-2.5 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/40">
          {utilisateurConnecte.role}
        </p>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {menuOrdonne.map((item) =>
            item.groupes ? (
              <NavGroup
                key={item.libelle}
                libelle={traduireNav(item.libelle, t)}
                icone={<item.Icone className="size-4 shrink-0" aria-hidden />}
                hrefAccueil={item.hrefAccueil}
                groupes={item.groupes
                  .map((groupe) => ({
                    categorie: groupe.categorie ? traduireCategorie(groupe.categorie, t) : groupe.categorie,
                    liens: groupe.liens
                      .filter((lien) => (!lien.module || peut(utilisateurConnecte.role, lien.module, "VOIR")) && (!lien.reserveAdmin || utilisateurConnecte.role === "ADMIN"))
                      .map((lien) => ({
                        href: lien.href,
                        libelle: lien.libelle,
                        icone: <lien.Icone className="size-3.5 shrink-0" aria-hidden />,
                      })),
                  }))
                  // Un lien réservé à l'Administrateur (Shifts/Politiques de
                  // congé) peut être le seul de sa catégorie — sans ce filtre,
                  // un Manager/Employé verrait un en-tête de catégorie
                  // ("Présence", "Congés") sans aucun lien dessous.
                  .filter((groupe) => groupe.liens.length > 0)}
              />
            ) : (
              <NavLink key={item.href} href={item.href}>
                <item.Icone className="size-4 shrink-0" aria-hidden />
                {traduireNav(item.libelle, t)}
              </NavLink>
            )
          )}
        </div>

        <MenuUtilisateur nom={ligne?.nomComplet ?? utilisateurConnecte.role} email={ligne?.email ?? ""} langue={utilisateurConnecte.langue} />
      </nav>
      <main className="min-w-0 flex-1 overflow-x-hidden p-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          {evenement && ligne ? (
            <BanniereAbonnement evenement={evenement} essaiFinLe={ligne.essaiFinLe} abonnementEcheanceLe={ligne.abonnementEcheanceLe} />
          ) : null}
          {children}
        </div>
      </main>
    </div>
    </LangueProvider>
  );
}
