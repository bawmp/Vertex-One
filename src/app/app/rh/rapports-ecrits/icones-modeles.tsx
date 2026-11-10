import { ClipboardList, HardHat, Lightbulb, PenLine, Plane, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { ModeleRapport } from "@/lib/rh/rapport-modeles";

const ICONES: Record<ModeleRapport["icone"], LucideIcon> = {
  mission: Plane,
  travaux: HardHat,
  activite: ClipboardList,
  incident: TriangleAlert,
  demande: Lightbulb,
  libre: PenLine,
};

/** Dégradés aux couleurs de la charte (bleu marine, orange) : jamais une couleur en dur. */
const TEINTES: Record<ModeleRapport["teinte"], string> = {
  bleu: "from-primary to-marque-bleu-700 shadow-primary/25",
  orange: "from-marque-orange-500 to-marque-orange-700 shadow-marque-orange-600/25",
  neutre: "from-muted-foreground/80 to-muted-foreground shadow-black/10",
};

/** Pastille d'icône d'un modèle de rapport : carré arrondi dégradé, icône blanche. */
export function PastilleModele({ modele, taille = "moyen", className }: { modele: Pick<ModeleRapport, "icone" | "teinte">; taille?: "petit" | "moyen" | "grand"; className?: string }) {
  const Icone = ICONES[modele.icone];
  const dimensions = taille === "petit" ? "size-9 rounded-xl" : taille === "grand" ? "size-14 rounded-2xl" : "size-11 rounded-2xl";
  const icone = taille === "petit" ? "size-4.5" : taille === "grand" ? "size-7" : "size-5.5";
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center bg-linear-to-br text-white shadow-md", dimensions, TEINTES[modele.teinte], className)}>
      <Icone className={icone} />
    </span>
  );
}
