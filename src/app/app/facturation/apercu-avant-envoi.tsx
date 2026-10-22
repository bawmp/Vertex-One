"use client";

import { useState, useTransition } from "react";
import { Eye, ExternalLink, Paperclip, Send, X, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/contexte";
import type { ApercuEmailEnvoi } from "@/lib/actions/devis";

/**
 * « Aperçu avant envoi » d'un devis ou d'une facture : l'email tel qu'il partira (destinataire, objet, message — composés
 * par le même code que l'envoi réel) à côté du PDF réel joint. Rien n'est envoyé tant qu'on ne clique pas sur
 * « Envoyer » ; le corps est affiché dans un cadre isolé (sans script).
 */
export function ApercuAvantEnvoi({
  charger,
  pdfUrl,
  envoyer,
  enCoursEnvoi,
}: {
  charger: () => Promise<ApercuEmailEnvoi>;
  pdfUrl: string;
  /** Lance l'envoi réel (même action que le bouton « Envoyer » de la page) puis ferme l'aperçu. */
  envoyer: () => void;
  enCoursEnvoi: boolean;
}) {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const [apercu, setApercu] = useState<ApercuEmailEnvoi | null>(null);
  // Sous la largeur « lg », un seul volet à la fois (message ou PDF) ; au-dessus, les deux côte à côte.
  const [volet, setVolet] = useState<"email" | "pdf">("email");
  const [chargement, startTransition] = useTransition();

  function ouvrir() {
    setApercu(null);
    setVolet("email");
    setOuvert(true);
    startTransition(async () => setApercu(await charger()));
  }

  const pret = apercu && !("erreur" in apercu) ? apercu : null;

  return (
    <>
      <Button type="button" variant="outline" onClick={ouvrir}>
        <Eye data-icon="inline-start" aria-hidden />
        {t("Aperçu avant envoi")}
      </Button>

      {ouvert ? (
        <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-black/60 p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={t("Aperçu avant envoi")}>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2">
            <p className="text-sm font-medium">{t("Aperçu avant envoi")} — {t("rien n'est envoyé tant que vous ne cliquez pas sur Envoyer")}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!pret || !pret.destinataire || enCoursEnvoi}
                onClick={() => {
                  envoyer();
                  setOuvert(false);
                }}
              >
                {enCoursEnvoi ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
                {t("Envoyer au client par email")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOuvert(false)}>
                <X data-icon="inline-start" aria-hidden />
                {t("Fermer l'aperçu")}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 lg:hidden" role="tablist" aria-label={t("Aperçu avant envoi")}>
            <Button type="button" role="tab" aria-selected={volet === "email"} variant={volet === "email" ? "default" : "secondary"} size="sm" onClick={() => setVolet("email")}>
              {t("Message")}
            </Button>
            <Button type="button" role="tab" aria-selected={volet === "pdf"} variant={volet === "pdf" ? "default" : "secondary"} size="sm" onClick={() => setVolet("pdf")}>
              {t("Document (PDF)")}
            </Button>
          </div>

          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
            <section className={`min-h-0 flex-col gap-2 overflow-auto rounded-lg bg-background p-3 ${volet === "email" ? "flex" : "hidden"} lg:flex`} aria-label={t("Email")}>
              {chargement || !apercu ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> {t("Chargement de l'aperçu…")}
                </p>
              ) : "erreur" in apercu ? (
                <p role="alert" className="text-sm text-destructive">
                  {apercu.erreur}
                </p>
              ) : (
                <>
                  {!apercu.destinataire ? (
                    <p role="alert" className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {t("Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM).")}
                    </p>
                  ) : null}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">{t("À")}</dt>
                    <dd>{apercu.destinataire ?? "—"}</dd>
                    <dt className="text-muted-foreground">{t("Objet")}</dt>
                    <dd className="font-medium">{apercu.objet}</dd>
                    <dt className="text-muted-foreground">{t("Pièce jointe")}</dt>
                    <dd className="flex items-center gap-1">
                      <Paperclip className="size-3.5" aria-hidden />
                      {apercu.pieceJointe}
                    </dd>
                  </dl>
                  <iframe title={t("Contenu de l'email")} sandbox="" srcDoc={apercu.corpsHtml} className="min-h-72 flex-1 rounded-md border border-border bg-white" />
                </>
              )}
            </section>
            <section className={`min-h-0 flex-col gap-2 rounded-lg bg-background p-3 ${volet === "pdf" ? "flex" : "hidden"} lg:flex`} aria-label={t("Document (PDF)")}>
              <iframe src={pdfUrl} title={t("Aperçu du PDF")} className="min-h-0 w-full flex-1 rounded-md border border-border bg-white" />
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                <ExternalLink className="size-3.5" aria-hidden />
                {t("Le PDF ne s'affiche pas ? Ouvrir dans un nouvel onglet")}
              </a>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
