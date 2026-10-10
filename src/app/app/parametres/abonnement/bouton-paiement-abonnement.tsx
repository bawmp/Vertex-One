"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ChoixCartes } from "@/components/formulaire/choix-cartes";
import { BandeauPaiementSecurise, EcranAttentePaiement, EcranPaiementEchoue, EcranPaiementReussi, RecapMontant } from "@/components/formulaire/ecrans-paiement";
import { declencherPaiementAbonnement, recupererTentativeAbonnementEnAttente, verifierStatutTentativeAbonnement } from "@/lib/actions/abonnement";
import { useT } from "@/lib/i18n/contexte";

const DELAI_REDIRECTION_MS = 1_800; // laisse le temps de lire "Paiement confirmé" avant de repartir vers l'application

type Operateur = "MTN_Cameroon" | "Orange_Cameroon";
type Etape = "formulaire" | "en_attente" | "confirme" | "echec";

const DELAI_SONDAGE_MS = 4_000;
const DUREE_MAX_SONDAGE_MS = 2 * 60 * 1000; // 2 minutes — au-delà, le client valide peut-être encore, mais on arrête de solliciter le serveur en boucle.

/**
 * Paiement direct sans redirection (2026-09-22) : le numéro de téléphone et l'opérateur (MTN/Orange — jamais deviné,
 * "ALL" n'a aucun effet pour ce parcours) sont saisis ici, une invite USSD part directement dessus. La confirmation
 * ne peut pas compter sur la seule notification (Aangaraa Pay ne la renvoie qu'une fois, immédiatement, transaction
 * encore PENDING) : cet écran SONDE activement le statut (verifierStatutTentativeAbonnement) toutes les 4 secondes
 * pendant 2 minutes, avec un retour visuel à chaque étape plutôt qu'un message figé.
 *
 * Deux renforts (2026-09-23, paiement réel confirmé côté Aangaraa Pay mais jamais reflété ici — voir conversation) :
 * (1) un onglet mis en arrière-plan pendant que le client bascule sur son téléphone pour valider l'invite USSD peut
 * être déchargé par le système (constaté en réel sur mobile), perdant tout l'état de sondage en mémoire — au
 * montage, on relit donc s'il existe une tentative EN_ATTENTE récente pour reprendre le sondage plutôt que de
 * réafficher un formulaire vierge qui masquerait un paiement pourtant en cours ou déjà réussi. (2) un `setTimeout`
 * est ralenti ou mis en pause tant que l'onglet reste en arrière-plan (throttling standard des navigateurs) : un
 * `visibilitychange` déclenche une relecture immédiate dès le retour sur l'onglet, au lieu d'attendre le prochain
 * intervalle de 4 s.
 *
 * Redirection automatique vers /app dès la confirmation (2026-09-23) : ce composant est aussi utilisé sur l'écran
 * de blocage /abonnement-expire (voir cette page), qui reste affiché tant que rien ne fait revenir le client dans
 * l'application — un simple message texte laissait l'utilisateur bloqué visuellement sur cette page même une fois
 * l'abonnement réactivé.
 */
export function BoutonPaiementAbonnement() {
  const t = useT();
  const router = useRouter();
  const [enCours, startTransition] = useTransition();
  const [telephone, setTelephone] = useState("");
  const [operateur, setOperateur] = useState<Operateur>("Orange_Cameroon");
  const [erreur, setErreur] = useState<string | null>(null);
  const [etape, setEtape] = useState<Etape>("formulaire");
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tentativeRef = useRef<{ id: string; depuis: number } | null>(null);

  useEffect(() => {
    let annule = false;
    recupererTentativeAbonnementEnAttente().then((tentative) => {
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
    if (etape !== "confirme") return;
    const minuteur = setTimeout(() => {
      router.push("/app");
      router.refresh(); // re-rend la mise en page de /app, dont le statut d'abonnement (essai/actif/suspendu) vient du serveur
    }, DELAI_REDIRECTION_MS);
    return () => clearTimeout(minuteur);
  }, [etape, router]);

  function verifierMaintenant(tentativeId: string, depuis: number) {
    startTransition(async () => {
      const statut = await verifierStatutTentativeAbonnement(tentativeId);
      if (statut === "CONFIRME") {
        tentativeRef.current = null;
        setEtape("confirme");
        return;
      }
      if (statut === "ECHEC") {
        tentativeRef.current = null;
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
    startTransition(async () => {
      const resultat = await declencherPaiementAbonnement(telephone, operateur);
      if (resultat.erreur || !resultat.tentativeId) {
        setErreur(resultat.erreur ?? t("Impossible de déclencher le paiement pour le moment."));
        return;
      }
      setEtape("en_attente");
      sonder(resultat.tentativeId, Date.now());
    });
  }

  if (etape === "confirme") {
    return (
      <div className="w-full max-w-md">
        <EcranPaiementReussi titre={t("Paiement confirmé — votre abonnement est actif.")} texte={t("Redirection vers l'application…")} />
      </div>
    );
  }

  if (etape === "en_attente") {
    return (
      <div className="w-full max-w-md">
        <EcranAttentePaiement
          titre={t("Vérifiez votre téléphone et validez la demande de paiement.")}
          texte={t("Nous attendons la confirmation…")}
          etapes={[t("Demande envoyée"), t("Validez sur votre téléphone"), t("Confirmation de votre paiement")]}
          etapeActive={1}
          libelleTemps={t("Temps écoulé :")}
        />
      </div>
    );
  }

  if (etape === "echec") {
    return (
      <div className="w-full max-w-md">
        <EcranPaiementEchoue titre={erreur ?? t("Le paiement n'a pas abouti.")} texte={t("Rien n'est débité sans votre validation. Vous pouvez réessayer.")}>
          <Button type="button" variant="outline" onClick={() => setEtape("formulaire")}>
            {t("Réessayer")}
          </Button>
        </EcranPaiementEchoue>
      </div>
    );
  }

  const chiffres = telephone.replace(/\D/g, "");
  const telephoneValide = chiffres.length >= 9;

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        if (telephoneValide && !enCours) payer();
      }}
      className="flex w-full max-w-md animate-in flex-col gap-5 text-left duration-500 fade-in slide-in-from-bottom-2"
    >
      <RecapMontant etiquette={t("Abonnement Vertex One")} designation={t("Un mois, toutes les fonctionnalités")} montant="50 000 FCFA" />

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
        {t("Régler mon abonnement (50 000 FCFA)")}
      </Button>

      <BandeauPaiementSecurise libelle={t("Paiement sécurisé")} moyens={["MTN Mobile Money", "Orange Money"]} />
    </form>
  );
}
