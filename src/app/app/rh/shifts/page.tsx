import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Lock, Clock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, shift } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouveauShift } from "./formulaire-nouveau-shift";
import { BoutonDesactiverShift } from "./bouton-desactiver-shift";

// Shifts (échange du 2026-09-12, comparaison avec Zoho People) — décision
// structurante réservée à l'Administrateur, même niveau que
// politiques-conges/sondages/catégories de tickets.
export default async function PageShifts() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les shifts sont réservés à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    const shifts = await tx.select().from(shift).where(eq(shift.entrepriseId, utilisateurConnecte.entrepriseId));
    return { shifts };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les Ressources Humaines sont disponibles à partir du forfait Business.</p>
      </div>
    );
  }

  const { shifts } = donnees;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Ressources Humaines
      </Link>
      <div className="flex items-center gap-2.5">
        <Clock className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Shifts</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Un shift définit une plage horaire attendue, assignée depuis la fiche RH d&apos;un employé. Une arrivée après
        l&apos;heure de début (plus la tolérance) est marquée en retard au pointage. Sans shift assigné, le pointage reste
        marqué présent comme avant.
      </p>

      <FormulaireNouveauShift />

      <div className="flex flex-col gap-3">
        {shifts.map((s) => (
          <Card key={s.id} className={s.actif ? undefined : "opacity-60"}>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="font-medium">{s.nom}</p>
                <Badge variant="neutral">
                  {s.heureDebut.slice(0, 5)} – {s.heureFin.slice(0, 5)}
                </Badge>
                {s.toleranceMinutes > 0 ? <Badge variant="neutral">{s.toleranceMinutes} min de tolérance</Badge> : null}
                {!s.actif ? <Badge variant="warning">Désactivé</Badge> : null}
              </div>
              {s.actif ? <BoutonDesactiverShift shiftId={s.id} /> : null}
            </CardContent>
          </Card>
        ))}
        {shifts.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucun shift pour le moment.</p> : null}
      </div>
    </div>
  );
}
