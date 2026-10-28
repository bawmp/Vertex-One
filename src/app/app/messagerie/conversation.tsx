"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { basculerReaction, supprimerMessage } from "@/lib/actions/messagerie";
import type { MessageAffiche } from "@/lib/messagerie/acces";
import { Compositeur } from "./compositeur";
import { FilDiscussion } from "./fil-discussion";
import { LigneMessage } from "./ligne-message";
import { cleJour, delaiProchaineLecture, fusionner, plusRecentChangement, type PersonneMentionnable } from "./utilitaires-conversation";
import { useT } from "@/lib/i18n/contexte";
import { appareilAbonneLocalement, EVENEMENT_NOUVEAU_MESSAGE } from "@/lib/messagerie/push-client";


const PREMIERE_LECTURE_MS = 3000;

export function Conversation({
  canalId,
  messagesInitiaux,
  moiId,
  moiNom,
  estAdmin,
  peutEcrire,
  candidats,
  messageCibleId,
}: {
  canalId: string;
  messagesInitiaux: MessageAffiche[];
  moiId: string;
  moiNom: string;
  estAdmin: boolean;
  peutEcrire: boolean;
  /** Personnes que l'on peut mentionner dans ce canal. */
  candidats: PersonneMentionnable[];
  /** Message à afficher en évidence à l'ouverture (résultat de recherche, lien d'une notification). */
  messageCibleId?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [messages, setMessages] = useState(messagesInitiaux);
  const [erreur, setErreur] = useState<string | null>(null);
  const [plusAnciens, setPlusAnciens] = useState(!messageCibleId && messagesInitiaux.length >= 50);
  const [chargementAnciens, setChargementAnciens] = useState(false);
  const [filOuvertId, setFilOuvertId] = useState<string | null>(null);
  const [surbrillanceId, setSurbrillanceId] = useState<string | undefined>(messageCibleId);
  const [citation, setCitation] = useState<MessageAffiche | null>(null);
  // Messages arrivés pendant que la conversation est ouverte (ils apparaissent avec une animation), et lecture d'un ancien
  // passage : bouton « aller aux derniers messages » avec le nombre de nouveaux messages des autres.
  const [nouveauxIds, setNouveauxIds] = useState<Set<string>>(() => new Set());
  const [loinDuBas, setLoinDuBas] = useState(false);
  const [nonVus, setNonVus] = useState(0);

  const defilement = useRef<HTMLDivElement>(null);
  const enBas = useRef(!messageCibleId);
  // Curseur de la mise à jour incrémentale : date du dernier changement déjà reçu.
  const curseur = useRef<string | null>(plusRecentChangement(messagesInitiaux));
  // Lectures consécutives sans rien de nouveau : sert à espacer les lectures d'une conversation calme.
  const lecturesVides = useRef(0);

  const messagesRef = useRef(messagesInitiaux);

  const nomsConnus = [...candidats.map((c) => c.nom), moiNom];

  // Mémorise si la personne est en bas de la conversation : on ne la ramène en bas que dans ce cas,
  // pour ne pas lui faire perdre sa lecture d'anciens messages quand un nouveau arrive.
  const surDefilement = useCallback(() => {
    const el = defilement.current;
    if (!el) return;
    const bas = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    enBas.current = bas;
    setLoinDuBas(!bas);
    if (bas) setNonVus(0);
  }, []);

  function descendre() {
    const el = defilement.current;
    if (!el) return;
    enBas.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNonVus(0);
  }

  useEffect(() => {
    messagesRef.current = messages;
    const el = defilement.current;
    if (el && enBas.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Première ouverture : on se place sur le message ciblé ou tout en bas, et on note le canal comme lu.
  useEffect(() => {
    const el = defilement.current;
    if (messageCibleId) {
      document.getElementById(`message-${messageCibleId}`)?.scrollIntoView({ block: "center" });
      const minuteur = setTimeout(() => setSurbrillanceId(undefined), 4000);
      fetch(`/app/messagerie/messages?canal=${encodeURIComponent(canalId)}&apres=${encodeURIComponent(new Date().toISOString())}&lu=1`).catch(() => undefined);
      return () => clearTimeout(minuteur);
    }
    if (el) el.scrollTop = el.scrollHeight;
    fetch(`/app/messagerie/messages?canal=${encodeURIComponent(canalId)}&apres=${encodeURIComponent(new Date().toISOString())}&lu=1`).catch(() => undefined);
  }, [canalId, messageCibleId]);

  // Mise à jour régulière : toutes les 3 s quand l'onglet est visible, beaucoup plus rarement sinon.
  useEffect(() => {
    let arrete = false;
    let minuteur: ReturnType<typeof setTimeout>;

    async function verifier() {
      const visible = document.visibilityState === "visible";
      try {
        const depuis = curseur.current ?? new Date(0).toISOString();
        const reponse = await fetch(`/app/messagerie/messages?canal=${encodeURIComponent(canalId)}&apres=${encodeURIComponent(depuis)}${visible ? "&lu=1" : ""}`, { cache: "no-store" });
        if (reponse.ok && !arrete) {
          const { messages: recus } = (await reponse.json()) as { messages: MessageAffiche[] };
          if (recus.length === 0) lecturesVides.current++;
          else {
            lecturesVides.current = 0;
            const plusRecent = plusRecentChangement(recus);
            if (plusRecent && (!curseur.current || plusRecent > curseur.current)) curseur.current = plusRecent;
            const connus = new Set(messagesRef.current.map((m) => m.id));
            const arrives = recus.filter((m) => !connus.has(m.id));
            if (arrives.length > 0) {
              setNouveauxIds((precedents) => new Set([...precedents, ...arrives.map((m) => m.id)]));
              if (!enBas.current) setNonVus((n) => n + arrives.filter((m) => m.auteurId !== moiId && !m.supprime).length);
            }
            setMessages((actuels) => fusionner(actuels, recus));

            // Onglet en arrière-plan : une notification du navigateur pour les nouveaux messages des autres.
            if (!visible && !appareilAbonneLocalement() && typeof Notification !== "undefined" && Notification.permission === "granted") {
              const nouveaux = recus.filter((m) => !m.supprime && m.auteurId !== moiId && !m.reactions.length);
              const dernier = nouveaux[nouveaux.length - 1];
              if (dernier) new Notification(dernier.auteurNom, { body: dernier.contenu || (dernier.piece ? `Pièce jointe : ${dernier.piece.nom}` : "Nouveau message"), tag: canalId });
            }
          }
        }
      } catch {
        // Réseau coupé : on réessaiera au prochain passage.
      }
      if (!arrete) minuteur = setTimeout(verifier, delaiProchaineLecture(visible, lecturesVides.current));
    }

    // Retour sur l'onglet : on reprend tout de suite le rythme rapide.
    function reveil() {
      lecturesVides.current = 0;
    }
    // Un message vient d'arriver (push reçu pendant que l'application est visible) : on relit tout de suite.
    function immediat() {
      lecturesVides.current = 0;
      clearTimeout(minuteur);
      void verifier();
    }
    window.addEventListener("focus", reveil);
    window.addEventListener(EVENEMENT_NOUVEAU_MESSAGE, immediat);
    minuteur = setTimeout(verifier, PREMIERE_LECTURE_MS);
    return () => {
      arrete = true;
      clearTimeout(minuteur);
      window.removeEventListener("focus", reveil);
      window.removeEventListener(EVENEMENT_NOUVEAU_MESSAGE, immediat);
    };
  }, [canalId, moiId]);

  // Clic sur une citation : on défile jusqu'au message d'origine s'il est chargé, sinon on ouvre la conversation centrée sur lui.
  function allerAuMessage(messageId: string) {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) {
      router.push(`/app/messagerie?canal=${encodeURIComponent(canalId)}&message=${encodeURIComponent(messageId)}`);
      return;
    }
    enBas.current = false;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    setSurbrillanceId(messageId);
    setTimeout(() => setSurbrillanceId((courant) => (courant === messageId ? undefined : courant)), 3000);
  }

  async function reagir(messageId: string, emoji: string) {
    setErreur(null);
    const resultat = await basculerReaction(messageId, emoji);
    if (resultat.reactions) setMessages((actuels) => actuels.map((m) => (m.id === messageId ? { ...m, reactions: resultat.reactions! } : m)));
    else if (resultat.erreur) setErreur(resultat.erreur);
  }

  async function supprimer(id: string) {
    if (!window.confirm(t("Supprimer ce message pour tout le monde ?"))) return;
    setErreur(null);
    const resultat = await supprimerMessage(id);
    if (resultat.erreur) return setErreur(resultat.erreur);
    setMessages((actuels) =>
      actuels.map((m) =>
        m.id === id
          ? { ...m, contenu: null, supprime: true, piece: null, reactions: [], citation: null }
          : m.citation?.id === id
            ? { ...m, citation: { ...m.citation, extrait: "", piece: false, supprime: true } }
            : m
      )
    );
    setCitation((courante) => (courante?.id === id ? null : courante));
  }

  async function chargerAnciens() {
    if (messages.length === 0) return;
    setChargementAnciens(true);
    try {
      const reponse = await fetch(`/app/messagerie/messages?canal=${encodeURIComponent(canalId)}&avant=${encodeURIComponent(messages[0].creeLe)}`, { cache: "no-store" });
      if (reponse.ok) {
        const { messages: anciens, plusAnciens: encore } = (await reponse.json()) as { messages: MessageAffiche[]; plusAnciens?: boolean };
        const el = defilement.current;
        const hauteurAvant = el?.scrollHeight ?? 0;
        enBas.current = false;
        setMessages((actuels) => fusionner(actuels, anciens));
        setPlusAnciens(Boolean(encore));
        // Garde la position de lecture : on n'est pas propulsé en haut par l'ajout d'anciens messages.
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - hauteurAvant;
        });
      }
    } finally {
      setChargementAnciens(false);
    }
  }

  return (
    <div className="relative flex h-[70vh] min-h-96 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div ref={defilement} onScroll={surDefilement} className="flex flex-1 flex-col gap-0.5 overflow-y-auto bg-gradient-to-b from-background/40 to-muted/30 p-4">
        {plusAnciens ? (
          <Button type="button" variant="ghost" size="sm" disabled={chargementAnciens} onClick={chargerAnciens} className="mb-2 self-center">
            {chargementAnciens ? <Spinner /> : null}
            {t("Messages plus anciens")}
          </Button>
        ) : null}

        {messages.length === 0 ? (
          <div className="m-auto flex flex-col items-center gap-3 text-center">
            <span className="animate-chat-flotte flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-marque-bleu-100 to-marque-orange-100 text-primary shadow-sm">
              <MessagesSquare className="size-8" aria-hidden />
            </span>
            <p className="text-sm text-muted-foreground">{t("Aucun message pour le moment. Écrivez le premier !")}</p>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <LigneMessage
            key={m.id}
            message={m}
            precedent={messages[i - 1]}
            nouveauJour={i === 0 || cleJour(messages[i - 1].creeLe) !== cleJour(m.creeLe)}
            moiId={moiId}
            estAdmin={estAdmin}
            peutEcrire={peutEcrire}
            nomsConnus={nomsConnus}
            surbrillance={surbrillanceId === m.id}
            nouveau={nouveauxIds.has(m.id)}
            surReaction={reagir}
            surSupprimer={supprimer}
            surOuvrirFil={setFilOuvertId}
            surCiter={setCitation}
            surAllerA={allerAuMessage}
          />
        ))}
        {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

        {loinDuBas ? (
          <button
            type="button"
            onClick={descendre}
            aria-label={t("Aller aux derniers messages")}
            className="animate-chat-entree sticky bottom-1 z-10 mt-2 flex items-center gap-1.5 self-end rounded-full border border-border bg-popover py-1.5 pr-3 pl-2.5 text-xs font-medium shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:scale-95"
          >
            <ArrowDown className={`size-4 ${nonVus > 0 ? "text-marque-orange" : "text-muted-foreground"}`} aria-hidden />
            {nonVus > 0 ? (nonVus > 1 ? t("{n} nouveaux messages", { n: nonVus }) : t("{n} nouveau message", { n: nonVus })) : t("Derniers messages")}
          </button>
        ) : null}
      </div>

      {peutEcrire ? (
        <Compositeur
          canalId={canalId}
          candidats={candidats}
          citation={citation}
          surRetirerCitation={() => setCitation(null)}
          placeholder={t("Écrivez un message… (Entrée pour envoyer, @ pour mentionner)")}
          surEnvoye={(envoye) => {
            lecturesVides.current = 0;
            enBas.current = true;
            if (!curseur.current || envoye.misAJourLe > curseur.current) curseur.current = envoye.misAJourLe;
            setNouveauxIds((precedents) => new Set(precedents).add(envoye.id));
            setMessages((actuels) => fusionner(actuels, [envoye]));
          }}
        />
      ) : (
        <p className="border-t border-border p-3 text-sm text-muted-foreground">{t("Vous pouvez lire cette conversation mais pas y écrire.")}</p>
      )}

      {filOuvertId ? (
        <FilDiscussion key={filOuvertId} canalId={canalId} racineId={filOuvertId} moiId={moiId} estAdmin={estAdmin} peutEcrire={peutEcrire} candidats={candidats} nomsConnus={nomsConnus} surFermer={() => setFilOuvertId(null)} />
      ) : null}
    </div>
  );
}
