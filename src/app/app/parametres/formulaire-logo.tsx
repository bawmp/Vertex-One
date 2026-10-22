"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LogoEntreprise } from "@/components/logo-entreprise";
import { televerserLogo } from "@/lib/actions/entreprise-branding";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireLogo({ entrepriseId, logoCleStockage, nomEntreprise }: { entrepriseId: string; logoCleStockage: string | null; nomEntreprise: string }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(televerserLogo, null);

  return (
    <form action={action} className="flex flex-wrap items-center gap-5">
      {/* Aperçu fidèle : c'est exactement ce panneau qui s'affiche au-dessus du nom de l'entreprise (barre latérale, espace client, pages d'accueil). */}
      <div className="w-56 shrink-0 rounded-2xl bg-sidebar p-3">
        <LogoEntreprise taille="panneau" className="h-24" entrepriseId={entrepriseId} logoCleStockage={logoCleStockage} nomEntreprise={nomEntreprise} />
      </div>
      <div className="flex flex-col gap-2">
        <input type="file" name="logo" accept="image/*" className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium" required />
        <Button type="submit" size="sm" disabled={enCours} className="self-start">
          {enCours ? <Spinner className="size-3.5" /> : null}
          {enCours ? t("Envoi…") : t("Téléverser")}
        </Button>
        {etat?.erreur ? <p className="text-xs text-destructive">{etat.erreur}</p> : null}
      </div>
    </form>
  );
}
