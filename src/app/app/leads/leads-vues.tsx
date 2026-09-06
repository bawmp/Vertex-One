"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Phone, Building2, ArrowRightCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { STATUT_LEAD } from "@/lib/libelles";
import { convertirLeadAction } from "@/lib/actions/lead";

type Lead = { id: string; nom: string; societeCliente: string | null; telephone: string; statut: string; convertiLe: boolean };

export function LeadsVues({ leads, peutModifier }: { leads: Lead[]; peutModifier: boolean }) {
  const [recherche, setRecherche] = useState("");
  const [enCours, demarrer] = useTransition();
  const [enConversion, setEnConversion] = useState<string | null>(null);

  const terme = recherche.trim().toLowerCase();
  const leadsFiltres = terme
    ? leads.filter((l) => [l.nom, l.societeCliente, l.telephone].some((champ) => champ?.toLowerCase().includes(terme)))
    : leads;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un lead…" className="pl-8" aria-label="Rechercher un lead" />
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {leadsFiltres.map((l) => {
            const info = STATUT_LEAD[l.statut];
            return (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <Link href={`/app/leads/${l.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5 hover:underline">
                  <span className="truncate font-medium">{l.nom}</span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    {l.societeCliente ? (
                      <span className="flex items-center gap-1">
                        <Building2 className="size-3" aria-hidden />
                        {l.societeCliente}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" aria-hidden />
                      {l.telephone}
                    </span>
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={info?.variante ?? "neutral"}>{l.convertiLe ? "Converti" : info?.libelle ?? l.statut}</Badge>
                  {peutModifier && !l.convertiLe ? (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={enCours}
                      onClick={() => {
                        setEnConversion(l.id);
                        demarrer(() => convertirLeadAction(l.id));
                      }}
                    >
                      {enCours && enConversion === l.id ? <Spinner /> : <ArrowRightCircle data-icon="inline-start" aria-hidden />}
                      Convertir
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {leadsFiltres.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted-foreground">{terme ? "Aucun lead ne correspond à cette recherche." : "Aucun lead pour le moment."}</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
