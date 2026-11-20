"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CheckCircle2, TriangleAlert, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { connecterCompteElyonpay, deconnecterCompteElyonpay } from "@/lib/actions/compte-elyonpay";
import { useT } from "@/lib/i18n/contexte";

/**
 * Brancher le compte ElyonPay de l'entreprise : identifiant marchand, nom affiché au payeur, clé d'API. La clé est testée auprès d'ElyonPay avant d'être gardée ; elle est
 * chiffrée côté serveur et n'est JAMAIS renvoyée à cet écran : après l'enregistrement le champ est vidé, et on ne revoit que ses 4 derniers caractères.
 */
export function FormulaireCompte({ nomParDefaut, marchandInitial, dejaBranche }: { nomParDefaut: string; marchandInitial: number | null; dejaBranche: boolean }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(connecterCompteElyonpay, null);
  const [cle, setCle] = useState("");

  useEffect(() => {
    // La clé saisie ne reste jamais affichée une fois enregistrée.
    /* eslint-disable react-hooks/set-state-in-effect -- réaction à la réponse du serveur */
    if (etat?.ok) setCle("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [etat]);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4" autoComplete="off">
      <div className="flex flex-col gap-1">
        <Label htmlFor="marchandId">{t("Identifiant marchand ElyonPay")}</Label>
        <Input id="marchandId" name="marchandId" inputMode="numeric" defaultValue={marchandInitial ?? ""} required className="max-w-48" placeholder="595" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="nomMarchand">{t("Nom affiché à vos clients au moment de payer")}</Label>
        <Input id="nomMarchand" name="nomMarchand" defaultValue={nomParDefaut} required maxLength={60} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="cle">{dejaBranche ? t("Nouvelle clé d'API (pour remplacer la clé actuelle)") : t("Clé d'API ElyonPay")}</Label>
        <Input id="cle" name="cle" type="password" value={cle} onChange={(e) => setCle(e.target.value)} required autoComplete="new-password" spellCheck={false} />
        <span className="text-xs text-muted-foreground">{t("La clé est testée auprès d'ElyonPay avant d'être enregistrée, puis chiffrée. Elle ne sera plus jamais affichée.")}</span>
      </div>

      {etat?.erreur ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {etat.erreur}
        </p>
      ) : null}
      {etat?.ok ? (
        <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden />
          {t("Compte ElyonPay branché : vos clients peuvent maintenant payer leurs factures en ligne.")}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? t("Vérification auprès d'ElyonPay…") : dejaBranche ? t("Vérifier et remplacer") : t("Vérifier et brancher")}
        </Button>
      </div>
    </form>
  );
}

/** Retirer le compte : deux temps pour qu'un clic distrait ne coupe pas le paiement en ligne de vos clients. */
export function BoutonDeconnecter() {
  const t = useT();
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function retirer() {
    setErreur(null);
    demarrer(async () => {
      const r = await deconnecterCompteElyonpay();
      if (r?.erreur) {
        setErreur(r.erreur);
        setConfirmer(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {confirmer ? (
        <span className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          {t("Vos clients ne pourront plus payer en ligne. Retirer le compte ?")}
          <Button size="sm" variant="destructive" onClick={retirer} disabled={enCours}>
            {enCours ? <Spinner /> : <Unplug data-icon="inline-start" aria-hidden />}
            {t("Oui, retirer")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmer(false)} disabled={enCours}>
            {t("Annuler")}
          </Button>
        </span>
      ) : (
        <div>
          <Button size="sm" variant="outline" onClick={() => setConfirmer(true)}>
            <Unplug data-icon="inline-start" aria-hidden />
            {t("Retirer ce compte")}
          </Button>
        </div>
      )}
      {erreur ? (
        <p role="alert" className="text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
