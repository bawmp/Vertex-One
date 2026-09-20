"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { basculerReaction, supprimerMessage } from "@/lib/actions/messagerie";
import type { MessageAffiche } from "@/lib/messagerie/acces";
import { Compositeur } from "./compositeur";
import { LigneMessage } from "./ligne-message";
import { cleJour, delaiProchaineLecture, fusionner, type PersonneMentionnable } from "./utilitaires-conversation";

/**
 * Fil de discussion d'un message : le message d'origine et ses réponses, dans un panneau à côté de la conversation.
 * Les réponses n'encombrent pas la chronologie du canal. Mise à jour régulière comme la conversation.
 */
export function FilDiscussion({
  canalId,
  racineId,
  moiId,
  estAdmin,
  peutEcrire,
  candidats,
  nomsConnus,
  surFermer,
}: {
  canalId: string;
  racineId: string;
  moiId: string;
  estAdmin: boolean;
  peutEcrire: boolean;
  candidats: PersonneMentionnable[];
  nomsConnus: string[];
  surFermer: () => void;
}) {
  const [messages, setMessages] = useState<MessageAffiche[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const defilement = useRef<HTMLDivElement>(null);
  const nbAvant = useRef(0);
  const lecturesVides = useRef(0);
  const derniereSignature = useRef("");

  // Lecture du fil : au départ, puis régulièrement (toutes les 3 s onglet visible, 20 s sinon).
  useEffect(() => {
    let arrete = false;
    let minuteur: ReturnType<typeof setTimeout>;
    async function charger() {
      const visible = document.visibilityState === "visible";
      try {
        const reponse = await fetch(`/app/messagerie/messages?canal=${encodeURIComponent(canalId)}&fil=${encodeURIComponent(racineId)}${visible ? "&lu=1" : ""}`, { cache: "no-store" });
        if (reponse.ok && !arrete) {
          const recus = ((await reponse.json()) as { messages: MessageAffiche[] }).messages;
          // Le fil est relu en entier : on ne compte comme « du nouveau » que ce qui a réellement changé.
          const signature = recus.map((m) => `${m.id}:${m.misAJourLe}`).join("|");
          lecturesVides.current = signature === derniereSignature.current ? lecturesVides.current + 1 : 0;
          derniereSignature.current = signature;
          setMessages(recus);
        }
        else if (!reponse.ok && !arrete) setErreur("Ce fil n'est plus disponible.");
      } catch {
        // Réseau coupé : on réessaiera au prochain passage.
      }
      if (!arrete) minuteur = setTimeout(charger, delaiProchaineLecture(visible, lecturesVides.current));
    }
    charger();
    return () => {
      arrete = true;
      clearTimeout(minuteur);
    };
  }, [canalId, racineId]);

  // On descend au dernier message quand une réponse arrive.
  useEffect(() => {
    const el = defilement.current;
    if (el && messages && messages.length !== nbAvant.current) el.scrollTop = el.scrollHeight;
    nbAvant.current = messages?.length ?? 0;
  }, [messages]);

  async function reagir(messageId: string, emoji: string) {
    const resultat = await basculerReaction(messageId, emoji);
    if (resultat.reactions) setMessages((actuels) => actuels?.map((m) => (m.id === messageId ? { ...m, reactions: resultat.reactions! } : m)) ?? null);
    else if (resultat.erreur) setErreur(resultat.erreur);
  }

  async function supprimer(messageId: string) {
    if (!window.confirm("Supprimer ce message pour tout le monde ?")) return;
    const resultat = await supprimerMessage(messageId);
    if (resultat.erreur) return setErreur(resultat.erreur);
    setMessages((actuels) => actuels?.map((m) => (m.id === messageId ? { ...m, contenu: null, supprime: true, piece: null, reactions: [] } : m)) ?? null);
  }

  const reponses = (messages ?? []).filter((m) => m.id !== racineId).length;

  return (
    <aside aria-label="Fil de discussion" className="absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-card shadow-xl sm:w-96">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold">Fil de discussion</p>
          <p className="text-xs text-muted-foreground">{messages ? `${reponses} réponse${reponses > 1 ? "s" : ""}` : "Chargement…"}</p>
        </div>
        <button type="button" onClick={surFermer} aria-label="Fermer le fil" className="rounded p-1 hover:bg-muted">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div ref={defilement} className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {messages === null ? (
          <div className="m-auto">
            <Spinner />
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={m.id} className={m.id === racineId ? "mb-2 border-b border-border pb-2" : ""}>
              <LigneMessage
                message={m}
                precedent={messages[i - 1]}
                nouveauJour={i === 0 || cleJour(messages[i - 1].creeLe) !== cleJour(m.creeLe)}
                moiId={moiId}
                estAdmin={estAdmin}
                peutEcrire={peutEcrire}
                nomsConnus={nomsConnus}
                dansUnFil
                surReaction={reagir}
                surSupprimer={supprimer}
              />
            </div>
          ))
        )}
        {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
      </div>

      {peutEcrire ? (
        <Compositeur
          canalId={canalId}
          parentId={racineId}
          candidats={candidats}
          placeholder="Répondre dans le fil…"
          surEnvoye={(envoye) => setMessages((actuels) => fusionner(actuels ?? [], [envoye]))}
        />
      ) : null}
    </aside>
  );
}
