"use client";

import { useActionState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { creerAnnonce } from "@/lib/actions/annonce";

export function FormulaireAnnonce() {
  const [etat, action, enCours] = useActionState(creerAnnonce, null);

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <Textarea name="contenu" placeholder="Écrire une annonce pour toute l'équipe…" rows={3} required />
          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
          <Button type="submit" size="sm" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : <Megaphone data-icon="inline-start" aria-hidden />}
            {enCours ? "Publication…" : "Publier"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
