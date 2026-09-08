import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc, and, ne } from "drizzle-orm";
import { ArrowLeft, Lock, MessageCircleHeart } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, sondage, sondageParticipation } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouveauSondage } from "./formulaire-nouveau-sondage";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  BROUILLON: { libelle: "Brouillon", variante: "neutral" },
  OUVERT: { libelle: "Ouvert", variante: "success" },
  FERME: { libelle: "Fermé", variante: "warning" },
};

export default async function PageSondages() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès aux Ressources Humaines.</p>
      </div>
    );
  }

  const estAdmin = utilisateurConnecte.role === "ADMIN";

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    // Un Admin voit tous les sondages (y compris brouillons/fermés, pour la
    // gestion) ; un employé ne voit que ceux ouverts — jamais un brouillon
    // en préparation.
    const sondages = await tx
      .select({ id: sondage.id, titre: sondage.titre, statut: sondage.statut, creeLe: sondage.creeLe })
      .from(sondage)
      .where(estAdmin ? eq(sondage.entrepriseId, utilisateurConnecte.entrepriseId) : and(eq(sondage.entrepriseId, utilisateurConnecte.entrepriseId), ne(sondage.statut, "BROUILLON")))
      .orderBy(desc(sondage.creeLe));

    const mesParticipations = await tx
      .select({ sondageId: sondageParticipation.sondageId })
      .from(sondageParticipation)
      .where(eq(sondageParticipation.utilisateurId, utilisateurConnecte.utilisateurId));
    const idsRepondus = new Set(mesParticipations.map((p) => p.sondageId));

    return { sondages, idsRepondus };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les Ressources Humaines sont disponibles à partir du forfait Business.</p>
      </div>
    );
  }

  const { sondages, idsRepondus } = donnees;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Ressources Humaines
      </Link>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MessageCircleHeart className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Sondages d&apos;engagement</h1>
        </div>
        {estAdmin ? <FormulaireNouveauSondage /> : null}
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {sondages.map((s) => {
            const info = LIBELLE_STATUT[s.statut] ?? { libelle: s.statut, variante: "neutral" as const };
            return (
              <Link key={s.id} href={`/app/rh/sondages/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                <span className="font-medium">{s.titre}</span>
                <div className="flex items-center gap-2">
                  {s.statut === "OUVERT" && idsRepondus.has(s.id) ? <Badge variant="neutral">Déjà répondu</Badge> : null}
                  <Badge variant={info.variante}>{info.libelle}</Badge>
                </div>
              </Link>
            );
          })}
          {sondages.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun sondage pour le moment.</p> : null}
        </div>
      </Card>
    </div>
  );
}
