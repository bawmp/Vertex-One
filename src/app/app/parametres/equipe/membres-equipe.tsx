"use client";

import { useState, useTransition } from "react";
import { KeyRound, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { definirModulesUtilisateur } from "@/lib/actions/acces-modules";
import { renvoyerAccesCollegue } from "@/lib/actions/invitation";
import { modulesRestreignables } from "@/lib/modules-libelles";
import { SelecteurModules } from "./selecteur-modules";
import { useT } from "@/lib/i18n/contexte";


export type MembreEquipe = { id: string; nomComplet: string; email: string; role: "MANAGER" | "EMPLOYE"; modulesAutorises: string[] | null; statut: "ACTIF" | "DESACTIVE" };

const LIBELLE_ROLE = { MANAGER: "Manager", EMPLOYE: "Employé" } as const;

function LigneMembre({ membre, index }: { membre: MembreEquipe; index: number }) {
  const t = useT();
  const tous = modulesRestreignables(membre.role);
  const initiales = membre.modulesAutorises ?? tous;
  const [ouvert, setOuvert] = useState(false);
  const [valeurs, setValeurs] = useState<string[]>(initiales);
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [enCoursAcces, startTransitionAcces] = useTransition();
  const [messageAcces, setMessageAcces] = useState<{ texte: string; erreur: boolean } | null>(null);

  const restreint = membre.modulesAutorises !== null;
  const desactive = membre.statut === "DESACTIVE";

  function enregistrer() {
    setErreur(null);
    startTransition(async () => {
      const resultat = await definirModulesUtilisateur(membre.id, valeurs);
      if (resultat?.erreur) setErreur(resultat.erreur);
      else setOuvert(false);
    });
  }

  function renvoyerAcces() {
    setMessageAcces(null);
    startTransitionAcces(async () => {
      const resultat = await renvoyerAccesCollegue(membre.id);
      if (resultat?.erreur) setMessageAcces({ texte: resultat.erreur, erreur: true });
      else setMessageAcces({ texte: resultat?.succes ?? "", erreur: false });
    });
  }

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className="group/ligne relative flex animate-in fade-in flex-col gap-3 overflow-hidden px-4 py-3 text-sm fill-mode-both duration-300 transition-colors hover:bg-muted/50"
    >
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100" />
      <div className="flex flex-wrap items-center justify-between gap-3 transition-transform duration-150 group-hover/ligne:translate-x-1">
        <div className="min-w-0">
          <p className="truncate font-medium">{membre.nomComplet}</p>
          <p className="truncate text-muted-foreground">{membre.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {desactive ? <Badge variant="danger">{t("Désactivé")}</Badge> : null}
          <Badge variant="neutral">{LIBELLE_ROLE[membre.role]}</Badge>
          <Badge variant={restreint ? "warning" : "success"}>{restreint ? `${initiales.length}/${tous.length} modules` : t("Tous les modules")}</Badge>
          <Button type="button" variant="ghost" size="xs" disabled={enCoursAcces} onClick={renvoyerAcces}>
            {enCoursAcces ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
            {desactive ? t("Réactiver et renvoyer un accès") : t("Renvoyer un accès")}
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => setOuvert((v) => !v)}>
            <KeyRound data-icon="inline-start" aria-hidden />
            {t("Accès")}
          </Button>
        </div>
      </div>
      {messageAcces ? <p className={`text-xs ${messageAcces.erreur ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{messageAcces.texte}</p> : null}
      {ouvert ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <SelecteurModules role={membre.role} valeurs={valeurs} onChange={setValeurs} />
          {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={enCours} onClick={enregistrer}>
              {enCours ? <Spinner /> : null}
              {t("Enregistrer")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
              {t("Annuler")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MembresEquipe({ membres }: { membres: MembreEquipe[] }) {
  const t = useT();
  return (
    <div>
      <h2 className="mb-1 text-sm font-medium text-muted-foreground">{t("Membres et accès aux modules")}</h2>
      <p className="mb-2 text-xs text-muted-foreground">{t("Choisissez les modules que chaque Manager ou Employé peut utiliser. Ses droits à l'intérieur d'un module restent ceux de son rôle.")}</p>
      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {membres.map((m, index) => (
            <LigneMembre key={m.id} membre={m} index={index} />
          ))}
          {membres.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucun Manager ni Employé pour le moment.")}</p> : null}
        </div>
      </Card>
    </div>
  );
}
