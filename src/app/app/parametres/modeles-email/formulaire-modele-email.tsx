"use client";

import { useActionState, useState, useTransition } from "react";
import { Save, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { enregistrerModeleEmail, reinitialiserModeleEmail } from "@/lib/actions/modele-email";
import type { TypeModeleEmail } from "@/lib/email/modeles";
import { useT } from "@/lib/i18n/contexte";

/** Même substitution que `interpoler()` côté serveur (copiée ici : ce composant client ne doit pas importer la base). */
function apercu(texte: string, variables: Record<string, string>): string {
  return texte.replace(/\{\{(\w+)\}\}/g, (m, cle: string) => (Object.prototype.hasOwnProperty.call(variables, cle) ? variables[cle] : m));
}

export function FormulaireModeleEmail({
  type,
  titre,
  objet,
  corps,
  variables,
  exemple,
  personnalise,
}: {
  type: TypeModeleEmail;
  titre: string;
  objet: string;
  corps: string;
  /** Variables utilisables dans ce modèle (affichées sous le titre, cliquables pour les copier). */
  variables: { cle: string; description: string }[];
  /** Valeurs d'exemple pour l'aperçu en direct. */
  exemple: Record<string, string>;
  /** Une version personnalisée existe : le bouton « Rétablir le texte par défaut » est proposé. */
  personnalise: boolean;
}) {
  const t = useT();
  const [etat, action, enCours] = useActionState(enregistrerModeleEmail, null);
  const [objetSaisi, setObjetSaisi] = useState(objet);
  const [corpsSaisi, setCorpsSaisi] = useState(corps);
  const [retour, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {t("Variables disponibles :")}
          {variables.map((v) => (
            <code key={v.cle} title={v.description} className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-accent-foreground">
              {`{{${v.cle}}}`}
            </code>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="type" value={type} />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`objet-${type}`}>{t("Objet")}</Label>
            <Input id={`objet-${type}`} name="objet" required value={objetSaisi} onChange={(e) => setObjetSaisi(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`corps-${type}`}>{t("Message")}</Label>
            <Textarea id={`corps-${type}`} name="corps" required value={corpsSaisi} onChange={(e) => setCorpsSaisi(e.target.value)} rows={7} />
          </div>

          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm">
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("Aperçu avec des valeurs d'exemple")}</p>
            <p className="font-medium">{apercu(objetSaisi, exemple)}</p>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{apercu(corpsSaisi, exemple)}</p>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
          {etat?.enregistre ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              {t("Modèle enregistré.")}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={enCours} className="self-start">
              {enCours ? <Spinner /> : <Save data-icon="inline-start" aria-hidden />}
              {enCours ? t("Enregistrement…") : t("Enregistrer")}
            </Button>
            {personnalise ? (
              <Button
                type="button"
                variant="ghost"
                disabled={retour}
                onClick={() => {
                  if (confirm(t("Rétablir le texte par défaut ? Votre version personnalisée sera supprimée."))) startTransition(() => reinitialiserModeleEmail(type));
                }}
              >
                {retour ? <Spinner /> : <RotateCcw data-icon="inline-start" aria-hidden />}
                {t("Rétablir le texte par défaut")}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
