"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Save, Send } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampZone } from "@/components/formulaire/champ";
import { ChoixCartes } from "@/components/formulaire/choix-cartes";
import { SectionFormulaire } from "@/components/formulaire/cadre-formulaire";
import { EcranPaiementReussi } from "@/components/formulaire/ecrans-paiement";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { envoyerRapportHierarchique } from "@/lib/actions/rapport-hierarchique";
import { LONGUEUR_MAX_OBJET } from "@/lib/rh/rapport-hierarchique-regles";
import { LONGUEUR_MAX_RUBRIQUE_LIGNE, LONGUEUR_MAX_RUBRIQUE_TEXTE, MODELES_RAPPORT, trouverModele, type ModeleRapport } from "@/lib/rh/rapport-modeles";
import { useT } from "@/lib/i18n/contexte";
import { PastilleModele } from "./icones-modeles";

type Destinataire = { id: string; nom: string; role: "ADMIN" | "MANAGER" };
type Brouillon = { objet: string; destinataireId: string; valeurs: Record<string, string> };

const CLE_BROUILLON = (modeleId: string) => `vertexone:rapport-brouillon:${modeleId}`;

/** Lecture et écriture du brouillon : le stockage du navigateur peut être absent ou bloqué, l'écran marche sans. */
function lireBrouillon(modeleId: string): Brouillon | null {
  try {
    const brut = window.localStorage.getItem(CLE_BROUILLON(modeleId));
    return brut ? (JSON.parse(brut) as Brouillon) : null;
  } catch {
    return null;
  }
}
function ecrireBrouillon(modeleId: string, brouillon: Brouillon | null) {
  try {
    if (brouillon) window.localStorage.setItem(CLE_BROUILLON(modeleId), JSON.stringify(brouillon));
    else window.localStorage.removeItem(CLE_BROUILLON(modeleId));
  } catch {
    /* stockage indisponible : le brouillon n'est simplement pas conservé */
  }
}

export function AssistantRapport({ destinataires, parDefaut, modeleInitial }: { destinataires: Destinataire[]; parDefaut: string | null; modeleInitial: string | null }) {
  const t = useT();
  const [modeleId, setModeleId] = useState<string | null>(trouverModele(modeleInitial)?.id ?? null);

  if (destinataires.length === 0) {
    return (
      <div className="animate-in rounded-3xl border border-dashed border-border bg-card p-8 text-center duration-500 fade-in slide-in-from-bottom-2">
        <p className="text-sm text-muted-foreground">{t("Personne ne peut encore recevoir votre rapport : aucun responsable n'est disponible.")}</p>
        <Button variant="outline" size="sm" className="mt-4" render={<Link href="/app/rh/rapports-ecrits" />} nativeButton={false}>{t("Retour aux rapports")}</Button>
      </div>
    );
  }

  const modele = trouverModele(modeleId);
  if (!modele) return <GalerieModeles onChoisir={setModeleId} />;
  return <FormulaireRapportModele key={modele.id} modele={modele} destinataires={destinataires} parDefaut={parDefaut} onChanger={() => setModeleId(null)} />;
}

