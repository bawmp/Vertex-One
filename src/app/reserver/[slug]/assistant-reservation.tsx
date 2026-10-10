"use client";

import { useEffect, useState, useTransition, useActionState } from "react";
import { CalendarDays, Clock, Mail, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { obtenirCreneauxDisponibles, creerReservationPublique } from "@/lib/actions/reservations-publiques";
import { Champ } from "@/components/formulaire/champ";
import { ChoixCartes } from "@/components/formulaire/choix-cartes";
import { EtapesClient } from "@/components/formulaire/parcours-client";
import { EcranPaiementReussi } from "@/components/formulaire/ecrans-paiement";

type Service = { id: string; nom: string; description: string | null; dureeMinutes: number; dureeTamponMinutes: number; prixFcfa: number };
type Intervenant = { id: string; nomComplet: string };

/** Bloc d'une étape de la réservation : titre numéroté et apparition en douceur quand l'étape précédente est faite. */
function Etape({ numero, titre, children }: { numero: number; titre: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`etape-${numero}`} className="flex animate-in flex-col gap-3 duration-500 fade-in slide-in-from-bottom-3">
      <h2 id={`etape-${numero}`} className="flex items-center gap-2.5 text-sm font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{numero}</span>
        {titre}
      </h2>
      {children}
    </section>
  );
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
    return <EcranPaiementReussi titre="Rendez-vous confirmé !" texte={`Référence : ${etat.numero}`} />;
  }

  const aujourdHui = new Date();
  const dateMin = aujourdHui.toISOString().slice(0, 10);
  const dateMaxObj = new Date(aujourdHui);
  dateMaxObj.setDate(dateMaxObj.getDate() + delaiMaximumJours);
  const dateMax = dateMaxObj.toISOString().slice(0, 10);

  const etapeActive = creneauChoisi ? 4 : dateIso ? 3 : intervenantId ? 2 : serviceId ? 1 : 0;

  return (
    <div className="flex flex-col gap-7">
      <EtapesClient etapes={["Service", "Personne", "Date", "Créneau", "Vous"]} active={etapeActive} />

      <Etape numero={1} titre="Choisissez un service">
        {services.length > 0 ? (
          <ChoixCartes
            etiquette="Service"
            colonnes={1}
            valeur={serviceId ?? ""}
            onChange={(id) => {
              setServiceId(id);
              setIntervenantId(null);
              setDateIso("");
              setCreneauChoisi(null);
            }}
            options={services.map((s) => ({
              valeur: s.id,
              libelle: s.nom,
              detail: `${s.dureeMinutes} min${s.prixFcfa > 0 ? ` · ${new Intl.NumberFormat("fr-FR").format(s.prixFcfa)} FCFA` : ""}`,
              icone: Clock,
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Aucun service disponible pour le moment.</p>
        )}
      </Etape>

      {serviceId ? (
        <Etape numero={2} titre="Choisissez la personne">
          {intervenants.length > 0 ? (
            <ChoixCartes
              etiquette="Personne"
              valeur={intervenantId ?? ""}
              onChange={(id) => {
                setIntervenantId(id);
                setDateIso("");
                setCreneauChoisi(null);
              }}
              options={intervenants.map((i) => ({ valeur: i.id, libelle: i.nomComplet, icone: UserRound }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Personne n&apos;est disponible pour le moment.</p>
          )}
        </Etape>
      ) : null}

      {serviceId && intervenantId ? (
        <Etape numero={3} titre="Choisissez une date">
          <Champ
            label="Date du rendez-vous"
            type="date"
            min={dateMin}
            max={dateMax}
            icone={CalendarDays}
            value={dateIso}
            onChange={(e) => {
              setDateIso(e.target.value);
              setCreneauChoisi(null);
            }}
            valide={dateIso !== ""}
            className="max-w-xs"
          />
        </Etape>
      ) : null}

      {dateIso ? (
        <Etape numero={4} titre="Choisissez un créneau">
          {chargementCreneaux ? (
            <div className="flex flex-wrap gap-2" aria-busy>
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="h-10 w-20 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {creneaux.map((c, i) => {
                const choisi = creneauChoisi === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCreneauChoisi(c)}
                    aria-pressed={choisi}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    className={cn(
                      "animate-apparition-etape h-10 min-w-20 rounded-xl border px-3 text-sm font-medium tabular-nums outline-none transition-all duration-150",
                      "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm focus-visible:ring-4 focus-visible:ring-primary/20 active:scale-95",
                      choisi ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25" : "border-border bg-background"
                    )}
                  >
                    {new Date(c).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </button>
                );
              })}
              {creneaux.length === 0 ? <p className="text-sm text-muted-foreground">Aucun créneau disponible ce jour-là.</p> : null}
            </div>
          )}
        </Etape>
      ) : null}

      {creneauChoisi ? (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="serviceId" value={serviceId ?? ""} />
          <input type="hidden" name="intervenantId" value={intervenantId ?? ""} />
          <input type="hidden" name="dateDebut" value={creneauChoisi} />

          <Etape numero={5} titre="Vos coordonnées">
            <div className="flex flex-col gap-4">
              <Champ label="Nom" name="clientNom" id="clientNom" icone={UserRound} required minLength={2} autoComplete="name" />
              <Champ label="Téléphone" name="clientTelephone" id="clientTelephone" type="tel" inputMode="tel" icone={Phone} required minLength={6} autoComplete="tel" />
              <Champ label="Email (optionnel)" name="clientEmail" id="clientEmail" type="email" icone={Mail} autoComplete="email" />
              <Champ label="Notes (optionnel)" name="notes" id="notes" />
            </div>
          </Etape>

          {etat?.erreur ? (
            <p role="alert" className="text-sm text-destructive">
              {etat.erreur}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={enCours} className="h-12 w-full text-base">
            {enCours ? <Spinner data-icon="inline-start" /> : null}
            {enCours ? "Confirmation…" : "Confirmer le rendez-vous"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
