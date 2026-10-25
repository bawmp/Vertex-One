"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CreditCard, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ChoixCartes } from "@/components/formulaire/choix-cartes";
import { BandeauPaiementSecurise, EcranAttentePaiement, EcranPaiementEchoue, EcranPaiementReussi, RecapMontant } from "@/components/formulaire/ecrans-paiement";
import { messageEchecPaiement } from "@/lib/aangaraa/messages-echec";
import { useT } from "@/lib/i18n/contexte";

type Operateur = "MTN_Cameroon" | "Orange_Cameroon";
type Etape = "formulaire" | "en_attente" | "confirme" | "echec";
type StatutRelecture = "CONFIRME" | "ECHEC" | "EN_ATTENTE" | "INTROUVABLE" | "INDISPONIBLE";

const DELAI_SONDAGE_MS = 4_000;
const DUREE_MAX_SONDAGE_MS = 2 * 60 * 1000; // au-delà, le client valide peut-être encore, mais on cesse de solliciter le serveur en boucle
const DELAI_CONFIRMATION_MS = 1_800; // le temps de lire « Paiement confirmé » avant de rafraîchir la page

/**
 * Paiement Mobile Money SANS redirection (`/no_redirect/payment`), partagé par la page publique d'une facture et l'encaissement
 * interne : le numéro et l'opérateur (MTN/Orange — jamais devinés) sont saisis ici, une invite USSD part sur le téléphone, puis
 * l'écran SONDE activement le statut (la notification du prestataire n'arrive qu'une fois, transaction encore PENDING).
 *
 * Mêmes renforts que le paiement d'abonnement : reprise d'une tentative récente après rechargement (l'onglet peut être déchargé
 * pendant que le client valide sur son téléphone) et relecture immédiate au retour sur l'onglet. Les trois actions viennent de
 * l'appelant : chacune revérifie côté serveur que la tentative appartient bien au document concerné.
 */
export function PaiementMobileMoney({
  etiquette,
  designation,
  montant,
  declencher,
  verifier,
  reprendre,
  onConfirme,
}: {
  etiquette: string;
  designation: string;
  montant: string;
  declencher: (telephone: string, operateur: Operateur) => Promise<{ tentativeId?: string; erreur?: string }>;
  verifier: (tentativeId: string) => Promise<{ statut: StatutRelecture; raison: string | null }>;
  reprendre?: () => Promise<{ tentativeId: string } | null>;
  onConfirme?: () => void;
}) {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const [telephone, setTelephone] = useState("");
  const [operateur, setOperateur] = useState<Operateur>("Orange_Cameroon");
  const [erreur, setErreur] = useState<string | null>(null);
  const [raisonEchec, setRaisonEchec] = useState<string | null>(null);
  const [etape, setEtape] = useState<Etape>("formulaire");
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tentativeRef = useRef<{ id: string; depuis: number } | null>(null);

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

  useEffect(() => {
    if (etape !== "confirme" || !onConfirme) return;
    const minuteur = setTimeout(onConfirme, DELAI_CONFIRMATION_MS);
    return () => clearTimeout(minuteur);
  }, [etape, onConfirme]);

  function verifierMaintenant(tentativeId: string, depuis: number) {
    startTransition(async () => {
      const resultat = await verifier(tentativeId);
      if (resultat.statut === "CONFIRME") {
        tentativeRef.current = null;
        setEtape("confirme");
        return;
      }
      if (resultat.statut === "ECHEC") {
        tentativeRef.current = null;
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
      const resultat = await declencher(telephone, operateur);
      if (resultat.erreur || !resultat.tentativeId) {
        setErreur(resultat.erreur ? t(resultat.erreur) : t("Impossible de déclencher le paiement pour le moment."));
        return;
      }
      setEtape("en_attente");
      sonder(resultat.tentativeId, Date.now());
    });
  }

  if (etape === "confirme") {
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

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        if (telephoneValide && !enCours) payer();
      }}
      className="flex w-full animate-in flex-col gap-5 text-left duration-500 fade-in slide-in-from-bottom-2"
    >
      <RecapMontant etiquette={etiquette} designation={designation} montant={montant} />

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

      <Button type="submit" size="lg" disabled={enCours || !telephoneValide} className="h-12 w-full text-base">
        {enCours ? <Spinner data-icon="inline-start" /> : <CreditCard data-icon="inline-start" aria-hidden />}
        {t("Payer {montant}", { montant })}
      </Button>

      <BandeauPaiementSecurise libelle={t("Paiement sécurisé")} moyens={["MTN Mobile Money", "Orange Money"]} />
    </form>
  );
}
