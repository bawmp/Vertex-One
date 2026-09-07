"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { convertirBonCommandeEnFactureFournisseur, annulerBonCommandeAchat } from "@/lib/actions/bon-commande-achat";

export function ConvertirBonCommande({ bonCommandeAchatId }: { bonCommandeAchatId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [numero, setNumero] = useState("");
  const [dateEcheance, setDateEcheance] = useState("");
  const [enCours, startTransition] = useTransition();

  if (!ouvert) {
    return (
      <div className="flex items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={() => setOuvert(true)}>
          Convertir en facture
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => startTransition(() => annulerBonCommandeAchat(bonCommandeAchatId))}
        >
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        placeholder="N° facture fournisseur"
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        className="w-40"
      />
      <Input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} className="w-36" />
      <Button
        type="button"
        size="sm"
        disabled={enCours || !numero.trim() || !dateEcheance}
        onClick={() =>
          startTransition(async () => {
            await convertirBonCommandeEnFactureFournisseur(bonCommandeAchatId, numero, dateEcheance);
            setOuvert(false);
          })
        }
      >
        {enCours ? <Spinner /> : null}
        Valider
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
        Annuler
      </Button>
    </div>
  );
}
