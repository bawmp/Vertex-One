"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerFactureAcompte } from "@/lib/actions/facture-acompte";
import { useT } from "@/lib/i18n/contexte";

export function FormulaireFactureAcompte({ dealId, contactId }: { dealId?: string; contactId?: string }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerFactureAcompte, null);

  return (
    <Card className="mt-6">
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          {dealId ? <input type="hidden" name="dealId" value={dealId} /> : null}
          {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="montant">{t("Montant de l'avance (FCFA)")}</Label>
            <Input id="montant" name="montant" type="number" min="1" required autoFocus />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            {enCours ? t("Création…") : t("Créer la facture d'acompte")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
