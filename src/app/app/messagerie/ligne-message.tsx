"use client";

import { useState } from "react";
import { MessageSquareReply, Paperclip, SmilePlus, Trash2 } from "lucide-react";
import type { MessageAffiche } from "@/lib/messagerie/acces";
import { decouperMentions, EMOJIS_REACTION } from "@/lib/messagerie/mentions";
import { formaterTaille } from "@/lib/one-form/fichiers";
import { heure, jour } from "./utilitaires-conversation";
import { useT } from "@/lib/i18n/contexte";

/** Pièce jointe d'un message : l'image s'affiche dans la conversation, les autres fichiers se téléchargent. */
function PieceJointe({ message, mien }: { message: MessageAffiche; mien: boolean }) {
  const piece = message.piece;
  if (!piece) return null;
  if (piece.image) {
    return (
      <a href={`/app/messagerie/fichier/${message.id}?apercu=1`} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir l'image ${piece.nom}`}>
        {/* Image protégée : servie par une route qui revérifie l'accès au canal, donc pas de <Image> optimisé. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/app/messagerie/fichier/${message.id}?apercu=1`} alt={piece.nom} loading="lazy" className="max-h-64 max-w-full rounded-xl border border-border object-cover" />
      </a>
    );
  }
  return (
    <a
      href={`/app/messagerie/fichier/${message.id}`}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${mien ? "border-primary/30 bg-primary/10 hover:bg-primary/15" : "border-border bg-background hover:bg-muted"}`}
    >
      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate font-medium">{piece.nom}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{formaterTaille(piece.taille)}</span>
    </a>
  );
}

/** Texte d'un message avec les @mentions mises en évidence (React échappe tout : jamais de HTML interprété). */
function TexteAvecMentions({ texte, noms }: { texte: string; noms: string[] }) {
  return (
    <>
      {decouperMentions(texte, noms).map((morceau, i) =>
        morceau.mention ? (
          <span key={i} className="rounded bg-marque-orange/15 px-0.5 font-medium text-marque-orange-700 dark:text-marque-orange-300">
            {morceau.texte}
          </span>
        ) : (
          <span key={i}>{morceau.texte}</span>
        )
      )}
    </>
  );
}

export function LigneMessage({
  message,
  precedent,
  nouveauJour,
  moiId,
  estAdmin,
  peutEcrire,
  nomsConnus,
  dansUnFil = false,
  surbrillance = false,
  surReaction,
  surSupprimer,
  surOuvrirFil,
}: {
  message: MessageAffiche;
  /** Message précédent du même fil d'affichage : sert à regrouper les messages consécutifs d'un même auteur. */
  precedent?: MessageAffiche;
  nouveauJour: boolean;
  moiId: string;
  estAdmin: boolean;
  peutEcrire: boolean;
  /** Noms des personnes que l'on peut mentionner (et le sien) : ils sont mis en évidence dans le texte. */
  nomsConnus: string[];
  dansUnFil?: boolean;
  surbrillance?: boolean;
  surReaction: (messageId: string, emoji: string) => void;
  surSupprimer: (messageId: string) => void;
  surOuvrirFil?: (messageId: string) => void;
}) {
  const t = useT();
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  const m = message;
  const mien = m.auteurId === moiId;
  const memeAuteur = precedent && !nouveauJour && precedent.auteurId === m.auteurId && new Date(m.creeLe).getTime() - new Date(precedent.creeLe).getTime() < 5 * 60_000;
  const peutSupprimer = !m.supprime && (mien || estAdmin);
  const peutRepondre = !m.supprime && peutEcrire && !dansUnFil && surOuvrirFil;

  const barreOutils =
    !m.supprime && (peutEcrire || peutSupprimer) ? (
      <div className="relative flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
        {peutEcrire ? (
          <button type="button" onClick={() => setSelecteurOuvert((v) => !v)} aria-label={t("Réagir")} aria-expanded={selecteurOuvert} className="rounded p-0.5 hover:bg-muted">
            <SmilePlus className="size-4 text-muted-foreground" aria-hidden />
          </button>
        ) : null}
        {peutRepondre ? (
          <button type="button" onClick={() => surOuvrirFil!(m.id)} aria-label={t("Répondre dans un fil")} className="rounded p-0.5 hover:bg-muted">
            <MessageSquareReply className="size-4 text-muted-foreground" aria-hidden />
          </button>
        ) : null}
        {peutSupprimer ? (
          <button type="button" onClick={() => surSupprimer(m.id)} aria-label={mien ? t("Supprimer ce message") : t("Supprimer ce message (modération)")} className="rounded p-0.5 hover:bg-muted">
            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" aria-hidden />
          </button>
        ) : null}
        {selecteurOuvert ? (
          <div role="menu" aria-label={t("Choisir une réaction")} className={`absolute bottom-full z-10 mb-1 flex gap-0.5 rounded-full border border-border bg-popover px-1.5 py-1 shadow-md ${mien ? "right-0" : "left-0"}`}>
            {EMOJIS_REACTION.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={() => {
                  setSelecteurOuvert(false);
                  surReaction(m.id, emoji);
                }}
                aria-label={`Réagir avec ${emoji}`}
                className="rounded-full px-1 text-lg leading-none transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <div id={`message-${m.id}`} className="flex flex-col">
      {nouveauJour ? <JourSeparateur iso={m.creeLe} /> : null}
      <div className={`group/message flex flex-col rounded-lg ${mien ? "items-end" : "items-start"} ${memeAuteur ? "mt-0.5" : "mt-2"} ${surbrillance ? "bg-marque-orange/10 ring-2 ring-marque-orange/40" : ""}`}>
        {!memeAuteur ? (
          <p className="mb-0.5 px-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{mien ? t("Vous") : m.auteurNom}</span> · {heure(m.creeLe)}
          </p>
        ) : null}
        <div className={`flex max-w-[88%] items-center gap-1.5 ${mien ? "flex-row-reverse" : ""}`}>
          {barreOutils}
          <div className={`flex min-w-0 flex-col gap-1 ${mien ? "items-end" : "items-start"}`}>
            {m.supprime ? (
              <p className="rounded-2xl border border-dashed border-border px-3 py-1.5 text-sm italic text-muted-foreground">{t("Message supprimé")}</p>
            ) : (
              <>
                <PieceJointe message={m} mien={mien} />
                {m.contenu ? (
                  <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${mien ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"}`}>
                    {mien ? m.contenu : <TexteAvecMentions texte={m.contenu} noms={nomsConnus} />}
                  </p>
                ) : null}
              </>
            )}
            {m.reactions.length > 0 ? (
              <div className={`flex flex-wrap gap-1 ${mien ? "justify-end" : ""}`}>
                {m.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    disabled={!peutEcrire}
                    onClick={() => surReaction(m.id, r.emoji)}
                    aria-label={`${r.emoji} ${r.total}${r.moi ? " (vous avez réagi)" : ""}`}
                    aria-pressed={r.moi}
                    className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${r.moi ? "border-primary/50 bg-primary/10 font-medium" : "border-border bg-background hover:bg-muted"}`}
                  >
                    <span>{r.emoji}</span>
                    <span className="tabular-nums">{r.total}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {!dansUnFil && !m.supprime && m.nbReponses > 0 && surOuvrirFil ? (
              <button type="button" onClick={() => surOuvrirFil(m.id)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <MessageSquareReply className="size-3.5" aria-hidden />
                {m.nbReponses > 1 ? t("{n} réponses", { n: m.nbReponses }) : t("{n} réponse", { n: m.nbReponses })}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function JourSeparateur({ iso }: { iso: string }) {
  return <p className="my-3 self-center rounded-full bg-muted px-3 py-0.5 text-xs capitalize text-muted-foreground">{jour(iso)}</p>;
}
