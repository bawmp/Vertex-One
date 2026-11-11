import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { peutVoirSalaire } from "@/lib/rh/acces";
import { lireBulletin } from "@/lib/rh/paie";
import { rendreBulletinPDF } from "@/lib/rh/bulletin-pdf";

export const dynamic = "force-dynamic";

/**
 * PDF du bulletin de paie d'un mois. Réservé à l'Administrateur et à la personne payée (même règle que le salaire, `peutVoirSalaire`) :
 * un Manager ne le reçoit pas. Le bulletin est relu avec l'entreprise de la session, jamais un identifiant pris dans la requête.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string; paiementId: string }> }) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });
  if (!peut(utilisateurConnecte, "RH", "VOIR")) return new NextResponse("Introuvable", { status: 404 });
  const { id, paiementId } = await params;

  const ligne = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => lireBulletin(tx, id, paiementId));
  if (!ligne || !peutVoirSalaire(utilisateurConnecte, ligne.utilisateurId)) return new NextResponse("Introuvable", { status: 404 });
  // Un brouillon (pas encore envoyé) n'est lisible que de l'Administrateur, jamais de la personne payée.
  if (!ligne.paiement.envoyeLe && utilisateurConnecte.role !== "ADMIN") return new NextResponse("Introuvable", { status: 404 });

  const pdf = await rendreBulletinPDF(ligne);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="bulletin-${ligne.paiement.mois}.pdf"`, "Cache-Control": "private, no-store" } });
}
