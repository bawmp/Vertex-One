// Palier 2, section 1 — le mot affiché pour Dossier/Projet change selon le
// secteur de l'entreprise (un artisan parle de "Chantier", un cabinet de
// "Mission"), sans que le modèle de données ou le code métier ne change.

export type VocabulaireEntree = { singulier: string; pluriel: string };

export const VOCABULAIRE_DOSSIER: Record<string, VocabulaireEntree> = {
  artisan: { singulier: "Fiche client", pluriel: "Fiches clients" },
  cabinet: { singulier: "Dossier", pluriel: "Dossiers" },
  agence: { singulier: "Compte client", pluriel: "Comptes clients" },
  generique: { singulier: "Dossier", pluriel: "Dossiers" },
};

export const VOCABULAIRE_PROJET: Record<string, VocabulaireEntree> = {
  artisan: { singulier: "Chantier", pluriel: "Chantiers" },
  cabinet: { singulier: "Mission", pluriel: "Missions" },
  agence: { singulier: "Projet", pluriel: "Projets" },
  generique: { singulier: "Projet", pluriel: "Projets" },
};

export function libelleDossier(secteurProfil: string): VocabulaireEntree {
  return VOCABULAIRE_DOSSIER[secteurProfil] ?? VOCABULAIRE_DOSSIER.generique;
}

export function libelleProjet(secteurProfil: string): VocabulaireEntree {
  return VOCABULAIRE_PROJET[secteurProfil] ?? VOCABULAIRE_PROJET.generique;
}
