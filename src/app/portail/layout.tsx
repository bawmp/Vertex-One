import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { utilisateur, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { resoudreMonContact } from "@/lib/portail/acces";
import { LogoEntreprise } from "@/components/logo-entreprise";
import { MenuUtilisateur } from "@/app/app/menu-utilisateur";
import { traduire } from "@/lib/i18n/traduire";
import { LangueProvider } from "@/lib/i18n/contexte";

/**
 * Portail client (échange du 2026-09-13) — premier vrai usage du rôle
 * CLIENT pour une connexion réelle (docs/palier-0-*, section 4 : "ce rôle
 * existe... mais son portail n'est construit qu'au Palier 4"). Habillage
 * minimal, volontairement distinct de la sidebar /app — un Contact externe
 * ne doit jamais voir de menu CRM/Facturation/etc.
 */
export default async function LayoutPortail({ children }: { children: React.ReactNode }) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  // Un interne (Admin/Manager/Employé) qui atterrit ici par erreur ne doit
  // jamais voir un portail vide — retour direct vers /app, jamais un écran
  // cassé.
  if (utilisateurConnecte.role !== "CLIENT") redirect("/app");

  const [ligne] = await db
    .select({ nomComplet: utilisateur.nomComplet, email: utilisateur.email, entrepriseNom: entreprise.nom, logoCleStockage: entreprise.logoCleStockage, couleurMarque: entreprise.couleurMarque })
    .from(utilisateur)
    .innerJoin(entreprise, eq(entreprise.id, utilisateur.entrepriseId))
    .where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));

  const styleMarque = ligne?.couleurMarque ? ({ "--primary": ligne.couleurMarque, "--ring": ligne.couleurMarque } as React.CSSProperties) : undefined;

  const monContact = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => resoudreMonContact(tx, utilisateurConnecte));

  if (!monContact) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Votre compte n&apos;est lié à aucun profil client — contactez l&apos;entreprise.</p>
      </div>
    );
  }

  return (
    <LangueProvider dictionnaire={traduire(utilisateurConnecte.langue)}>
      <div className="flex min-h-screen flex-col bg-background" style={styleMarque}>
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <LogoEntreprise entrepriseId={utilisateurConnecte.entrepriseId} logoCleStockage={ligne?.logoCleStockage ?? null} nomEntreprise={ligne?.entrepriseNom} />
            <span className="text-sm text-muted-foreground">{ligne?.entrepriseNom}</span>
          </div>
          <div className="w-64">
            <MenuUtilisateur nom={ligne?.nomComplet ?? "Client"} email={ligne?.email ?? ""} langue={utilisateurConnecte.langue} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 p-8">{children}</main>
      </div>
    </LangueProvider>
  );
}
