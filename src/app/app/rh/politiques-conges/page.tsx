import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Lock, CalendarRange } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, politiqueConge, politiqueCongePalier } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouvellePolitique } from "./formulaire-nouvelle-politique";
import { FormulairePalier } from "./formulaire-palier";
import { BoutonSupprimerPalier } from "./bouton-supprimer-palier";
import { BoutonDesactiverPolitique } from "./bouton-desactiver-politique";

const LIBELLE_TYPE: Record<string, string> = { FIXE: "Fixe", ANCIENNETE: "Par ancienneté" };

// Politiques de congés (échange du 2026-09-08, comparaison avec Zoho
// People) — décision structurante réservée à l'Administrateur, comme
// modifierDossierRH() (src/lib/actions/rh.ts).
export default async function PagePolitiquesConges() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les politiques de congé sont réservées à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    const politiques = await tx.select().from(politiqueConge).where(eq(politiqueConge.entrepriseId, utilisateurConnecte.entrepriseId));
    const paliers = await tx.select().from(politiqueCongePalier).where(eq(politiqueCongePalier.entrepriseId, utilisateurConnecte.entrepriseId));

    return { politiques, paliers };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les Ressources Humaines sont disponibles à partir du forfait Business.</p>
      </div>
    );
  }

  const { politiques, paliers } = donnees;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Ressources Humaines
      </Link>
      <div className="flex items-center gap-2.5">
        <CalendarRange className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Politiques de congé</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Une politique définit le droit annuel de congé payé d&apos;un employé, assigné depuis sa fiche RH. Sans politique
        assignée, le solde reste géré entièrement à la main comme avant.
      </p>

      <FormulaireNouvellePolitique />

      <div className="flex flex-col gap-3">
        {politiques.map((p) => {
          const sesPaliers = paliers.filter((pal) => pal.politiqueCongeId === p.id).sort((a, b) => a.anneesAncienneteMin - b.anneesAncienneteMin);
          return (
            <Card key={p.id} className={p.actif ? undefined : "opacity-60"}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{p.nom}</p>
                    <Badge variant="neutral">{LIBELLE_TYPE[p.type] ?? p.type}</Badge>
                    {!p.actif ? <Badge variant="warning">Désactivée</Badge> : null}
                  </div>
                  {p.actif ? <BoutonDesactiverPolitique politiqueCongeId={p.id} /> : null}
                </div>
                <p className="text-sm text-muted-foreground">{p.joursBaseParAn} jour(s) de base par an</p>

                {p.type === "ANCIENNETE" ? (
                  <div className="flex flex-col gap-2 border-t pt-3">
                    {sesPaliers.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {sesPaliers.map((pal) => (
                          <div key={pal.id} className="flex items-center justify-between text-sm">
                            <span>
                              À partir de {pal.anneesAncienneteMin} an(s) d&apos;ancienneté : +{pal.joursSupplementaires} jour(s)
                            </span>
                            {p.actif ? <BoutonSupprimerPalier palierId={pal.id} /> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aucun palier défini pour le moment.</p>
                    )}
                    {p.actif ? <FormulairePalier politiqueCongeId={p.id} /> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
        {politiques.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucune politique de congé pour le moment.</p> : null}
      </div>
    </div>
  );
}
