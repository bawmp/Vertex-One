import { redirect } from "next/navigation";
import { Users, Receipt, FolderKanban, FileText, Settings } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, type Module } from "@/lib/permissions";
import { Wordmark } from "@/components/wordmark";

const MODULES_MENU: { module: Module; libelle: string; href: string; Icone: typeof Users }[] = [
  { module: "CRM", libelle: "CRM", href: "/app/crm", Icone: Users },
  { module: "FACTURATION", libelle: "Facturation", href: "/app/facturation", Icone: Receipt },
  { module: "PROJETS", libelle: "Projets", href: "/app/projets", Icone: FolderKanban },
  { module: "DOCUMENTS", libelle: "Documents", href: "/app/documents", Icone: FileText },
  { module: "PARAMETRES", libelle: "Paramètres", href: "/app/parametres", Icone: Settings },
];

// Deuxième vérification de session, indépendante de proxy.ts (défense en
// profondeur — voir docs/palier-0-*, section 7 : le serveur ne fait jamais
// confiance à ce que le navigateur prétend, uniquement à sa propre session.
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const menuVisible = MODULES_MENU.filter(({ module }) => peut(utilisateurConnecte.role, module, "VOIR"));

  return (
    <div className="min-h-screen flex bg-background">
      <nav className="w-60 shrink-0 border-r bg-sidebar p-4 flex flex-col gap-1">
        <div className="mb-6 px-2">
          <Wordmark />
        </div>

        <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {utilisateurConnecte.role}
        </p>

        {menuVisible.map(({ href, libelle, Icone }) => (
          <a
            key={href}
            href={href}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Icone className="size-4" aria-hidden />
            {libelle}
          </a>
        ))}
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
