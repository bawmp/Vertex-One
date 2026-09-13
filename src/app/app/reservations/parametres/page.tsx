import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Lock, Settings } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, parametreReservation } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponibleAddon } from "@/lib/plans";
import { BoutonActiverReservations } from "../bouton-activer-reservations";
import { FormulaireParametres } from "./formulaire-parametres";
import { BoutonPublier } from "./bouton-publier";

export default async function PageParametresReservations() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les paramètres de réservation sont réservés à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    const actif = await disponibleAddon(tx, monEntreprise, "RESERVATIONS");
    if (!actif) return { actif: false as const };

    const [params] = await tx.select().from(parametreReservation).where(eq(parametreReservation.entrepriseId, utilisateurConnecte.entrepriseId));
    return { actif: true as const, params: params ?? null };
  });

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Link href="/app/reservations" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Réservations
      </Link>
      <div className="flex items-center gap-2.5">
        <Settings className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      </div>

      {!donnees.actif ? (
        <BoutonActiverReservations />
      ) : (
        <div className="flex flex-col gap-4">
          <FormulaireParametres params={donnees.params} />

          {donnees.params ? (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
              <p className="text-sm text-muted-foreground">
                Page publique : <span className="font-mono">/reserver/{donnees.params.slug}</span>
              </p>
              <BoutonPublier publie={donnees.params.publie} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
