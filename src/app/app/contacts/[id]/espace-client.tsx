"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { definirEspaceClientContact } from "@/lib/actions/contact";
import { useT } from "@/lib/i18n/contexte";

/**
 * Adresse de l'espace où ce client suit sa procédure : une fois sa facture payée, il y est renvoyé. En général renseignée toute seule
 * par le site de l'entreprise ; à saisir ici pour un dossier créé avant, ou à la main. Seule une adresse https est acceptée.
 */
export function EspaceClientContact({ contactId, adresseInitiale, peutModifier }: { contactId: string; adresseInitiale: string | null; peutModifier: boolean }) {
  const t = useT();
  const [adresse, setAdresse] = useState(adresseInitiale ?? "");
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  function enregistrer() {
    setMessage(null);
    demarrer(async () => {
      const r = await definirEspaceClientContact(contactId, adresse);
      setMessage(r?.erreur ? { texte: r.erreur, erreur: true } : { texte: t("Adresse enregistrée."), erreur: false });
    });
  }

  if (!peutModifier) {
    return adresseInitiale ? (
      <a href={adresseInitiale} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline">
        <ExternalLink className="size-3.5" aria-hidden />
        {t("Ouvrir l'espace de suivi")}
      </a>
    ) : (
      <p className="text-sm text-muted-foreground">{t("Aucun espace de suivi renseigné.")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input type="url" inputMode="url" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="https://…" aria-label={t("Adresse de l'espace de suivi")} className="min-w-0 flex-1" />
        <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={enregistrer}>
          {enCours ? <Spinner /> : <Save data-icon="inline-start" aria-hidden />}
          {t("Enregistrer")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("Le client y est renvoyé à la fin de son parcours (facture payée). Adresse en https uniquement.")}</p>
      {message ? <p role={message.erreur ? "alert" : "status"} className={`text-xs ${message.erreur ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{message.texte}</p> : null}
    </div>
  );
}
