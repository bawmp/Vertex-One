import { m } from "@/lib/i18n/catalogue";

/**
 * Modèles de rapport (2026-11-10) : chaque modèle est une liste de rubriques à remplir (mission, travaux, activité, incident, demande,
 * autre). Code pur, importé par l'écran (affichage des rubriques) ET par le serveur (validation) : le serveur ne retient que les rubriques
 * du modèle choisi, jamais une rubrique inventée par le navigateur. Les libellés sont marqués `m()` et traduits à l'affichage.
 */

export type TypeRubrique = "ligne" | "texte";

export type Rubrique = {
  cle: string;
  libelle: string;
  aide?: string;
  type: TypeRubrique;
  requis?: boolean;
};

export type ModeleRapport = {
  id: string;
  libelle: string;
  description: string;
  /** Début d'objet proposé (la personne le complète). */
  objetPropose: string;
  /** Nom de l'icône (résolu côté écran) et teinte de la charte : jamais une couleur en dur. */
  icone: "mission" | "travaux" | "activite" | "incident" | "demande" | "libre";
  teinte: "bleu" | "orange" | "neutre";
  rubriques: Rubrique[];
};

export const MODELES_RAPPORT: ModeleRapport[] = [
  {
    id: "MISSION",
    libelle: m("Rapport de mission"),
    description: m("Un déplacement, une visite ou une tâche confiée : objectif, déroulement, résultats."),
    objetPropose: m("Mission — "),
    icone: "mission",
    teinte: "bleu",
    rubriques: [
      { cle: "lieu", libelle: m("Lieu"), type: "ligne" },
      { cle: "periode", libelle: m("Période (dates)"), type: "ligne" },
      { cle: "objectif", libelle: m("Objectif de la mission"), aide: m("Pourquoi cette mission, ce qu'on attendait d'elle."), type: "texte", requis: true },
      { cle: "deroulement", libelle: m("Déroulement"), aide: m("Ce que vous avez fait, étape par étape."), type: "texte", requis: true },
      { cle: "resultats", libelle: m("Résultats obtenus"), type: "texte", requis: true },
      { cle: "difficultes", libelle: m("Difficultés rencontrées"), type: "texte" },
      { cle: "suites", libelle: m("Suites à donner"), aide: m("Ce qu'il reste à faire, et par qui."), type: "texte" },
    ],
  },
  {
    id: "TRAVAUX",
    libelle: m("Rapport de travaux"),
    description: m("Un chantier ou une intervention : travaux réalisés, matériel, avancement, problèmes."),
    objetPropose: m("Travaux — "),
    icone: "travaux",
    teinte: "orange",
    rubriques: [
      { cle: "site", libelle: m("Site ou chantier"), type: "ligne" },
      { cle: "periode", libelle: m("Période (dates)"), type: "ligne" },
      { cle: "travaux", libelle: m("Travaux réalisés"), type: "texte", requis: true },
      { cle: "materiel", libelle: m("Matériel et fournitures utilisés"), type: "texte" },
      { cle: "avancement", libelle: m("Avancement"), aide: m("Par exemple : 60 % terminé."), type: "ligne" },
      { cle: "problemes", libelle: m("Problèmes constatés"), type: "texte" },
      { cle: "prevision", libelle: m("Prochaines étapes"), type: "texte" },
    ],
  },
  {
    id: "ACTIVITE",
    libelle: m("Rapport d'activité"),
    description: m("Le point de votre journée, de votre semaine ou de votre mois."),
    objetPropose: m("Activité — "),
    icone: "activite",
    teinte: "bleu",
    rubriques: [
      { cle: "periode", libelle: m("Période concernée"), aide: m("Par exemple : semaine du 10 au 14 novembre."), type: "ligne", requis: true },
      { cle: "realise", libelle: m("Ce qui a été réalisé"), type: "texte", requis: true },
      { cle: "encours", libelle: m("Ce qui est en cours"), type: "texte" },
      { cle: "prevu", libelle: m("Ce qui est prévu ensuite"), type: "texte" },
      { cle: "points", libelle: m("Points d'attention"), type: "texte" },
    ],
  },
  {
    id: "INCIDENT",
    libelle: m("Signalement d'incident"),
    description: m("Un problème, une panne ou un accident à faire remonter rapidement."),
    objetPropose: m("Incident — "),
    icone: "incident",
    teinte: "orange",
    rubriques: [
      { cle: "quand", libelle: m("Date et heure"), type: "ligne" },
      { cle: "lieu", libelle: m("Lieu"), type: "ligne" },
      { cle: "description", libelle: m("Ce qui s'est passé"), type: "texte", requis: true },
      { cle: "consequences", libelle: m("Conséquences"), type: "texte" },
      { cle: "mesures", libelle: m("Mesures prises ou proposées"), type: "texte" },
    ],
  },
  {
    id: "DEMANDE",
    libelle: m("Demande ou proposition"),
    description: m("Un besoin, une idée d'amélioration ou une demande à soumettre à votre responsable."),
    objetPropose: m("Demande — "),
    icone: "demande",
    teinte: "bleu",
    rubriques: [
      { cle: "besoin", libelle: m("Votre demande ou proposition"), type: "texte", requis: true },
      { cle: "justification", libelle: m("Pourquoi c'est utile"), type: "texte" },
      { cle: "delai", libelle: m("Délai souhaité"), type: "ligne" },
    ],
  },
  {
    id: "LIBRE",
    libelle: m("Autre rapport"),
    description: m("Une page blanche pour tout ce qui ne rentre pas dans les autres modèles."),
    objetPropose: "",
    icone: "libre",
    teinte: "neutre",
    rubriques: [{ cle: "contenu", libelle: m("Votre rapport"), type: "texte", requis: true }],
  },
];

