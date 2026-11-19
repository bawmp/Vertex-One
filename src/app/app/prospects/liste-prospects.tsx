"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Phone, Mail, Building2, BellRing, MessageCircle, SearchX, UserCheck, Inbox, ChevronDown, CheckCircle2 } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { devenirClient } from "@/lib/actions/prospect";
import { ETAT_RELANCE, estARelancer, type EtatRelanceProspect } from "@/lib/crm/prospects";
import { useT } from "@/lib/i18n/contexte";
import { PanneauRelance } from "./panneau-relance";

export type LigneProspect = {
  id: string;
  nom: string;
  societeCliente: string | null;
  telephone: string;
  email: string | null;
  rappelLe: string | null;
  qualifieLe: string;
  derniereRelanceLe: string | null;
  nbRelances: number;
  assigneANom: string | null;
  sourceExterne: string | null;
  etat: EtatRelanceProspect;
};

type Filtre = "TOUS" | "A_RELANCER" | "RAPPELS" | "RECENTS";

export function ListeProspects({ prospects, nomEntreprise, peutModifier }: { prospects: LigneProspect[]; nomEntreprise: string; peutModifier: boolean }) {
  const t = useT();
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("TOUS");
  const [ouvert, setOuvert] = useState<{ id: string; onglet: "email" | "whatsapp" } | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const format = useMemo(() => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "Africa/Douala" }), [t.locale]);

  const nombres = useMemo(
    () => ({
      TOUS: prospects.length,
      A_RELANCER: prospects.filter((p) => estARelancer(p.etat)).length,
      RAPPELS: prospects.filter((p) => p.etat === "RAPPEL_PREVU").length,
      RECENTS: prospects.filter((p) => p.etat === "RELANCE_RECENTE").length,
    }),
    [prospects]
  );

  const terme = recherche.trim().toLowerCase();
  const visibles = prospects.filter((p) => {
    if (filtre === "A_RELANCER" && !estARelancer(p.etat)) return false;
    if (filtre === "RAPPELS" && p.etat !== "RAPPEL_PREVU") return false;
    if (filtre === "RECENTS" && p.etat !== "RELANCE_RECENTE") return false;
    return terme ? [p.nom, p.societeCliente, p.telephone, p.email].some((champ) => champ?.toLowerCase().includes(terme)) : true;
  });

  const filtres: { cle: Filtre; libelle: string }[] = [
    { cle: "TOUS", libelle: t("Tous") },
    { cle: "A_RELANCER", libelle: t("À relancer") },
    { cle: "RAPPELS", libelle: t("Rappels prévus") },
    { cle: "RECENTS", libelle: t("Relancés récemment") },
  ];

  function confirmerClient(id: string) {
    setErreur(null);
    demarrer(async () => {
      const r = await devenirClient(id); // en cas de succès, le serveur redirige vers la fiche du nouveau contact
      if (r && "erreur" in r) {
        setErreur(r.erreur);
        setConfirmation(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={t("Rechercher un prospect…")} className="pl-8" aria-label={t("Rechercher un prospect")} />
        </div>
        <div role="group" aria-label={t("Filtrer les prospects")} className="flex flex-wrap gap-1">
          {filtres.map(({ cle, libelle }) => (
            <Button key={cle} type="button" size="sm" variant={filtre === cle ? "default" : "outline"} aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
              {libelle}
              <span className="ml-1 rounded-full bg-background/20 px-1.5 text-xs tabular-nums">{nombres[cle]}</span>
            </Button>
          ))}
        </div>
      </div>

      {erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {visibles.map((p) => {
            const info = ETAT_RELANCE[p.etat];
            const estOuvert = ouvert?.id === p.id;
            return (
              <div key={p.id} className="flex flex-col gap-3 px-4 py-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/app/leads/${p.id}`} className="font-medium hover:underline">
                        {p.nom}
                      </Link>
                      <Badge variant={info.variante}>{t(info.libelle)}</Badge>
                    </div>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {p.societeCliente ? (
                        <span className="flex items-center gap-1">
                          <Building2 className="size-3" aria-hidden />
                          {p.societeCliente}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Phone className="size-3" aria-hidden />
                        {p.telephone}
                      </span>
                      {p.email ? (
                        <span className="flex min-w-0 items-center gap-1 break-all">
                          <Mail className="size-3 shrink-0" aria-hidden />
                          {p.email}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{t("Qualifié le {date}", { date: format.format(new Date(p.qualifieLe)) })}</span>
                      <span>
                        {p.derniereRelanceLe
                          ? t("Dernière relance : {date} ({n} au total)", { date: format.format(new Date(p.derniereRelanceLe)), n: p.nbRelances })
                          : t("Jamais relancé")}
                      </span>
                      {p.rappelLe ? (
                        <span className="flex items-center gap-1">
                          <BellRing className="size-3" aria-hidden />
                          {t("Rappel le {date}", { date: format.format(new Date(`${p.rappelLe}T12:00:00Z`)) })}
                        </span>
                      ) : null}
                      {p.assigneANom ? <span>{t("Suivi par {nom}", { nom: p.assigneANom })}</span> : null}
                    </span>
                  </div>

                  {peutModifier ? (
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      <Button size="xs" variant={estOuvert && ouvert?.onglet === "whatsapp" ? "default" : "outline"} onClick={() => setOuvert(estOuvert && ouvert?.onglet === "whatsapp" ? null : { id: p.id, onglet: "whatsapp" })}>
                        <MessageCircle data-icon="inline-start" aria-hidden />
                        {t("WhatsApp")}
                      </Button>
                      <Button size="xs" variant={estOuvert && ouvert?.onglet === "email" ? "default" : "outline"} onClick={() => setOuvert(estOuvert && ouvert?.onglet === "email" ? null : { id: p.id, onglet: "email" })}>
                        <Mail data-icon="inline-start" aria-hidden />
                        {t("E-mail")}
                      </Button>
                      <Button size="xs" variant="ghost" aria-expanded={estOuvert} onClick={() => setOuvert(estOuvert ? null : { id: p.id, onglet: "email" })} title={t("Plus d'options de relance")}>
                        <ChevronDown className={`size-3.5 transition-transform ${estOuvert ? "rotate-180" : ""}`} aria-hidden />
                        <span className="sr-only">{t("Plus d'options de relance")}</span>
                      </Button>
                      {confirmation === p.id ? (
                        <span className="flex items-center gap-1.5 rounded-md border border-emerald-600/30 bg-emerald-50 px-2 py-1 text-xs dark:bg-emerald-500/10">
                          {t("Créer le contact ?")}
                          <Button size="xs" disabled={enCours} onClick={() => confirmerClient(p.id)}>
                            {enCours ? <Spinner /> : <CheckCircle2 data-icon="inline-start" aria-hidden />}
                            {t("Oui")}
                          </Button>
                          <Button size="xs" variant="ghost" disabled={enCours} onClick={() => setConfirmation(null)}>
                            {t("Non")}
                          </Button>
                        </span>
                      ) : (
                        <Button size="xs" variant="secondary" onClick={() => setConfirmation(p.id)}>
                          <UserCheck data-icon="inline-start" aria-hidden />
                          {t("Devenir client")}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>

                {estOuvert && peutModifier ? (
                  <PanneauRelance
                    key={`${p.id}-${ouvert.onglet}`}
                    prospect={{ id: p.id, nom: p.nom, telephone: p.telephone, email: p.email, rappelLe: p.rappelLe }}
                    nomEntreprise={nomEntreprise}
                    ongletInitial={ouvert.onglet}
                  />
                ) : null}
              </div>
            );
          })}
          {visibles.length === 0 ? (
            <EtatVide
              icone={terme || filtre !== "TOUS" ? SearchX : Inbox}
              titre={terme || filtre !== "TOUS" ? t("Aucun prospect ne correspond.") : t("Aucun prospect qualifié pour le moment.")}
              description={
                terme || filtre !== "TOUS"
                  ? t("Essayez un autre filtre, ou effacez la recherche.")
                  : t("Quand vous passez un lead au statut « Qualifié », il arrive ici pour être relancé jusqu'à ce qu'il devienne client.")
              }
            >
              {!terme && filtre === "TOUS" ? (
                <Button variant="outline" render={<Link href="/app/leads" />} nativeButton={false}>
                  {t("Voir les leads")}
                </Button>
              ) : null}
            </EtatVide>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
