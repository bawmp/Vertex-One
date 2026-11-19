"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Mail, MessageCircle, PhoneCall, BellRing, CheckCircle2, TriangleAlert, Send, Paperclip, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { arreterSequenceProspect, definirRappelProspect, marquerAReponduProspect, noterRelanceProspect, ouvrirRelanceWhatsApp, relancerProspectParEmail, reprendreSequenceProspect } from "@/lib/actions/prospect";
import { MODELES_RELANCE } from "@/lib/crm/prospects";
import type { InfoAuto } from "@/lib/crm/sequence-prospects";
import { phraseAuto } from "./resume-auto";
import { elementsACompleter } from "@/lib/email/modeles";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";
import { useT } from "@/lib/i18n/contexte";

type Onglet = "email" | "whatsapp" | "note" | "rappel" | "auto";

export type ProspectPourRelance = { id: string; nom: string; telephone: string; email: string | null; rappelLe: string | null; auto?: InfoAuto | null };

/**
 * Tout ce qu'il faut pour relancer UN prospect, au même endroit : e-mail (part réellement), WhatsApp (ouvre la conversation avec le message déjà écrit),
 * appel ou note (gardés dans l'historique) et rappel daté. Les textes viennent de modèles modifiables avant l'envoi ; le serveur relit le prospect en
 * base et revérifie la portée : ce formulaire n'envoie jamais d'adresse ni de numéro.
 */
export function PanneauRelance({ prospect, nomEntreprise, ongletInitial = "email" }: { prospect: ProspectPourRelance; nomEntreprise: string; ongletInitial?: Onglet }) {
  const t = useT();
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial);

  const onglets: { cle: Onglet; libelle: string; Icone: typeof Mail }[] = [
    { cle: "email", libelle: t("E-mail"), Icone: Mail },
    { cle: "whatsapp", libelle: t("WhatsApp"), Icone: MessageCircle },
    { cle: "note", libelle: t("Appel / note"), Icone: PhoneCall },
    { cle: "rappel", libelle: t("Rappel"), Icone: BellRing },
    // L'onglet « Automatique » n'existe que si l'entreprise a activé la relance automatique (Paramètres).
    ...(prospect.auto ? [{ cle: "auto" as Onglet, libelle: t("Automatique"), Icone: Repeat }] : []),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div role="tablist" aria-label={t("Façon de relancer")} className="flex flex-wrap gap-1">
        {onglets.map(({ cle, libelle, Icone }) => (
          <Button key={cle} type="button" role="tab" aria-selected={onglet === cle} size="sm" variant={onglet === cle ? "default" : "ghost"} onClick={() => setOnglet(cle)}>
            <Icone data-icon="inline-start" aria-hidden />
            {libelle}
          </Button>
        ))}
      </div>

      {onglet === "email" ? <OngletEmail prospect={prospect} nomEntreprise={nomEntreprise} /> : null}
      {onglet === "whatsapp" ? <OngletWhatsApp prospect={prospect} nomEntreprise={nomEntreprise} /> : null}
      {onglet === "note" ? <OngletNote prospect={prospect} /> : null}
      {onglet === "rappel" ? <OngletRappel prospect={prospect} /> : null}
      {onglet === "auto" && prospect.auto ? <OngletAuto prospect={prospect} auto={prospect.auto} /> : null}
    </div>
  );
}

