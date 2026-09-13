import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Lock, Package } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, serviceReservable } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponibleAddon } from "@/lib/plans";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouveauService } from "./formulaire-nouveau-service";
import { BoutonDesactiverService } from "./bouton-desactiver-service";

export default async function PageServicesReservables() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les services sont réservés à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RESERVATIONS"))) return null;

    const services = await tx.select().from(serviceReservable).where(eq(serviceReservable.entrepriseId, utilisateurConnecte.entrepriseId));
    return { services };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Le module Réservations n&apos;est pas activé.</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/reservations" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Réservations
      </Link>
      <div className="flex items-center gap-2.5">
        <Package className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Un service définit une durée (et un battement optionnel après le rendez-vous) proposée sur votre page de
        réservation publique. Tout membre du personnel actif peut effectuer n&apos;importe quel service actif.
      </p>

      <FormulaireNouveauService />

      <div className="flex flex-col gap-3">
        {donnees.services.map((s) => (
          <Card key={s.id} className={s.actif ? undefined : "opacity-60"}>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="font-medium">{s.nom}</p>
                <Badge variant="neutral">{s.dureeMinutes} min</Badge>
                {s.dureeTamponMinutes > 0 ? <Badge variant="neutral">+{s.dureeTamponMinutes} min de battement</Badge> : null}
                {s.prixFcfa > 0 ? <Badge variant="neutral">{new Intl.NumberFormat("fr-FR").format(s.prixFcfa)} FCFA</Badge> : null}
                {!s.actif ? <Badge variant="warning">Désactivé</Badge> : null}
              </div>
              {s.actif ? <BoutonDesactiverService serviceId={s.id} /> : null}
            </CardContent>
          </Card>
        ))}
        {donnees.services.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucun service pour le moment.</p> : null}
      </div>
    </div>
  );
}
