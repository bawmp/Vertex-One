"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { basculerReaction, supprimerMessage } from "@/lib/actions/messagerie";
import type { MessageAffiche } from "@/lib/messagerie/acces";
import { Compositeur } from "./compositeur";
import { FilDiscussion } from "./fil-discussion";
import { LigneMessage } from "./ligne-message";
import { cleJour, delaiProchaineLecture, fusionner, plusRecentChangement, type PersonneMentionnable } from "./utilitaires-conversation";

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
  const [messages, setMessages] = useState(messagesInitiaux);
  const [erreur, setErreur] = useState<string | null>(null);
  const [plusAnciens, setPlusAnciens] = useState(!messageCibleId && messagesInitiaux.length >= 50);
  const [chargementAnciens, setChargementAnciens] = useState(false);
  const [filOuvertId, setFilOuvertId] = useState<string | null>(null);
  const [surbrillanceId, setSurbrillanceId] = useState<string | undefined>(messageCibleId);

  const defilement = useRef<HTMLDivElement>(null);
  const enBas = useRef(!messageCibleId);
  // Curseur de la mise à jour incrémentale : date du dernier changement déjà reçu.
  const curseur = useRef<string | null>(plusRecentChangement(messagesInitiaux));
  // Lectures consécutives sans rien de nouveau : sert à espacer les lectures d'une conversation calme.
  const lecturesVides = useRef(0);

  const nomsConnus = [...candidats.map((c) => c.nom), moiNom];

  // Mémorise si la personne est en bas de la conversation : on ne la ramène en bas que dans ce cas,
  // pour ne pas lui faire perdre sa lecture d'anciens messages quand un nouveau arrive.
  const surDefilement = useCallback(() => {
    const el = defilement.current;
    if (el) enBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
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
            setMessages((actuels) => fusionner(actuels, recus));

            // Onglet en arrière-plan : une notification du navigateur pour les nouveaux messages des autres.
            if (!visible && typeof Notification !== "undefined" && Notification.permission === "granted") {
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
    window.addEventListener("focus", reveil);
    minuteur = setTimeout(verifier, PREMIERE_LECTURE_MS);
    return () => {
      arrete = true;
      clearTimeout(minuteur);
      window.removeEventListener("focus", reveil);
    };
  }, [canalId, moiId]);

  async function reagir(messageId: string, emoji: string) {
    setErreur(null);
    const resultat = await basculerReaction(messageId, emoji);
    if (resultat.reactions) setMessages((actuels) => actuels.map((m) => (m.id === messageId ? { ...m, reactions: resultat.reactions! } : m)));
    else if (resultat.erreur) setErreur(resultat.erreur);
  }

  async function supprimer(id: string) {
    if (!window.confirm("Supprimer ce message pour tout le monde ?")) return;
    setErreur(null);
    const resultat = await supprimerMessage(id);
    if (resultat.erreur) return setErreur(resultat.erreur);
    setMessages((actuels) => actuels.map((m) => (m.id === id ? { ...m, contenu: null, supprime: true, piece: null, reactions: [] } : m)));
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
    <div className="relative flex h-[70vh] min-h-96 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div ref={defilement} onScroll={surDefilement} className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-4">
        {plusAnciens ? (
          <Button type="button" variant="ghost" size="sm" disabled={chargementAnciens} onClick={chargerAnciens} className="mb-2 self-center">
            {chargementAnciens ? <Spinner /> : null}
            Messages plus anciens
          </Button>
        ) : null}

        {messages.length === 0 ? <p className="m-auto text-sm text-muted-foreground">Aucun message pour le moment. Écrivez le premier !</p> : null}

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
            surReaction={reagir}
            surSupprimer={supprimer}
            surOuvrirFil={setFilOuvertId}
          />
        ))}
        {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
      </div>

      {peutEcrire ? (
        <Compositeur
          canalId={canalId}
          candidats={candidats}
          placeholder="Écrivez un message… (Entrée pour envoyer, @ pour mentionner)"
          surEnvoye={(envoye) => {
            lecturesVides.current = 0;
            enBas.current = true;
            if (!curseur.current || envoye.misAJourLe > curseur.current) curseur.current = envoye.misAJourLe;
            setMessages((actuels) => fusionner(actuels, [envoye]));
          }}
        />
      ) : (
        <p className="border-t border-border p-3 text-sm text-muted-foreground">Vous pouvez lire cette conversation mais pas y écrire.</p>
      )}

      {filOuvertId ? (
        <FilDiscussion key={filOuvertId} canalId={canalId} racineId={filOuvertId} moiId={moiId} estAdmin={estAdmin} peutEcrire={peutEcrire} candidats={candidats} nomsConnus={nomsConnus} surFermer={() => setFilOuvertId(null)} />
      ) : null}
    </div>
  );
}
