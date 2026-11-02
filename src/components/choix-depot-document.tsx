"use client";

import { useEffect, useState } from "react";
import { ChampSelect } from "@/components/formulaire/champ";
import { lireDepotsFormulaire, type DepotChoix } from "@/lib/actions/depot";
import { useT } from "@/lib/i18n/contexte";

/**
 * Liste déroulante « Dépôt » d'un document qui bouge le stock (devis, commande, facture périodique, ticket de vente, achats). N'apparaît
 * que pour une entreprise de produits qui a au moins DEUX dépôts : sinon rien ne s'affiche et le dépôt principal est utilisé. Le champ
 * `depotId` part avec le formulaire ; le serveur le revérifie (dépôt actif de l'entreprise). `sens` ne change que le libellé.
 */
export function ChoixDepotDocument({ sens }: { sens: "sortie" | "entree" }) {
  const t = useT();
  const [depots, setDepots] = useState<DepotChoix[]>([]);

  useEffect(() => {
    let actif = true;
    lireDepotsFormulaire().then((liste) => {
      if (actif) setDepots(liste);
    });
    return () => {
      actif = false;
    };
  }, []);

  if (depots.length < 2) return null;
  const principal = depots.find((d) => d.principal) ?? depots[0];

  return (
    <div className="max-w-sm">
      <ChampSelect label={sens === "sortie" ? t("Dépôt d'où sort le stock") : t("Dépôt où entre le stock")} name="depotId" defaultValue={principal.id} aide={t("Seuls les produits dont le stock est suivi sont concernés.")}>
        {depots.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nom}
            {d.principal ? ` (${t("Principal")})` : ""}
          </option>
        ))}
      </ChampSelect>
    </div>
  );
}
