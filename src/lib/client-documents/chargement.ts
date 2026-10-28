import { avecEntreprise } from "@/db/client";
import { trouverLien } from "@/lib/client-documents/liens";
import { recupererDevisPourClient, recupererFacturePourClient } from "@/lib/pdf/donnees";
import { promesseEnCours } from "@/lib/facturation/promesse";

export async function chargerDevisParJeton(jeton: string) {
  const lien = await trouverLien(jeton);
  if (!lien?.devisId) return null;
  const donnees = await avecEntreprise(lien.entrepriseId, (tx) => recupererDevisPourClient(tx, lien.entrepriseId, lien.devisId!));
  return donnees ? { ...donnees, entrepriseId: lien.entrepriseId } : null;
}

export async function chargerFactureParJeton(jeton: string) {
  const lien = await trouverLien(jeton);
  if (!lien?.factureId) return null;
  const resultat = await avecEntreprise(lien.entrepriseId, async (tx) => {
    const donnees = await recupererFacturePourClient(tx, lien.entrepriseId, lien.factureId!);
    if (!donnees) return null;
    // Promesse de paiement en cours (celle que le client a pu annoncer lui-même, ou que l'équipe a notée) : seules la date et le
    // montant sont exposées sur la page publique, jamais la note interne ni l'auteur.
    const promesse = await promesseEnCours(tx, lien.factureId!);
    return { ...donnees, promesse: promesse ? { datePromise: promesse.datePromise, montant: promesse.montant } : null };
  });
  return resultat ? { ...resultat, entrepriseId: lien.entrepriseId } : null;
}
