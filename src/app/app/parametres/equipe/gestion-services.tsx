"use client";

import { useActionState, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { creerService, renommerService, archiverService } from "@/lib/actions/service";
import { useT } from "@/lib/i18n/contexte";

function LigneService({ service, index }: { service: { id: string; nom: string }; index: number }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(renommerService, null);
  const [enEdition, setEnEdition] = useState(false);

  if (enEdition) {
    return (
      <form action={action} className="flex items-center gap-2 px-4 py-2.5">
        <input type="hidden" name="serviceId" value={service.id} />
        <Input name="nom" defaultValue={service.nom} required className="h-8" />
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : t("Enregistrer")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEnEdition(false)}>
          {t("Annuler")}
        </Button>
        {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      </form>
    );
  }

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className="group/ligne relative flex animate-in fade-in items-center justify-between gap-3 overflow-hidden px-4 py-2.5 text-sm fill-mode-both duration-300 transition-colors hover:bg-muted/50"
    >
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100" />
      <p className="font-medium transition-transform duration-150 group-hover/ligne:translate-x-1">{service.nom}</p>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Renommer")} onClick={() => setEnEdition(true)}>
          <Pencil aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("Archiver")}
          onClick={() => {
            if (window.confirm(`Archiver le département "${service.nom}" ? Les employés rattachés repasseront à "Aucun".`)) {
              archiverService(service.id);
            }
          }}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function GestionServices({ services }: { services: { id: string; nom: string }[] }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerService, null);
  const [ouvert, setOuvert] = useState(false);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t("Départements")}</h2>
        {!ouvert ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
            <Plus data-icon="inline-start" aria-hidden />
            {t("Nouveau département")}
          </Button>
        ) : null}
      </div>

      {ouvert ? (
        <form action={action} className="mb-3 flex items-center gap-2 rounded-lg border p-3">
          <Input name="nom" placeholder={t("ex : Ventes, Support, Comptabilité")} required className="h-8" autoFocus />
          <Button type="submit" size="sm" disabled={enCours}>
            {enCours ? <Spinner /> : t("Créer")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
            {t("Annuler")}
          </Button>
          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
        </form>
      ) : null}

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {services.map((s, index) => (
            <LigneService key={s.id} service={s} index={index} />
          ))}
          {services.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucun département pour le moment.")}</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
