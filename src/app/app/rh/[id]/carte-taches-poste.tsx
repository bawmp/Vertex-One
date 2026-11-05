"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ajouterTachePosteAction, retirerTachePosteAction } from "@/lib/actions/taches-poste";
import { FREQUENCES, LIBELLE_FREQUENCE, type FrequenceTache } from "@/lib/rh/taches-poste-regles";
import { useT } from "@/lib/i18n/contexte";

export type TachePosteAffichee = { id: string; titre: string; description: string | null; frequence: FrequenceTache };

/**
 * Tâches du poste d'une personne : ses responsabilités permanentes ou récurrentes. Lisibles de la personne, de son manager et de l'Administrateur ;
 * le formulaire d'ajout et le bouton de retrait n'apparaissent que pour qui peut les gérer (revérifié côté serveur à chaque action).
 */
export function ListeTachesPoste({ taches, peutGerer, cibleId, dossierRHId }: { taches: TachePosteAffichee[]; peutGerer: boolean; cibleId: string; dossierRHId: string }) {
  const t = useT();
  const formulaire = useRef<HTMLFormElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  const [etat, action, enAjout] = useActionState(async (precedent: Awaited<ReturnType<typeof ajouterTachePosteAction>>, formData: FormData) => {
    const resultat = await ajouterTachePosteAction(cibleId, dossierRHId, precedent, formData);
    if (resultat?.message) {
      formulaire.current?.reset();
      setOuvert(false);
    }
    return resultat;
  }, null);

  return (
    <div className="flex flex-col gap-3">
      {taches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{peutGerer ? t("Aucune tâche du poste pour l'instant : décrivez ce que cette personne doit assurer dans son poste.") : t("Aucune tâche du poste définie pour l'instant.")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {taches.map((x) => (
            <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{x.titre}</p>
                {x.description ? <p className="mt-0.5 text-xs whitespace-pre-line text-muted-foreground">{x.description}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant="neutral">{t(LIBELLE_FREQUENCE[x.frequence])}</Badge>
                {peutGerer ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={enCours}
                    aria-label={t("Retirer la tâche")}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setErreur(null);
                      startTransition(async () => {
                        const r = await retirerTachePosteAction(x.id, dossierRHId);
                        if (r?.erreur) setErreur(r.erreur);
                      });
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {erreur ? <p role="alert" className="text-sm text-destructive">{erreur}</p> : null}

      {peutGerer ? (
        ouvert ? (
          <form ref={formulaire} action={action} className="flex flex-col gap-3 rounded-xl border border-border p-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="titre-tache-poste">{t("Tâche")}</Label>
              <Input id="titre-tache-poste" name="titre" required minLength={3} maxLength={120} placeholder={t("Ex. : relancer les factures en retard")} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="description-tache-poste">{t("Détail (optionnel)")}</Label>
              <Textarea id="description-tache-poste" name="description" rows={3} maxLength={600} />
            </div>
            <div className="flex flex-col gap-1 sm:max-w-56">
              <Label htmlFor="frequence-tache-poste">{t("Fréquence")}</Label>
              <Select id="frequence-tache-poste" name="frequence" defaultValue="PERMANENTE">
                {FREQUENCES.map((f) => (
                  <option key={f} value={f}>
                    {t(LIBELLE_FREQUENCE[f])}
                  </option>
                ))}
              </Select>
            </div>
            {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={enAjout}>
                {enAjout ? <Spinner /> : null}
                {t("Ajouter la tâche")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
                {t("Annuler")}
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOuvert(true)}>
            <Plus data-icon="inline-start" aria-hidden />
            {t("Ajouter une tâche du poste")}
          </Button>
        )
      ) : null}
    </div>
  );
}
