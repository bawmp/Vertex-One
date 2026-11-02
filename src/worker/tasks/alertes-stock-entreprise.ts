import type { Task } from "graphile-worker";
import { avecEntreprise } from "@/db/client";
import { traiterAlertesStock } from "@/lib/produits/alertes-stock";

type ChargeAlertesStock = { entrepriseId: string };

/**
 * Traite une seule entreprise — voir verifier-alertes-stock.ts. Passe par avecEntreprise() (rôle restreint, RLS active) comme tout code
 * applicatif : jamais les données d'une autre entreprise. Voir CLAUDE.md.
 */
const alertesStockEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeAlertesStock;
  const resultat = await avecEntreprise(entrepriseId, (tx) => traiterAlertesStock(tx, entrepriseId));
  if (resultat.produitsSignales > 0) helpers.logger.info(`Alerte de stock envoyée pour l'entreprise ${entrepriseId} : ${resultat.produitsSignales} produit(s), ${resultat.adresses} destinataire(s)`);
};

export default alertesStockEntreprise;
