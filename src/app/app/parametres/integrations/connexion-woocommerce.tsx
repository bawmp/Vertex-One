"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { connecterWooCommerce, verifierWooCommerce } from "@/lib/actions/boutique-connexion";
import { useT } from "@/lib/i18n/contexte";
import type { DepotChoix } from "./boutique-en-ligne";

const CHAMP_SELECT = "h-10 rounded-lg border border-input bg-background px-3 text-sm";

/**
 * Connexion automatique d'une boutique WooCommerce : l'utilisateur copie deux clés depuis son site, Vertex One vérifie, montre ce qui va se
 * passer en chiffres, puis connecte. Aucune compétence technique : chaque étape dit où cliquer.
 */
export function ConnexionWooCommerce({ depots }: { depots: DepotChoix[] }) {
  const t = useT();
  const [adresse, setAdresse] = useState("");
  const [cle, setCle] = useState("");
  const [secret, setSecret] = useState("");
  const [depot, setDepot] = useState("");
  const [accepte, setAccepte] = useState(false);
  const [etatV, verifier, enCoursV] = useActionState(verifierWooCommerce, null);
  const [etatC, connecter, enCoursC] = useActionState(connecterWooCommerce, null);
  const apercu = etatV?.apercu;

  if (etatC?.connecte) {
    const { nom, resultat } = etatC.connecte;
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4" aria-hidden />{t("« {nom} » est connecté.", { nom })}</p>
        {resultat.erreur ? (
          <p role="alert" className="text-destructive">{t(resultat.erreur)}</p>
        ) : (
          <p>{t("Premier échange terminé : {n} produit(s) mis à jour sur votre site. Ensuite, tout se fait tout seul toutes les 5 minutes.", { n: resultat.stockEnvoye })}</p>
        )}
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1.5 rounded-lg bg-muted/60 p-4 pl-8 text-sm">
        <li>{t("Connectez-vous à l'administration de votre site (WordPress).")}</li>
        <li>{t("Ouvrez WooCommerce → Réglages → Avancé → API REST, puis cliquez « Ajouter une clé ».")}</li>
        <li>{t("Description : « Vertex One ». Autorisations : « Lecture/Écriture ». Cliquez « Générer la clé API ».")}</li>
        <li>{t("Copiez la « Clé client » et le « Secret client » dans les cases ci-dessous (le secret ne s'affiche qu'une fois).")}</li>
      </ol>
      <p className="text-xs text-muted-foreground">{t("Si « API REST » n'apparaît pas, vérifiez dans Réglages → Permaliens que le réglage n'est pas « Simple ».")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="woo-adresse">{t("Adresse de votre site")}</Label>
          <Input id="woo-adresse" name="adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="https://maboutique.com" autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="woo-cle">{t("Clé client")}</Label>
          <Input id="woo-cle" name="cle" value={cle} onChange={(e) => setCle(e.target.value)} placeholder="ck_…" autoComplete="off" spellCheck={false} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="woo-secret">{t("Secret client")}</Label>
          <Input id="woo-secret" name="secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="cs_…" autoComplete="off" spellCheck={false} required />
        </div>
        {depots.length > 1 ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="woo-depot">{t("Dépôt de la boutique")}</Label>
            <select id="woo-depot" name="depot" value={depot} onChange={(e) => setDepot(e.target.value)} className={CHAMP_SELECT}>
              {depots.map((d) => (
                <option key={d.id} value={d.principal ? "" : d.id}>
                  {d.nom}
                  {d.principal ? ` (${t("principal")})` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={apercu ? "outline" : "default"} formAction={verifier} disabled={enCoursV || enCoursC}>
          {enCoursV ? <Spinner /> : <ShieldCheck data-icon="inline-start" aria-hidden />}
          {apercu ? t("Vérifier à nouveau") : t("Vérifier ma boutique")}
        </Button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden />{t("Vos clés sont chiffrées et ne sont jamais affichées.")}</span>
      </div>
      {etatV?.erreur ? <p role="alert" className="text-sm text-destructive">{etatV.erreur}</p> : null}

      {apercu ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 className="size-4" aria-hidden />{t("Votre site répond et vos clés sont acceptées.")}</p>
          <ul className="flex flex-col gap-1">
            <li>{t("{n} produit(s) sont reconnus des deux côtés (même code) : leur stock sera aligné sur Vertex One.", { n: apercu.reconnus })}</li>
            {apercu.sansEquivalentSite > 0 ? (
              <li className="text-amber-800">{t("{n} produit(s) de Vertex One n'existent pas sur votre site (même code introuvable) : {exemples}…", { n: apercu.sansEquivalentSite, exemples: apercu.exemplesSansEquivalent.join(", ") })}</li>
            ) : null}
            {apercu.sansCodeChezVertexOne > 0 ? <li className="text-muted-foreground">{t("{n} produit(s) de votre site ne sont pas reliés à Vertex One : ils gardent leur stock actuel, sans changement.", { n: apercu.sansCodeChezVertexOne })}</li> : null}
          </ul>
          {apercu.reconnus === 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{t("Aucun produit n'est relié pour l'instant. Dans Vertex One, saisissez dans le champ « Code-barres » de chaque produit le même code (SKU) que sur votre site, ou importez vos produits avec leur code, puis revenez ici.")}</span>
            </p>
          ) : null}
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" name="accepte" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
            <span>{t("Je comprends que, pour les produits reconnus, le stock de mon site sera remplacé par celui de Vertex One, qui devient la référence.")}</span>
          </label>
          <Button type="submit" size="sm" formAction={connecter} disabled={!accepte || enCoursC || enCoursV} className="w-fit">
            {enCoursC ? <Spinner /> : null}
            {t("Connecter ma boutique")}
          </Button>
          {etatC?.erreur ? <p role="alert" className="text-sm text-destructive">{etatC.erreur}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
