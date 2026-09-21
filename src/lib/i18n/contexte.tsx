"use client";

import { createContext, useContext, useMemo } from "react";
import type { Langue } from "@/lib/session";
import { fr, type Dictionnaire } from "./dictionnaire";
import { traducteur, type Traducteur } from "./catalogue";

const ContexteLangue = createContext<Dictionnaire>(fr);
const ContexteLangueCourante = createContext<Langue>("fr");

/**
 * Posé une fois par layout (src/app/layout.tsx pour tout le site, puis src/app/app/layout.tsx et
 * src/app/portail/layout.tsx avec la préférence de la personne connectée) — jamais recalculé côté client, pour rester
 * cohérent avec le rendu serveur. `dictionnaire` (menus, en-têtes d'accueil) est déjà résolu côté serveur ; `langue` sert
 * au catalogue de phrases (`useT`).
 */
export function LangueProvider({ dictionnaire, langue = "fr", children }: { dictionnaire: Dictionnaire; langue?: Langue; children: React.ReactNode }) {
  return (
    <ContexteLangueCourante.Provider value={langue}>
      <ContexteLangue.Provider value={dictionnaire}>{children}</ContexteLangue.Provider>
    </ContexteLangueCourante.Provider>
  );
}

export function useTraduction(): Dictionnaire {
  return useContext(ContexteLangue);
}

export function useLangue(): Langue {
  return useContext(ContexteLangueCourante);
}

/** Traducteur d'un composant client : `const t = useT();`. */
export function useT(): Traducteur {
  const langue = useLangue();
  return useMemo(() => traducteur(langue), [langue]);
}
