import "server-only";
import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { documentRedige, entreprise } from "@/db/schema";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";
import { validerContenu, type ContenuRedaction } from "./contenu";
import { validerMiseEnPage, type MiseEnPage } from "./mise-en-page";
import { chargerIdentite } from "./identite";
import { rendreDocumentRedigePDF } from "./rendu-pdf";
import { rendreDocumentRedigeDocx } from "./rendu-docx";

export type FormatExport = "pdf" | "docx";

export const TYPES_MIME: Record<FormatExport, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Le module Documents (dont la rédaction fait partie) est-il disponible pour cette entreprise ? Même garde que la page Documents. */
export async function moduleDocumentsDisponible(tx: TransactionDrizzle, entrepriseId: string): Promise<boolean> {
  const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  return !!e && disponible(e, "CHAT_INTERNE");
}

/**
 * Document rédigé accessible à cet utilisateur pour cette action : droit sur le module DOCUMENTS (jamais le rôle seul —
 * l'utilisateur entier est passé, voir CLAUDE.md) ET portée sur `assigneAId` (propre, équipe ou tout, selon le rôle).
 * Un identifiant d'un document hors portée ou d'une autre entreprise (la RLS le masque déjà) renvoie null.
 */
export async function documentRedigeAutorise(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, id: string, action: "VOIR" | "MODIFIER" | "SUPPRIMER") {
  if (!peut(utilisateurConnecte, "DOCUMENTS", action)) return null;
  if (!(await moduleDocumentsDisponible(tx, utilisateurConnecte.entrepriseId))) return null;
  const [d] = await tx.select().from(documentRedige).where(eq(documentRedige.id, id));
  if (!d) return null;
  const visibles = await idsVisibles(tx, utilisateurConnecte, "DOCUMENTS");
  if (visibles !== "TOUT" && !visibles.includes(d.assigneAId)) return null;
  return d;
}

/** Nom de fichier sûr et lisible (jamais de séparateur de chemin, de guillemet ni de saut de ligne dans un en-tête HTTP). */
export function nomDeFichier(titre: string, format: FormatExport): string {
  const base = titre.replace(/[^\p{L}\p{N} ._()-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Document";
  return `${base}.${format}`;
}

/** Contenu et mise en page d'un document enregistré, revalidés à la lecture (une ligne ancienne ou altérée ne casse jamais l'export). */
export function lireDocument(d: typeof documentRedige.$inferSelect): { contenu: ContenuRedaction; miseEnPage: MiseEnPage } {
  const v = validerContenu(d.contenu);
  return { contenu: "contenu" in v ? v.contenu : { type: "doc", content: [{ type: "paragraph" }] }, miseEnPage: validerMiseEnPage(d.miseEnPage) };
}

/** Génère le fichier (PDF ou Word) d'un document. À appeler dans avecEntreprise(entrepriseId, …) pour l'identité de l'entreprise. */
export async function genererFichier(tx: TransactionDrizzle, entrepriseId: string, d: typeof documentRedige.$inferSelect, format: FormatExport): Promise<{ contenu: Buffer; nom: string; typeMime: string }> {
  const { contenu, miseEnPage } = lireDocument(d);
  const identite = await chargerIdentite(tx, entrepriseId);
  const props = { titre: d.titre, contenu, miseEnPage, identite, dateEdition: new Date() };
  const octets = format === "pdf" ? await rendreDocumentRedigePDF(props) : await rendreDocumentRedigeDocx(props);
  return { contenu: octets, nom: nomDeFichier(d.titre, format), typeMime: TYPES_MIME[format] };
}
