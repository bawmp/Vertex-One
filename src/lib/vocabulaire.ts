// Palier 2, section 1 — le mot affiché pour Dossier/Projet change selon le
// secteur de l'entreprise (un artisan parle de "Chantier", un cabinet de
// "Mission"), sans que le modèle de données ou le code métier ne change.

// Les mots sont marqués m() : traduits à l'affichage avec t(vocab.singulier) (voir src/lib/i18n/catalogue.ts).
import { m } from "@/lib/i18n/catalogue";

export type VocabulaireEntree = { singulier: string; pluriel: string };

export const VOCABULAIRE_DOSSIER: Record<string, VocabulaireEntree> = {
  artisan: { singulier: m("Fiche client"), pluriel: m("Fiches clients") },
  cabinet: { singulier: m("Dossier"), pluriel: m("Dossiers") },
  agence: { singulier: m("Compte client"), pluriel: m("Comptes clients") },
  generique: { singulier: m("Dossier"), pluriel: m("Dossiers") },
};

export const VOCABULAIRE_PROJET: Record<string, VocabulaireEntree> = {
  artisan: { singulier: m("Chantier"), pluriel: m("Chantiers") },
  cabinet: { singulier: m("Mission"), pluriel: m("Missions") },
  agence: { singulier: m("Projet"), pluriel: m("Projets") },
  generique: { singulier: m("Projet"), pluriel: m("Projets") },
};

export function libelleDossier(secteurProfil: string): VocabulaireEntree {
  return VOCABULAIRE_DOSSIER[secteurProfil] ?? VOCABULAIRE_DOSSIER.generique;
}

export function libelleProjet(secteurProfil: string): VocabulaireEntree {
  return VOCABULAIRE_PROJET[secteurProfil] ?? VOCABULAIRE_PROJET.generique;
}
