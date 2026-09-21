"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/contexte";

type Message = { role: "user" | "assistant"; content: string };

const MESSAGE_ACCUEIL: Message = {
  role: "assistant",
  content: "Bonjour, je suis Kyria 👋 Posez-moi une question sur Vertex One — tarifs, modules, essai gratuit...",
};

/**
 * Bulle de chat flottante, montée une seule fois dans le layout du site
 * vitrine (visible sur toutes les pages, jamais dans /app). Historique en
 * mémoire uniquement (pas de persistance en base pour cette V1 — un visiteur
 * anonyme sans compte n'a pas besoin de retrouver sa conversation après un
 * rechargement). Couleur d'accent violette, volontairement distincte de
 * l'emerald de marque, pour identifier Kyria comme une brique "assistant IA"
 * à part — même logique que src/lib/kyria/contexte.ts, pensée pour être
 * réutilisée telle quelle dans l'application plus tard.
 */
export function KyriaChat() {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const [messages, setMessages] = useState<Message[]>([MESSAGE_ACCUEIL]);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const finDesMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finDesMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ouvert]);

  async function envoyer() {
    const contenu = saisie.trim();
    if (!contenu || enCours) return;

    const nouveauxMessages: Message[] = [...messages, { role: "user", content: contenu }];
    setMessages(nouveauxMessages);
    setSaisie("");
    setEnCours(true);

    try {
      const reponse = await fetch("/api/kyria", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nouveauxMessages }),
      });
      const donnees = await reponse.json();
      setMessages((precedents) => [
        ...precedents,
        { role: "assistant", content: donnees.reponse ?? donnees.erreur ?? "Une erreur inattendue est survenue." },
      ]);
    } catch {
      setMessages((precedents) => [...precedents, { role: "assistant", content: "Kyria est momentanément injoignable — réessayez dans un instant." }]);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-20 flex flex-col items-end gap-3">
      {ouvert ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 zoom-in-95 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl duration-300">
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4.5" aria-hidden />
              <span className="font-semibold">{t("Kyria")}</span>
            </div>
            <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/15" aria-label={t("Fermer")} onClick={() => setOuvert(false)}>
              <X aria-hidden />
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <p
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    message.role === "user" ? "bg-violet-600 text-white" : "bg-muted text-foreground"
                  }`}
                >
                  {message.content}
                </p>
              </div>
            ))}
            {enCours ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2 text-sm text-muted-foreground">
                  <Spinner />
                  {t("Kyria réfléchit…")}
                </div>
              </div>
            ) : null}
            <div ref={finDesMessages} />
          </div>

          <div className="flex items-end gap-2 border-t border-border p-3">
            <Textarea
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  envoyer();
                }
              }}
              placeholder={t("Posez votre question…")}
              rows={1}
              className="max-h-24 min-h-9 resize-none"
            />
            <Button size="icon" disabled={enCours || !saisie.trim()} onClick={envoyer} aria-label={t("Envoyer")}>
              <Send aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      <Button
        size="icon-lg"
        className={`rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg transition-transform hover:-translate-y-0.5 hover:from-violet-400 hover:to-indigo-400 ${ouvert ? "" : "animate-pulse"}`}
        aria-label={ouvert ? t("Fermer Kyria") : t("Discuter avec Kyria")}
        onClick={() => setOuvert((v) => !v)}
      >
        {ouvert ? <X aria-hidden /> : <Sparkles aria-hidden />}
      </Button>
    </div>
  );
}
