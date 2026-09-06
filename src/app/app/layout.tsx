import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Users, UserPlus, Building2, Handshake, Receipt, FolderKanban, FileText, MessageSquare, Megaphone, Settings, FileSignature, Calculator, IdCard, Rocket } from "lucide-react";
import { db } from "@/db/client";
import { utilisateur, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, type Module } from "@/lib/permissions";
import { Wordmark } from "@/components/wordmark";
import { Badge } from "@/components/ui/badge";
import { NavLink, NavGroup } from "./nav-link";
import { MenuUtilisateur } from "./menu-utilisateur";

type IconeComposant = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
type LienMenu = { libelle: string; href: string; Icone: IconeComposant };
type GroupeMenu = { categorie?: string; liens: LienMenu[] };
type ItemMenu =
  | { module: Module; libelle: string; href: string; Icone: IconeComposant; groupes?: undefined }
  | { module: Module; libelle: string; href?: undefined; hrefAccueil?: string; Icone: IconeComposant; groupes: GroupeMenu[] };

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
        ],
      },
    ],
  },
  { module: "FACTURATION", libelle: "Facturation", href: "/app/facturation", Icone: Receipt },
  { module: "PROJETS", libelle: "Projets", href: "/app/projets", Icone: FolderKanban },
  { module: "DOCUMENTS", libelle: "Documents", href: "/app/documents", Icone: FileText },
  { module: "MESSAGERIE", libelle: "Messagerie", href: "/app/messagerie", Icone: MessageSquare },
  { module: "ANNONCES", libelle: "Annonces", href: "/app/annonces", Icone: Megaphone },
  { module: "SIGNATURE", libelle: "Signatures", href: "/app/signatures", Icone: FileSignature },
  { module: "COMPTABILITE", libelle: "Comptabilité", href: "/app/comptabilite", Icone: Calculator },
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

  const menuVisible = MODULES_MENU.filter(({ module }) => peut(utilisateurConnecte.role, module, "VOIR"));

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
                  liens: groupe.liens.map((lien) => ({
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
