"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enregistrerReglagesNotification, envoyerNotificationEssai } from "@/lib/actions/notifications-chat";
import { abonnerCetAppareil, appareilAbonneLocalement, desabonnerCetAppareil, pushPris } from "@/lib/messagerie/push-client";
import type { NiveauNotification } from "@/lib/messagerie/push";
import { useT } from "@/lib/i18n/contexte";

type Props = {
  niveauInitial: NiveauNotification;
  sonInitial: boolean;
  apercuInitial: boolean;
  /** Appareils de la personne déjà abonnés (côté serveur). */
  appareils: number;
  /** Clé publique VAPID ; null tant que le service de notification n'est pas configuré. */
  clePublique: string | null;
};

/**
 * « Mes notifications » : activer le push sur cet appareil, choisir ce qui déclenche une notification, le son, l'aperçu du
 * texte, et envoyer un essai. Chaque changement est enregistré tout de suite. Le canal en sourdine se règle depuis la
 * conversation (voir sourdine-canal.tsx).
 */
export function MesNotifications({ niveauInitial, sonInitial, apercuInitial, appareils, clePublique }: Props) {
  const t = useT();
  const [permission, setPermission] = useState<NotificationPermission | "indisponible">("indisponible");
  const [cetAppareil, setCetAppareil] = useState(false);
  const [niveau, setNiveau] = useState(niveauInitial);
  const [son, setSon] = useState(sonInitial);
  const [apercu, setApercu] = useState(apercuInitial);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [iphoneNonInstalle, setIphoneNonInstalle] = useState(false);

  // L'état du navigateur n'existe qu'après le montage (évite un écart d'hydratation).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- l'état du navigateur n'est connu qu'après le montage. */
    setPermission(pushPris() ? Notification.permission : "indisponible");
    setCetAppareil(appareilAbonneLocalement());
    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const installee = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIphoneNonInstalle(iphone && !installee);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function enregistrer(prochain: { niveau: NiveauNotification; son: boolean; apercu: boolean }) {
    setMessage(null);
    demarrer(async () => {
      const resultat = await enregistrerReglagesNotification(prochain);
      setMessage(resultat.erreur ?? t("Enregistré"));
    });
  }

  function activer() {
    if (!clePublique) return;
    setMessage(null);
    demarrer(async () => {
      let accord = Notification.permission;
      if (accord === "default") accord = await Notification.requestPermission();
      setPermission(accord);
      if (accord !== "granted") return setMessage(t("Notifications refusées : autorisez-les dans les réglages de votre navigateur."));
      const resultat = await abonnerCetAppareil(clePublique);
      if ("erreur" in resultat) return setMessage(resultat.erreur);
      setCetAppareil(true);
      setMessage(t("Notifications activées sur cet appareil."));
    });
  }

  function desactiver() {
    demarrer(async () => {
      await desabonnerCetAppareil();
      setCetAppareil(false);
      setMessage(t("Notifications désactivées sur cet appareil."));
    });
  }

  function essai() {
    setMessage(null);
    demarrer(async () => {
      const r = await envoyerNotificationEssai();
      if (r.erreur) return setMessage(r.erreur);
      setMessage(r.appareils ? t("Essai envoyé à {n} appareil(s).", { n: r.envoyes ?? 0 }) : t("Aucun appareil n'est encore abonné."));
    });
  }

  const niveaux: { valeur: NiveauNotification; libelle: string; aide: string }[] = [
    { valeur: "PRIVE_MENTIONS", libelle: t("Messages privés et mentions"), aide: t("Messages directs, groupes privés et @mentions (recommandé).") },
    { valeur: "TOUT", libelle: t("Tous les messages"), aide: t("Aussi chaque message des canaux ouverts à l'équipe.") },
    { valeur: "DIRECTS_MENTIONS", libelle: t("Directs et mentions"), aide: t("Seulement les messages directs et les @mentions.") },
    { valeur: "AUCUNE", libelle: t("Aucune notification"), aide: t("Le badge et l'email de secours restent actifs.") },
  ];

  const actif = cetAppareil || appareils > 0;

  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-sm font-medium">
        {actif ? <BellRing className="size-4 text-marque-orange" aria-hidden /> : <Bell className="size-4 text-muted-foreground" aria-hidden />}
        <span className="flex-1">{t("Mes notifications")}</span>
        <span className={`size-2 rounded-full ${cetAppareil ? "bg-emerald-500" : "bg-muted-foreground/30"}`} aria-hidden />
      </summary>

      <div className="flex flex-col gap-3 border-t border-border px-2.5 py-3 text-sm">
        {!clePublique ? (
          <p className="text-xs text-muted-foreground">{t("Les notifications push ne sont pas encore activées pour votre espace.")}</p>
        ) : permission === "indisponible" ? (
          <p className="text-xs text-muted-foreground">{t("Ce navigateur ne gère pas les notifications. Vous serez prévenu par email.")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {cetAppareil && permission === "granted" ? (
              <>
                <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3.5" aria-hidden />
                  {t("Activées sur cet appareil")}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={enCours} onClick={essai} className="flex-1">
                    {t("Envoyer un essai")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={enCours} onClick={desactiver}>
                    {t("Désactiver")}
                  </Button>
                </div>
              </>
            ) : (
              <Button type="button" size="sm" disabled={enCours || permission === "denied"} onClick={activer}>
                <Bell data-icon="inline-start" aria-hidden />
                {t("Activer sur cet appareil")}
              </Button>
            )}
            {permission === "denied" ? <p className="text-xs text-muted-foreground">{t("Notifications bloquées : autorisez-les dans les réglages de votre navigateur, puis revenez ici.")}</p> : null}
            {iphoneNonInstalle ? <p className="text-xs text-muted-foreground">{t("Sur iPhone : touchez Partager puis « Sur l'écran d'accueil », ouvrez Vertex One depuis l'icône, puis activez les notifications.")}</p> : null}
          </div>
        )}

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Me prévenir pour")}</legend>
          {niveaux.map((n) => (
            <label key={n.valeur} className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted/60">
              <input
                type="radio"
                name="niveau-notification"
                value={n.valeur}
                checked={niveau === n.valeur}
                onChange={() => {
                  setNiveau(n.valeur);
                  enregistrer({ niveau: n.valeur, son, apercu });
                }}
                className="mt-1 accent-[var(--marque-orange)]"
              />
              <span className="flex flex-col">
                <span className="font-medium">{n.libelle}</span>
                <span className="text-xs text-muted-foreground">{n.aide}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={son}
            onChange={(e) => {
              setSon(e.target.checked);
              enregistrer({ niveau, son: e.target.checked, apercu });
            }}
            className="accent-[var(--marque-orange)]"
          />
          {t("Jouer un son à l'arrivée d'un message")}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={apercu}
            onChange={(e) => {
              setApercu(e.target.checked);
              enregistrer({ niveau, son, apercu: e.target.checked });
            }}
            className="accent-[var(--marque-orange)]"
          />
          {t("Afficher le texte du message dans la notification")}
        </label>

        {message ? (
          <p className="text-xs text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </details>
  );
}
