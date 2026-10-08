import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { echapperHtml } from "./modeles";

// Les messageries n'affichent pas le SVG (Gmail, Outlook le bloquent) : un logo SVG est simplement omis de l'email
// plutôt que de s'y afficher cassé. Le logo reste visible partout ailleurs dans l'application.
const FORMATS_AFFICHABLES_EN_EMAIL = /^image\/(png|jpe?g|gif|webp)$/i;

export type DonneesLogoEmail = { entrepriseId: string; nom: string; logoCleStockage: string | null; logoTypeMime: string | null };

/**
 * En-tête HTML portant le logo de l'entreprise émettrice, ou chaîne vide si elle n'en a pas (ou si le format n'est pas
 * affichable en email). L'image est servie par la route publique /logo/[entrepriseId] (un logo n'est pas une donnée
 * sensible) ; le nom de l'entreprise, saisi par un utilisateur, est échappé.
 */
export function construireEnteteLogo(d: DonneesLogoEmail, base: string): string {
  if (!d.logoCleStockage || !d.logoTypeMime || !FORMATS_AFFICHABLES_EN_EMAIL.test(d.logoTypeMime)) return "";
  const src = `${base.replace(/\/+$/, "")}/logo/${encodeURIComponent(d.entrepriseId)}`;
  return `<p style="margin:0 0 16px"><img src="${src}" alt="${echapperHtml(d.nom)}" style="display:block;max-height:64px;max-width:240px;height:auto;width:auto"></p>`;
}

/** Lit le logo de l'entreprise (table sans RLS, comme partout ailleurs pour `entreprise`) et construit l'en-tête. */
export async function enteteLogoEmail(entrepriseId: string): Promise<string> {
  try {
    const [e] = await db
      .select({ nom: entreprise.nom, logoCleStockage: entreprise.logoCleStockage, logoTypeMime: entreprise.logoTypeMime })
      .from(entreprise)
      .where(eq(entreprise.id, entrepriseId));
    if (!e) return "";
    return construireEnteteLogo({ entrepriseId, ...e }, process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
  } catch (erreur) {
    // Un logo manquant ne doit jamais empêcher l'envoi d'un devis ou d'une facture.
    console.error("[email] lecture du logo impossible :", erreur instanceof Error ? erreur.message : erreur);
    return "";
  }
}

/** Nom et logo d'une entreprise pour une page publique (signature, invitation) — table sans RLS. */
export async function identiteVisuellePublique(entrepriseId: string): Promise<{ nom: string; logoCleStockage: string | null } | null> {
  const [e] = await db.select({ nom: entreprise.nom, logoCleStockage: entreprise.logoCleStockage }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  return e ?? null;
}
