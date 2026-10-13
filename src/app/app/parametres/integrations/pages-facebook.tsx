"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Link2Off, Megaphone, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { connecterPageFacebook, deconnecterPageFacebook, demarrerConnexionFacebook } from "@/lib/actions/facebook";
import { useT } from "@/lib/i18n/contexte";
import { m } from "@/lib/i18n/catalogue";

export type PageReliee = { id: string; nom: string; creeLe: string; dernierLeadLe: string | null };

const MESSAGES_RETOUR: Record<string, string> = {
  annule: m("Connexion annulée : aucune autorisation n'a été donnée à Vertex One."),
  etat: m("La connexion a expiré ou provient d'un autre navigateur. Relancez-la."),
  erreur: m("Facebook n'a pas pu confirmer la connexion. Réessayez dans un instant."),
  "aucune-page": m("Aucune page Facebook n'a été trouvée sur ce compte : vous devez en être administrateur."),
  refuse: m("Seul l'administrateur peut relier une page Facebook."),
};

export function PagesFacebook({ configure, pages, pagesAChoisir, retour }: { configure: boolean; pages: PageReliee[]; pagesAChoisir: { id: string; nom: string }[]; retour: string | null }) {
  const t = useT();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [relie, setRelie] = useState(false);
  const formatDate = (iso: string) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(new Date(iso));

  function lancer(action: () => Promise<{ erreur: string } | { ok: true } | null>, apres?: () => void) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await action();
      if (resultat && "erreur" in resultat) setErreur(resultat.erreur);
      else apres?.();
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Megaphone className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-medium">{t("Publicités Facebook")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Reliez votre page Facebook : chaque prospect qui remplit le formulaire de l'une de vos publicités devient automatiquement un lead, assigné au premier administrateur.")}
          </p>
        </div>
      </div>

      {!configure ? <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t("La connexion Facebook n'est pas encore activée sur cette plateforme.")}</p> : null}
      {retour && MESSAGES_RETOUR[retour] ? <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">{t(MESSAGES_RETOUR[retour])}</p> : null}
      {erreur ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erreur}</p> : null}
      {relie ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="size-4" aria-hidden />
          {t("Page reliée : les prochains prospects arriveront dans vos leads.")}
        </p>
      ) : null}

      {pagesAChoisir.length > 0 && !relie ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("Quelle page voulez-vous relier ?")}</p>
          {pagesAChoisir.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="truncate text-sm">{p.nom}</span>
              <Button type="button" size="sm" disabled={enCours} onClick={() => lancer(() => connecterPageFacebook(p.id), () => setRelie(true))}>
                {enCours ? <Spinner data-icon="inline-start" /> : <Plug data-icon="inline-start" aria-hidden />}
                {t("Relier cette page")}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {pages.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.nom}</p>
                <p className="text-xs text-muted-foreground">
                  {t("Reliée le {date}", { date: formatDate(p.creeLe) })} · {p.dernierLeadLe ? t("Dernier prospect : {date}", { date: formatDate(p.dernierLeadLe) }) : t("Aucun prospect reçu pour l'instant")}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enCours}
                onClick={() => {
                  if (confirm(t("Déconnecter cette page ? Les nouveaux prospects n'arriveront plus dans vos leads."))) lancer(() => deconnecterPageFacebook(p.id));
                }}
              >
                <Link2Off data-icon="inline-start" aria-hidden />
                {t("Déconnecter")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <Button type="button" disabled={enCours || !configure} onClick={() => lancer(demarrerConnexionFacebook)}>
          {enCours ? <Spinner data-icon="inline-start" /> : <Megaphone data-icon="inline-start" aria-hidden />}
          {pages.length > 0 ? t("Relier une autre page") : t("Relier ma page Facebook")}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">{t("Vous devez être administrateur de la page. Vertex One ne publie jamais rien à votre place.")}</p>
      </div>
    </section>
  );
}
