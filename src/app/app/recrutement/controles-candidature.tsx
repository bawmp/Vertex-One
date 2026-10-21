"use client";

import { useActionState, useState, useTransition } from "react";
import { Ban, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SelecteurPersonne } from "@/components/selecteur-personne";
import { apercuEmailStatutCandidature, changerStatutCandidature, assignerCandidature, modifierCandidature, supprimerCandidature } from "@/lib/actions/recrutement";

const STATUTS = [
  { valeur: "RECUE", libelle: "Reçue" },
  { valeur: "EN_EXAMEN", libelle: "En examen" },
  { valeur: "ENTRETIEN", libelle: "Entretien" },
  { valeur: "OFFRE", libelle: "Offre" },
  { valeur: "EMBAUCHE", libelle: "Embauché(e)" },
  { valeur: "REJETEE", libelle: "Rejetée" },
] as const;

type Coordonnees = { nom: string; telephone: string; email: string | null; message: string | null };
type StatutValeur = (typeof STATUTS)[number]["valeur"];
type MessagePrevu = { statut: StatutValeur; destinataire: string; objet: string; corps: string };

/**
 * Message au candidat relu avant l'envoi : l'utilisateur le modifie (objet et texte), puis envoie en changeant le statut,
 * change le statut sans prévenir, ou annule (le statut reste inchangé). Les modèles par défaut se règlent dans les paramètres.
 */
