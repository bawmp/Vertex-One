import type { Task } from "graphile-worker";
import { and, eq, isNull, ne } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { connexionBoutique } from "@/db/schema";
import { synchroniserConnexion } from "@/lib/boutique/synchro";

type ChargeSynchro = { entrepriseId: string };

/**
 * Traite UNE entreprise : un tour de synchronisation pour chacune de ses boutiques connectées automatiquement (les connexions « fichier »
 * n'en ont pas). Passe par avecEntreprise() (rôle restreint, RLS active) comme tout code applicatif ; `synchroniserConnexion` ne lance
 * jamais d'exception (tout problème devient un message sur la connexion), donc une boutique en panne ne bloque pas les autres.
 */
const synchroniserBoutiquesEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeSynchro;
  const connexions = await avecEntreprise(entrepriseId, (tx) =>
    tx
      .select({ id: connexionBoutique.id })
      .from(connexionBoutique)
      .where(and(eq(connexionBoutique.entrepriseId, entrepriseId), isNull(connexionBoutique.archiveeLe), ne(connexionBoutique.type, "FICHIER")))
  );
  for (const c of connexions) {
    const r = await synchroniserConnexion(entrepriseId, c.id);
    if (r.erreur) helpers.logger.warn(`Boutique ${c.id} (entreprise ${entrepriseId}) : ${r.erreur}`);
    else if (r.enregistrees + r.annulees + r.stockEnvoye > 0) helpers.logger.info(`Boutique ${c.id} : ${r.enregistrees} commande(s), ${r.annulees} annulation(s), ${r.stockEnvoye} stock(s) envoyé(s)`);
  }
};

export default synchroniserBoutiquesEntreprise;
