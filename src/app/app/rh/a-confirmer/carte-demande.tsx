"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { annulerDemandeAction, confirmerDemandeAction, refuserDemandeAction } from "@/lib/actions/demande-collaborateur";
import { CONTRATS_COLLABORATEUR, LIBELLE_CONTRAT } from "@/lib/rh/nouveau-collaborateur";
import { useT } from "@/lib/i18n/contexte";

export type DemandeAffichee = { id: string; nomDemandeur: string; email: string; poste: string; typeContrat: string; dateEmbauche: string; dateFin: string | null; dateNaissance: string | null; responsableId: string | null; creeLe: string };

/** Fiche demandée par un Manager : l'Administrateur corrige au besoin, puis confirme (l'invitation part) ou refuse. Aucun champ salaire. */
function CarteDemandeAdmin({ demande: d, responsables, onRetour }: { demande: DemandeAffichee; responsables: { id: string; nom: string }[]; onRetour: (message: string) => void }) {
  const t = useT();
  const [contrat, setContrat] = useState(d.typeContrat);
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  // Une fois traitée, la demande quitte la liste : le résultat est donc remonté au parent, qui reste affiché.
  const [etat, action, enConfirmation] = useActionState(async (precedent: Awaited<ReturnType<typeof confirmerDemandeAction>>, formData: FormData) => {
    const r = await confirmerDemandeAction(d.id, precedent, formData);
    if (r?.message) onRetour(r.message);
    return r;
  }, null);
  const avecFin = contrat !== "CDI";

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-marque-orange/40 bg-card p-4 shadow-xs">
      <div>
        <p className="font-medium">{d.email}</p>
        <p className="text-sm text-muted-foreground">{t("Demandée par {nom} le {date}", { nom: d.nomDemandeur, date: d.creeLe })}</p>
      </div>

      {refus ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`motif-${d.id}`}>{t("Motif du refus (optionnel)")}</Label>
          <Textarea id={`motif-${d.id}`} rows={2} maxLength={500} value={motif} onChange={(e) => setMotif(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={enCours}
              onClick={() => {
                setErreur(null);
                startTransition(async () => {
                  const r = await refuserDemandeAction(d.id, motif);
                  if (r?.erreur) setErreur(r.erreur);
                  else onRetour(t("Demande refusée : le Manager en est prévenu."));
                });
              }}
            >
              {enCours ? <Spinner /> : <X data-icon="inline-start" aria-hidden />}
              {t("Confirmer le refus")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={enCours} onClick={() => setRefus(false)}>
              {t("Retour")}
            </Button>
          </div>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`poste-${d.id}`}>{t("Poste")}</Label>
              <Input id={`poste-${d.id}`} name="poste" defaultValue={d.poste} required maxLength={120} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`contrat-${d.id}`}>{t("Type de collaborateur")}</Label>
              <Select id={`contrat-${d.id}`} name="typeContrat" value={contrat} onChange={(e) => setContrat(e.target.value)}>
                {CONTRATS_COLLABORATEUR.map((c) => (
                  <option key={c} value={c}>
                    {t(LIBELLE_CONTRAT[c])}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`arrivee-${d.id}`}>{t("Date d'arrivée")}</Label>
              <Input id={`arrivee-${d.id}`} name="dateEmbauche" type="date" defaultValue={d.dateEmbauche} required />
            </div>
            {avecFin ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`fin-${d.id}`}>{contrat === "STAGE" ? t("Fin du stage") : contrat === "CDD" ? t("Fin du CDD") : t("Fin de la mission")}</Label>
                <Input id={`fin-${d.id}`} name="dateFin" type="date" defaultValue={d.dateFin ?? ""} required />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor={`naissance-${d.id}`}>{t("Date de naissance (facultatif)")}</Label>
              <Input id={`naissance-${d.id}`} name="dateNaissance" type="date" defaultValue={d.dateNaissance ?? ""} />
            </div>
          </div>
          <div className="flex flex-col gap-1 sm:max-w-72">
            <Label htmlFor={`responsable-${d.id}`}>{t("Responsable")}</Label>
            <Select id={`responsable-${d.id}`} name="responsableId" defaultValue={d.responsableId ?? ""}>
              <option value="">{t("Aucun pour l'instant")}</option>
              {responsables.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nom}
                </option>
              ))}
            </Select>
          </div>
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{t("Rien n'est envoyé avant votre confirmation. Le salaire se renseigne ensuite sur la fiche, une fois le compte activé : il reste visible de vous et de la personne seulement.")}</p>
          {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
          {erreur ? <p role="alert" className="text-sm text-destructive">{erreur}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={enConfirmation}>
              {enConfirmation ? <Spinner /> : <Check data-icon="inline-start" aria-hidden />}
              {t("Confirmer et inviter")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setRefus(true)}>
              {t("Refuser")}
            </Button>
          </div>
        </form>
      )}
      {refus && erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </li>
  );
}

export function BoutonAnnulerDemande({ demandeId }: { demandeId: string }) {
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
            const r = await annulerDemandeAction(demandeId);
            if (r?.erreur) setErreur(r.erreur);
          });
        }}
      >
        {enCours ? <Spinner /> : null}
        {t("Retirer ma demande")}
      </Button>
      {erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}

/** Liste des demandes à confirmer : garde à l'écran le résultat de chaque réponse (confirmée, refusée, lien de secours) même quand la carte disparaît. */
export function ListeDemandesAdmin({ demandes, responsables }: { demandes: DemandeAffichee[]; responsables: { id: string; nom: string }[] }) {
  const [retours, setRetours] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-3">
      {retours.map((message, i) => (
        <p key={i} role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {message}
        </p>
      ))}
      <ul className="flex flex-col gap-3">
        {demandes.map((d) => (
          <CarteDemandeAdmin key={d.id} demande={d} responsables={responsables} onRetour={(message) => setRetours((p) => [...p, message])} />
        ))}
      </ul>
    </div>
  );
}
