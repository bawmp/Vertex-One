"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronDown, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formaterFCFA } from "@/lib/facturation/calcul";
import {
  compteDansTotal,
  devisCorrespond,
  factureCorrespond,
  grouperParPeriode,
  type FiltreDevis,
  type FiltreFacture,
  type Granularite,
  type Periode,
} from "@/lib/facturation/classement";
import { useT } from "@/lib/i18n/contexte";
import { BoutonSupprimerDevis } from "./bouton-supprimer-devis";

export type LigneClassee = {
  id: string;
  numero: string;
  client: string;
  montantTTC: number;
  statut: string;
  /** Libellé français du statut (clé du catalogue, traduit ici). */
  statutLibelle: string;
  variante: "neutral" | "success" | "warning" | "danger" | "info" | "brand";
  /** Date qui range le document dans une période : création du devis, émission de la facture (ISO). */
  date: string;
  dateValidite?: string;
  /** Facture : promesse de paiement en cours, déjà formatée (« 25 nov. 2026 »). */
  promesse?: string;
  href: string;
  supprimable?: boolean;
};

type Filtre = FiltreDevis | FiltreFacture;
const GRANULARITES: { valeur: Granularite; libelle: string }[] = [
  { valeur: "MOIS", libelle: "Mois" },
  { valeur: "TRIMESTRE", libelle: "Trimestre" },
  { valeur: "SEMESTRE", libelle: "Semestre" },
  { valeur: "ANNEE", libelle: "Année" },
];

/**
 * Liste de devis ou de factures rangée par période (mois, trimestre, semestre, année) puis, au choix, filtrée par statut (pour les
 * factures : non payées, en attente, en retard, payées…). Le groupe le plus récent est ouvert ; chaque groupe annonce son nombre de
 * documents et son total. Une recherche rapide (numéro, client) s'applique à l'ensemble.
 */
