import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Users, UserPlus, Building2, Handshake, Receipt, FolderKanban, FileText, MessageSquare, Megaphone, Settings, FileSignature, Calculator, IdCard, Rocket, ShoppingCart, Package, Landmark, Wallet, BarChart3, Clock } from "lucide-react";
import { db } from "@/db/client";
import { utilisateur, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, type Module } from "@/lib/permissions";
import { Wordmark } from "@/components/wordmark";
import { Badge } from "@/components/ui/badge";
import { NavLink, NavGroup } from "./nav-link";
import { MenuUtilisateur } from "./menu-utilisateur";

type IconeComposant = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
// module optionnel — un lien de sous-menu peut appartenir à un module
// différent de celui du parent (ex. le raccourci "Documents" sous CRM >
// Ventes reste gouverné par le module DOCUMENTS, pas CRM) ; absent, il
// hérite implicitement de la visibilité du groupe parent.
type LienMenu = { libelle: string; href: string; Icone: IconeComposant; module?: Module };
type GroupeMenu = { categorie?: string; liens: LienMenu[] };
type ItemMenu =
  | { module: Module; libelle: string; href: string; Icone: IconeComposant; groupes?: undefined }
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
  // aux intitulés attendus sans construire de nouvelle page. Pas de
  // hrefAccueil (contrairement à CRM) : Comptabilité est réservée à
  // l'Administrateur (voir permissions.ts) alors que Facturation/Achats/
  // Produits sont largement partagés — aucune page ne convient comme
  // "accueil" commun à tous les rôles qui voient FACO.
  {
    libelle: "FACO",
    Icone: Landmark,
    groupes: [
      {
        categorie: "Articles",
        liens: [{ libelle: "Produits", href: "/app/produits", Icone: Package, module: "PRODUITS" }],
      },
      {
        categorie: "Ventes",
        liens: [
          // Raccourci vers un module qui existe déjà ailleurs dans la
          // sidebar (Contacts, sous CRM) — Zoho Books a ses propres
          // "Clients", dupliqué ici plutôt que déplacé, même principe que
          // Documents/Campagnes sous CRM > Ventes.
          { libelle: "Clients", href: "/app/contacts", Icone: Users, module: "CRM" },
          { libelle: "Facturation", href: "/app/facturation", Icone: Receipt, module: "FACTURATION" },
        ],
      },
      {
        categorie: "Achats",
        liens: [{ libelle: "Achats", href: "/app/achats", Icone: ShoppingCart, module: "ACHATS" }],
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
      {
        categorie: "Comptable",
        liens: [{ libelle: "Comptabilité", href: "/app/comptabilite", Icone: Calculator, module: "COMPTABILITE" }],
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
  { module: "RH", libelle: "Ressources Humaines", href: "/app/rh", Icone: IdCard },
  { module: "MARKETING", libelle: "Marketing", href: "/app/marketing", Icone: Rocket },
  { module: "PARAMETRES", libelle: "Paramètres", href: "/app/parametres", Icone: Settings },
];

const LIBELLE_PLAN: Record<string, string> = { starter: "Starter", pro: "Pro", business: "Business" };

// Deuxième vérification de session, indépendante de proxy.ts (défense en
// profondeur — voir docs/palier-0-*, section 7 : le serveur ne fait jamais
// confiance à ce que le navigateur prétend, uniquement à sa propre session.
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  // Un item plat, ou groupé avec un module unifiant (CRM), reste gouverné par
  // ce seul module. Un item groupé sans module unique (FACO — ses quatre
  // sous-modules ont des visibilités différentes par rôle) n'est affiché que
  // si au moins un de ses liens l'est, sinon un rôle qui ne voit que
  // Facturation/Achats/Produits (jamais Comptabilité, réservée à
  // l'Administrateur) perdrait l'accès à toute l'entrée.
  const itemVisible = (item: ItemMenu) => {
    if (!item.groupes) return peut(utilisateurConnecte.role, item.module, "VOIR");
    if (item.module) return peut(utilisateurConnecte.role, item.module, "VOIR");
    return item.groupes.some((groupe) => groupe.liens.some((lien) => lien.module && peut(utilisateurConnecte.role, lien.module, "VOIR")));
  };
  const menuVisible = MODULES_MENU.filter(itemVisible);

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
      entreprisePlan: entreprise.planAbonnement,
    })
    .from(utilisateur)
    .innerJoin(entreprise, eq(entreprise.id, utilisateur.entrepriseId))
    .where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));

  return (
    <div className="flex min-h-screen bg-background">
      <nav className="sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-4">
        <div className="mb-1 flex items-center justify-between px-2">
          <Wordmark sombre />
        </div>
        <div className="mb-5 flex items-center justify-between px-2">
          <p className="truncate text-sm text-sidebar-foreground/60">{ligne?.entrepriseNom}</p>
          <Badge className="shrink-0 border-0 bg-white/10 text-white ring-white/15">
            {LIBELLE_PLAN[ligne?.entreprisePlan ?? "starter"] ?? ligne?.entreprisePlan}
          </Badge>
        </div>

        <p className="mb-1 px-2.5 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/40">
          {utilisateurConnecte.role}
        </p>

        <div className="flex flex-1 flex-col gap-0.5">
          {menuVisible.map((item) =>
            item.groupes ? (
              <NavGroup
                key={item.libelle}
                libelle={item.libelle}
                icone={<item.Icone className="size-4 shrink-0" aria-hidden />}
                hrefAccueil={item.hrefAccueil}
                groupes={item.groupes.map((groupe) => ({
                  categorie: groupe.categorie,
                  liens: groupe.liens
                    .filter((lien) => !lien.module || peut(utilisateurConnecte.role, lien.module, "VOIR"))
                    .map((lien) => ({
                      href: lien.href,
                      libelle: lien.libelle,
                      icone: <lien.Icone className="size-3.5 shrink-0" aria-hidden />,
                    })),
                }))}
              />
            ) : (
              <NavLink key={item.href} href={item.href}>
                <item.Icone className="size-4 shrink-0" aria-hidden />
                {item.libelle}
              </NavLink>
            )
          )}
        </div>

        <MenuUtilisateur nom={ligne?.nomComplet ?? utilisateurConnecte.role} email={ligne?.email ?? ""} />
      </nav>
      <main className="min-w-0 flex-1 overflow-x-hidden p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
