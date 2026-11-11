"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { modifierFicheOuverteAction } from "@/lib/actions/fiche-ouverte";
import { CHAMPS_MODIFIABLES, CONTRATS_PARTAGES, type TypeCible } from "@/lib/rh/fiches-ouvertes-regles";
import { useT } from "@/lib/i18n/contexte";

/**
 * Modification des informations d'une fiche d'une autre entreprise du groupe. Les champs sont ceux de la liste fermée ; le serveur
 * revérifie l'autorisation du propriétaire et le droit de modifier : ce formulaire ne décide de rien.
 */
export function FormulaireFicheOuverte({ type, entrepriseId, id, valeurs, peutModifier }: { type: TypeCible; entrepriseId: string; id: string; valeurs: Record<string, string | null>; peutModifier: boolean }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(modifierFicheOuverteAction, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="entrepriseId" value={entrepriseId} />
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CHAMPS_MODIFIABLES[type].map((c) => (
          <div key={c.cle} className="flex flex-col gap-1.5">
            <Label htmlFor={`champ-${c.cle}`}>{t(c.libelle)}</Label>
            {c.genre === "contrat" ? (
              <Select id={`champ-${c.cle}`} name={c.cle} defaultValue={valeurs[c.cle] ?? "CDI"} disabled={!peutModifier}>
                {CONTRATS_PARTAGES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </Select>
            ) : (
              <Input id={`champ-${c.cle}`} name={c.cle} type={c.genre === "jour" ? "date" : c.genre === "email" ? "email" : "text"} maxLength={c.max} required={c.requis} defaultValue={valeurs[c.cle] ?? ""} readOnly={!peutModifier} />
            )}
          </div>
        ))}
      </div>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {peutModifier ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={enCours}>
            {enCours ? <Spinner /> : null}
            {enCours ? t("Enregistrement…") : t("Enregistrer les modifications")}
          </Button>
          {etat?.ok ? (
            <span role="status" className="flex animate-in items-center gap-1.5 text-sm text-emerald-700 fade-in dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              {t("Modifications enregistrées. L'entreprise propriétaire en est informée dans l'historique de la fiche.")}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("Vous pouvez consulter cette fiche ; la modifier demande le droit de modification des Ressources Humaines.")}</p>
      )}
    </form>
  );
}
