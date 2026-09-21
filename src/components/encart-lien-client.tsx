"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/contexte";

/**
 * Encart des pages internes devis/facture : le lien public à partager au client (par
 * WhatsApp par exemple) et un résumé de sa réponse — accepté, refusé, contesté, avec
 * la date et le motif quand il y en a un.
 */
export function EncartLienClient({ url, resume }: { url: string; resume: { ton: "succes" | "alerte" | "neutre"; texte: string } | null }) {
  const t = useT();
  const [copie, setCopie] = useState(false);

  const classesResume =
    resume?.ton === "succes"
      ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
      : resume?.ton === "alerte"
        ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        : "bg-muted text-muted-foreground";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        <Link2 className="size-3.5" aria-hidden />
        {t("Lien client")}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">{url}</code>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Copier le lien client")} onClick={() => navigator.clipboard.writeText(url).then(() => setCopie(true))}>
          {copie ? <Check className="text-emerald-600" aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("Le client y consulte le document, l'accepte ou le refuse et peut le régler en ligne.")}</p>
      {resume ? <p className={`rounded-md px-2.5 py-2 ${classesResume}`}>{resume.texte}</p> : null}
    </div>
  );
}
