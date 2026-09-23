"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CreditCard, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { declencherPaiementAbonnement, recupererTentativeAbonnementEnAttente, verifierStatutTentativeAbonnement } from "@/lib/actions/abonnement";
import { useT } from "@/lib/i18n/contexte";

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
 */
export function BoutonPaiementAbonnement() {
  const t = useT();
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
      <div className="flex flex-col items-center gap-1.5 text-center">
        <CheckCircle2 className="size-6 text-primary" aria-hidden />
        <p className="text-sm font-medium">{t("Paiement confirmé — votre abonnement est actif.")}</p>
      </div>
    );
  }

  if (etape === "en_attente") {
    return (
      <div className="flex flex-col items-center gap-1.5 text-center">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-medium">{t("Vérifiez votre téléphone et validez la demande de paiement.")}</p>
        <p className="text-xs text-muted-foreground">{t("Nous attendons la confirmation…")}</p>
      </div>
    );
  }

  if (etape === "echec") {
    return (
      <div className="flex flex-col items-center gap-1.5 text-center">
        <XCircle className="size-6 text-destructive" aria-hidden />
        <p className="text-sm font-medium">{erreur ?? t("Le paiement n'a pas abouti.")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setEtape("formulaire")}>
          {t("Réessayer")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Input
        type="tel"
        value={telephone}
        onChange={(e) => setTelephone(e.target.value)}
        placeholder={t("Numéro Mobile Money (ex : 690 11 12 22)")}
        disabled={enCours}
        className="max-w-xs"
      />
      <div className="flex gap-2">
        <Button type="button" variant={operateur === "MTN_Cameroon" ? "default" : "outline"} size="sm" onClick={() => setOperateur("MTN_Cameroon")} disabled={enCours}>
          MTN Mobile Money
        </Button>
        <Button type="button" variant={operateur === "Orange_Cameroon" ? "default" : "outline"} size="sm" onClick={() => setOperateur("Orange_Cameroon")} disabled={enCours}>
          Orange Money
        </Button>
      </div>
      <Button type="button" onClick={payer} disabled={enCours || !telephone}>
        {enCours ? <Spinner data-icon="inline-start" /> : <CreditCard data-icon="inline-start" aria-hidden />}
        {t("Régler mon abonnement (50 000 FCFA)")}
      </Button>
      {erreur ? <p className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
