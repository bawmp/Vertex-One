"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, Copy, Check, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerCleApi, revoquerCleApi } from "@/lib/actions/cle-api";
import { useT } from "@/lib/i18n/contexte";

type Cle = { id: string; nom: string; prefixe: string; creeLe: string; dernierUsageLe: string | null; revoqueeLe: string | null };

export function GestionClesApi({ cles }: { cles: Cle[] }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerCleApi, null);
  const [copie, setCopie] = useState(false);
  const [revocation, demarrer] = useTransition();

  async function copier(cle: string) {
    try {
      await navigator.clipboard.writeText(cle);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers indisponible : la clé reste sélectionnable à l'écran.
    }
  }

  function revoquer(id: string, nom: string) {
    if (!window.confirm(t("Révoquer la clé « {nom} » ? Les sites qui l'utilisent ne pourront plus envoyer de demandes.", { nom }))) return;
    demarrer(async () => {
      await revoquerCleApi(id);
    });
  }

  const format = (iso: string) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nom-cle">{t("Nom de la nouvelle clé")}</Label>
          <Input id="nom-cle" name="nom" required minLength={2} maxLength={80} placeholder={t("Ex. : Site Global Mobility")} />
        </div>
        <Button type="submit" size="sm" disabled={enCours} className="w-fit">
          {enCours ? <Spinner /> : <KeyRound data-icon="inline-start" aria-hidden />}
          {t("Créer une clé")}
        </Button>
        {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      </form>

      {etat?.cleCree ? (
        <Card className="flex flex-col gap-2 border-amber-300 p-4">
          <p className="text-sm font-medium">{t("Clé « {nom} » créée. Copiez-la maintenant : elle ne sera plus jamais affichée.", { nom: etat.nomCle ?? "" })}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">{etat.cleCree}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => copier(etat.cleCree!)}>
              {copie ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
              {copie ? t("Copiée") : t("Copier")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("Gardez-la secrète, comme un mot de passe : toute personne qui la possède peut ajouter des leads à votre CRM.")}</p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t("Clés existantes")}</h2>
        {cles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Aucune clé pour le moment.")}</p>
        ) : (
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {cles.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {c.nom}
                      {c.revoqueeLe ? <Badge variant="neutral">{t("Révoquée")}</Badge> : <Badge variant="success">{t("Active")}</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{c.prefixe}…</span> · {t("créée le {date}", { date: format(c.creeLe) })} ·{" "}
                      {c.dernierUsageLe ? t("dernier usage : {date}", { date: format(c.dernierUsageLe) }) : t("jamais utilisée")}
                    </p>
                  </div>
                  {!c.revoqueeLe ? (
                    <Button type="button" size="sm" variant="outline" disabled={revocation} onClick={() => revoquer(c.id, c.nom)} className="text-destructive hover:text-destructive">
                      <Ban data-icon="inline-start" aria-hidden />
                      {t("Révoquer")}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
