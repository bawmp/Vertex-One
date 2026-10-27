import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";
import { ArrowLeft, GraduationCap, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { FormulaireStagiairePro } from "./formulaire-stagiaire-pro";

export const dynamic = "force-dynamic";

/** Nouveau stagiaire professionnel : Administrateur ou Manager (droit RH/CREER). */
export default async function PageNouveauStagiairePro() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if ((utilisateurConnecte.role !== "ADMIN" && utilisateurConnecte.role !== "MANAGER") || !peut(utilisateurConnecte, "RH", "CREER")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas le droit d&apos;inviter un stagiaire.</p>
      </div>
    );
  }
  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;
    return tx
      .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet })
      .from(utilisateur)
      .where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), ne(utilisateur.role, "CLIENT"), eq(utilisateur.statut, "ACTIF")));
  });
  if (!donnees) redirect("/app/rh/stagiaires");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh/stagiaires" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Stagiaires
      </Link>
      <div className="flex items-center gap-2.5">
        <GraduationCap className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Nouveau stagiaire professionnel</h1>
      </div>
      <FormulaireStagiairePro personnes={donnees} choixResponsable={utilisateurConnecte.role === "ADMIN"} />
    </div>
  );
}
