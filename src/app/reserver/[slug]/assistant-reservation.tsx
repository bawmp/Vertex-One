"use client";

import { useEffect, useState, useTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { obtenirCreneauxDisponibles, creerReservationPublique } from "@/lib/actions/reservations-publiques";

type Service = { id: string; nom: string; description: string | null; dureeMinutes: number; dureeTamponMinutes: number; prixFcfa: number };
type Intervenant = { id: string; nomComplet: string };

function classeChoix(actif: boolean) {
  return cn("rounded-lg border px-3 py-2 text-left text-sm transition-colors", actif ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50");
}

export function AssistantReservation({
  slug,
  services,
  intervenants,
  delaiMaximumJours,
}: {
  slug: string;
  services: Service[];
  intervenants: Intervenant[];
  delaiMaximumJours: number;
}) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [intervenantId, setIntervenantId] = useState<string | null>(null);
  const [dateIso, setDateIso] = useState("");
  const [creneaux, setCreneaux] = useState<string[]>([]);
  const [creneauChoisi, setCreneauChoisi] = useState<string | null>(null);
  const [chargementCreneaux, startChargement] = useTransition();
  const [etat, action, enCours] = useActionState(creerReservationPublique, null);

  useEffect(() => {
    // creneaux n'est affiché que si dateIso est renseigné (voir plus bas) —
    // rien à réinitialiser ici tant qu'un chargement n'a pas de quoi
    // démarrer, jamais de setState synchrone dans le corps de l'effet.
    if (!serviceId || !intervenantId || !dateIso) return;
    startChargement(async () => {
      const resultat = await obtenirCreneauxDisponibles(slug, serviceId, intervenantId, dateIso);
      setCreneaux(resultat.map((d) => d.toISOString()));
    });
  }, [slug, serviceId, intervenantId, dateIso]);

  if (etat?.succes) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-lg font-medium">Rendez-vous confirmé !</p>
        <p className="text-sm text-muted-foreground">Référence : {etat.numero}</p>
      </div>
    );
  }

  const aujourdHui = new Date();
  const dateMin = aujourdHui.toISOString().slice(0, 10);
  const dateMaxObj = new Date(aujourdHui);
  dateMaxObj.setDate(dateMaxObj.getDate() + delaiMaximumJours);
  const dateMax = dateMaxObj.toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>1. Choisissez un service</Label>
        <div className="flex flex-col gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setServiceId(s.id);
                setIntervenantId(null);
                setDateIso("");
                setCreneauChoisi(null);
              }}
              className={cn(classeChoix(serviceId === s.id), "flex items-center justify-between")}
            >
              <span>
                <span className="font-medium">{s.nom}</span> — {s.dureeMinutes} min
              </span>
              {s.prixFcfa > 0 ? <span className="text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(s.prixFcfa)} FCFA</span> : null}
            </button>
          ))}
          {services.length === 0 ? <p className="text-sm text-muted-foreground">Aucun service disponible pour le moment.</p> : null}
        </div>
      </div>

      {serviceId ? (
        <div className="flex flex-col gap-2">
          <Label>2. Choisissez la personne</Label>
          <div className="flex flex-wrap gap-2">
            {intervenants.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  setIntervenantId(i.id);
                  setDateIso("");
                  setCreneauChoisi(null);
                }}
                className={cn(classeChoix(intervenantId === i.id), "rounded-full")}
              >
                {i.nomComplet}
              </button>
            ))}
            {intervenants.length === 0 ? <p className="text-sm text-muted-foreground">Personne n&apos;est disponible pour le moment.</p> : null}
          </div>
        </div>
      ) : null}

      {serviceId && intervenantId ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="date-reservation">3. Choisissez une date</Label>
          <Input
            id="date-reservation"
            type="date"
            min={dateMin}
            max={dateMax}
            value={dateIso}
            onChange={(e) => {
              setDateIso(e.target.value);
              setCreneauChoisi(null);
            }}
            className="max-w-48"
          />
        </div>
      ) : null}

      {dateIso ? (
        <div className="flex flex-col gap-2">
          <Label>4. Choisissez un créneau</Label>
          {chargementCreneaux ? <Spinner /> : null}
          <div className="flex flex-wrap gap-2">
            {creneaux.map((c) => (
              <button key={c} type="button" onClick={() => setCreneauChoisi(c)} className={classeChoix(creneauChoisi === c)}>
                {new Date(c).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </button>
            ))}
            {!chargementCreneaux && creneaux.length === 0 ? <p className="text-sm text-muted-foreground">Aucun créneau disponible ce jour-là.</p> : null}
          </div>
        </div>
      ) : null}

      {creneauChoisi ? (
        <form action={action} className="flex flex-col gap-4 border-t pt-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="serviceId" value={serviceId ?? ""} />
          <input type="hidden" name="intervenantId" value={intervenantId ?? ""} />
          <input type="hidden" name="dateDebut" value={creneauChoisi} />

          <Label>5. Vos coordonnées</Label>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientNom">Nom</Label>
            <Input id="clientNom" name="clientNom" required minLength={2} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientTelephone">Téléphone</Label>
            <Input id="clientTelephone" name="clientTelephone" required minLength={6} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientEmail">Email (optionnel)</Label>
            <Input id="clientEmail" name="clientEmail" type="email" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optionnel)</Label>
            <Input id="notes" name="notes" />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="w-full">
            {enCours ? <Spinner /> : null}
            {enCours ? "Confirmation…" : "Confirmer le rendez-vous"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