function SelecteurModele({ id, valeur, onChoisir }: { id: string; valeur: string; onChoisir: (cle: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{t("Modèle (facultatif)")}</Label>
      <Select id={id} value={valeur} onChange={(e) => onChoisir(e.target.value)}>
        <option value="">{t("Aucun modèle : je rédige moi-même")}</option>
        {MODELES_RELANCE.map((mo) => (
          <option key={mo.cle} value={mo.cle}>
            {t(mo.libelle)}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Retour({ erreur, succes }: { erreur?: string | null; succes?: string | null }) {
  if (erreur)
    return (
      <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {erreur}
      </p>
    );
  if (succes)
    return (
      <p role="status" className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        {succes}
      </p>
    );
  return null;
}

function OngletEmail({ prospect, nomEntreprise }: { prospect: ProspectPourRelance; nomEntreprise: string }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(relancerProspectParEmail, null);
  const [modele, setModele] = useState("");
  const [objet, setObjet] = useState("");
  const [message, setMessage] = useState("");
  const champFichiers = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (etat?.envoye) {
      /* eslint-disable react-hooks/set-state-in-effect -- réaction à la réponse du serveur */
      setObjet("");
      setMessage("");
      setModele("");
      if (champFichiers.current) champFichiers.current.value = "";
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [etat]);

  if (!prospect.email) {
    return <p className="text-sm text-muted-foreground">{t("Ce prospect n'a pas d'adresse e-mail renseignée. Utilisez WhatsApp ou ajoutez son adresse sur sa fiche.")}</p>;
  }

  const aCompleter = elementsACompleter(`${objet}\n${message}`);

  function choisir(cle: string) {
    setModele(cle);
    const mo = MODELES_RELANCE.find((x) => x.cle === cle);
    if (!mo) return;
    const valeurs = { nom: prospect.nom, entreprise: nomEntreprise };
    setObjet(t(mo.objet, valeurs));
    setMessage(t(mo.message, valeurs));
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="leadId" value={prospect.id} />
      <p className="text-xs text-muted-foreground">{t("À : {email}", { email: prospect.email })}</p>
      <SelecteurModele id={`modele-email-${prospect.id}`} valeur={modele} onChoisir={choisir} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`objet-${prospect.id}`}>{t("Objet")}</Label>
        <Input id={`objet-${prospect.id}`} name="objet" value={objet} onChange={(e) => setObjet(e.target.value)} required maxLength={200} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`message-${prospect.id}`}>{t("Message")}</Label>
        <Textarea id={`message-${prospect.id}`} name="message" rows={7} value={message} onChange={(e) => setMessage(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`fichiers-${prospect.id}`} className="flex items-center gap-1.5">
          <Paperclip className="size-3.5" aria-hidden />
          {t("Pièces jointes (facultatif)")}
        </Label>
        <input ref={champFichiers} id={`fichiers-${prospect.id}`} name="fichiers" type="file" multiple className="text-xs file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1" />
        <span className="text-xs text-muted-foreground">{t("Cinq fichiers au plus, 4 Mo en tout (image, PDF, Word, Excel).")}</span>
      </div>
      {aCompleter.length > 0 ? <Retour erreur={t("Complétez ou retirez : {elements}.", { elements: aCompleter.join(", ") })} /> : null}
      <Retour erreur={etat?.erreur} succes={etat?.envoye ? t("E-mail envoyé. Il est noté dans l'historique.") : null} />
      <div>
        <Button type="submit" disabled={enCours || aCompleter.length > 0}>
          {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
          {t("Envoyer l'e-mail")}
        </Button>
      </div>
    </form>
  );
}

function OngletWhatsApp({ prospect, nomEntreprise }: { prospect: ProspectPourRelance; nomEntreprise: string }) {
  const t = useT();
  const [modele, setModele] = useState("");
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const [enCours, demarrer] = useTransition();

  function choisir(cle: string) {
    setModele(cle);
    const mo = MODELES_RELANCE.find((x) => x.cle === cle);
    if (mo) setMessage(t(mo.whatsapp, { nom: prospect.nom, entreprise: nomEntreprise }));
  }

  function ouvrir() {
    setErreur(null);
    setFait(false);
    // La fenêtre s'ouvre tout de suite (geste de la personne) : sinon le navigateur bloque l'ouverture après l'appel au serveur.
    const fenetre = window.open("about:blank", "_blank");
    demarrer(async () => {
      const r = await ouvrirRelanceWhatsApp(prospect.id, message);
      if (r.lien && fenetre) {
        fenetre.location.href = r.lien;
        setFait(true);
      } else {
        fenetre?.close();
        setErreur(r.erreur ?? t("Impossible d'ouvrir WhatsApp."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("Pour : {numero}", { numero: prospect.telephone })}</p>
      <SelecteurModele id={`modele-wa-${prospect.id}`} valeur={modele} onChoisir={choisir} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`wa-${prospect.id}`}>{t("Message")}</Label>
        <Textarea id={`wa-${prospect.id}`} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("Écrivez votre message…")} />
        <span className="text-xs text-muted-foreground">{t("WhatsApp s'ouvre avec ce message déjà écrit : vous appuyez vous-même sur « Envoyer ».")}</span>
      </div>
      <Retour erreur={erreur} succes={fait ? t("WhatsApp est ouvert. La relance est notée dans l'historique.") : null} />
      <div>
        <Button type="button" onClick={ouvrir} disabled={enCours || message.trim().length < 2}>
          {enCours ? <Spinner /> : <MessageCircle data-icon="inline-start" aria-hidden />}
          {t("Ouvrir WhatsApp")}
        </Button>
      </div>
    </div>
  );
}

function OngletNote({ prospect }: { prospect: ProspectPourRelance }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(noterRelanceProspect, null);
  const [contenu, setContenu] = useState("");

  useEffect(() => {
    if (etat?.ok) {
      /* eslint-disable react-hooks/set-state-in-effect -- réaction à la réponse du serveur */
      setContenu("");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [etat]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="leadId" value={prospect.id} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`canal-${prospect.id}`}>{t("Ce que vous notez")}</Label>
        <Select id={`canal-${prospect.id}`} name="canal" defaultValue="appel">
          <option value="appel">{t("J'ai appelé ce prospect")}</option>
          <option value="note">{t("Une remarque")}</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`contenu-${prospect.id}`}>{t("Ce qui s'est dit")}</Label>
        <Textarea id={`contenu-${prospect.id}`} name="contenu" rows={4} value={contenu} onChange={(e) => setContenu(e.target.value)} required />
      </div>
      <Retour erreur={etat?.erreur} succes={etat?.ok ? t("Noté dans l'historique.") : null} />
      <div>
        <Button type="submit" disabled={enCours}>
          {enCours ? <Spinner /> : <CheckCircle2 data-icon="inline-start" aria-hidden />}
          {t("Enregistrer")}
        </Button>
      </div>
    </form>
  );
}

function OngletRappel({ prospect }: { prospect: ProspectPourRelance }) {
  const t = useT();
  const [jour, setJour] = useState(prospect.rappelLe ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function enregistrer(valeur: string | null) {
    setErreur(null);
    setFait(null);
    demarrer(async () => {
      const r = await definirRappelProspect(prospect.id, valeur);
      if (r.erreur) setErreur(r.erreur);
      else {
        setFait(valeur ? t("Rappel enregistré : ce prospect passera « à relancer » ce jour-là.") : t("Rappel retiré."));
        if (!valeur) setJour("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`rappel-${prospect.id}`}>{t("Me le rappeler le")}</Label>
        <Input id={`rappel-${prospect.id}`} type="date" min={aujourdhuiDouala()} value={jour} onChange={(e) => setJour(e.target.value)} className="max-w-48" />
      </div>
      <Retour erreur={erreur} succes={fait} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => enregistrer(jour)} disabled={enCours || !jour}>
          {enCours ? <Spinner /> : <BellRing data-icon="inline-start" aria-hidden />}
          {t("Enregistrer le rappel")}
        </Button>
        {prospect.rappelLe ? (
          <Button type="button" variant="outline" onClick={() => enregistrer(null)} disabled={enCours}>
            {t("Retirer le rappel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function OngletAuto({ prospect, auto }: { prospect: ProspectPourRelance; auto: InfoAuto }) {
  const t = useT();
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function lancer(action: (id: string) => Promise<{ erreur?: string; ok?: boolean }>, message: string) {
    setErreur(null);
    setFait(null);
    demarrer(async () => {
      const r = await action(prospect.id);
      if (r.erreur) setErreur(r.erreur);
      else setFait(message);
    });
  }

  const arretee = auto.action === "ARRETEE";
  const enCoursDeSequence = auto.action === "ENVOYER" || auto.action === "ATTENDRE";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{phraseAuto(t, auto)}</p>
      <p className="text-xs text-muted-foreground">
        {t("Des e-mails modèles partent tout seuls, aux dates prévues, jusqu'à ce que ce prospect réponde, devienne client ou que vous arrêtiez. Une relance faite à la main retarde le prochain e-mail automatique.")}
      </p>
      <Retour erreur={erreur} succes={fait} />
      <div className="flex flex-wrap gap-2">
        {enCoursDeSequence ? (
          <>
            <Button type="button" onClick={() => lancer(marquerAReponduProspect, t("C'est noté : les relances automatiques sont arrêtées."))} disabled={enCours}>
              {enCours ? <Spinner /> : <CheckCircle2 data-icon="inline-start" aria-hidden />}
              {t("Il a répondu")}
            </Button>
            <Button type="button" variant="outline" onClick={() => lancer(arreterSequenceProspect, t("Les relances automatiques de ce prospect sont arrêtées."))} disabled={enCours}>
              {t("Arrêter les relances automatiques")}
            </Button>
          </>
        ) : null}
        {arretee ? (
          <Button type="button" onClick={() => lancer(reprendreSequenceProspect, t("Les relances automatiques reprennent."))} disabled={enCours}>
            {enCours ? <Spinner /> : <Repeat data-icon="inline-start" aria-hidden />}
            {t("Reprendre les relances automatiques")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
