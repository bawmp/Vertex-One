import { and, eq, ne } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { dossierRH, entreprise, stagiaireAcademique, utilisateur } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";

/**
 * Une même personne ne travaille que dans UNE entreprise d'un même groupe (2026-11-05). Une adresse email ne peut déjà appartenir qu'à un seul
 * compte ; ce module reconnaît aussi la même personne sous une autre adresse : même téléphone (9 derniers chiffres) ou mêmes nom et date de
 * naissance. Les collaborateurs actifs (employé, manager, stagiaire professionnel, prestataire) et les stagiaires académiques en cours des AUTRES
 * entreprises du groupe comptent ; une fiche clôturée ou un compte désactivé ne bloque plus.
 *
 * Isolation : la vérification est une exception volontaire à l'étanchéité entre filiales, réduite au strict minimum. Elle lit chaque entreprise
 * du groupe DANS sa propre transaction (`avecEntreprise`, identifiants déduits de la base, jamais du navigateur) et ne renvoie qu'un OUI/NON :
 * ni le nom de l'entreprise, ni la personne, ni aucune donnée de l'autre entreprise ne sort de ce module.
 */
export const MESSAGE_DEJA_EMPLOYE_GROUPE = m("Cette personne est déjà employée dans une autre entreprise de votre groupe : elle ne peut l'être que dans une seule.");

export type IdentitePersonne = { nom?: string | null; telephone?: string | null; dateNaissance?: string | null; email?: string | null };

/** Les 9 derniers chiffres d'un numéro (avec ou sans +237, espaces ou points) ; null s'il y en a moins de 9. */
export function chiffresTelephone(t: string | null | undefined): string | null {
  const c = String(t ?? "").replace(/\D/g, "");
  return c.length >= 9 ? c.slice(-9) : null;
}

/** Nom comparable : sans accents ni casse ni ponctuation, mots triés (« Mbarga Jean » = « jean MBARGA »). Null s'il reste moins de deux mots. */
export function nomComparable(n: string | null | undefined): string | null {
  const mots = String(n ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return mots.length >= 2 ? mots.sort().join(" ") : null;
}

/** Règle pure : ces deux identités sont-elles la même personne ? Email, ou téléphone, ou nom + date de naissance (jamais le nom seul). */
export function memePersonne(a: IdentitePersonne, b: IdentitePersonne): boolean {
  const ea = a.email?.trim().toLowerCase();
  if (ea && ea === b.email?.trim().toLowerCase()) return true;
  const ta = chiffresTelephone(a.telephone);
  if (ta && ta === chiffresTelephone(b.telephone)) return true;
  const na = nomComparable(a.nom);
  return Boolean(na && a.dateNaissance && a.dateNaissance === b.dateNaissance && na === nomComparable(b.nom));
}

/** Entreprises du même groupe que `entrepriseId` (hors elle-même). `entreprise` n'a pas de RLS. */
async function autresEntreprisesDuGroupe(entrepriseId: string): Promise<string[]> {
  const [moi] = await db.select({ groupeId: entreprise.groupeId }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!moi?.groupeId) return [];
  const lignes = await db.select({ id: entreprise.id }).from(entreprise).where(and(eq(entreprise.groupeId, moi.groupeId), ne(entreprise.id, entrepriseId)));
  return lignes.map((l) => l.id);
}

/**
 * Cette personne est-elle déjà employée (ou en stage) dans une autre entreprise du groupe de `entrepriseId` ? Sans groupe, toujours faux.
 * Au moins un élément d'identité doit être fourni ; sans rien à comparer, faux.
 */
export async function dejaEmployeDansLeGroupe(entrepriseId: string, personne: IdentitePersonne): Promise<boolean> {
  if (!personne.email && !chiffresTelephone(personne.telephone) && !(nomComparable(personne.nom) && personne.dateNaissance)) return false;
  for (const autre of await autresEntreprisesDuGroupe(entrepriseId)) {
    const trouve = await avecEntreprise(autre, async (tx) => {
      // `utilisateur` reste en RLS permissive (Better-Auth) : le filtre sur l'entreprise est explicite. Le salaire n'est jamais lu.
      const collaborateurs = await tx
        .select({ nom: utilisateur.nomComplet, email: utilisateur.email, telephone: dossierRH.telephone, naissance: dossierRH.dateNaissance })
        .from(utilisateur)
        .leftJoin(dossierRH, eq(dossierRH.utilisateurId, utilisateur.id))
        .where(and(eq(utilisateur.entrepriseId, autre), eq(utilisateur.statut, "ACTIF"), ne(utilisateur.role, "CLIENT"), ne(utilisateur.role, "COMPTABLE")));
      if (collaborateurs.some((c) => memePersonne(personne, { nom: c.nom, email: c.email, telephone: c.telephone, dateNaissance: c.naissance }))) return true;
      const stagiaires = await tx
        .select({ nom: stagiaireAcademique.nom, email: stagiaireAcademique.email, telephone: stagiaireAcademique.telephone, naissance: stagiaireAcademique.dateNaissance })
        .from(stagiaireAcademique)
        .where(and(eq(stagiaireAcademique.entrepriseId, autre), eq(stagiaireAcademique.statut, "EN_COURS")));
      return stagiaires.some((s) => memePersonne(personne, { nom: s.nom, email: s.email, telephone: s.telephone, dateNaissance: s.naissance }));
    });
    if (trouve) return true;
  }
  return false;
}
