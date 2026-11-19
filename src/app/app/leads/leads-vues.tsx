"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Phone, Building2, SearchX, UserPlus } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { STATUT_LEAD } from "@/lib/libelles";
import { useT } from "@/lib/i18n/contexte";

type Lead = { id: string; nom: string; societeCliente: string | null; telephone: string; statut: string; convertiLe: boolean };

/**
 * Liste des leads « en travail » (nouveaux, contactés, disqualifiés) et des leads devenus clients. Un lead qualifié pas encore client n'est plus ici : il est
 * dans « Prospects qualifiés ». La création d'un contact passe uniquement par « Devenir client » (plus de bouton « Convertir » sur chaque ligne).
 */
export function LeadsVues({ leads }: { leads: Lead[] }) {
  const t = useT();
  const [recherche, setRecherche] = useState("");

  const terme = recherche.trim().toLowerCase();
  const leadsFiltres = terme
    ? leads.filter((l) => [l.nom, l.societeCliente, l.telephone].some((champ) => champ?.toLowerCase().includes(terme)))
    : leads;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={t("Rechercher un lead…")} className="pl-8" aria-label={t("Rechercher un lead")} />
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {leadsFiltres.map((l, index) => {
            const info = STATUT_LEAD[l.statut];
            return (
              <div
                key={l.id}
                style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                className="group/ligne relative flex animate-in fade-in flex-col gap-2 overflow-hidden px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 fill-mode-both duration-300 hover:bg-muted/50"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100"
                />
                <Link
                  href={`/app/leads/${l.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 transition-transform duration-150 group-hover/ligne:translate-x-1"
                >
                  <span className="font-medium sm:truncate">{l.nom}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {l.societeCliente ? (
                      <span className="flex items-center gap-1">
                        <Building2 className="size-3" aria-hidden />
                        {l.societeCliente}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Phone className="size-3" aria-hidden />
                      {l.telephone}
                    </span>
                  </span>
                </Link>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <Badge variant={l.convertiLe ? "success" : info?.variante ?? "neutral"}>{l.convertiLe ? t("Devenu client") : t(info?.libelle ?? l.statut)}</Badge>
                </div>
              </div>
            );
          })}
          {leadsFiltres.length === 0 ? (
            <EtatVide
              icone={terme ? SearchX : UserPlus}
              titre={terme ? t("Aucun lead ne correspond à cette recherche.") : t("Aucun lead pour le moment.")}
              description={terme ? t("Essayez un autre nom, ou effacez la recherche.") : t("Les prospects que vous ajoutez ou qui arrivent de vos formulaires apparaissent ici.")}
            />
          ) : null}
        </div>
      </Card>
    </div>
  );
}
