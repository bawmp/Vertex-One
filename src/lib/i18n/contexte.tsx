"use client";

import { createContext, useContext } from "react";
import { fr, type Dictionnaire } from "./dictionnaire";

const ContexteLangue = createContext<Dictionnaire>(fr);

/**
 * Posé une fois par layout (src/app/app/layout.tsx, src/app/portail/layout.tsx)
 * avec le dictionnaire déjà résolu côté serveur (traduire(utilisateurConnecte.langue))
 * — jamais recalculé côté client, pour rester cohérent avec le rendu serveur.
 */
export function LangueProvider({ dictionnaire, children }: { dictionnaire: Dictionnaire; children: React.ReactNode }) {
  return <ContexteLangue.Provider value={dictionnaire}>{children}</ContexteLangue.Provider>;
}

export function useTraduction(): Dictionnaire {
  return useContext(ContexteLangue);
}
