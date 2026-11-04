import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, notInArray } from "drizzle-orm";
import { ArrowLeft, Lock, UserPlus } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { ROLES_NON_COLLEGUES } from "@/lib/equipe/collegues";
import { FormulaireNouveauCollaborateur } from "./formulaire-nouveau-collaborateur";

export const dynamic = "force-dynamic";

/** Nouvelle fiche collaborateur : Administrateur ou Manager (droit RH/CREER) ; jamais de salaire ici. */
export default async function PageNouveauCollaborateur() {
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if ((u.role !== "ADMIN" && u.role !== "MANAGER") || !peut(u, "RH", "CREER")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas le droit de créer la fiche d&apos;un collaborateur.</p>
      </div>
    );
  }
  const personnes = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!disponible(e, "RH")) return null;
    return tx
      .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet })
      .from(utilisateur)
      .where(and(eq(utilisateur.entrepriseId, u.entrepriseId), notInArray(utilisateur.role, [...ROLES_NON_COLLEGUES]), eq(utilisateur.statut, "ACTIF")));
  });
  if (!personnes) redirect("/app/rh");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>
      <div className="flex items-center gap-2.5">
        <UserPlus className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Nouvelle fiche collaborateur</h1>
      </div>
      <p className="text-sm text-muted-foreground">Employé, stagiaire professionnel, prestataire ou freelance : la personne est invitée par email et sa fiche se remplit à l&apos;activation de son compte.</p>
      <FormulaireNouveauCollaborateur personnes={personnes} choixResponsable={u.role === "ADMIN"} />
    </div>
  );
}
