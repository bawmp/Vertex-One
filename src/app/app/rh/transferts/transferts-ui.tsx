"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ArrowRightLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { accepterTransfertAction, annulerTransfertAction, proposerTransfertAction, refuserTransfertAction } from "@/lib/actions/transferts";
import { useT } from "@/lib/i18n/contexte";

const SELECT = "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Formulaire de l'Administrateur d'origine : qui, vers quelle entreprise du groupe, avec un mot facultatif. Tout est revérifié côté serveur. */
export function FormulaireTransfert({ personnes, entreprises, personneInitiale }: { personnes: { id: string; nom: string; poste: string }[]; entreprises: { id: string; nom: string }[]; personneInitiale?: string }) {
  const t = useT();
  const formulaire = useRef<HTMLFormElement>(null);
  const [etat, action, enCours] = useActionState(async (precedent: Awaited<ReturnType<typeof proposerTransfertAction>>, formData: FormData) => {
    const r = await proposerTransfertAction(precedent, formData);
    if (r?.message) formulaire.current?.reset();
    return r;
  }, null);

  if (personnes.length === 0) return <p className="text-sm text-muted-foreground">{t("Aucun collaborateur ne peut être transféré pour l'instant (il faut un Employé ou un Manager actif avec une fiche RH).")}</p>;

  return (
    <form ref={formulaire} action={action} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="transfert-personne">{t("Collaborateur à transférer")}</Label>
          <select id="transfert-personne" name="personneId" required defaultValue={personnes.some((p) => p.id === personneInitiale) ? personneInitiale : ""} className={SELECT}>
            <option value="" disabled>
              {t("Choisir une personne")}
            </option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom} — {p.poste}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="transfert-entreprise">{t("Vers l'entreprise")}</Label>
          <select id="transfert-entreprise" name="entrepriseId" required defaultValue={entreprises.length === 1 ? entreprises[0].id : ""} className={SELECT}>
            <option value="" disabled>
              {t("Choisir une entreprise du groupe")}
            </option>
            {entreprises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="transfert-message">{t("Message pour l'Administrateur d'accueil (optionnel)")}</Label>
        <Textarea id="transfert-message" name="message" rows={2} maxLength={500} />
      </div>
      <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        {t("Rien ne change tant que l'autre Administrateur n'a pas accepté. À l'acceptation, la personne se connecte avec la même adresse et le même mot de passe ; sa fiche (poste, contrat, coordonnées, date d'arrivée) la suit. Son salaire, ses congés, ses évaluations et ses fichiers restent chez vous, archivés.")}
      </p>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{etat.message}</p> : null}
      <Button type="submit" className="self-start" disabled={enCours}>
        {enCours ? <Spinner /> : <ArrowRightLeft data-icon="inline-start" aria-hidden />}
        {t("Proposer le transfert")}
      </Button>
    </form>
  );
}

/** Demande reçue : l'Administrateur d'accueil choisit (facultatif) le responsable de la personne, puis accepte, ou refuse avec un motif. */
export function ReponseTransfert({ ligneId, responsables }: { ligneId: string; responsables: { id: string; nom: string }[] }) {
  const t = useT();
  const [responsable, setResponsable] = useState("");
  const [motif, setMotif] = useState("");
  const [refus, setRefus] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  function envoyer(accepter: boolean) {
    setErreur(null);
    startTransition(async () => {
      const r = accepter ? await accepterTransfertAction(ligneId, responsable) : await refuserTransfertAction(ligneId, motif);
      if (r?.erreur) setErreur(r.erreur);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {refus ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`motif-${ligneId}`}>{t("Motif du refus (optionnel)")}</Label>
          <Textarea id={`motif-${ligneId}`} rows={2} maxLength={500} value={motif} onChange={(e) => setMotif(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={enCours} onClick={() => envoyer(false)}>
              {enCours ? <Spinner /> : <X data-icon="inline-start" aria-hidden />}
              {t("Confirmer le refus")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={enCours} onClick={() => setRefus(false)}>
              {t("Retour")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1 sm:max-w-72">
            <Label htmlFor={`responsable-${ligneId}`}>{t("Responsable dans votre entreprise (optionnel)")}</Label>
            <select id={`responsable-${ligneId}`} value={responsable} onChange={(e) => setResponsable(e.target.value)} className={SELECT}>
              <option value="">{t("Aucun pour l'instant")}</option>
              {responsables.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={enCours}
              onClick={() => {
                if (window.confirm(t("Accepter ce transfert ? La personne rejoindra votre entreprise et se reconnectera avec la même adresse et le même mot de passe."))) envoyer(true);
              }}
            >
              {enCours ? <Spinner /> : <Check data-icon="inline-start" aria-hidden />}
              {t("Accepter le transfert")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => setRefus(true)}>
              {t("Refuser")}
            </Button>
          </div>
        </>
      )}
      {erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}

export function BoutonAnnulerTransfert({ ligneId }: { ligneId: string }) {
  const t = useT();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={enCours}
        onClick={() => {
          setErreur(null);
          startTransition(async () => {
            const r = await annulerTransfertAction(ligneId);
            if (r?.erreur) setErreur(r.erreur);
          });
        }}
      >
        {enCours ? <Spinner /> : null}
        {t("Annuler la demande")}
      </Button>
      {erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
