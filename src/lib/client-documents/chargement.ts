import { avecEntreprise } from "@/db/client";
import { trouverLien } from "@/lib/client-documents/liens";
import { recupererDevisPourClient, recupererFacturePourClient } from "@/lib/pdf/donnees";

export async function chargerDevisParJeton(jeton: string) {
  const lien = await trouverLien(jeton);
  if (!lien?.devisId) return null;
  const donnees = await avecEntreprise(lien.entrepriseId, (tx) => recupererDevisPourClient(tx, lien.entrepriseId, lien.devisId!));
  return donnees ? { ...donnees, entrepriseId: lien.entrepriseId } : null;
}

export async function chargerFactureParJeton(jeton: string) {
  const lien = await trouverLien(jeton);
  if (!lien?.factureId) return null;
  const donnees = await avecEntreprise(lien.entrepriseId, (tx) => recupererFacturePourClient(tx, lien.entrepriseId, lien.factureId!));
  return donnees ? { ...donnees, entrepriseId: lien.entrepriseId } : null;
}
