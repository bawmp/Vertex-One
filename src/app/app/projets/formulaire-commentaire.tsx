"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/contexte";

type EtatCommentaire = { erreur?: string } | null;

export function FormulaireCommentaire({
  action,
  champCache,
  idCache,
}: {
  action: (etat: EtatCommentaire, formData: FormData) => Promise<EtatCommentaire>;
  champCache: string;
  idCache: string;
}) {
  const t = useT();
  const [etat, formAction, enCours] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name={champCache} value={idCache} />
      <Textarea name="contenu" placeholder={t("Ajouter un commentaire…")} rows={2} required />
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      <Button type="submit" size="sm" disabled={enCours} className="self-start">
        {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
        {enCours ? t("Envoi…") : t("Commenter")}
      </Button>
    </form>
  );
}
