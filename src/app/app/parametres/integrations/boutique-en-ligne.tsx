"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { AlertTriangle, Ban, Check, CheckCircle2, Code2, Copy, FileSpreadsheet, RefreshCw, Store, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { connecterBoutique, definirDepotConnexion } from "@/lib/actions/boutique-stock";
import { definirDepotBoutique, deconnecterBoutique, synchroniserMaintenant } from "@/lib/actions/boutique-connexion";
import { revoquerCleApi } from "@/lib/actions/cle-api";
import type { ResumeBoutique } from "@/lib/api-externe/stock-site";
import { useT } from "@/lib/i18n/contexte";
import { ConnexionWooCommerce } from "./connexion-woocommerce";
import { EchangeFichiers } from "./echange-fichiers";

/** Connexion par code (un développeur appelle Vertex One avec une clé d'API). */
export type ConnexionBoutique = { id: string; nom: string; prefixe: string; creeLe: string; dernierUsageLe: string | null; depotStockId: string | null; commandes30j: number; derniereCommandeLe: string | null };
/** Connexion automatique (Vertex One va chercher les commandes et envoie le stock) : WooCommerce. */
export type ConnexionAuto = { id: string; type: string; nom: string; statut: string; derniereErreur: string | null; dernierCycleLe: string | null; depotId: string | null; commandes30j: number };
export type DepotChoix = { id: string; nom: string; principal: boolean };

const CHAMP_SELECT = "h-10 rounded-lg border border-input bg-background px-3 text-sm";

function Etape({ numero, titre, children, fait }: { numero: number; titre: string; children: React.ReactNode; fait?: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className={`flex size-6 items-center justify-center rounded-full text-xs text-white ${fait ? "bg-emerald-600" : "bg-primary"}`} aria-hidden>
          {fait ? <Check className="size-3.5" /> : numero}
        </span>
        {titre}
      </h3>
      <div className="flex flex-col gap-3 pl-8">{children}</div>
    </section>
  );
}

type Choix = "woo" | "fichiers" | "dev";

