"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { definirModulesUtilisateur } from "@/lib/actions/acces-modules";
import { modulesRestreignables } from "@/lib/modules-libelles";
import { SelecteurModules } from "./selecteur-modules";

export type MembreEquipe = { id: string; nomComplet: string; email: string; role: "MANAGER" | "EMPLOYE"; modulesAutorises: string[] | null };

const LIBELLE_ROLE = { MANAGER: "Manager", EMPLOYE: "Employé" } as const;

function LigneMembre({ membre }: { membre: MembreEquipe }) {
  const tous = modulesRestreignables(membre.role);
  const initiales = membre.modulesAutorises ?? tous;
  const [ouvert, setOuvert] = useState(false);
  const [valeurs, setValeurs] = useState<string[]>(initiales);
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const restreint = membre.modulesAutorises !== null;

  function enregistrer() {
    setErreur(null);
    startTransition(async () => {
      const resultat = await definirModulesUtilisateur(membre.id, valeurs);
      if (resultat?.erreur) setErreur(resultat.erreur);
      else setOuvert(false);
    });
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{membre.nomComplet}</p>
          <p className="truncate text-muted-foreground">{membre.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{LIBELLE_ROLE[membre.role]}</Badge>
          <Badge variant={restreint ? "warning" : "success"}>{restreint ? `${initiales.length}/${tous.length} modules` : "Tous les modules"}</Badge>
          <Button type="button" variant="ghost" size="xs" onClick={() => setOuvert((v) => !v)}>
            <KeyRound data-icon="inline-start" aria-hidden />
            Accès
          </Button>
        </div>
      </div>
      {ouvert ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <SelecteurModules role={membre.role} valeurs={valeurs} onChange={setValeurs} />
          {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={enCours} onClick={enregistrer}>
              {enCours ? <Spinner /> : null}
              Enregistrer
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MembresEquipe({ membres }: { membres: MembreEquipe[] }) {
  return (
    <div>
      <h2 className="mb-1 text-sm font-medium text-muted-foreground">Membres et accès aux modules</h2>
      <p className="mb-2 text-xs text-muted-foreground">Choisissez les modules que chaque Manager ou Employé peut utiliser. Ses droits à l&apos;intérieur d&apos;un module restent ceux de son rôle.</p>
      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {membres.map((m) => (
            <LigneMembre key={m.id} membre={m} />
          ))}
          {membres.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun Manager ni Employé pour le moment.</p> : null}
        </div>
      </Card>
    </div>
  );
}
