import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Lock, Settings } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, parametreRecrutement } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponibleAddon } from "@/lib/plans";
import { BoutonActiverRecrutement } from "../bouton-activer-recrutement";
import { FormulaireParametresRecrutement } from "./formulaire-parametres";
import { BoutonPublierRecrutement } from "./bouton-publier";
import { LienPublicCarrieres } from "./lien-public";

export default async function PageParametresRecrutement() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les paramètres de recrutement sont réservés à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    const actif = await disponibleAddon(tx, monEntreprise, "RECRUTEMENT");
    if (!actif) return { actif: false as const };

    const [params] = await tx.select().from(parametreRecrutement).where(eq(parametreRecrutement.entrepriseId, utilisateurConnecte.entrepriseId));
    return { actif: true as const, params: params ?? null };
  });

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Link href="/app/recrutement" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Recrutement
      </Link>
      <div className="flex items-center gap-2.5">
        <Settings className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      </div>

      {!donnees.actif ? (
        <BoutonActiverRecrutement />
      ) : (
        <div className="flex flex-col gap-4">
          <FormulaireParametresRecrutement params={donnees.params} />

          {donnees.params ? (
            <>
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
              <p className="text-sm font-medium">Lien à partager avec les candidats</p>
              <LienPublicCarrieres url={`${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/carrieres/${donnees.params.slug}`} publie={donnees.params.publie} />
              <BoutonPublierRecrutement publie={donnees.params.publie} />
            </div>

            <ol className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">1.</span> Créez vos offres dans « Postes ouverts ».</li>
              <li><span className="font-medium text-foreground">2.</span> Publiez la page ci-dessus.</li>
              <li><span className="font-medium text-foreground">3.</span> Partagez le lien : chaque candidat choisit une offre, remplit le formulaire et joint son CV.</li>
              <li><span className="font-medium text-foreground">4.</span> Vous êtes prévenu par email et retrouvez la candidature dans « Recrutement ».</li>
            </ol>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
