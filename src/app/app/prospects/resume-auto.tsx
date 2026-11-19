"use client";

import { Repeat } from "lucide-react";
import type { InfoAuto } from "@/lib/crm/sequence-prospects";
import { useT } from "@/lib/i18n/contexte";

/** Une phrase qui dit où en est la relance automatique d'un prospect (ou rien si elle n'est pas activée pour l'entreprise). */
export function phraseAuto(t: ReturnType<typeof useT>, auto: InfoAuto): string {
  const jour = auto.jour ? new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${auto.jour}T12:00:00Z`)) : "";
  switch (auto.action) {
    case "ENVOYER":
      return t("Prochain e-mail automatique : aujourd'hui (étape {etape} sur {n})", { etape: auto.etape, n: auto.nbEtapes });
    case "ATTENDRE":
      return t("Prochain e-mail automatique : le {date} (étape {etape} sur {n})", { date: jour, etape: auto.etape, n: auto.nbEtapes });
    case "TERMINEE":
      return t("Relance automatique terminée ({n} e-mails envoyés)", { n: auto.etape });
    case "ARRETEE":
      return auto.motif === "a_repondu" ? t("Relance automatique arrêtée : il a répondu") : t("Relance automatique arrêtée par l'équipe");
    case "SANS_EMAIL":
      return t("Pas d'adresse e-mail : aucune relance automatique");
    default:
      return "";
  }
}

export function ResumeAuto({ auto }: { auto: InfoAuto | null }) {
  const t = useT();
  if (!auto || auto.action === "NON_CONCERNE") return null;
  return (
    <span className="flex items-center gap-1">
      <Repeat className="size-3" aria-hidden />
      {phraseAuto(t, auto)}
    </span>
  );
}
