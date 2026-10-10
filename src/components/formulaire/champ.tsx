"use client";

import { useId, useState, type ComponentProps } from "react";
import { Check, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/lib/i18n/contexte";

type ProprietesChamp = Omit<ComponentProps<"input">, "prefix" | "size"> & {
  label: string;
  erreur?: string | null;
  aide?: string;
  /** Le champ est correct : une coche apparaît à droite. */
  valide?: boolean;
  icone?: LucideIcon;
  /** Texte fixe devant la saisie (ex. « +237 »). */
  prefixe?: string;
};

/**
 * Champ à libellé flottant : le libellé occupe le champ vide, puis glisse en petit au-dessus dès qu'on tape ou qu'on
 * clique. Grande zone tactile (56 px), anneau de focus aux couleurs de la marque, coche animée quand la saisie est
 * correcte, message d'erreur annoncé aux lecteurs d'écran. Fonctionne en contrôlé (`value`) comme en non contrôlé
 * (`defaultValue`, utile avec une Server Action) ; le libellé reste un vrai <label for> (accessibilité, tests).
 * Un `type="password"` reçoit automatiquement un bouton afficher/masquer.
 */
export function Champ({ label, erreur, aide, valide, icone: Icone, prefixe, className, id, type, placeholder, ...proprietes }: ProprietesChamp) {
  const t = useT();
  const idAuto = useId();
  const identifiant = id ?? idAuto;
  const [visible, setVisible] = useState(false);
  const estMotDePasse = type === "password";
  const libelleFixe = Boolean(prefixe || placeholder);
  const idMessage = `${identifiant}-message`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="group relative">
        {Icone ? <Icone aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" /> : null}
        {prefixe ? <span className={cn("pointer-events-none absolute bottom-2 text-base text-muted-foreground tabular-nums", Icone ? "left-11" : "left-3.5")}>{prefixe}</span> : null}
        <input
          {...proprietes}
          id={identifiant}
          type={estMotDePasse && visible ? "text" : type}
          placeholder={placeholder ?? " "}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur || aide ? idMessage : undefined}
          className={cn(
            "peer h-14 w-full rounded-xl border border-input bg-background pt-5 pb-1.5 text-base text-foreground shadow-xs outline-none transition-all duration-200 placeholder:text-muted-foreground/50",
            "hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60",
            "aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15",
            Icone ? "pl-11" : "pl-3.5",
            prefixe ? (Icone ? "pl-[5.75rem]" : "pl-[4.25rem]") : null,
            estMotDePasse || valide ? "pr-12" : "pr-3.5",
            !libelleFixe && "placeholder:text-transparent"
          )}
        />
        <label
          htmlFor={identifiant}
          className={cn(
            "pointer-events-none absolute origin-left text-muted-foreground transition-all duration-200",
            Icone ? "left-11" : "left-3.5",
            prefixe ? (Icone ? "left-[5.75rem]" : "left-[4.25rem]") : null,
            libelleFixe
              ? "top-2 text-xs"
              : "top-[1.0625rem] text-base peer-focus:top-2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs",
            "peer-focus:text-primary peer-aria-invalid:text-destructive"
          )}
        >
          {label}
          {proprietes.required ? <span aria-hidden className="ml-0.5 text-marque-orange">*</span> : null}
        </label>

        {estMotDePasse ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t("Masquer le mot de passe") : t("Afficher le mot de passe")}
            aria-pressed={visible}
            className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            {visible ? <EyeOff className="size-4.5" aria-hidden /> : <Eye className="size-4.5" aria-hidden />}
          </button>
        ) : valide ? (
          <span aria-hidden className="absolute top-1/2 right-3 flex size-6 -translate-y-1/2 animate-in zoom-in-50 items-center justify-center rounded-full bg-emerald-500 text-white duration-200">
            <Check className="size-3.5" />
          </span>
        ) : null}
      </div>
      {erreur ? (
        <p id={idMessage} role="alert" className="animate-in fade-in slide-in-from-top-1 text-xs text-destructive duration-200">
          {erreur}
        </p>
      ) : aide ? (
        <p id={idMessage} className="text-xs text-muted-foreground">
          {aide}
        </p>
      ) : null}
    </div>
  );
}

type ProprietesZone = Omit<ComponentProps<"textarea">, "prefix"> & { label: string; erreur?: string | null; aide?: string };

/** Zone de texte à libellé flottant (même langage visuel que `Champ`), redimensionnable à la verticale seulement. */
export function ChampZone({ label, erreur, aide, className, id, ...proprietes }: ProprietesZone) {
  const idAuto = useId();
  const identifiant = id ?? idAuto;
  const idMessage = `${identifiant}-message`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="relative">
        <textarea
          {...proprietes}
          id={identifiant}
          placeholder=" "
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur || aide ? idMessage : undefined}
          className="peer min-h-24 w-full resize-y rounded-xl border border-input bg-background px-3.5 pt-6 pb-2 text-base shadow-xs outline-none transition-all duration-200 placeholder:text-transparent hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15"
        />
        <label
          htmlFor={identifiant}
          className="pointer-events-none absolute top-[1.0625rem] left-3.5 origin-left text-base text-muted-foreground transition-all duration-200 peer-focus:top-2 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs"
        >
          {label}
        </label>
      </div>
      {erreur ? (
        <p id={idMessage} role="alert" className="text-xs text-destructive">
          {erreur}
        </p>
      ) : aide ? (
        <p id={idMessage} className="text-xs text-muted-foreground">
          {aide}
        </p>
      ) : null}
    </div>
  );
}

type ProprietesSelect = Omit<ComponentProps<"select">, "prefix"> & { label: string; erreur?: string | null; aide?: string; icone?: LucideIcon };

/** Liste déroulante native (fiable au téléphone) habillée comme `Champ` : libellé fixe en petit, chevron, anneau de focus. */
export function ChampSelect({ label, erreur, aide, icone: Icone, className, id, children, ...proprietes }: ProprietesSelect) {
  const idAuto = useId();
  const identifiant = id ?? idAuto;
  const idMessage = `${identifiant}-message`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="group relative">
        {Icone ? <Icone aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" /> : null}
        <select
          {...proprietes}
          id={identifiant}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur || aide ? idMessage : undefined}
          className={cn(
            "peer h-14 w-full appearance-none rounded-xl border border-input bg-background pt-5 pr-10 pb-1.5 text-base shadow-xs outline-none transition-all duration-200",
            "hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15",
            Icone ? "pl-11" : "pl-3.5"
          )}
        >
          {children}
        </select>
        <label htmlFor={identifiant} className={cn("pointer-events-none absolute top-2 text-xs text-muted-foreground transition-colors peer-focus:text-primary", Icone ? "left-11" : "left-3.5")}>
          {label}
        </label>
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground transition-transform peer-focus:rotate-180 peer-focus:text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 8 5 5 5-5" />
        </svg>
      </div>
      {erreur ? (
        <p id={idMessage} role="alert" className="text-xs text-destructive">
          {erreur}
        </p>
      ) : aide ? (
        <p id={idMessage} className="text-xs text-muted-foreground">
          {aide}
        </p>
      ) : null}
    </div>
  );
}
