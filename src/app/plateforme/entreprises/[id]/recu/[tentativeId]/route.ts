import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { dbPlateforme } from "@/db/plateforme";
import { entreprise, tentativePaiementAbonnement } from "@/db/schema";
import { estStaffPlateforme } from "@/lib/plateforme/acces";
import { rendreRecuAbonnementPDF } from "@/lib/pdf/rendu";

/**
 * Téléchargement du reçu d'abonnement depuis la Console interne (2026-09-23, demande explicite : le reçu doit être
 * consultable côté Vertex One, pas seulement reçu par email par le tenant). Un Route Handler, pas une page : le
 * layout de /plateforme (garde d'accès staff) ne s'applique qu'à l'arbre de rendu React, jamais à un route.ts —
 * la garde est donc revérifiée ici explicitement, même patron que les autres téléchargements protégés du produit.
 *
 * dbPlateforme (rôle plateforme_lecture, BYPASSRLS, lecture seule) : cette lecture est volontairement cross-tenant
 * (un membre du staff Vertex One, pas le tenant lui-même) — jamais avecEntreprise() ici, qui supposerait une
 * session tenant.
 *
 * Régénéré à la volée (pas stocké) : cohérent avec le reste du produit (devis/facture PDF). Le moyen de paiement
 * exact (opérateur Orange/MTN) n'est pas conservé sur la ligne elle-même — le reçu envoyé par email au moment de la
 * confirmation le précise, celui-ci reste générique ("Mobile Money").
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string; tentativeId: string }> }) {
  if (!(await estStaffPlateforme())) return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });

  const { id, tentativeId } = await params;

  const [tentative] = await dbPlateforme
    .select({ montant: tentativePaiementAbonnement.montant, statut: tentativePaiementAbonnement.statut, confirmeLe: tentativePaiementAbonnement.confirmeLe, entrepriseId: tentativePaiementAbonnement.entrepriseId })
    .from(tentativePaiementAbonnement)
    .where(eq(tentativePaiementAbonnement.id, tentativeId));

  if (!tentative || tentative.entrepriseId !== id || tentative.statut !== "CONFIRME" || !tentative.confirmeLe) {
    return NextResponse.json({ erreur: "reçu introuvable" }, { status: 404 });
  }

  const [monEntreprise] = await dbPlateforme.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, id));
  if (!monEntreprise) return NextResponse.json({ erreur: "entreprise introuvable" }, { status: 404 });

  const buffer = await rendreRecuAbonnementPDF({
    reference: tentativeId,
    nomEntreprisePayeuse: monEntreprise.nom,
    montant: tentative.montant,
    moyenPaiement: "Mobile Money",
    dateConfirmation: tentative.confirmeLe,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="recu-${tentativeId}.pdf"` },
  });
}