export function ListeClassee({ type, lignes, peutSupprimer }: { type: "devis" | "facture"; lignes: LigneClassee[]; peutSupprimer: boolean }) {
  const t = useT();
  const [granularite, setGranularite] = useState<Granularite>("MOIS");
  const [filtre, setFiltre] = useState<Filtre>(type === "devis" ? "TOUS" : "TOUTES");
  const [recherche, setRecherche] = useState("");
  const [fermes, setFermes] = useState<Set<string>>(new Set());
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  const filtres: { valeur: Filtre; libelle: string }[] =
    type === "devis"
      ? [
          { valeur: "TOUS", libelle: t("Tous") },
          { valeur: "BROUILLON", libelle: t("Brouillons") },
          { valeur: "EN_ATTENTE", libelle: t("En attente de réponse") },
          { valeur: "ACCEPTE", libelle: t("Acceptés") },
          { valeur: "REFUSE", libelle: t("Refusés") },
          { valeur: "EXPIRE", libelle: t("Expirés") },
        ]
      : [
          { valeur: "TOUTES", libelle: t("Toutes") },
          { valeur: "NON_PAYEES", libelle: t("Non payées") },
          { valeur: "EN_ATTENTE", libelle: t("En attente") },
          { valeur: "EN_RETARD", libelle: t("En retard") },
          { valeur: "PAYEES", libelle: t("Payées") },
          { valeur: "ANNULEES", libelle: t("Annulées") },
        ];

  const correspond = (l: LigneClassee, f: Filtre) =>
    type === "devis" ? devisCorrespond({ statut: l.statut, dateValidite: l.dateValidite ?? l.date }, f as FiltreDevis) : factureCorrespond(l.statut, f as FiltreFacture);

  const compteurs = useMemo(() => Object.fromEntries(filtres.map((f) => [f.valeur, lignes.filter((l) => correspond(l, f.valeur)).length])), [lignes, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const terme = recherche.trim().toLowerCase();
  const visibles = lignes.filter((l) => correspond(l, filtre) && (!terme || l.numero.toLowerCase().includes(terme) || l.client.toLowerCase().includes(terme)));
  const groupes = grouperParPeriode(visibles, (l) => l.date, granularite);

  function libellePeriode(p: Periode): string {
    if (p.granularite === "MOIS") return new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(p.annee, p.indice - 1, 1)));
    if (p.granularite === "TRIMESTRE") return t("T{n} {annee}", { n: p.indice, annee: p.annee });
    if (p.granularite === "SEMESTRE") return t("S{n} {annee}", { n: p.indice, annee: p.annee });
    return String(p.annee);
  }
  const estOuvert = (cle: string, index: number) => (index === 0 ? !fermes.has(cle) : ouverts.has(cle));
  function basculer(cle: string, index: number) {
    const mettre = (precedent: Set<string>) => {
      const suivant = new Set(precedent);
      if (suivant.has(cle)) suivant.delete(cle);
      else suivant.add(cle);
      return suivant;
    };
    if (index === 0) setFermes(mettre);
    else setOuverts(mettre);
  }
  // Une recherche affiche tous les résultats, sans obliger à déplier chaque période.
  const toutOuvert = terme.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label={t("Regrouper par")} className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {GRANULARITES.map((g) => (
            <button
              key={g.valeur}
              type="button"
              aria-pressed={granularite === g.valeur}
              onClick={() => setGranularite(g.valeur)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${granularite === g.valeur ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(g.libelle)}
            </button>
          ))}
        </div>
        <label className="relative min-w-40 flex-1 sm:max-w-xs">
          <span className="sr-only">{t("Rechercher par numéro ou client")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={t("Rechercher par numéro ou client")}
            className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </label>
      </div>

      <div role="group" aria-label={t("Filtrer par statut")} className="flex flex-wrap gap-1.5">
        {filtres.map((f) => (
          <button
            key={f.valeur}
            type="button"
            aria-pressed={filtre === f.valeur}
            onClick={() => setFiltre(f.valeur)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${filtre === f.valeur ? "bg-primary text-primary-foreground ring-primary" : "bg-background text-muted-foreground ring-border hover:text-foreground"}`}
          >
            {f.libelle}
            <span className={`tabular-nums ${filtre === f.valeur ? "opacity-80" : "opacity-60"}`}>{compteurs[f.valeur]}</span>
          </button>
        ))}
      </div>

      {groupes.length === 0 ? (
        <Card className="p-0">
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {lignes.length === 0 ? (type === "devis" ? t("Aucun devis.") : t("Aucune facture.")) : t("Aucun document ne correspond à ces critères.")}
          </p>
        </Card>
      ) : (
        groupes.map((g, index) => {
          const ouvert = toutOuvert || estOuvert(g.periode.cle, index);
          const total = g.elements.filter((l) => compteDansTotal(l.statut)).reduce((somme, l) => somme + l.montantTTC, 0);
          return (
            <Card key={g.periode.cle} className="overflow-hidden p-0">
              <button
                type="button"
                aria-expanded={ouvert}
                onClick={() => basculer(g.periode.cle, index)}
                className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-2.5 text-left text-sm hover:bg-muted/70"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${ouvert ? "" : "-rotate-90"}`} aria-hidden />
                  <span className="font-semibold capitalize">{libellePeriode(g.periode)}</span>
                  <span className="text-muted-foreground">
                    · {g.elements.length === 1 ? t("{n} document", { n: g.elements.length }) : t("{n} documents", { n: g.elements.length })}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formaterFCFA(total)}</span>
              </button>
              {ouvert ? (
                <div className="flex flex-col divide-y divide-border border-t border-border">
                  {g.elements.map((l) => (
                    <div key={l.id} className="flex items-center hover:bg-muted/60">
                      <Link href={l.href} className="group/ligne relative flex min-w-0 flex-1 flex-col gap-1 overflow-hidden px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100" />
                        <span className="min-w-0 transition-transform duration-150 group-hover/ligne:translate-x-1 sm:truncate">
                          <span className="font-medium">{l.numero}</span>
                          <span className="text-muted-foreground"> — {l.client}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0">
                          <span className="tabular-nums text-muted-foreground">{formaterFCFA(l.montantTTC)}</span>
                          {l.promesse ? (
                            <Badge variant="info" className="gap-1">
                              <CalendarClock className="size-3" aria-hidden />
                              {t("Promis le {date}", { date: l.promesse })}
                            </Badge>
                          ) : null}
                          <Badge variant={l.variante}>{t(l.statutLibelle)}</Badge>
                        </span>
                      </Link>
                      {l.supprimable && peutSupprimer ? (
                        <div className="shrink-0 pr-3">
                          <BoutonSupprimerDevis devisId={l.id} numero={l.numero} compact />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </div>
  );
}
