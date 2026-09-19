import { Coffee, GraduationCap, Heart, Rocket, Sparkles, Star, Sun, Users } from "lucide-react";

/**
 * Teintes vives qui se relaient d'une carte à l'autre. Les classes sont écrites
 * en entier (jamais assemblées) pour que Tailwind les détecte.
 */
export const TEINTES = [
  { fond: "bg-amber-50", pastille: "bg-amber-100 text-amber-600", barre: "bg-amber-400", puce: "bg-amber-100 text-amber-800" },
  { fond: "bg-sky-50", pastille: "bg-sky-100 text-sky-600", barre: "bg-sky-400", puce: "bg-sky-100 text-sky-800" },
  { fond: "bg-rose-50", pastille: "bg-rose-100 text-rose-600", barre: "bg-rose-400", puce: "bg-rose-100 text-rose-800" },
  { fond: "bg-violet-50", pastille: "bg-violet-100 text-violet-600", barre: "bg-violet-400", puce: "bg-violet-100 text-violet-800" },
  { fond: "bg-emerald-50", pastille: "bg-emerald-100 text-emerald-600", barre: "bg-emerald-400", puce: "bg-emerald-100 text-emerald-800" },
  { fond: "bg-orange-50", pastille: "bg-orange-100 text-orange-600", barre: "bg-orange-400", puce: "bg-orange-100 text-orange-800" },
  { fond: "bg-teal-50", pastille: "bg-teal-100 text-teal-600", barre: "bg-teal-400", puce: "bg-teal-100 text-teal-800" },
  { fond: "bg-fuchsia-50", pastille: "bg-fuchsia-100 text-fuchsia-600", barre: "bg-fuchsia-400", puce: "bg-fuchsia-100 text-fuchsia-800" },
] as const;

export const ICONES_ATOUTS = [Sparkles, Heart, Rocket, Coffee, GraduationCap, Users, Sun, Star] as const;

export const teinte = (indice: number) => TEINTES[indice % TEINTES.length];
export const iconeAtout = (indice: number) => ICONES_ATOUTS[indice % ICONES_ATOUTS.length];
