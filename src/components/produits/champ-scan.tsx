"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, ScanBarcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/contexte";

// L'API de lecture de codes-barres du navigateur n'est pas dans les types standards.
type DetecteurCode = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type FabriqueDetecteur = (new (options?: { formats?: string[] }) => DetecteurCode) & { getSupportedFormats?: () => Promise<string[]> };

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

/**
 * Champ de lecture d'un code-barres, de trois façons : une douchette (USB ou Bluetooth) tape le code puis « Entrée » dans le champ ; on peut
 * aussi le taper à la main ; et, sur les navigateurs qui savent lire un code (Chrome et Edge sur Android et ordinateur), le bouton
 * « Caméra » ouvre l'appareil photo. Chaque lecture appelle `onCode` ; le contrôle du code se fait toujours côté serveur.
 */
export function ChampScan({ onCode, placeholder, autoFocus = false }: { onCode: (code: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const t = useT();
  const [valeur, setValeur] = useState("");
  // La capacité du navigateur ne change pas pendant la visite ; côté serveur on suppose « non » pour que le premier affichage coïncide.
  const cameraPossible = useSyncExternalStore(
    () => () => {},
    () => "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia),
    () => false
  );
  const [cameraOuverte, setCameraOuverte] = useState(false);
  const [erreurCamera, setErreurCamera] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const flux = useRef<MediaStream | null>(null);
  // Le parent peut recréer sa fonction à chaque affichage : on la lit par référence pour ne pas relancer la caméra.
  const surCode = useRef(onCode);
  useEffect(() => {
    surCode.current = onCode;
  }, [onCode]);

  const arreterCamera = useCallback(() => {
    flux.current?.getTracks().forEach((piste) => piste.stop());
    flux.current = null;
    setCameraOuverte(false);
  }, []);

  useEffect(() => arreterCamera, [arreterCamera]);

  useEffect(() => {
    if (!cameraOuverte) return;
    let actif = true;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const Detecteur = (window as unknown as { BarcodeDetector: FabriqueDetecteur }).BarcodeDetector;
        const supportes = (await Detecteur.getSupportedFormats?.()) ?? FORMATS;
        const detecteur = new Detecteur({ formats: FORMATS.filter((f) => supportes.includes(f)) });
        const flot = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!actif) return flot.getTracks().forEach((p) => p.stop());
        flux.current = flot;
        if (video.current) {
          video.current.srcObject = flot;
          await video.current.play();
        }
        const boucle = async () => {
          if (!actif || !video.current) return;
          try {
            const trouves = await detecteur.detect(video.current);
            if (trouves[0]?.rawValue) {
              arreterCamera();
              surCode.current(trouves[0].rawValue);
              return;
            }
          } catch {
            /* image pas prête : on réessaie */
          }
          minuteur = setTimeout(boucle, 250);
        };
        boucle();
      } catch {
        setErreurCamera(t("Impossible d'ouvrir la caméra : autorisez-la dans votre navigateur, ou saisissez le code."));
        arreterCamera();
      }
    })();
    return () => {
      actif = false;
      if (minuteur) clearTimeout(minuteur);
    };
  }, [cameraOuverte, arreterCamera, t]);

  function envoyer() {
    const code = valeur.trim();
    if (!code) return;
    setValeur("");
    onCode(code);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            autoFocus={autoFocus}
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                envoyer();
              }
            }}
            placeholder={placeholder ?? t("Scannez ou tapez un code-barres")}
            aria-label={placeholder ?? t("Scannez ou tapez un code-barres")}
            className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9"
          />
        </div>
        <Button type="button" variant="outline" onClick={envoyer} disabled={!valeur.trim()}>
          {t("Chercher")}
        </Button>
        {cameraPossible ? (
          <Button type="button" variant="outline" onClick={() => { setErreurCamera(null); setCameraOuverte(true); }}>
            <Camera data-icon="inline-start" aria-hidden />
            {t("Caméra")}
          </Button>
        ) : null}
      </div>
      {!cameraPossible ? <p className="text-xs text-muted-foreground">{t("Avec une douchette, cliquez dans le champ puis scannez. La lecture par la caméra n'est pas disponible sur ce navigateur.")}</p> : null}
      {erreurCamera ? <p role="alert" className="text-sm text-destructive">{erreurCamera}</p> : null}
      {cameraOuverte ? (
        <div className="relative overflow-hidden rounded-lg border bg-black">
          <video ref={video} muted playsInline className="max-h-72 w-full object-cover" />
          <Button type="button" size="icon-sm" variant="secondary" className="absolute top-2 right-2" onClick={arreterCamera} aria-label={t("Fermer la caméra")}>
            <X className="size-4" aria-hidden />
          </Button>
          <p className="absolute right-0 bottom-0 left-0 bg-black/60 px-3 py-1 text-center text-xs text-white">{t("Placez le code-barres dans l'image")}</p>
        </div>
      ) : null}
    </div>
  );
}
