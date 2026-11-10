import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, FilePen, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { destinatairesPossibles } from "@/lib/rh/rapport-hierarchique";
import { destinataireParDefaut } from "@/lib/rh/rapport-hierarchique-regles";
import { AssistantRapport } from "../assistant-rapport";
import { getT } from "@/lib/i18n/langue";

export default async function PageNouveauRapport({ searchParams }: { searchParams: Promise<{ modele?: string }> }) {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "RH", "CREER")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas le droit d'envoyer un rapport.")}</p>
      </div>
    );
  }

  const { modele } = await searchParams;

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    const autorises = await destinatairesPossibles(tx, utilisateurConnecte);
    const [moi] = await tx
      .select({ managerId: utilisateur.managerId })
      .from(utilisateur)
      .where(and(eq(utilisateur.id, utilisateurConnecte.utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    return { autorises, parDefaut: destinataireParDefaut(moi?.managerId ?? null, autorises) };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.")}</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Link href="/app/rh/rapports-ecrits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Rapports écrits")}
      </Link>
      <div className="flex animate-in items-start gap-3.5 duration-500 fade-in slide-in-from-bottom-2">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-marque-bleu-700 text-primary-foreground shadow-md shadow-primary/25">
          <FilePen className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Nouveau rapport")}</h1>
          <p className="text-sm text-muted-foreground">{t("Racontez, rubrique par rubrique : votre responsable recevra un rapport clair et structuré.")}</p>
        </div>
      </div>
      <AssistantRapport destinataires={donnees.autorises.map((p) => ({ id: p.id, nom: p.nomComplet, role: p.role as "ADMIN" | "MANAGER" }))} parDefaut={donnees.parDefaut} modeleInitial={modele ?? null} />
    </div>
  );
}