export const MODELE_PAR_DEFAUT = "LIBRE";

export function trouverModele(id: string | null | undefined): ModeleRapport | undefined {
  return MODELES_RAPPORT.find((x) => x.id === id);
}

export const LONGUEUR_MAX_RUBRIQUE_LIGNE = 200;
export const LONGUEUR_MAX_RUBRIQUE_TEXTE = 5000;
/** Total des rubriques d'un rapport : même plafond que le texte d'un rapport libre. */
export const LONGUEUR_MAX_TOTAL = 10_000;

export type SectionSaisie = { cle: string; texte: string };

export type ResultatValidation = { ok: true; sections: SectionSaisie[]; contenu: string } | { ok: false; erreur: "MODELE" | "REQUIS" | "TROP_LONG"; rubrique?: string };

/**
 * Valide la saisie d'un rapport contre son modèle. Seules les rubriques du modèle sont retenues (une clé inconnue envoyée par le
 * navigateur est ignorée), les rubriques vides écartées, et `contenu` est le texte complet (« Libellé : texte »), conservé pour
 * l'aperçu et les anciens écrans.
 */
export function validerRapport(modeleId: string, saisie: Record<string, string | undefined>): ResultatValidation {
  const modele = trouverModele(modeleId);
  if (!modele) return { ok: false, erreur: "MODELE" };

  const sections: SectionSaisie[] = [];
  let total = 0;
  for (const r of modele.rubriques) {
    const texte = (saisie[r.cle] ?? "").trim();
    if (!texte) {
      if (r.requis) return { ok: false, erreur: "REQUIS", rubrique: r.cle };
      continue;
    }
    if (texte.length > (r.type === "ligne" ? LONGUEUR_MAX_RUBRIQUE_LIGNE : LONGUEUR_MAX_RUBRIQUE_TEXTE)) return { ok: false, erreur: "TROP_LONG", rubrique: r.cle };
    total += texte.length;
    sections.push({ cle: r.cle, texte });
  }
  if (total > LONGUEUR_MAX_TOTAL) return { ok: false, erreur: "TROP_LONG" };

  const contenu = sections
    .map((s) => {
      const r = modele.rubriques.find((x) => x.cle === s.cle)!;
      return modele.id === "LIBRE" ? s.texte : `${r.libelle} :\n${s.texte}`;
    })
    .join("\n\n");
  return { ok: true, sections, contenu };
}
