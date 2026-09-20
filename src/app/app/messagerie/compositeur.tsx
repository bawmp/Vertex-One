"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { envoyerMessage } from "@/lib/actions/messagerie";
import type { MessageAffiche } from "@/lib/messagerie/acces";
import { attributAccept, CATEGORIES_FICHIER, formaterTaille, TAILLE_MAX_TOTAL_LIBELLE } from "@/lib/one-form/fichiers";
import type { PersonneMentionnable } from "./utilitaires-conversation";

// « @ » suivi de quelques lettres (un prénom, éventuellement un nom) juste avant le curseur.
const MOTIF_MENTION_EN_COURS = /(^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/u;

/**
 * Zone de saisie d'un message : texte, pièce jointe, et auto-complétion des @mentions (flèches + Entrée ou Tab).
 * Sert à la fois à la conversation et aux fils (`parentId`). Le serveur décide seul qui est réellement mentionné.
 */
export function Compositeur({
  canalId,
  parentId,
  candidats,
  placeholder,
  surEnvoye,
}: {
  canalId: string;
  parentId?: string;
  candidats: PersonneMentionnable[];
  placeholder: string;
  surEnvoye: (message: MessageAffiche) => void;
}) {
  const [texte, setTexte] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, startEnvoi] = useTransition();
  const [suggestions, setSuggestions] = useState<PersonneMentionnable[]>([]);
  const [indexSuggestion, setIndexSuggestion] = useState(0);
  const champTexte = useRef<HTMLTextAreaElement>(null);
  const champFichier = useRef<HTMLInputElement>(null);

  function mettreAJourSuggestions(valeur: string, curseur: number) {
    const avant = valeur.slice(0, curseur);
    const trouve = MOTIF_MENTION_EN_COURS.exec(avant);
    if (!trouve) return setSuggestions([]);
    const requete = trouve[2].toLowerCase();
    const filtrees = candidats.filter((c) => c.nom.toLowerCase().includes(requete)).slice(0, 6);
    setSuggestions(filtrees);
    setIndexSuggestion(0);
  }

  function choisirSuggestion(personne: PersonneMentionnable) {
    const zone = champTexte.current;
    const curseur = zone?.selectionStart ?? texte.length;
    const avant = texte.slice(0, curseur).replace(MOTIF_MENTION_EN_COURS, (_m, debut: string) => `${debut}@${personne.nom} `);
    const apres = texte.slice(curseur);
    setTexte(avant + apres);
    setSuggestions([]);
    requestAnimationFrame(() => {
      zone?.focus();
      zone?.setSelectionRange(avant.length, avant.length);
    });
  }

  function choisirFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setErreur(null);
    if (f && f.size > 4 * 1024 * 1024) {
      setErreur(`Le fichier dépasse la taille maximale de ${TAILLE_MAX_TOTAL_LIBELLE}.`);
      e.target.value = "";
      return;
    }
    setFichier(f);
  }

  function retirerFichier() {
    setFichier(null);
    if (champFichier.current) champFichier.current.value = "";
  }

  function envoyer() {
    const contenu = texte.trim();
    if ((!contenu && !fichier) || envoiEnCours) return;
    setErreur(null);
    const donnees = new FormData();
    donnees.set("canalId", canalId);
    if (parentId) donnees.set("parentId", parentId);
    donnees.set("contenu", contenu);
    if (fichier) donnees.set("fichier", fichier);
    startEnvoi(async () => {
      const resultat = await envoyerMessage(donnees);
      if (resultat.erreur || !resultat.message) return setErreur(resultat.erreur ?? "Le message n'a pas pu être envoyé.");
      setTexte("");
      setSuggestions([]);
      retirerFichier();
      surEnvoye(resultat.message);
    });
  }

  return (
    <div className="relative flex flex-col gap-1.5 border-t border-border p-3">
      {suggestions.length > 0 ? (
        <ul role="listbox" aria-label="Personnes à mentionner" className="absolute bottom-full left-3 z-20 mb-1 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === indexSuggestion}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // garde le focus dans le champ de saisie
                  choisirSuggestion(s);
                }}
                className={`w-full truncate px-3 py-1.5 text-left text-sm ${i === indexSuggestion ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              >
                @{s.nom}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
      {fichier ? (
        <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-sm">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate">{fichier.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formaterTaille(fichier.size)}</span>
          <button type="button" onClick={retirerFichier} aria-label="Retirer la pièce jointe">
            <X className="size-3.5 text-muted-foreground hover:text-destructive" aria-hidden />
          </button>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <input ref={champFichier} type="file" accept={attributAccept(CATEGORIES_FICHIER)} onChange={choisirFichier} className="hidden" aria-label="Joindre un fichier" />
        <Button type="button" variant="outline" size="icon" onClick={() => champFichier.current?.click()} disabled={envoiEnCours} aria-label="Joindre un fichier" title={`Image, PDF, Word ou Excel — ${TAILLE_MAX_TOTAL_LIBELLE} au plus`}>
          <Paperclip aria-hidden />
        </Button>
        <Textarea
          ref={champTexte}
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            mettreAJourSuggestions(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                return setIndexSuggestion((i) => (i + 1) % suggestions.length);
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                return setIndexSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                return choisirSuggestion(suggestions[indexSuggestion]);
              }
              if (e.key === "Escape") return setSuggestions([]);
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              envoyer();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={placeholder}
          className="max-h-32 min-h-9 flex-1 resize-none"
          aria-label={parentId ? "Votre réponse" : "Votre message"}
        />
        <Button type="button" onClick={envoyer} disabled={envoiEnCours || (!texte.trim() && !fichier)} aria-label={parentId ? "Envoyer la réponse" : "Envoyer le message"}>
          {envoiEnCours ? <Spinner /> : <Send data-icon="inline-start" aria-hidden />}
          Envoyer
        </Button>
      </div>
    </div>
  );
}