function GalerieModeles({ onChoisir }: { onChoisir: (id: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-5">
      <div className="animate-in duration-500 fade-in slide-in-from-bottom-2">
        <h2 className="text-lg font-semibold tracking-tight">{t("Quel type de rapport voulez-vous écrire ?")}</h2>
        <p className="text-sm text-muted-foreground">{t("Choisissez un modèle : il vous guide rubrique par rubrique.")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {MODELES_RAPPORT.map((m, index) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChoisir(m.id)}
            style={{ animationDelay: `${index * 60}ms` }}
            className="group flex animate-in items-start gap-3.5 rounded-2xl border border-border bg-card p-4 text-left shadow-xs outline-none transition-all duration-200 fade-in slide-in-from-bottom-3 fill-mode-both hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-4 focus-visible:ring-primary/20 active:translate-y-0 active:scale-[0.99]"
          >
            <PastilleModele modele={m} taille="grand" className="transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">{t(m.libelle)}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{t(m.description)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FormulaireRapportModele({ modele, destinataires, parDefaut, onChanger }: { modele: ModeleRapport; destinataires: Destinataire[]; parDefaut: string | null; onChanger: () => void }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(envoyerRapportHierarchique, null);

  // Champs contrôlés : après une erreur, React 19 vide les champs non contrôlés d'un formulaire à action — la personne perdrait son rapport.
  const [objet, setObjet] = useState(t(modele.objetPropose));
  const [destinataireId, setDestinataireId] = useState(parDefaut ?? destinataires[0]?.id ?? "");
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [brouillonRepris, setBrouillonRepris] = useState(false);
  const [enregistreA, setEnregistreA] = useState<number | null>(null);
  const [tentative, setTentative] = useState(0);
  // L'erreur du serveur disparaît dès que la personne corrige sa saisie, et revient si un nouvel envoi échoue.
  const [erreurMasquee, setErreurMasquee] = useState(false);
  const pret = useRef(false);

  // Reprise d'un brouillon laissé sur cet appareil pour ce modèle (lecture du stockage du navigateur au montage).
  useEffect(() => {
    const b = lireBrouillon(modele.id);
    if (b) {
      /* eslint-disable react-hooks/set-state-in-effect -- le stockage du navigateur n'existe pas côté serveur : lecture après le montage */
      setObjet(b.objet || t(modele.objetPropose));
      if (b.destinataireId && destinataires.some((d) => d.id === b.destinataireId)) setDestinataireId(b.destinataireId);
      setValeurs(b.valeurs ?? {});
      setBrouillonRepris(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    pret.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lecture unique au montage
  }, []);

  // Enregistrement automatique du brouillon (un peu après la dernière frappe).
  useEffect(() => {
    if (!pret.current || etat?.envoye) return;
    const vide = !Object.values(valeurs).some((v) => v.trim());
    const minuteur = window.setTimeout(() => {
      if (vide) {
        ecrireBrouillon(modele.id, null);
        setEnregistreA(null);
      } else {
        ecrireBrouillon(modele.id, { objet, destinataireId, valeurs });
        setEnregistreA(Date.now());
      }
    }, 700);
    return () => window.clearTimeout(minuteur);
  }, [objet, destinataireId, valeurs, modele.id, etat?.envoye]);

  useEffect(() => {
    if (etat?.envoye) ecrireBrouillon(modele.id, null);
    if (etat?.erreur) {
      /* eslint-disable react-hooks/set-state-in-effect -- réaction à la réponse du serveur */
      setTentative((n) => n + 1); // relance la secousse du message d'erreur
      setErreurMasquee(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [etat, modele.id]);

  const requises = useMemo(() => modele.rubriques.filter((r) => r.requis), [modele]);
  const etapes = [objet.trim().length > 0, Boolean(destinataireId), ...requises.map((r) => (valeurs[r.cle] ?? "").trim().length > 0)];
  const faites = etapes.filter(Boolean).length;
  const pourcentage = Math.round((faites / etapes.length) * 100);

  if (etat?.envoye) {
    const cible = destinataires.find((d) => d.id === destinataireId);
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <EcranPaiementReussi titre={t("Rapport envoyé !")} texte={cible ? t("{nom} a été prévenu par email. Vous verrez ici quand il l'aura lu.", { nom: cible.nom }) : undefined}>
          <div className="mt-2 flex flex-wrap justify-center gap-2.5">
            <Button render={<Link href="/app/rh/rapports-ecrits?vue=envoyes" />} nativeButton={false}>{t("Voir mes rapports envoyés")}</Button>
            <Button variant="outline" render={<Link href="/app/rh/rapports-ecrits/nouveau" />} nativeButton={false}>{t("Écrire un autre rapport")}</Button>
          </div>
        </EcranPaiementReussi>
      </div>
    );
  }

  return (
    <form action={action} className="flex animate-in flex-col gap-6 duration-500 fade-in slide-in-from-right-4">
      <input type="hidden" name="modele" value={modele.id} />

      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3">
          <PastilleModele modele={modele} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{t(modele.libelle)}</p>
            <p className="truncate text-xs text-muted-foreground">{t(modele.description)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onChanger}>
            <ArrowLeft data-icon="inline-start" aria-hidden />
            {t("Changer de modèle")}
          </Button>
        </div>
        <div className="flex flex-col gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pourcentage} aria-label={t("Progression du rapport")}>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-linear-to-r from-primary to-marque-orange transition-all duration-500 ease-out" style={{ width: `${pourcentage}%` }} />
          </div>
          <p className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{pourcentage === 100 ? t("Prêt à envoyer !") : t("{n} sur {total} éléments obligatoires remplis", { n: faites, total: etapes.length })}</span>
            {brouillonRepris && enregistreA === null ? <span>{t("Brouillon repris")}</span> : null}
            {enregistreA !== null ? (
              <span className="flex animate-in items-center gap-1 fade-in">
                <Save className="size-3" aria-hidden />
                {t("Brouillon enregistré")}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-7 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <SectionFormulaire titre={t("À qui l'envoyer ?")}>
          <ChoixCartes
            nom="destinataireId"
            etiquette={t("Destinataire")}
            valeur={destinataireId}
            onChange={(id) => {
              setDestinataireId(id);
              setErreurMasquee(true);
            }}
            colonnes={2}
            options={destinataires.map((d) => ({ valeur: d.id, libelle: d.nom, detail: d.role === "ADMIN" ? t("Administrateur") : t("Manager") }))}
          />
        </SectionFormulaire>

        <SectionFormulaire titre={t("Votre rapport")}>
          <Champ label={t("Objet")} id="objet" name="objet" required maxLength={LONGUEUR_MAX_OBJET} value={objet} onChange={(e) => {
              setObjet(e.target.value);
              setErreurMasquee(true);
            }} valide={objet.trim().length > 0} />
          {modele.rubriques.map((r) =>
            r.type === "ligne" ? (
              <Champ
                key={r.cle}
                label={t(r.libelle) + (r.requis ? " *" : "")}
                id={`rubrique_${r.cle}`}
                name={`rubrique_${r.cle}`}
                aide={r.aide ? t(r.aide) : undefined}
                maxLength={LONGUEUR_MAX_RUBRIQUE_LIGNE}
                value={valeurs[r.cle] ?? ""}
                onChange={(e) => {
                  setValeurs((v) => ({ ...v, [r.cle]: e.target.value }));
                  setErreurMasquee(true);
                }}
              />
            ) : (
              <ChampZone
                key={r.cle}
                label={t(r.libelle) + (r.requis ? " *" : "")}
                id={`rubrique_${r.cle}`}
                name={`rubrique_${r.cle}`}
                aide={r.aide ? t(r.aide) : undefined}
                maxLength={LONGUEUR_MAX_RUBRIQUE_TEXTE}
                rows={r.requis ? 5 : 3}
                value={valeurs[r.cle] ?? ""}
                onChange={(e) => {
                  setValeurs((v) => ({ ...v, [r.cle]: e.target.value }));
                  setErreurMasquee(true);
                }}
              />
            ),
          )}
        </SectionFormulaire>

        <p className="flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-xs text-muted-foreground">
          <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
          {t("Seuls vous et le destinataire pouvez lire ce rapport.")}
        </p>

        {etat?.erreur && !erreurMasquee ? (
          <p key={tentative} role="alert" className="animate-secousse rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
            {etat.erreur}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="submit" size="lg" disabled={enCours} className={cn(pourcentage === 100 && !enCours && "shadow-lg shadow-primary/25")}>
            {enCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
            {enCours ? t("Envoi…") : t("Envoyer le rapport")}
          </Button>
          <Button variant="ghost" render={<Link href="/app/rh/rapports-ecrits" />} nativeButton={false}>{t("Annuler")}</Button>
        </div>
      </div>
    </form>
  );
}
