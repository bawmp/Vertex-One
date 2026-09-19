import { validerFichier, type ResultatValidation } from "@/lib/one-form/fichiers";

// Validation serveur du CV — jamais fait confiance au type MIME ni à
// l'extension envoyés par le navigateur : le vrai format est reconnu par les
// premiers octets (voir src/lib/one-form/fichiers.ts, même logique que le champ
// « Fichier » de One Form). Le formulaire de candidature est public et
// anonyme : tout fichier reçu est hostile jusqu'à preuve du contraire.
//
// 4 Mo : limite de corps de requête des fonctions Vercel (4,5 Mo), formulaire
// compris. L'ancienne limite de 5 Mo n'a jamais pu être atteinte en production.
export const TAILLE_MAX_CV_OCTETS = 4 * 1024 * 1024;

// PDF et Word moderne (DOCX) uniquement. L'ancien format .doc (OLE) est refusé :
// sa signature est identique à celle d'autres fichiers (.msi, .xls...) et ne
// permet pas de garantir qu'il s'agit bien d'un document.
const EXTENSIONS_CV_ACCEPTEES = ["pdf", "docx"];

export const TYPES_CONTRAT = ["CDI", "CDD", "Stage", "Alternance", "Freelance"] as const;

export async function validerCv(fichier: File): Promise<ResultatValidation> {
  if (fichier.size === 0) return { ok: false, erreur: "Sélectionnez un CV." };
  if (fichier.size > TAILLE_MAX_CV_OCTETS) return { ok: false, erreur: "Le CV ne doit pas dépasser 4 Mo." };

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const resultat = validerFichier({ taille: octets.length, octets, categories: ["PDF", "DOCUMENT"] });
  if (!resultat.ok) return { ok: false, erreur: "Le CV doit être un fichier PDF ou Word (.docx)." };
  if (!EXTENSIONS_CV_ACCEPTEES.includes(resultat.format.extension)) {
    return { ok: false, erreur: "Le CV doit être un fichier PDF ou Word (.docx)." };
  }
  return resultat;
}
