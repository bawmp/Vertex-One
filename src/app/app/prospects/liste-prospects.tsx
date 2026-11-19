"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Phone, Mail, Building2, BellRing, MessageCircle, SearchX, UserCheck, Inbox, ChevronDown, CheckCircle2, Send, Paperclip, X, TriangleAlert } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { devenirClient, relancerProspectsParEmail } from "@/lib/actions/prospect";
import { ETAT_RELANCE, MODELES_RELANCE, NB_MAX_ENVOIS_GROUPES, estARelancer, type EtatRelanceProspect } from "@/lib/crm/prospects";
import type { InfoAuto } from "@/lib/crm/sequence-prospects";
import { elementsACompleter } from "@/lib/email/modeles";
import { useT } from "@/lib/i18n/contexte";
import { PanneauRelance } from "./panneau-relance";
import { ResumeAuto } from "./resume-auto";

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
  /** Où en est sa relance automatique (null si l'entreprise ne l'a pas activée). */
  auto: InfoAuto | null;
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
  const [selection, setSelection] = useState<string[]>([]);
  const [groupeOuvert, setGroupeOuvert] = useState(false);

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

  // Seuls les prospects avec une adresse e-mail peuvent être sélectionnés, 50 au plus par envoi.
  const selectionnables = visibles.filter((p) => p.email).slice(0, NB_MAX_ENVOIS_GROUPES);

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

      {peutModifier && visibles.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={selectionnables.length > 0 && selectionnables.every((p) => selection.includes(p.id))}
              onChange={(e) => setSelection(e.target.checked ? selectionnables.map((p) => p.id) : [])}
              disabled={selectionnables.length === 0}
            />
            {t("Tout sélectionner")}
          </label>
          {selection.length > 0 ? (
            <>
              <span className="text-muted-foreground">{selection.length > 1 ? t("{n} prospects sélectionnés", { n: selection.length }) : t("{n} prospect sélectionné", { n: selection.length })}</span>
              <Button size="sm" onClick={() => setGroupeOuvert(true)}>
                <Mail data-icon="inline-start" aria-hidden />
                {t("Écrire par e-mail à la sélection")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSelection([]); setGroupeOuvert(false); }}>
                {t("Effacer la sélection")}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {groupeOuvert && selection.length > 0 ? (
        <ComposeurGroupe
          ids={selection}
          noms={prospects.filter((p) => selection.includes(p.id)).map((p) => p.nom)}
          onFermer={() => setGroupeOuvert(false)}
          onTerminer={() => {
            setGroupeOuvert(false);
            setSelection([]);
          }}
        />
      ) : null}

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {visibles.map((p) => {
            const info = ETAT_RELANCE[p.etat];
            const estOuvert = ouvert?.id === p.id;
            return (
              <div key={p.id} className="flex flex-col gap-3 px-4 py-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {peutModifier ? (
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        aria-label={t("Sélectionner {nom}", { nom: p.nom })}
                        title={p.email ? undefined : t("Pas d'adresse e-mail : ce prospect ne peut pas recevoir d'e-mail.")}
                        disabled={!p.email}
                        checked={selection.includes(p.id)}
                        onChange={(e) => setSelection((avant) => (e.target.checked ? (avant.length >= NB_MAX_ENVOIS_GROUPES ? avant : [...avant, p.id]) : avant.filter((x) => x !== p.id)))}
                      />
                    ) : null}
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
                      <ResumeAuto auto={p.auto} />
                    </span>
                    </div>
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
                    prospect={{ id: p.id, nom: p.nom, telephone: p.telephone, email: p.email, rappelLe: p.rappelLe, auto: p.auto }}
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

/**
 * Écrire le MÊME message à plusieurs prospects : `{nom}` et `{entreprise}` sont remplacés pour CHACUN par le serveur, qui relit chaque prospect en base
 * (portée, adresse) et ignore, en le disant, ceux qui n'ont pas d'adresse ou qui ne sont plus des prospects. Les e-mails partent l'un après l'autre ;
 * le bilan dit combien sont partis et lesquels ne l'ont pas été. Une fois le bilan affiché, le formulaire est verrouillé (pas de double envoi) : « Terminer ».
 */
function ComposeurGroupe({ ids, noms, onFermer, onTerminer }: { ids: string[]; noms: string[]; onFermer: () => void; onTerminer: () => void }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(relancerProspectsParEmail, null);
  const [modele, setModele] = useState("");
  const [objet, setObjet] = useState("");
  const [message, setMessage] = useState("");
  const champFichiers = useRef<HTMLInputElement>(null);
  const aCompleter = elementsACompleter(`${objet}\n${message}`);
  const termine = Boolean(etat?.resultat);

  function choisir(cle: string) {
    setModele(cle);
    const mo = MODELES_RELANCE.find((x) => x.cle === cle);
    if (!mo) return;
    // Les repères restent écrits tels quels : le serveur les remplace pour chaque destinataire.
    const reperes = { nom: "{nom}", entreprise: "{entreprise}" };
    setObjet(t(mo.objet, reperes));
    setMessage(t(mo.message, reperes));
  }

  const apercuNoms = noms.slice(0, 4).join(", ") + (noms.length > 4 ? t(" et {n} autres", { n: noms.length - 4 }) : "");

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{ids.length > 1 ? t("Écrire à {n} prospects", { n: ids.length }) : t("Écrire à {n} prospect", { n: ids.length })}</h2>
          <p className="text-xs text-muted-foreground">{apercuNoms}</p>
        </div>
        <Button type="button" size="icon-sm" variant="ghost" onClick={onFermer} aria-label={t("Fermer")}>
          <X aria-hidden />
        </Button>
      </div>

      {termine && etat?.resultat ? (
        <div className="flex flex-col gap-2 text-sm">
          <p role="status" className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" aria-hidden />
            {etat.resultat.envoyes > 1 ? t("{n} e-mails envoyés.", { n: etat.resultat.envoyes }) : t("{n} e-mail envoyé.", { n: etat.resultat.envoyes })}
          </p>
          {[...etat.resultat.ignores, ...etat.resultat.echecs].length > 0 ? (
            <div role="alert" className="rounded-md border border-amber-600/30 bg-amber-50 p-3 dark:bg-amber-500/10">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-4" aria-hidden />
                {t("Non envoyés")}
              </p>
              <ul className="list-disc pl-5 text-xs">
                {etat.resultat.ignores.map((x, i) => (
                  <li key={`i${i}`}>{x.nom} — {x.raison}</li>
                ))}
                {etat.resultat.echecs.map((x, i) => (
                  <li key={`e${i}`}>{x.nom} — {x.raison}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <Button type="button" onClick={onTerminer}>{t("Terminer")}</Button>
          </div>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          {ids.map((id) => (
            <input key={id} type="hidden" name="leadIds" value={id} />
          ))}
          <div className="flex flex-col gap-1">
            <Label htmlFor="modele-groupe">{t("Modèle (facultatif)")}</Label>
            <Select id="modele-groupe" value={modele} onChange={(e) => choisir(e.target.value)}>
              <option value="">{t("Aucun modèle : je rédige moi-même")}</option>
              {MODELES_RELANCE.map((mo) => (
                <option key={mo.cle} value={mo.cle}>
                  {t(mo.libelle)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="objet-groupe">{t("Objet")}</Label>
            <Input id="objet-groupe" name="objet" value={objet} onChange={(e) => setObjet(e.target.value)} required maxLength={200} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="message-groupe">{t("Message")}</Label>
            <Textarea id="message-groupe" name="message" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} required />
            <span className="text-xs text-muted-foreground">{t("Écrivez {nom} pour insérer le nom de chaque prospect, et {entreprise} pour le nom de votre entreprise.")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fichiers-groupe" className="flex items-center gap-1.5">
              <Paperclip className="size-3.5" aria-hidden />
              {t("Pièces jointes (facultatif)")}
            </Label>
            <input ref={champFichiers} id="fichiers-groupe" name="fichiers" type="file" multiple className="text-xs file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1" />
            <span className="text-xs text-muted-foreground">{t("Cinq fichiers au plus, 4 Mo en tout (image, PDF, Word, Excel).")}</span>
          </div>
          {aCompleter.length > 0 ? (
            <p role="alert" className="text-sm text-destructive">{t("Complétez ou retirez : {elements}.", { elements: aCompleter.join(", ") })}</p>
          ) : null}
          {etat?.erreur ? (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {etat.erreur}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={enCours || aCompleter.length > 0}>
              {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
              {enCours ? t("Envoi en cours…") : ids.length > 1 ? t("Envoyer à {n} prospects", { n: ids.length }) : t("Envoyer à {n} prospect", { n: ids.length })}
            </Button>
            <Button type="button" variant="ghost" onClick={onFermer} disabled={enCours}>{t("Annuler")}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
