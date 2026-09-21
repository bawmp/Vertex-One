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
import { getT } from "@/lib/i18n/langue";

/**
 * Portail client (échange du 2026-09-13) — premier vrai usage du rôle
 * CLIENT pour une connexion réelle (docs/palier-0-*, section 4 : "ce rôle
 * existe... mais son portail n'est construit qu'au Palier 4"). Habillage
 * minimal, volontairement distinct de la sidebar /app — un Contact externe
 * ne doit jamais voir de menu CRM/Facturation/etc.
 */
export default async function LayoutPortail({ children }: { children: React.ReactNode }) {
  const t = await getT();
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
        <p className="text-muted-foreground">{t("Votre compte n'est lié à aucun profil client — contactez l'entreprise.")}</p>
      </div>
    );
  }

  return (
    <LangueProvider dictionnaire={traduire(utilisateurConnecte.langue)} langue={utilisateurConnecte.langue ?? "fr"}>
      <div className="flex min-h-screen flex-col bg-background" style={styleMarque}>
        <header className="flex items-center justify-between gap-4 border-b-2 border-b-marque-bleu-100 px-6 py-4">
          <div className="flex flex-col items-start gap-1.5">
            <LogoEntreprise taille="bandeau" entrepriseId={utilisateurConnecte.entrepriseId} logoCleStockage={ligne?.logoCleStockage ?? null} nomEntreprise={ligne?.entrepriseNom} />
            <span className="px-1 text-sm font-medium text-muted-foreground">{ligne?.entrepriseNom}</span>
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
