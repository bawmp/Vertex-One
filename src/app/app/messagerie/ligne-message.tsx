"use client";

import { useState } from "react";
import { MessageSquareReply, Paperclip, Reply, SmilePlus, Trash2 } from "lucide-react";
import type { MessageAffiche } from "@/lib/messagerie/acces";
import { decouperMentions, EMOJIS_REACTION } from "@/lib/messagerie/mentions";
import { formaterTaille } from "@/lib/one-form/fichiers";
import { AvatarPersonne } from "./avatar-personne";
import { cleJour, heure } from "./utilitaires-conversation";
import { useT } from "@/lib/i18n/contexte";

/** Pièce jointe d'un message : l'image s'affiche dans la conversation, les autres fichiers se téléchargent. */
function PieceJointe({ message, mien }: { message: MessageAffiche; mien: boolean }) {
  const piece = message.piece;
  if (!piece) return null;
  if (piece.image) {
    return (
      <a href={`/app/messagerie/fichier/${message.id}?apercu=1`} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir l'image ${piece.nom}`} className="group/image block overflow-hidden rounded-2xl border border-border shadow-sm">
        {/* Image protégée : servie par une route qui revérifie l'accès au canal, donc pas de <Image> optimisé. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/app/messagerie/fichier/${message.id}?apercu=1`} alt={piece.nom} loading="lazy" className="max-h-64 max-w-full object-cover transition-transform duration-300 group-hover/image:scale-[1.03]" />
      </a>
    );
  }
  return (
    <a
      href={`/app/messagerie/fichier/${message.id}`}
      className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-sm shadow-xs transition-all duration-150 hover:-translate-y-px hover:shadow-sm ${mien ? "border-primary/30 bg-primary/10 hover:bg-primary/15" : "border-border bg-background hover:bg-muted"}`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-marque-bleu-100 text-marque-bleu-700 dark:bg-marque-bleu-800/60 dark:text-marque-bleu-100">
        <Paperclip className="size-4" aria-hidden />
      </span>
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

/** Aperçu du message auquel celui-ci répond ; un clic ramène à l'original (jamais le texte d'un message supprimé). */
function BlocCitation({ citation, mien, surAllerA }: { citation: NonNullable<MessageAffiche["citation"]>; mien: boolean; surAllerA?: (messageId: string) => void }) {
  const t = useT();
  const contenu = (
    <>
      <span className="block truncate text-xs font-semibold">{citation.auteurNom}</span>
      <span className="block truncate text-xs italic opacity-80">
        {citation.supprime ? t("Message supprimé") : citation.extrait || (citation.piece ? t("Pièce jointe") : "")}
      </span>
    </>
  );
  const classes = `block w-full max-w-xs rounded-xl border-l-4 px-2.5 py-1.5 text-left ${mien ? "border-marque-orange bg-primary/10" : "border-marque-orange bg-muted"}`;
  return surAllerA ? (
    <button type="button" onClick={() => surAllerA(citation.id)} aria-label={t("Aller au message d'origine")} className={`${classes} transition-all duration-150 hover:-translate-y-px hover:shadow-sm`}>
      {contenu}
    </button>
  ) : (
    <div className={classes}>{contenu}</div>
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
  nouveau = false,
  surReaction,
  surSupprimer,
  surOuvrirFil,
  surCiter,
  surAllerA,
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
  /** Arrivé pendant que la conversation est ouverte : il apparaît avec une petite animation. */
  nouveau?: boolean;
  surReaction: (messageId: string, emoji: string) => void;
  surSupprimer: (messageId: string) => void;
  surOuvrirFil?: (messageId: string) => void;
  /** Répondre à CE message précis (citation dans la conversation). */
  surCiter?: (message: MessageAffiche) => void;
  /** Aller au message cité (défilement, ou ouverture de la zone de la conversation où il se trouve). */
  surAllerA?: (messageId: string) => void;
}) {
  const t = useT();
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  const m = message;
  const mien = m.auteurId === moiId;
  const memeAuteur = precedent && !nouveauJour && precedent.auteurId === m.auteurId && new Date(m.creeLe).getTime() - new Date(precedent.creeLe).getTime() < 5 * 60_000;
  const peutSupprimer = !m.supprime && (mien || estAdmin);
  const peutRepondre = !m.supprime && peutEcrire && !dansUnFil && surOuvrirFil;
  const peutCiter = !m.supprime && peutEcrire && !dansUnFil && surCiter;
  const tailleAvatar = dansUnFil ? "sm" : "md";

  const barreOutils =
    !m.supprime && (peutEcrire || peutSupprimer) ? (
      <div className="relative flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-popover px-1 py-0.5 opacity-0 shadow-sm transition-opacity duration-150 focus-within:opacity-100 group-hover/message:opacity-100">
        {peutEcrire ? (
          <button type="button" onClick={() => setSelecteurOuvert((v) => !v)} aria-label={t("Réagir")} aria-expanded={selecteurOuvert} className="rounded-full p-1 transition-colors hover:bg-muted">
            <SmilePlus className="size-4 text-muted-foreground" aria-hidden />
          </button>
        ) : null}
        {peutCiter ? (
          <button type="button" onClick={() => surCiter!(m)} aria-label={t("Répondre à ce message")} className="rounded-full p-1 transition-colors hover:bg-muted">
            <Reply className="size-4 text-muted-foreground" aria-hidden />
          </button>
        ) : null}
        {peutRepondre ? (
          <button type="button" onClick={() => surOuvrirFil!(m.id)} aria-label={t("Répondre dans un fil")} className="rounded-full p-1 transition-colors hover:bg-muted">
            <MessageSquareReply className="size-4 text-muted-foreground" aria-hidden />
          </button>
        ) : null}
        {peutSupprimer ? (
          <button type="button" onClick={() => surSupprimer(m.id)} aria-label={mien ? t("Supprimer ce message") : t("Supprimer ce message (modération)")} className="group/suppr rounded-full p-1 transition-colors hover:bg-destructive/10">
            <Trash2 className="size-3.5 text-muted-foreground transition-colors group-hover/suppr:text-destructive" aria-hidden />
          </button>
        ) : null}
        {selecteurOuvert ? (
          <div role="menu" aria-label={t("Choisir une réaction")} className={`absolute bottom-full z-10 mb-1.5 flex animate-in gap-0.5 rounded-full border border-border bg-popover px-1.5 py-1 shadow-lg fade-in zoom-in-95 slide-in-from-bottom-1 duration-150 ${mien ? "right-0" : "left-0"}`}>
            {EMOJIS_REACTION.map((emoji, i) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                style={{ animationDelay: `${i * 25}ms` }}
                onClick={() => {
                  setSelecteurOuvert(false);
                  surReaction(m.id, emoji);
                }}
                aria-label={`Réagir avec ${emoji}`}
                className="animate-chat-pop rounded-full px-1 text-lg leading-none transition-transform hover:-translate-y-0.5 hover:scale-125"
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
      <div
        className={`group/message flex gap-2 rounded-xl px-1 ${mien ? "flex-row-reverse" : ""} ${memeAuteur ? "mt-0.5" : "mt-3"} ${nouveau ? "animate-chat-entree" : ""} ${surbrillance ? "animate-chat-eclat ring-2 ring-marque-orange/40" : ""}`}
      >
        {!mien ? (
          memeAuteur ? (
            <span aria-hidden className={`shrink-0 ${dansUnFil ? "w-7" : "w-9"}`} />
          ) : (
            <AvatarPersonne nom={m.auteurNom} taille={tailleAvatar} className="mt-0.5" />
          )
        ) : null}

        <div className={`flex min-w-0 max-w-[88%] flex-col ${mien ? "items-end" : "items-start"}`}>
          {!memeAuteur ? (
            <p className="mb-0.5 px-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{mien ? t("Vous") : m.auteurNom}</span> · {heure(m.creeLe)}
            </p>
          ) : null}
          <div className={`flex items-center gap-1.5 ${mien ? "flex-row-reverse" : ""}`}>
            {barreOutils}
            <div className={`flex min-w-0 flex-col gap-1 ${mien ? "items-end" : "items-start"}`}>
              {m.supprime ? (
                <p className="rounded-2xl border border-dashed border-border px-3 py-1.5 text-sm italic text-muted-foreground">{t("Message supprimé")}</p>
              ) : (
                <>
                  {m.citation ? <BlocCitation citation={m.citation} mien={mien} surAllerA={surAllerA} /> : null}
                  <PieceJointe message={m} mien={mien} />
                  {m.contenu ? (
                    <p
                      className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        mien ? "rounded-br-md bg-gradient-to-br from-primary to-marque-bleu-700 text-primary-foreground shadow-sm" : "rounded-bl-md bg-muted ring-1 ring-border/60"
                      }`}
                    >
                      {mien ? m.contenu : <TexteAvecMentions texte={m.contenu} noms={nomsConnus} />}
                    </p>
                  ) : null}
                </>
              )}
              {m.reactions.length > 0 ? (
                <div className={`flex flex-wrap gap-1 ${mien ? "justify-end" : ""}`}>
                  {m.reactions.map((r) => (
                    <button
                      key={`${r.emoji}-${r.total}`}
                      type="button"
                      disabled={!peutEcrire}
                      onClick={() => surReaction(m.id, r.emoji)}
                      aria-label={`${r.emoji} ${r.total}${r.moi ? " (vous avez réagi)" : ""}`}
                      aria-pressed={r.moi}
                      className={`animate-chat-pop flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all duration-150 hover:-translate-y-px hover:shadow-sm ${r.moi ? "border-primary/50 bg-primary/10 font-medium" : "border-border bg-background hover:bg-muted"}`}
                    >
                      <span>{r.emoji}</span>
                      <span className="tabular-nums">{r.total}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {!dansUnFil && !m.supprime && m.nbReponses > 0 && surOuvrirFil ? (
                <button type="button" onClick={() => surOuvrirFil(m.id)} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15">
                  <MessageSquareReply className="size-3.5" aria-hidden />
                  {m.nbReponses > 1 ? t("{n} réponses", { n: m.nbReponses }) : t("{n} réponse", { n: m.nbReponses })}
                </button>
              ) : null}
            </div>
            {memeAuteur ? (
              <time dateTime={m.creeLe} className="shrink-0 self-end pb-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
                {heure(m.creeLe)}
              </time>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Séparateur de jour : « Aujourd'hui », « Hier », sinon la date complète. */
export function JourSeparateur({ iso }: { iso: string }) {
  const t = useT();
  // Instant fixé une fois pour toutes à l'affichage (un rendu doit rester pur).
  const [maintenant] = useState(() => Date.now());
  const cle = cleJour(iso);
  const libelle =
    cle === cleJour(new Date(maintenant).toISOString())
      ? t("Aujourd'hui")
      : cle === cleJour(new Date(maintenant - 86_400_000).toISOString())
        ? t("Hier")
        : new Intl.DateTimeFormat(t.locale, { dateStyle: "full", timeZone: "Africa/Douala" }).format(new Date(iso));
  return <p className="my-3 self-center rounded-full bg-background/80 px-3 py-0.5 text-xs font-medium capitalize text-muted-foreground shadow-xs ring-1 ring-border">{libelle}</p>;
}
