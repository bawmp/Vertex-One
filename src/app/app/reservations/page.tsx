import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, gte, inArray } from "drizzle-orm";
import { CalendarCheck, Lock, Package, Users, Settings } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, reservation, serviceReservable, intervenantReservation, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponibleAddon } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonsReservation } from "./boutons-reservation";
import { BoutonActiverReservations } from "./bouton-activer-reservations";

const LIBELLE_STATUT: Record<string, { libelle: string; variant: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  CONFIRMEE: { libelle: "Confirmée", variant: "info" },
  TERMINEE: { libelle: "Terminée", variant: "success" },
  ABSENCE: { libelle: "Absence", variant: "warning" },
  ANNULEE: { libelle: "Annulée", variant: "danger" },
};

export default async function PageReservations() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "RESERVATIONS", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès aux Réservations.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    const actif = await disponibleAddon(tx, monEntreprise, "RESERVATIONS");
    if (!actif) return { actif: false as const };

    const idsPortee = await idsVisibles(tx, utilisateurConnecte, "RESERVATIONS");
    let idsIntervenants: "TOUT" | string[] = "TOUT";
    if (idsPortee !== "TOUT") {
      const lignes = await tx.select({ id: intervenantReservation.id }).from(intervenantReservation).where(inArray(intervenantReservation.utilisateurId, idsPortee));
      idsIntervenants = lignes.map((l) => l.id);
    }

    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);

    const reservations = await tx
      .select({
        id: reservation.id,
        numero: reservation.numero,
        dateDebut: reservation.dateDebut,
        statut: reservation.statut,
        clientNom: reservation.clientNom,
        clientTelephone: reservation.clientTelephone,
        serviceNom: serviceReservable.nom,
        intervenantNom: utilisateur.nomComplet,
      })
      .from(reservation)
      .innerJoin(serviceReservable, eq(reservation.serviceId, serviceReservable.id))
      .innerJoin(intervenantReservation, eq(reservation.intervenantId, intervenantReservation.id))
      .innerJoin(utilisateur, eq(intervenantReservation.utilisateurId, utilisateur.id))
      .where(
        and(
          eq(reservation.entrepriseId, utilisateurConnecte.entrepriseId),
          gte(reservation.dateDebut, aujourdHui),
          idsIntervenants === "TOUT" ? undefined : inArray(reservation.intervenantId, idsIntervenants)
        )
      )
      .orderBy(reservation.dateDebut);

    return { actif: true as const, reservations };
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CalendarCheck className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Réservations</h1>
        </div>
        {donnees.actif && utilisateurConnecte.role === "ADMIN" ? (
          <div className="flex items-center gap-3">
            <Link href="/app/reservations/services" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <Package className="size-3.5" aria-hidden />
              Services
            </Link>
            <Link href="/app/reservations/staff" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <Users className="size-3.5" aria-hidden />
              Personnel
            </Link>
            <Link href="/app/reservations/parametres" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <Settings className="size-3.5" aria-hidden />
              Paramètres
            </Link>
          </div>
        ) : null}
      </div>

      {!donnees.actif ? (
        utilisateurConnecte.role === "ADMIN" ? (
          <BoutonActiverReservations />
        ) : (
          <p className="text-sm text-muted-foreground">Le module Réservations n&apos;est pas activé — demandez à un Administrateur de l&apos;activer.</p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {donnees.reservations.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{r.serviceNom}</p>
                    <Badge variant={LIBELLE_STATUT[r.statut]?.variant ?? "neutral"}>{LIBELLE_STATUT[r.statut]?.libelle ?? r.statut}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(r.dateDebut)} — {r.clientNom} ({r.clientTelephone}) — avec {r.intervenantNom}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.numero}</p>
                </div>
                <BoutonsReservation reservationId={r.id} statut={r.statut} />
              </CardContent>
            </Card>
          ))}
          {donnees.reservations.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucun rendez-vous à venir.</p> : null}
        </div>
      )}
    </div>
  );
}
