"use client";

import { useState, useTransition } from "react";
import { ChampSelect } from "@/components/formulaire/champ";
import { affecterListePrixContact } from "@/lib/actions/listes-prix";
import { useT } from "@/lib/i18n/contexte";

/** Liste de prix du client : ses devis, commandes et reçus proposent les prix de cette liste (modifiables sur le document). */
export function ListePrixContact({ contactId, listeActuelle, listes, peutModifier }: { contactId: string; listeActuelle: string | null; listes: { id: string; nom: string; remisePourcent: number }[]; peutModifier: boolean }) {
  const t = useT();
  const [choix, setChoix] = useState(listeActuelle ?? "");
  const [enCours, demarrer] = useTransition();
  const [etat, setEtat] = useState<{ texte: string; erreur: boolean } | null>(null);

  if (!peutModifier) {
    const nom = listes.find((l) => l.id === listeActuelle)?.nom;
    return <p className="text-sm text-muted-foreground">{nom ?? t("Prix du catalogue.")}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ChampSelect
        label={t("Liste de prix")}
        name="listePrix"
        value={choix}
        disabled={enCours}
        onChange={(e) => {
          const valeur = e.target.value;
          setChoix(valeur);
          setEtat(null);
          demarrer(async () => {
            const r = await affecterListePrixContact(contactId, valeur === "" ? null : valeur);
            setEtat(r?.erreur ? { texte: r.erreur, erreur: true } : { texte: t("Liste de prix enregistrée."), erreur: false });
          });
        }}
      >
        <option value="">{t("Prix du catalogue")}</option>
        {listes.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nom} ({t("Remise {n} %", { n: l.remisePourcent })})
          </option>
        ))}
      </ChampSelect>
      <p className="text-xs text-muted-foreground">{t("Ses devis, commandes et reçus proposent les prix de cette liste.")}</p>
      {etat ? <p role={etat.erreur ? "alert" : "status"} className={`text-xs ${etat.erreur ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{etat.texte}</p> : null}
    </div>
  );
}
