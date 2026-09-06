"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { List, LayoutGrid, Search, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUT_DEAL } from "@/lib/libelles";
import { changerStatutDeal } from "@/lib/actions/deal";

type Deal = { id: string; titre: string; montant: number; statut: string; contactNom: string; compteNom: string | null };
type Vue = "kanban" | "liste";

const ORDRE_STATUTS = ["QUALIFICATION", "PROPOSITION", "NEGOCIATION", "GAGNE", "PERDU"];

function formaterMontant(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

export function DealsVues({ deals, peutModifier }: { deals: Deal[]; peutModifier: boolean }) {
  const [vue, setVue] = useState<Vue>("kanban");
  const [recherche, setRecherche] = useState("");
  const [donnees, setDonnees] = useState(deals);
  const [donneesPrecedentes, setDonneesPrecedentes] = useState(deals);
  const [enCours, demarrer] = useTransition();
  const [carteEnTraine, setCarteEnTraine] = useState<string | null>(null);
  const [colonneSurvolee, setColonneSurvolee] = useState<string | null>(null);

  if (deals !== donneesPrecedentes) {
    setDonneesPrecedentes(deals);
    setDonnees(deals);
  }

  function deposer(statutCible: string) {
    setColonneSurvolee(null);
    if (!carteEnTraine || !peutModifier || enCours) return;
    const id = carteEnTraine;
    setCarteEnTraine(null);

    const leDeal = donnees.find((d) => d.id === id);
    if (!leDeal || leDeal.statut === statutCible) return;

    setDonnees((prec) => prec.map((d) => (d.id === id ? { ...d, statut: statutCible } : d)));
    demarrer(() => changerStatutDeal(id, statutCible as Parameters<typeof changerStatutDeal>[1]));
  }

  const terme = recherche.trim().toLowerCase();
  const donneesFiltrees = terme
    ? donnees.filter((d) => [d.titre, d.contactNom, d.compteNom].some((champ) => champ?.toLowerCase().includes(terme)))
    : donnees;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un deal…" className="pl-8" aria-label="Rechercher un deal" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant={vue === "kanban" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setVue("kanban")} aria-label="Vue Kanban">
            <LayoutGrid className="size-4" aria-hidden />
          </Button>
          <Button variant={vue === "liste" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setVue("liste")} aria-label="Vue liste">
            <List className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {vue === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ORDRE_STATUTS.map((statut) => {
            const info = STATUT_DEAL[statut];
            const cartes = donneesFiltrees.filter((d) => d.statut === statut);
            const total = cartes.reduce((s, d) => s + d.montant, 0);
            return (
              <div
                key={statut}
                onDragOver={(e) => {
                  if (!peutModifier) return;
                  e.preventDefault();
                  setColonneSurvolee(statut);
                }}
                onDragLeave={() => setColonneSurvolee((c) => (c === statut ? null : c))}
                onDrop={() => deposer(statut)}
                className={`flex w-64 shrink-0 flex-col gap-2 rounded-lg p-2 transition-colors ${colonneSurvolee === statut ? "bg-muted" : ""}`}
              >
                <div className="flex flex-col gap-0.5 px-1">
                  <div className="flex items-center justify-between">
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? statut}</Badge>
                    <span className="text-xs text-muted-foreground">{cartes.length}</span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{formaterMontant(total)}</span>
                </div>
                <div className="flex min-h-16 flex-col gap-2">
                  {cartes.map((d) => (
                    <Link
                      key={d.id}
                      href={`/app/deals/${d.id}`}
                      draggable={peutModifier && !enCours}
                      onDragStart={() => setCarteEnTraine(d.id)}
                      onDragEnd={() => setCarteEnTraine(null)}
                    >
                      <Card
                        className={`transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_6px_rgba(0,0,0,0.05),0_16px_32px_-16px_rgba(0,0,0,0.14)] ${
                          carteEnTraine === d.id ? "opacity-40" : ""
                        } ${peutModifier ? "cursor-grab active:cursor-grabbing" : ""}`}
                      >
                        <CardContent className="flex flex-col gap-1 p-3">
                          <p className="text-sm font-medium">{d.titre}</p>
                          <p className="text-xs text-muted-foreground">{d.compteNom ?? d.contactNom}</p>
                          <p className="text-xs font-medium">{formaterMontant(d.montant)}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donneesFiltrees.map((d) => {
              const info = STATUT_DEAL[d.statut];
              return (
                <Link key={d.id} href={`/app/deals/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{d.titre}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {d.compteNom ? <Building2 className="size-3" aria-hidden /> : null}
                      {d.compteNom ?? d.contactNom}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formaterMontant(d.montant)}</span>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? d.statut}</Badge>
                  </div>
                </Link>
              );
            })}
            {donneesFiltrees.length === 0 ? (
              <p className="px-4 py-8 text-center text-muted-foreground">{terme ? "Aucun deal ne correspond à cette recherche." : "Aucun deal pour le moment."}</p>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}
