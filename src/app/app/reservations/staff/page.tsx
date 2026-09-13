import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, ne, and } from "drizzle-orm";
import { ArrowLeft, Lock, Users } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, intervenantReservation, disponibiliteReservation } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponibleAddon } from "@/lib/plans";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonBasculerIntervenant } from "./bouton-basculer-intervenant";
import { FormulaireDisponibilite } from "./formulaire-disponibilite";
import { BoutonSupprimerDisponibilite } from "./bouton-supprimer-disponibilite";

const LIBELLE_JOUR: Record<string, string> = { LUNDI: "Lundi", MARDI: "Mardi", MERCREDI: "Mercredi", JEUDI: "Jeudi", VENDREDI: "Vendredi", SAMEDI: "Samedi", DIMANCHE: "Dimanche" };

export default async function PageStaffReservations() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Le personnel réservable est réservé à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RESERVATIONS"))) return null;

    const utilisateurs = await tx
      .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet })
      .from(utilisateur)
      .where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), ne(utilisateur.role, "CLIENT")))
      .orderBy(utilisateur.nomComplet);

    const intervenants = await tx.select().from(intervenantReservation).where(eq(intervenantReservation.entrepriseId, utilisateurConnecte.entrepriseId));
    const disponibilites = await tx.select().from(disponibiliteReservation).where(eq(disponibiliteReservation.entrepriseId, utilisateurConnecte.entrepriseId));

    return { utilisateurs, intervenants, disponibilites };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Le module Réservations n&apos;est pas activé.</p>
      </div>
    );
  }

  const { utilisateurs, intervenants, disponibilites } = donnees;
  const intervenantParUtilisateurId = new Map(intervenants.map((i) => [i.utilisateurId, i]));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/reservations" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Réservations
      </Link>
      <div className="flex items-center gap-2.5">
        <Users className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Personnel réservable</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Un membre du personnel réservable apparaît sur la page publique et peut recevoir des rendez-vous, selon ses
        disponibilités hebdomadaires ci-dessous.
      </p>

      <div className="flex flex-col gap-4">
        {utilisateurs.map((u) => {
          const intervenant = intervenantParUtilisateurId.get(u.id);
          const actif = intervenant?.actif ?? false;
          const mesDisponibilites = intervenant ? disponibilites.filter((d) => d.intervenantId === intervenant.id) : [];

          return (
            <Card key={u.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{u.nomComplet}</p>
                  <BoutonBasculerIntervenant utilisateurId={u.id} actif={actif} />
                </div>

                {actif && intervenant ? (
                  <div className="flex flex-col gap-2 border-t pt-3">
                    {mesDisponibilites.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                        <Badge variant="neutral">
                          {LIBELLE_JOUR[d.jourSemaine] ?? d.jourSemaine} {d.heureDebut.slice(0, 5)} – {d.heureFin.slice(0, 5)}
                        </Badge>
                        <BoutonSupprimerDisponibilite disponibiliteId={d.id} />
                      </div>
                    ))}
                    {mesDisponibilites.length === 0 ? <p className="text-xs text-muted-foreground">Aucune disponibilité — invisible sur la page publique.</p> : null}
                    <FormulaireDisponibilite intervenantId={intervenant.id} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
