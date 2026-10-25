"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CreditCard, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ChoixCartes } from "@/components/formulaire/choix-cartes";
import { BandeauPaiementSecurise, EcranAttentePaiement, EcranPaiementEchoue, EcranPaiementReussi, RecapMontant } from "@/components/formulaire/ecrans-paiement";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { trancheMinimale } from "@/lib/facturation/tranche";
import { messageEchecPaiement } from "@/lib/aangaraa/messages-echec";
import { useT } from "@/lib/i18n/contexte";

type Operateur = "MTN_Cameroon" | "Orange_Cameroon";
type Etape = "formulaire" | "en_attente" | "confirme" | "echec";
type StatutRelecture = "CONFIRME" | "ECHEC" | "EN_ATTENTE" | "INTROUVABLE" | "INDISPONIBLE";
type ModeMontant = "tout" | "tranche";

const DELAI_SONDAGE_MS = 4_000;
const DUREE_MAX_SONDAGE_MS = 2 * 60 * 1000; // au-delà, le client valide peut-être encore, mais on cesse de solliciter le serveur en boucle
const DELAI_CONFIRMATION_MS = 1_800; // le temps de lire « Paiement confirmé » avant de rafraîchir la page
const POURCENTAGES_RAPIDES = [25, 50, 75];

/** Un montant rapide (part du solde), arrondi au multiple de 500 supérieur, jamais en dessous de la tranche minimale ni au solde entier. */
function montantRapide(solde: number, pourcentage: number): number | null {
  const brut = Math.ceil((solde * pourcentage) / 100 / 500) * 500;
  const montant = Math.max(brut, trancheMinimale(solde));
  return montant < solde ? montant : null;
}

/**
 * Paiement Mobile Money SANS redirection (`/no_redirect/payment`), partagé par la page publique d'une facture et l'encaissement
 * interne : le numéro et l'opérateur (MTN/Orange — jamais devinés) sont saisis ici, une invite USSD part sur le téléphone, puis
 * l'écran SONDE activement le statut (la notification du prestataire n'arrive qu'une fois, transaction encore PENDING).
 *
 * Paiement en plusieurs fois : quand l'entreprise l'autorise, le payeur choisit de régler tout le solde ou une tranche de son choix
 * (le serveur borne toujours le montant : jamais plus que le solde, jamais une tranche dérisoire). Après une tranche, l'écran
 * annonce ce qui reste dû et propose de payer la suivante.
 *
 * Mêmes renforts que le paiement d'abonnement : reprise d'une tentative récente après rechargement (l'onglet peut être déchargé
 * pendant que le client valide sur son téléphone) et relecture immédiate au retour sur l'onglet. Les actions viennent de
 * l'appelant : chacune revérifie côté serveur que la tentative appartient bien au document concerné.
 */
