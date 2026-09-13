"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LogoEntreprise } from "@/components/logo-entreprise";
import { televerserLogo } from "@/lib/actions/entreprise-branding";

export function FormulaireLogo({ entrepriseId, logoCleStockage, nomEntreprise }: { entrepriseId: string; logoCleStockage: string | null; nomEntreprise: string }) {
  const [etat, action, enCours] = useActionState(televerserLogo, null);

  return (
    <form action={action} className="flex items-center gap-4">
      <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-dashed p-2">
        <LogoEntreprise entrepriseId={entrepriseId} logoCleStockage={logoCleStockage} nomEntreprise={nomEntreprise} />
      </div>
      <div className="flex flex-col gap-2">
        <input type="file" name="logo" accept="image/*" className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium" required />
        <Button type="submit" size="sm" disabled={enCours} className="self-start">
          {enCours ? <Spinner className="size-3.5" /> : null}
          {enCours ? "Envoi…" : "Téléverser"}
        </Button>
        {etat?.erreur ? <p className="text-xs text-destructive">{etat.erreur}</p> : null}
      </div>
    </form>
  );
}
