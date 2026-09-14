"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { recupererListeEntreprises } from "@/lib/plateforme/donnees";

type Entreprise = Awaited<ReturnType<typeof recupererListeEntreprises>>[number];

const LIBELLE_STATUT: Record<string, { texte: string; variant: "success" | "danger" | "brand" }> = {
  essai: { texte: "Essai", variant: "brand" },
  actif: { texte: "Actif", variant: "success" },
  suspendu: { texte: "Suspendu", variant: "danger" },
};

export function ListeEntreprises({ entreprises }: { entreprises: Entreprise[] }) {
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState("tous");

  const filtrees = useMemo(() => {
    return entreprises.filter((e) => {
      const correspondRecherche = e.nom.toLowerCase().includes(recherche.trim().toLowerCase());
      const correspondStatut = statut === "tous" || e.statutAbonnement === statut;
      return correspondRecherche && correspondStatut;
    });
  }, [entreprises, recherche, statut]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une entreprise…" className="pl-8" />
        </div>
        <Select value={statut} onChange={(e) => setStatut(e.target.value)} className="sm:w-48">
          <option value="tous">Tous les statuts</option>
          <option value="essai">Essai</option>
          <option value="actif">Actif</option>
          <option value="suspendu">Suspendu</option>
        </Select>
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {filtrees.length > 0 ? (
            filtrees.map((e) => {
              const libelle = LIBELLE_STATUT[e.statutAbonnement] ?? { texte: e.statutAbonnement, variant: "brand" as const };
              const dateReference = e.statutAbonnement === "essai" ? e.essaiFinLe : e.abonnementEcheanceLe;
              return (
                <Link key={e.id} href={`/plateforme/entreprises/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{e.nom}</span>
                    <span className="text-xs text-muted-foreground">{e.secteurProfil}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(dateReference)}</span>
                    <Badge variant={libelle.variant}>{libelle.texte}</Badge>
                  </div>
                </Link>
              );
            })
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune entreprise ne correspond à cette recherche.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