function FenetreMessageCandidat({
  message,
  enCours,
  onEnvoyer,
  onSansPrevenir,
  onAnnuler,
}: {
  message: MessagePrevu;
  enCours: boolean;
  onEnvoyer: (objet: string, corps: string) => void;
  onSansPrevenir: () => void;
  onAnnuler: () => void;
}) {
  const [objet, setObjet] = useState(message.objet);
  const [corps, setCorps] = useState(message.corps);
  const libelle = STATUTS.find((x) => x.valeur === message.statut)?.libelle ?? message.statut;
  const invalide = objet.trim().length === 0 || corps.trim().length === 0 || objet.length > 200 || corps.length > 5000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="titre-message-candidat">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-xl bg-background p-5 shadow-xl">
        <h2 id="titre-message-candidat" className="text-base font-semibold">
          Message au candidat — statut « {libelle} »
        </h2>
        <p className="text-sm text-muted-foreground">
          Ce message sera envoyé à <strong>{message.destinataire}</strong>. Relisez-le et modifiez-le si besoin avant de valider le changement de statut.
        </p>
        <div className="flex flex-col gap-1">
          <Label htmlFor="objet-message-candidat">Objet</Label>
          <Input id="objet-message-candidat" value={objet} maxLength={200} onChange={(e) => setObjet(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="corps-message-candidat">Message</Label>
          <Textarea id="corps-message-candidat" rows={10} value={corps} maxLength={5000} onChange={(e) => setCorps(e.target.value)} />
          <p className="text-xs text-muted-foreground">{corps.length} / 5000 caractères</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={enCours} onClick={onAnnuler}>
            Annuler
          </Button>
          <Button type="button" variant="outline" disabled={enCours} onClick={onSansPrevenir}>
            Changer sans prévenir
          </Button>
          <Button type="button" disabled={enCours || invalide} onClick={() => onEnvoyer(objet, corps)}>
            {enCours ? <Spinner /> : null}
            Envoyer et changer le statut
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ControlesCandidature({
  candidatureId,
  statut,
  peutReassigner,
  agents,
  agentActuelId,
  peutModifier,
  peutSupprimer,
  coordonnees,
}: {
  candidatureId: string;
  statut: string;
  peutReassigner: boolean;
  agents: { id: string; nomComplet: string }[];
  agentActuelId: string | null;
  peutModifier: boolean;
  peutSupprimer: boolean;
  coordonnees: Coordonnees;
}) {
  const [edition, setEdition] = useState(false);
  const [enCours, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [messagePrevu, setMessagePrevu] = useState<MessagePrevu | null>(null);
  const [cleSelect, setCleSelect] = useState(0); // remonte le sélecteur de statut quand le changement est annulé
  const [etat, action, enregistrement] = useActionState(async (precedent: { erreur?: string } | null, formData: FormData) => {
    const resultat = await modifierCandidature(precedent, formData);
    if (!resultat) setEdition(false);
    return resultat;
  }, null);

  return (
    <div className="flex flex-col gap-3">
      {messagePrevu ? (
        <FenetreMessageCandidat
          message={messagePrevu}
          enCours={enCours}
          onEnvoyer={(objet, corps) =>
            startTransition(async () => {
              await changerStatutCandidature(candidatureId, messagePrevu.statut, { objet, corps });
              setMessagePrevu(null);
            })
          }
          onSansPrevenir={() =>
            startTransition(async () => {
              await changerStatutCandidature(candidatureId, messagePrevu.statut, { prevenir: false });
              setMessagePrevu(null);
            })
          }
          onAnnuler={() => {
            setMessagePrevu(null);
            setCleSelect((c) => c + 1);
          }}
        />
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`statut-${candidatureId}`}>Statut</Label>
          {/* key : le statut affiché suit la base après une annulation ou un rétablissement. */}
          <Select
            key={`${statut}-${cleSelect}`}
            id={`statut-${candidatureId}`}
            defaultValue={statut}
            className="w-36"
            disabled={!peutModifier}
            onChange={(e) => {
              const nouveau = e.target.value as StatutValeur;
              // Un message part au candidat : on le montre d'abord, modifiable. Sinon (pas d'email, « Reçue », notifications coupées), changement direct.
              startTransition(async () => {
                const apercu = coordonnees.email ? await apercuEmailStatutCandidature(candidatureId, nouveau) : null;
                if (apercu) setMessagePrevu({ statut: nouveau, destinataire: apercu.destinataire, objet: apercu.objet, corps: apercu.corps });
                else await changerStatutCandidature(candidatureId, nouveau);
              });
            }}
          >
            {STATUTS.map((s) => (
              <option key={s.valeur} value={s.valeur}>
                {s.libelle}
              </option>
            ))}
          </Select>
          <p className="max-w-52 text-xs text-muted-foreground">{coordonnees.email ? "Le candidat est prévenu par email à chaque changement." : "Pas d'adresse email : le candidat ne sera pas prévenu."}</p>
        </div>
        {peutReassigner ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`agent-${candidatureId}`}>Recruteur</Label>
            <SelecteurPersonne
              id={`agent-${candidatureId}`}
              personnes={agents}
              defaultValue={agentActuelId}
              className="w-44"
              onValueChange={(id) => assignerCandidature(candidatureId, id)}
            />
          </div>
        ) : null}
      </div>

      {peutModifier || peutSupprimer ? (
        <div className="flex flex-wrap items-center gap-1">
          {enCours ? <Spinner className="size-3.5" /> : null}
          {peutModifier ? (
            <Button type="button" variant="ghost" size="xs" disabled={enCours} onClick={() => setEdition((v) => !v)}>
              <Pencil data-icon="inline-start" aria-hidden />
              Modifier
            </Button>
          ) : null}
          {peutModifier && statut !== "REJETEE" && statut !== "EMBAUCHE" ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={enCours}
              className="text-muted-foreground"
              onClick={() => {
                if (confirm("Annuler cette candidature ? Elle passera au statut « Rejetée » (vous pourrez la rétablir).")) {
                  startTransition(() => changerStatutCandidature(candidatureId, "REJETEE", { prevenir: false }));
                }
              }}
            >
              <Ban data-icon="inline-start" aria-hidden />
              Annuler
            </Button>
          ) : null}
          {peutModifier && statut === "REJETEE" ? (
            <Button type="button" variant="ghost" size="xs" disabled={enCours} className="text-muted-foreground" onClick={() => startTransition(() => changerStatutCandidature(candidatureId, "RECUE", { prevenir: false }))}>
              <RotateCcw data-icon="inline-start" aria-hidden />
              Rétablir
            </Button>
          ) : null}
          {peutSupprimer ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={enCours}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (!confirm("Supprimer définitivement cette candidature et son CV ? Cette action est irréversible.")) return;
                setErreur(null);
                startTransition(async () => {
                  const resultat = await supprimerCandidature(candidatureId);
                  if (resultat?.erreur) setErreur(resultat.erreur);
                });
              }}
            >
              <Trash2 data-icon="inline-start" aria-hidden />
              Supprimer
            </Button>
          ) : null}
        </div>
      ) : null}
      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

      {edition ? (
        <form action={action} className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <input type="hidden" name="candidatureId" value={candidatureId} />
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`nom-${candidatureId}`}>Nom</Label>
              <Input id={`nom-${candidatureId}`} name="nom" defaultValue={coordonnees.nom} required className="w-56" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`tel-${candidatureId}`}>Téléphone</Label>
              <Input id={`tel-${candidatureId}`} name="telephone" defaultValue={coordonnees.telephone} required className="w-44" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`email-${candidatureId}`}>Email (optionnel)</Label>
              <Input id={`email-${candidatureId}`} name="email" type="email" defaultValue={coordonnees.email ?? ""} className="w-56" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`message-${candidatureId}`}>Message (optionnel)</Label>
            <Textarea id={`message-${candidatureId}`} name="message" rows={3} defaultValue={coordonnees.message ?? ""} />
          </div>
          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enregistrement}>
              {enregistrement ? <Spinner /> : null}
              {enregistrement ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEdition(false)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