function CarteChoix({ actif, onClick, icone, titre, detail, badge }: { actif: boolean; onClick: () => void; icone: React.ReactNode; titre: string; detail: string; badge: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left text-sm transition-colors hover:border-primary ${actif ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}
    >
      <Badge variant={actif ? "info" : "neutral"}>{badge}</Badge>
      <span className="flex items-center gap-2 font-medium">{icone}{titre}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}

export function BoutiqueEnLigne({ connexions, connexionsAuto, depots, resume, base }: { connexions: ConnexionBoutique[]; connexionsAuto: ConnexionAuto[]; depots: DepotChoix[]; resume: ResumeBoutique; base: string }) {
  const t = useT();
  const [choix, setChoix] = useState<Choix | null>(connexions.length + connexionsAuto.length === 0 ? "woo" : null);
  const [etat, action, enCours] = useActionState(connecterBoutique, null);
  const [copie, setCopie] = useState<string | null>(null);
  const [occupe, demarrer] = useTransition();
  const [message, setMessage] = useState<{ erreur?: string; info?: string } | null>(null);
  // Fuseau fixé (Douala) : le serveur et le navigateur affichent la même heure, sans décalage d'hydratation.
  const format = (iso: string) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Douala" }).format(new Date(iso));
  const plusieursDepots = depots.length > 1;
  const aDesConnexions = connexions.length + connexionsAuto.length > 0;

  async function copier(texte: string, quoi: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(quoi);
      setTimeout(() => setCopie(null), 2000);
    } catch {
      // Presse-papiers indisponible : le texte reste sélectionnable à l'écran.
    }
  }

  function deconnecterAuto(c: ConnexionAuto) {
    if (!window.confirm(t("Déconnecter « {nom} » ? Vertex One n'échangera plus rien avec ce site et ses clés seront effacées.", { nom: c.nom }))) return;
    demarrer(async () => {
      await deconnecterBoutique(c.id);
    });
  }

  function synchroniser(c: ConnexionAuto) {
    setMessage(null);
    demarrer(async () => {
      const r = await synchroniserMaintenant(c.id);
      if (r.erreur) setMessage({ erreur: r.erreur });
      else if (r.resultat) setMessage({ info: t("Synchronisé : {a} commande(s) reçue(s), {b} annulation(s), {c} stock(s) envoyé(s).", { a: r.resultat.enregistrees, b: r.resultat.annulees, c: r.resultat.stockEnvoye }) });
    });
  }

  function changerDepotAuto(c: ConnexionAuto, depotId: string) {
    setMessage(null);
    demarrer(async () => {
      const r = await definirDepotBoutique(c.id, depotId || null);
      if (r.erreur) setMessage({ erreur: r.erreur });
    });
  }

  function revoquer(c: ConnexionBoutique) {
    if (!window.confirm(t("Déconnecter « {nom} » ? Le site ne pourra plus lire le stock ni vous envoyer ses commandes.", { nom: c.nom }))) return;
    demarrer(async () => {
      await revoquerCleApi(c.id);
    });
  }

  function changerDepot(c: ConnexionBoutique, depotId: string) {
    setMessage(null);
    demarrer(async () => {
      const r = await definirDepotConnexion(c.id, depotId || null);
      if (r.erreur) setMessage({ erreur: r.erreur });
    });
  }

  const { produitsSuivis, produitsSuivisAvecCode } = resume;
  const sansCode = produitsSuivis - produitsSuivisAvecCode;
  const selectDepot = (valeur: string, surChangement: (v: string) => void, etiquette: string) => (
    <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {t("Le site voit et fait baisser le stock du dépôt :")}
      <select value={valeur} disabled={occupe} onChange={(e) => surChangement(e.target.value)} className={`${CHAMP_SELECT} h-8 text-xs`} aria-label={etiquette}>
        {depots.map((d) => (
          <option key={d.id} value={d.principal ? "" : d.id}>
            {d.nom}
            {d.principal ? ` (${t("principal")})` : ""}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Card className="flex flex-col gap-6 p-5">
      <div className="flex items-start gap-3">
        <Store className="mt-0.5 size-5 text-primary" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold">{t("Boutique en ligne : un seul stock")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Votre site vend, Vertex One garde le stock : chaque commande du site le fait baisser ici, et le site lit ce qui reste pour afficher « en stock » ou « rupture ». Vous ne saisissez plus le stock à deux endroits.")}
          </p>
        </div>
      </div>

      {aDesConnexions ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("Vos sites connectés")}</h3>
          <div className="flex flex-col divide-y divide-border rounded-lg border">
            {connexionsAuto.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {c.nom}
                    <Badge variant="info">WooCommerce</Badge>
                    {c.statut === "ERREUR" ? <Badge variant="warning">{t("À corriger")}</Badge> : <Badge variant="success">{t("Connecté")}</Badge>}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={occupe} onClick={() => synchroniser(c)}>
                      {occupe ? <Spinner /> : <RefreshCw data-icon="inline-start" aria-hidden />}
                      {t("Synchroniser maintenant")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={occupe} onClick={() => deconnecterAuto(c)} className="text-destructive hover:text-destructive">
                      <Ban data-icon="inline-start" aria-hidden />
                      {t("Déconnecter")}
                    </Button>
                  </div>
                </div>
                {c.derniereErreur ? (
                  <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{t(c.derniereErreur)} {t("Si le problème persiste, déconnectez puis reconnectez votre boutique.")}</span>
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {c.dernierCycleLe ? t("dernier échange : {date}", { date: format(c.dernierCycleLe) }) : t("aucun échange pour l'instant : le site n'est pas encore branché")} · {t("{n} commande(s) reçue(s) en 30 jours", { n: c.commandes30j })} · {t("échange automatique toutes les 5 minutes")}
                </p>
                {plusieursDepots ? selectDepot(c.depotId ?? "", (v) => changerDepotAuto(c, v), t("Dépôt de la boutique")) : null}
              </div>
            ))}
            {connexions.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {c.nom}
                    <Badge variant="neutral">{t("Par code (développeur)")}</Badge>
                    <Badge variant="success">{t("Connecté")}</Badge>
                  </p>
                  <Button type="button" size="sm" variant="outline" disabled={occupe} onClick={() => revoquer(c)} className="text-destructive hover:text-destructive">
                    <Ban data-icon="inline-start" aria-hidden />
                    {t("Déconnecter")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{c.prefixe}…</span> ·{" "}
                  {c.dernierUsageLe ? t("dernier échange : {date}", { date: format(c.dernierUsageLe) }) : t("aucun échange pour l'instant : le site n'est pas encore branché")} ·{" "}
                  {t("{n} commande(s) reçue(s) en 30 jours", { n: c.commandes30j })}
                </p>
                {plusieursDepots ? selectDepot(c.depotStockId ?? "", (v) => changerDepot(c, v), t("Dépôt de la boutique")) : null}
              </div>
            ))}
          </div>
          {message?.erreur ? <p role="alert" className="text-sm text-destructive">{message.erreur}</p> : null}
          {message?.info ? <p role="status" className="text-sm text-emerald-700">{message.info}</p> : null}
        </section>
      ) : null}

      <Etape numero={1} titre={aDesConnexions ? t("Connecter un autre site") : t("Connectez votre site")} fait={aDesConnexions && choix === null}>
        <p className="text-sm text-muted-foreground">{t("Comment est fait votre site ? Choisissez, nous vous guidons pas à pas.")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <CarteChoix actif={choix === "woo"} onClick={() => setChoix(choix === "woo" ? null : "woo")} icone={<Zap className="size-4 text-primary" aria-hidden />} titre="WooCommerce" badge={t("Automatique")} detail={t("Votre site est sous WordPress avec WooCommerce. Vous copiez 2 clés, le reste se fait tout seul.")} />
          <CarteChoix actif={choix === "fichiers"} onClick={() => setChoix(choix === "fichiers" ? null : "fichiers")} icone={<FileSpreadsheet className="size-4 text-primary" aria-hidden />} titre={t("Autre site ou tableur")} badge={t("Par fichiers")} detail={t("Shopify, Wix, PrestaShop, un site sur mesure ou Excel : vous échangez deux fichiers, sans rien installer.")} />
          <CarteChoix actif={choix === "dev"} onClick={() => setChoix(choix === "dev" ? null : "dev")} icone={<Code2 className="size-4 text-primary" aria-hidden />} titre={t("Mon développeur s'en occupe")} badge={t("Par code")} detail={t("Vous donnez une clé à la personne qui a fait votre site : elle branche tout.")} />
        </div>

        {choix === "woo" ? <ConnexionWooCommerce depots={depots} /> : null}
        {choix === "fichiers" ? <EchangeFichiers /> : null}
        {choix === "dev" ? (
          <div className="flex flex-col gap-3">
            <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
              <p className="text-sm font-medium">{t("Donnez un nom à votre site, c'est tout.")}</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-52 flex-1 flex-col gap-1">
                  <Label htmlFor="nom-boutique">{t("Nom du site")}</Label>
                  <Input id="nom-boutique" name="nom" required minLength={2} maxLength={80} placeholder={t("Ex. : Ma boutique en ligne")} />
                </div>
                {plusieursDepots ? (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="depot-boutique">{t("Dépôt de la boutique")}</Label>
                    <select id="depot-boutique" name="depot" defaultValue="" className={CHAMP_SELECT}>
                      {depots.map((d) => (
                        <option key={d.id} value={d.principal ? "" : d.id}>
                          {d.nom}
                          {d.principal ? ` (${t("principal")})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <Button type="submit" size="sm" disabled={enCours}>
                  {enCours ? <Spinner /> : <Store data-icon="inline-start" aria-hidden />}
                  {t("Connecter")}
                </Button>
              </div>
              {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
            </form>

            {etat?.cleCree ? (
              <Card className="flex flex-col gap-3 border-amber-300 p-4">
                <p className="text-sm font-medium">{t("« {nom} » est connecté. Copiez cette clé maintenant : elle ne sera plus jamais affichée.", { nom: etat.nomConnexion ?? "" })}</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 select-all break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">{etat.cleCree}</code>
                  <Button type="button" size="sm" variant="outline" onClick={() => copier(etat.cleCree!, "cle")}>
                    {copie === "cle" ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
                    {copie === "cle" ? t("Copiée") : t("Copier")}
                  </Button>
                </div>
                <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
                  <p className="text-xs font-medium">{t("À transmettre au développeur de votre site :")}</p>
                  <pre className="overflow-x-auto font-mono text-xs leading-relaxed">{`${t("Adresse")} : ${base}/api/externe/stock\n${t("Clé")} : ${etat.cleCree}`}</pre>
                  <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => copier(`${t("Adresse")} : ${base}/api/externe/stock\n${t("Clé")} : ${etat.cleCree}`, "pack")}>
                    {copie === "pack" ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
                    {copie === "pack" ? t("Copié") : t("Copier le tout")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("Gardez cette clé secrète, comme un mot de passe : qui la possède peut faire baisser votre stock.")}</p>
              </Card>
            ) : null}

            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">{t("Pour le développeur du site")}</summary>
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">{t("Trois appels, toujours depuis le serveur de votre site (jamais depuis le navigateur du visiteur : la clé y serait visible).")}</p>
                <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed">{`# 1. Lire le stock disponible (ajoutez ?codes=ENF-0001,ELE-0002 pour quelques produits)
GET ${base}/api/externe/stock
Authorization: Bearer vo_votre_cle
→ { "depot": "Dépôt principal", "produits": [ { "code": "ENF-0001", "nom": "Jouet", "disponible": 7 } ], "tronque": false }

# 2. Déclarer une commande : le stock sort, la réponse donne ce qu'il reste
POST ${base}/api/externe/stock/commandes
Authorization: Bearer vo_votre_cle
Content-Type: application/json

{ "reference": "commande-1042", "lignes": [ { "code": "ENF-0001", "quantite": 3 } ] }
→ { "statut": "ENREGISTREE", "doublon": false, "lignes": [ { "code": "ENF-0001", "quantite": 3, "statut": "ok", "disponible": 4 } ] }

# 3. Annuler une commande : le stock revient
POST ${base}/api/externe/stock/commandes/annulation
{ "reference": "commande-1042" }`}</pre>
                <p className="text-xs text-muted-foreground">
                  {t("« reference » est obligatoire : renvoyer la même référence ne fait jamais sortir le stock deux fois. « code » est le code-barres du produit dans Vertex One. Une commande n'est jamais refusée pour cause de stock ou de code inconnu : les lignes à vérifier (« inconnu », « non_suivi ») sont signalées dans la réponse (« aVerifier »). « disponible » ne descend jamais sous 0. Réponses : 201 enregistrée, 200 déjà reçue, 400 données invalides, 401 clé invalide, 402 abonnement suspendu, 403 clé non autorisée au stock, 404 référence inconnue (annulation), 429 trop de requêtes.")}
                </p>
              </div>
            </details>
          </div>
        ) : null}
      </Etape>

      <Etape numero={2} titre={t("Reliez vos produits")} fait={produitsSuivis > 0 && sansCode === 0}>
        <p className="text-sm text-muted-foreground">
          {t("Chaque produit de Vertex One doit porter le MÊME code que sur votre site, dans le champ « Code-barres » de sa fiche. C'est ce code qui permet de savoir de quel article parle une commande.")}
        </p>
        {produitsSuivis === 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {t("Aucun produit n'a encore son stock suivi. Activez le suivi dans la fiche de chaque produit, ou importez vos produits avec leur stock et leur code.")}{" "}
              <Link href="/app/parametres/import" className="underline">{t("Importer mes produits")}</Link>
            </span>
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{t("{avec} produit(s) sur {total} ont un code et seront reconnus par votre site.", { avec: produitsSuivisAvecCode, total: produitsSuivis })}</span>
              {sansCode > 0 ? (
                <Link href="/app/produits" className="text-primary underline">{t("Compléter les {n} produit(s) sans code", { n: sansCode })}</Link>
              ) : (
                <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" aria-hidden />{t("Tous vos produits sont reliés")}</span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={produitsSuivis} aria-valuenow={produitsSuivisAvecCode} aria-label={t("Produits reliés à votre site")}>
              <div className="h-full bg-primary" style={{ width: `${Math.round((produitsSuivisAvecCode / produitsSuivis) * 100)}%` }} />
            </div>
          </div>
        )}

        {resume.codesInconnus.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-300 p-3">
            <p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="size-4 text-amber-600" aria-hidden />{t("Votre site a vendu des articles que Vertex One ne reconnaît pas")}</p>
            <p className="text-xs text-muted-foreground">{t("Les commandes ont bien été enregistrées, mais leur stock n'a pas baissé. Ouvrez le produit correspondant et saisissez ce code dans son champ « Code-barres » : les prochaines commandes seront reconnues.")}</p>
            <ul className="flex flex-col divide-y divide-border text-sm">
              {resume.codesInconnus.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{c.code}</code>
                  <span className="text-xs text-muted-foreground">{t("{n} fois", { n: c.fois })} · {c.source} · {format(c.derniereLe)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {resume.codesNonSuivis.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{t("Produits vendus par le site dont le stock n'est pas suivi")}</p>
            <p className="text-xs text-muted-foreground">{t("Activez le suivi du stock dans leur fiche pour que les commandes du site les fassent baisser.")}</p>
            <ul className="flex flex-col divide-y divide-border text-sm">
              {resume.codesNonSuivis.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>{c.nom} <code className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{c.code}</code></span>
                  <span className="text-xs text-muted-foreground">{t("{n} fois", { n: c.fois })}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Etape>

      <Etape numero={3} titre={t("Suivez ce que reçoit Vertex One")}>
        {resume.dernieresCommandes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Aucune commande reçue de votre site pour l'instant. Elles apparaîtront ici dès que votre développeur aura branché le site.")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border text-sm">
            {resume.dernieresCommandes.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{c.reference} <span className="text-xs font-normal text-muted-foreground">· {c.source}</span></p>
                  <p className="text-xs text-muted-foreground">{format(c.creeLe)} · {t("{n} article(s)", { n: c.nbLignes })}</p>
                </div>
                <div className="flex items-center gap-2">
                  {c.statut === "ANNULEE" ? <Badge variant="neutral">{t("Annulée")}</Badge> : <Badge variant="success">{t("Stock mis à jour")}</Badge>}
                  {c.statut !== "ANNULEE" && c.nbProblemes > 0 ? <Badge variant="warning">{t("{n} à vérifier", { n: c.nbProblemes })}</Badge> : null}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("Chaque commande laisse une ligne « Vente » dans l'historique du stock du produit, et les alertes de stock bas fonctionnent comme d'habitude.")}</p>
      </Etape>
    </Card>
  );
}
