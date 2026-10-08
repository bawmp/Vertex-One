"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { traiterDemandeSuppressionDocument } from "@/lib/actions/document";
import { useT } from "@/lib/i18n/contexte";

type Demande = { id: string; documentNom: string; demandeParNom: string; motif: string | null; creeLe: string };

/**
 * Demandes de suppression en attente — Administrateur seulement (la page ne l'affiche qu'avec le droit de
 * suppression générale, et le serveur revérifie à chaque décision). Montre qui a demandé, quand et pourquoi.
 */
export function DemandesSuppression({ demandes }: { demandes: Demande[] }) {
  const t = useT();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  if (demandes.length === 0) return null;

  function traiter(id: string, decision: "APPROUVER" | "REFUSER") {
    if (decision === "APPROUVER" && !window.confirm(t("Supprimer définitivement ce document ?"))) return;
    setErreur(null);
    demarrer(async () => {
      const r = await traiterDemandeSuppressionDocument(id, decision);
      if (r.erreur) setErreur(r.erreur);
    });
  }

  return (
    <Card className="border-amber-300 p-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-medium">
        <Trash2 className="size-4 text-amber-600" aria-hidden />
        {t("Demandes de suppression en attente")}
      </div>
      <div className="flex flex-col divide-y divide-border">
        {demandes.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{d.documentNom}</p>
              <p className="text-xs text-muted-foreground">
                {t("Demandée par {nom}", { nom: d.demandeParNom })} · {new Date(d.creeLe).toLocaleDateString(t.locale)}
                {d.motif ? ` — « ${d.motif} »` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={enCours} onClick={() => traiter(d.id, "APPROUVER")}>
                {t("Approuver la suppression")}
              </Button>
              <Button size="sm" variant="outline" disabled={enCours} onClick={() => traiter(d.id, "REFUSER")}>
                {t("Refuser")}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {erreur ? <p className="border-t border-border px-4 py-2 text-xs text-destructive">{erreur}</p> : null}
    </Card>
  );
}
