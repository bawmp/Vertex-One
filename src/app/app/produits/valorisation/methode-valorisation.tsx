"use client";

import { useState, useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChoixCartes } from "@/components/formulaire/choix-cartes";
import { definirMethodeValorisation, type EtatValorisation } from "@/lib/actions/valorisation-stock";
import type { MethodeValorisation } from "@/lib/produits/valorisation-regles";
import { useT } from "@/lib/i18n/contexte";

/** Choix de la méthode de valorisation : deux grandes cartes, enregistrées au clic. Contrôle refait côté serveur (Administrateur seul). */
export function ChoixMethode({ methode, peutChanger }: { methode: MethodeValorisation; peutChanger: boolean }) {
  const t = useT();
  const [choix, setChoix] = useState<MethodeValorisation>(methode);
  const [etat, setEtat] = useState<EtatValorisation>(null);
  const [enCours, startTransition] = useTransition();

  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-medium">{t("Méthode de valorisation")}</h2>
        <ChoixCartes
          etiquette={t("Méthode de valorisation")}
          valeur={choix}
          desactive={!peutChanger || enCours}
          onChange={(v) => {
            const suivante = v as MethodeValorisation;
            setChoix(suivante);
            setEtat(null);
            startTransition(async () => {
              const r = await definirMethodeValorisation(suivante);
              setEtat(r);
              if (r?.erreur) setChoix(methode);
            });
          }}
          colonnes={2}
          options={[
            { valeur: "CMUP", libelle: t("Coût moyen pondéré"), detail: t("Chaque unité vaut le coût moyen de tous vos achats. Simple et stable.") },
            { valeur: "FIFO", libelle: t("Premier entré, premier sorti"), detail: t("Ce qui reste en stock vaut le prix des derniers achats. Suit mieux les prix qui montent.") },
          ]}
        />
        {!peutChanger ? <p className="text-xs text-muted-foreground">{t("Seul l'Administrateur peut changer la méthode.")}</p> : null}
        {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
        {etat?.message ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-4" aria-hidden />
            {etat.message} {t("La prochaine « constatation de la variation » ajustera la comptabilité.")}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
