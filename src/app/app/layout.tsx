import { redirect } from "next/navigation";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, type Module } from "@/lib/permissions";

const MODULES_MENU: { module: Module; libelle: string; href: string }[] = [
  { module: "CRM", libelle: "CRM", href: "/app/crm" },
  { module: "FACTURATION", libelle: "Facturation", href: "/app/facturation" },
  { module: "PROJETS", libelle: "Projets", href: "/app/projets" },
  { module: "DOCUMENTS", libelle: "Documents", href: "/app/documents" },
  { module: "PARAMETRES", libelle: "Paramètres", href: "/app/parametres" },
];

// Deuxième vérification de session, indépendante de proxy.ts (défense en
// profondeur — voir docs/palier-0-*, section 7 : le serveur ne fait jamais
// confiance à ce que le navigateur prétend, uniquement à sa propre session.
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const menuVisible = MODULES_MENU.filter(({ module }) => peut(utilisateurConnecte.role, module, "VOIR"));

  return (
    <div className="min-h-screen flex">
      <nav className="w-56 shrink-0 border-r p-4 flex flex-col gap-1">
        <p className="mb-4 text-xs font-medium uppercase text-muted-foreground">
          {utilisateurConnecte.role}
        </p>
        {menuVisible.map(({ href, libelle }) => (
          <a key={href} href={href} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
            {libelle}
          </a>
        ))}
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
