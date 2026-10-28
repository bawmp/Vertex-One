"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { modifierServiceReservable } from "@/lib/actions/reservations";
import { BoutonDesactiverService } from "./bouton-desactiver-service";

export type ServiceAffiche = {
  id: string;
  nom: string;
  description: string | null;
  dureeMinutes: number;
  dureeTamponMinutes: number;
  prixFcfa: number;
  actif: boolean;
};

/**
 * Un service de la liste : ses informations, un bouton « Modifier » qui ouvre le formulaire à la place, et « Désactiver ».
 * Les contrôles (Administrateur, entreprise, validation) sont refaits côté serveur par `modifierServiceReservable`.
 */
export function CarteService({ service: s, index }: { service: ServiceAffiche; index: number }) {
  const [edition, setEdition] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    donnees.set("serviceId", s.id);
    setErreur(null);
    startTransition(async () => {
      const resultat = await modifierServiceReservable(donnees);
      if (resultat?.erreur) setErreur(resultat.erreur);
      else setEdition(false);
    });
  }

  return (
    <Card
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={`animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both ${s.actif || edition ? "" : "opacity-60"}`}
    >
      <CardContent>
        {edition ? (
          <form onSubmit={enregistrer} className="flex flex-col gap-4" aria-label={`Modifier ${s.nom}`}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`nom-${s.id}`}>Nom</Label>
              <Input id={`nom-${s.id}`} name="nom" defaultValue={s.nom} required className="max-w-64" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`description-${s.id}`}>Description (optionnel)</Label>
              <Input id={`description-${s.id}`} name="description" defaultValue={s.description ?? ""} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`dureeMinutes-${s.id}`}>Durée (min)</Label>
                <Input id={`dureeMinutes-${s.id}`} name="dureeMinutes" type="number" min={5} step={5} defaultValue={s.dureeMinutes} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`dureeTamponMinutes-${s.id}`}>Battement (min)</Label>
                <Input id={`dureeTamponMinutes-${s.id}`} name="dureeTamponMinutes" type="number" min={0} step={5} defaultValue={s.dureeTamponMinutes} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`prixFcfa-${s.id}`}>Prix (FCFA)</Label>
                <Input id={`prixFcfa-${s.id}`} name="prixFcfa" type="number" min={0} step={100} defaultValue={s.prixFcfa} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Les réservations déjà prises gardent leur durée et leur prix ; la modification s&apos;applique aux prochaines.</p>

            {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={enCours}>
                {enCours ? <Spinner /> : null}
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <Button type="button" variant="ghost" disabled={enCours} onClick={() => { setEdition(false); setErreur(null); }}>
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{s.nom}</p>
                <Badge variant="neutral">{s.dureeMinutes} min</Badge>
                {s.dureeTamponMinutes > 0 ? <Badge variant="neutral">+{s.dureeTamponMinutes} min de battement</Badge> : null}
                {s.prixFcfa > 0 ? <Badge variant="neutral">{new Intl.NumberFormat("fr-FR").format(s.prixFcfa)} FCFA</Badge> : null}
                {!s.actif ? <Badge variant="warning">Désactivé</Badge> : null}
              </div>
              {s.description ? <p className="truncate text-sm text-muted-foreground">{s.description}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="ghost" size="xs" onClick={() => setEdition(true)} aria-label={`Modifier ${s.nom}`}>
                <Pencil data-icon="inline-start" aria-hidden />
                Modifier
              </Button>
              {s.actif ? <BoutonDesactiverService serviceId={s.id} /> : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
