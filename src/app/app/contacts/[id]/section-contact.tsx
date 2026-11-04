"use client";

import { useState, useTransition } from "react";
import { ChampSelect } from "@/components/formulaire/champ";
import { definirSectionDuClient } from "@/lib/actions/analytique";
import { useT } from "@/lib/i18n/contexte";

/** Section analytique du client : ses nouvelles factures et ses reçus de vente y sont rattachés automatiquement (Comptabilité analytique). */
export function SectionContact({ contactId, sectionActuelle, sections }: { contactId: string; sectionActuelle: string | null; sections: { id: string; code: string; libelle: string }[] }) {
  const t = useT();
  const [choix, setChoix] = useState(sectionActuelle ?? "");
  const [enCours, demarrer] = useTransition();
  const [etat, setEtat] = useState<{ texte: string; erreur: boolean } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <ChampSelect
        label={t("Section analytique")}
        name="sectionAnalytique"
        value={choix}
        disabled={enCours}
        onChange={(e) => {
          const valeur = e.target.value;
          setChoix(valeur);
          setEtat(null);
          demarrer(async () => {
            const r = await definirSectionDuClient(contactId, valeur === "" ? null : valeur);
            setEtat(r?.erreur ? { texte: r.erreur, erreur: true } : { texte: t("Section du client enregistrée."), erreur: false });
          });
        }}
      >
        <option value="">{t("Aucune")}</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} — {s.libelle}
          </option>
        ))}
      </ChampSelect>
      <p className="text-xs text-muted-foreground">{t("Ses nouvelles factures et ses reçus de vente sont rattachés à cette section dans la comptabilité analytique.")}</p>
      {etat ? <p role={etat.erreur ? "alert" : "status"} className={`text-xs ${etat.erreur ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{etat.texte}</p> : null}
    </div>
  );
}
