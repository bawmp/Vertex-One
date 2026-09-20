"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { desactiverPosteOuvert, modifierPosteOuvert, reactiverPosteOuvert, supprimerPosteOuvert } from "@/lib/actions/recrutement";
import { TYPES_CONTRAT } from "@/lib/recrutement/validation";

export type PosteAffiche = { id: string; titre: string; description: string | null; lieu: string | null; typeContrat: string | null; actif: boolean };

export function CartePoste({ poste }: { poste: PosteAffiche }) {
  const [edition, setEdition] = useState(false);
  const [enCours, startTransition] = useTransition();
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);
  const [etat, action, enregistrement] = useActionState(async (precedent: { erreur?: string } | null, formData: FormData) => {
    const resultat = await modifierPosteOuvert(precedent, formData);
    if (!resultat) setEdition(false);
    return resultat;
  }, null);

  if (edition) {
    return (
      <Card>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="posteId" value={poste.id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor={`titre-${poste.id}`}>Titre</Label>
              <Input id={`titre-${poste.id}`} name="titre" defaultValue={poste.titre} required className="max-w-64" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`lieu-${poste.id}`}>Lieu (optionnel)</Label>
              <Input id={`lieu-${poste.id}`} name="lieu" defaultValue={poste.lieu ?? ""} className="max-w-64" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`contrat-${poste.id}`}>Type de contrat (optionnel)</Label>
              <Select id={`contrat-${poste.id}`} name="typeContrat" defaultValue={poste.typeContrat ?? ""} className="max-w-64">
                <option value="">Non précisé</option>
                {TYPES_CONTRAT.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`description-${poste.id}`}>Description (optionnel)</Label>
              <Textarea id={`description-${poste.id}`} name="description" rows={8} defaultValue={poste.description ?? ""} />
            </div>

            {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={enregistrement}>
                {enregistrement ? <Spinner /> : null}
                {enregistrement ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEdition(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={poste.actif ? undefined : "opacity-70"}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{poste.titre}</p>
            {poste.lieu ? <Badge variant="neutral">{poste.lieu}</Badge> : null}
            {poste.typeContrat ? <Badge variant="brand">{poste.typeContrat}</Badge> : null}
            {!poste.actif ? <Badge variant="warning">Désactivé</Badge> : null}
          </div>
          <div className="flex items-center gap-1">
            {enCours ? <Spinner className="size-3.5" /> : null}
            <Button type="button" variant="ghost" size="xs" disabled={enCours} onClick={() => setEdition(true)}>
              <Pencil data-icon="inline-start" aria-hidden />
              Modifier
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={enCours}
              className="text-muted-foreground"
              onClick={() => {
                if (!poste.actif || confirm("Désactiver ce poste ? Il ne sera plus affiché sur la page publique.")) {
                  startTransition(() => (poste.actif ? desactiverPosteOuvert(poste.id) : reactiverPosteOuvert(poste.id)));
                }
              }}
            >
              {poste.actif ? "Désactiver" : "Réactiver"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={enCours}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (!confirm("Supprimer définitivement ce poste ? Cette action est irréversible.")) return;
                setErreurSuppression(null);
                startTransition(async () => {
                  const resultat = await supprimerPosteOuvert(poste.id);
                  if (resultat?.erreur) setErreurSuppression(resultat.erreur);
                });
              }}
            >
              <Trash2 data-icon="inline-start" aria-hidden />
              Supprimer
            </Button>
          </div>
        </div>
        {erreurSuppression ? <p className="text-sm text-destructive">{erreurSuppression}</p> : null}
      </CardContent>
    </Card>
  );
}
