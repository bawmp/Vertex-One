"use client";

import { useActionState, useState, useTransition } from "react";
import { Ban, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SelecteurPersonne } from "@/components/selecteur-personne";
import { changerStatutCandidature, assignerCandidature, modifierCandidature, supprimerCandidature } from "@/lib/actions/recrutement";

const STATUTS = [
  { valeur: "RECUE", libelle: "Reçue" },
  { valeur: "EN_EXAMEN", libelle: "En examen" },
  { valeur: "ENTRETIEN", libelle: "Entretien" },
  { valeur: "OFFRE", libelle: "Offre" },
  { valeur: "EMBAUCHE", libelle: "Embauché(e)" },
  { valeur: "REJETEE", libelle: "Rejetée" },
] as const;

type Coordonnees = { nom: string; telephone: string; email: string | null; message: string | null };

export function ControlesCandidature({
  candidatureId,
  statut,
  peutReassigner,
  agents,
  agentActuelId,
  peutModifier,
  peutSupprimer,
  coordonnees,
}: {
  candidatureId: string;
  statut: string;
  peutReassigner: boolean;
  agents: { id: string; nomComplet: string }[];
  agentActuelId: string | null;
  peutModifier: boolean;
  peutSupprimer: boolean;
  coordonnees: Coordonnees;
}) {
  const [edition, setEdition] = useState(false);
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [etat, action, enregistrement] = useActionState(async (precedent: { erreur?: string } | null, formData: FormData) => {
    const resultat = await modifierCandidature(precedent, formData);
    if (!resultat) setEdition(false);
    return resultat;
  }, null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`statut-${candidatureId}`}>Statut</Label>
          {/* key : le statut affiché suit la base après une annulation ou un rétablissement. */}
          <Select
            key={statut}
            id={`statut-${candidatureId}`}
            defaultValue={statut}
            className="w-36"
            disabled={!peutModifier}
            onChange={(e) => changerStatutCandidature(candidatureId, e.target.value as (typeof STATUTS)[number]["valeur"])}
          >
            {STATUTS.map((s) => (
              <option key={s.valeur} value={s.valeur}>
                {s.libelle}
              </option>
            ))}
          </Select>
        </div>
        {peutReassigner ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`agent-${candidatureId}`}>Recruteur</Label>
            <SelecteurPersonne
              id={`agent-${candidatureId}`}
              personnes={agents}
              defaultValue={agentActuelId}
              className="w-44"
              onValueChange={(id) => assignerCandidature(candidatureId, id)}
            />
          </div>
        ) : null}
      </div>

      {peutModifier || peutSupprimer ? (
        <div className="flex flex-wrap items-center gap-1">
          {enCours ? <Spinner className="size-3.5" /> : null}
          {peutModifier ? (
            <Button type="button" variant="ghost" size="xs" disabled={enCours} onClick={() => setEdition((v) => !v)}>
              <Pencil data-icon="inline-start" aria-hidden />
              Modifier
            </Button>
          ) : null}
          {peutModifier && statut !== "REJETEE" && statut !== "EMBAUCHE" ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={enCours}
              className="text-muted-foreground"
              onClick={() => {
                if (confirm("Annuler cette candidature ? Elle passera au statut « Rejetée » (vous pourrez la rétablir).")) {
                  startTransition(() => changerStatutCandidature(candidatureId, "REJETEE"));
                }
              }}
            >
              <Ban data-icon="inline-start" aria-hidden />
              Annuler
            </Button>
          ) : null}
          {peutModifier && statut === "REJETEE" ? (
            <Button type="button" variant="ghost" size="xs" disabled={enCours} className="text-muted-foreground" onClick={() => startTransition(() => changerStatutCandidature(candidatureId, "RECUE"))}>
              <RotateCcw data-icon="inline-start" aria-hidden />
              Rétablir
            </Button>
          ) : null}
          {peutSupprimer ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={enCours}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (!confirm("Supprimer définitivement cette candidature et son CV ? Cette action est irréversible.")) return;
                setErreur(null);
                startTransition(async () => {
                  const resultat = await supprimerCandidature(candidatureId);
                  if (resultat?.erreur) setErreur(resultat.erreur);
                });
              }}
            >
              <Trash2 data-icon="inline-start" aria-hidden />
              Supprimer
            </Button>
          ) : null}
        </div>
      ) : null}
      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

      {edition ? (
        <form action={action} className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <input type="hidden" name="candidatureId" value={candidatureId} />
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`nom-${candidatureId}`}>Nom</Label>
              <Input id={`nom-${candidatureId}`} name="nom" defaultValue={coordonnees.nom} required className="w-56" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`tel-${candidatureId}`}>Téléphone</Label>
              <Input id={`tel-${candidatureId}`} name="telephone" defaultValue={coordonnees.telephone} required className="w-44" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`email-${candidatureId}`}>Email (optionnel)</Label>
              <Input id={`email-${candidatureId}`} name="email" type="email" defaultValue={coordonnees.email ?? ""} className="w-56" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`message-${candidatureId}`}>Message (optionnel)</Label>
            <Textarea id={`message-${candidatureId}`} name="message" rows={3} defaultValue={coordonnees.message ?? ""} />
          </div>
          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enregistrement}>
              {enregistrement ? <Spinner /> : null}
              {enregistrement ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEdition(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