export function PaiementMobileMoney({
  etiquette,
  designation,
  solde,
  dejaPaye = 0,
  tranchesAutorisees = false,
  declencher,
  verifier,
  reprendre,
  onConfirme,
}: {
  etiquette: string;
  designation: string;
  /** Ce qui reste dû (FCFA), lu en base par le serveur. */
  solde: number;
  dejaPaye?: number;
  tranchesAutorisees?: boolean;
  declencher: (telephone: string, operateur: Operateur, montant: number) => Promise<{ tentativeId?: string; erreur?: string }>;
  verifier: (tentativeId: string) => Promise<{ statut: StatutRelecture; raison: string | null }>;
  reprendre?: () => Promise<{ tentativeId: string } | null>;
  onConfirme?: () => void;
}) {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [telephone, setTelephone] = useState("");
  const [operateur, setOperateur] = useState<Operateur>("Orange_Cameroon");
  const [mode, setMode] = useState<ModeMontant>("tout");
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [raisonEchec, setRaisonEchec] = useState<string | null>(null);
  const [etape, setEtape] = useState<Etape>("formulaire");
  const [resteApres, setResteApres] = useState(0);
  const [montantPaye, setMontantPaye] = useState(0);
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tentativeRef = useRef<{ id: string; depuis: number } | null>(null);
  const reglementEnCoursRef = useRef<{ montant: number; soldeAvant: number } | null>(null);

  const tranchesProposees = tranchesAutorisees && solde > trancheMinimale(solde);
  const minimum = trancheMinimale(solde);
  const montantTranche = Number(saisie.replace(/\s/g, ""));
  const trancheValide = Number.isInteger(montantTranche) && montantTranche >= minimum && montantTranche <= solde;
  const montantChoisi = mode === "tout" || !tranchesProposees ? solde : montantTranche;
  const montantValide = mode === "tout" || !tranchesProposees ? solde > 0 : trancheValide;

  useEffect(() => {
    if (!reprendre) return;
    let annule = false;
    reprendre().then((tentative) => {
      if (annule || !tentative) return;
      setEtape("en_attente");
      sonder(tentative.tentativeId, Date.now());
    });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reprise une seule fois au montage
  }, []);

  useEffect(() => {
    function auRetourSurOnglet() {
      if (document.visibilityState !== "visible" || !tentativeRef.current) return;
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
      verifierMaintenant(tentativeRef.current.id, tentativeRef.current.depuis);
    }
    document.addEventListener("visibilitychange", auRetourSurOnglet);
    return () => document.removeEventListener("visibilitychange", auRetourSurOnglet);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verifierMaintenant est stable pour la durée du composant
  }, []);

  useEffect(() => () => {
    if (minuteurRef.current) clearTimeout(minuteurRef.current);
  }, []);

  // Une tranche laisse un reste à payer : la page est rafraîchie tout de suite (le solde affiché change) et l'écran propose la
  // suivante. Un règlement complet laisse le temps de lire « Paiement confirmé » avant de rafraîchir.
  useEffect(() => {
    if (etape !== "confirme" || !onConfirme) return;
    if (resteApres > 0) {
      onConfirme();
      return;
    }
    const minuteur = setTimeout(onConfirme, DELAI_CONFIRMATION_MS);
    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois à l'arrivée sur l'écran de confirmation
  }, [etape]);

  function verifierMaintenant(tentativeId: string, depuis: number) {
    startTransition(async () => {
      const resultat = await verifier(tentativeId);
      if (resultat.statut === "CONFIRME") {
        tentativeRef.current = null;
        const reglement = reglementEnCoursRef.current;
        // Reprise après rechargement : on ne connaît plus la tranche payée, donc pas de « reste » annoncé (la page, rafraîchie, le montre).
        setMontantPaye(reglement?.montant ?? 0);
        setResteApres(reglement ? Math.max(0, reglement.soldeAvant - reglement.montant) : 0);
        reglementEnCoursRef.current = null;
        setEtape("confirme");
        return;
      }
      if (resultat.statut === "ECHEC") {
        tentativeRef.current = null;
        reglementEnCoursRef.current = null;
        setRaisonEchec(resultat.raison);
        setEtape("echec");
        return;
      }
      if (Date.now() - depuis > DUREE_MAX_SONDAGE_MS) {
        tentativeRef.current = null;
        setEtape("echec");
        setErreur(t("Nous n'avons pas encore reçu de confirmation. Si vous avez validé le paiement sur votre téléphone, contactez-nous — sinon réessayez."));
        return;
      }
      sonder(tentativeId, depuis); // INDISPONIBLE ou EN_ATTENTE : on continue de sonder
    });
  }

  function sonder(tentativeId: string, depuis: number) {
    tentativeRef.current = { id: tentativeId, depuis };
    minuteurRef.current = setTimeout(() => verifierMaintenant(tentativeId, depuis), DELAI_SONDAGE_MS);
  }

  function payer() {
    setErreur(null);
    setRaisonEchec(null);
    startTransition(async () => {
      const resultat = await declencher(telephone, operateur, montantChoisi);
      if (resultat.erreur || !resultat.tentativeId) {
        setErreur(resultat.erreur ? t(resultat.erreur) : t("Impossible de déclencher le paiement pour le moment."));
        return;
      }
      reglementEnCoursRef.current = { montant: montantChoisi, soldeAvant: solde };
      setEtape("en_attente");
      sonder(resultat.tentativeId, Date.now());
    });
  }

  if (etape === "confirme") {
    if (resteApres > 0) {
      return (
        <EcranPaiementReussi titre={t("Tranche de {montant} reçue — merci !", { montant: formaterFCFA(montantPaye) })} texte={t("Il vous reste {reste} à régler sur cette facture.", { reste: formaterFCFA(resteApres) })}>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSaisie("");
              setMode("tout");
              setEtape("formulaire");
            }}
          >
            {t("Payer une autre tranche")}
          </Button>
        </EcranPaiementReussi>
      );
    }
    return <EcranPaiementReussi titre={t("Paiement confirmé — merci !")} texte={t("Votre paiement a bien été reçu.")} />;
  }

  if (etape === "en_attente") {
    return (
      <EcranAttentePaiement
        titre={t("Vérifiez votre téléphone et validez la demande de paiement.")}
        texte={t("Nous attendons la confirmation…")}
        etapes={[t("Demande envoyée"), t("Validez sur votre téléphone"), t("Confirmation de votre paiement")]}
        etapeActive={1}
        libelleTemps={t("Temps écoulé :")}
      />
    );
  }

  if (etape === "echec") {
    return (
      <EcranPaiementEchoue titre={erreur ?? t("Le paiement n'a pas abouti.")} texte={(messageEchecPaiement(raisonEchec) ? t(messageEchecPaiement(raisonEchec)!) + " " : "") + t("Rien n'est débité sans votre validation. Vous pouvez réessayer.")}>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setErreur(null);
            setEtape("formulaire");
          }}
        >
          {t("Réessayer")}
        </Button>
      </EcranPaiementEchoue>
    );
  }

  const telephoneValide = telephone.replace(/\D/g, "").length >= 9;
  const reste = Math.max(0, solde - montantChoisi);

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        if (telephoneValide && montantValide && !enCours) payer();
      }}
      className="flex w-full animate-in flex-col gap-5 text-left duration-500 fade-in slide-in-from-bottom-2"
    >
      <RecapMontant etiquette={etiquette} designation={dejaPaye > 0 ? `${designation} — ${t("déjà réglé : {montant}", { montant: formaterFCFA(dejaPaye) })}` : designation} montant={formaterFCFA(montantValide ? montantChoisi : solde)} />

      {tranchesProposees ? (
        <div className="flex flex-col gap-3">
          <ChoixCartes
            etiquette={t("Combien voulez-vous payer ?")}
            valeur={mode}
            onChange={(v) => setMode(v as ModeMontant)}
            desactive={enCours}
            options={[
              { valeur: "tout", libelle: t("Tout le solde"), detail: formaterFCFA(solde) },
              { valeur: "tranche", libelle: t("Une tranche"), detail: t("Je choisis le montant") },
            ]}
          />
          {mode === "tranche" ? (
            <div className="flex animate-in flex-col gap-3 duration-300 fade-in slide-in-from-top-1">
              <Champ
                label={t("Montant de la tranche (FCFA)")}
                name="montant"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t("ex : 10000")}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value.replace(/[^\d\s]/g, ""))}
                disabled={enCours}
                valide={trancheValide}
                aide={t("Entre {min} et {max}.", { min: formaterFCFA(minimum), max: formaterFCFA(solde) })}
              />
              <div className="flex flex-wrap gap-2">
                {POURCENTAGES_RAPIDES.map((pourcentage) => {
                  const montant = montantRapide(solde, pourcentage);
                  if (montant === null) return null;
                  return (
                    <Button key={pourcentage} type="button" size="sm" variant="outline" disabled={enCours} onClick={() => setSaisie(String(montant))}>
                      {formaterFCFA(montant)}
                    </Button>
                  );
                })}
              </div>
              {trancheValide && reste > 0 ? <p className="text-xs text-muted-foreground">{t("Il vous resterait {reste} à régler ensuite.", { reste: formaterFCFA(reste) })}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <ChoixCartes
        etiquette={t("Opérateur Mobile Money")}
        valeur={operateur}
        onChange={(v) => setOperateur(v as Operateur)}
        desactive={enCours}
        options={[
          { valeur: "MTN_Cameroon", libelle: "MTN Mobile Money", pastille: "#ffcc00" },
          { valeur: "Orange_Cameroon", libelle: "Orange Money", pastille: "#ff7900" },
        ]}
      />

      <Champ
        label={t("Numéro Mobile Money")}
        name="telephone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        icone={Smartphone}
        prefixe="+237"
        placeholder={t("ex : 690 11 12 22")}
        value={telephone}
        onChange={(e) => setTelephone(e.target.value)}
        disabled={enCours}
        valide={telephoneValide}
        erreur={erreur}
        aide={t("Une demande de validation sera envoyée sur ce numéro.")}
      />

      <Button type="submit" size="lg" disabled={enCours || !telephoneValide || !montantValide} className="h-12 w-full text-base">
        {enCours ? <Spinner data-icon="inline-start" /> : <CreditCard data-icon="inline-start" aria-hidden />}
        {t("Payer {montant}", { montant: formaterFCFA(montantValide ? montantChoisi : solde) })}
      </Button>

      <BandeauPaiementSecurise libelle={t("Paiement sécurisé")} moyens={["MTN Mobile Money", "Orange Money"]} />
    </form>
  );
}
