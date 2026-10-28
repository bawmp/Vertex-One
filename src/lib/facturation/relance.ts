import { eq, and, lt, notExists, notInArray, inArray, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { facture, contact, entreprise, promessePaiement } from "@/db/schema";
import { envoyerEmail } from "@/lib/email/client";
import { gabaritRelanceFacture } from "@/lib/email/gabarits";
import { enteteLogoEmail } from "@/lib/email/logo";
import { envoyerWhatsApp } from "@/lib/whatsapp/client";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { lireSolde } from "@/lib/facturation/solde";
import { journaliserEmailEnvoye } from "@/lib/crm/journaliser-email";

export type ResultatRelance = {
  factureId: string;
  numero: string;
  canal: "email" | "whatsapp";
  envoye: boolean;
  erreur?: string;
};

/**
 * Docs/palier-1-*, section 6, étape 6 — à appeler quotidiennement par la
 * file d'attente Postgres (graphile-worker, pas encore installée dans ce
 * projet : le déclenchement planifié est différé, cette fonction est prête
 * à être branchée dessus). Fait passer en EN_RETARD les factures dont
 * l'échéance est dépassée sans paiement complet, et envoie une relance par
 * email et par WhatsApp (voir src/lib/whatsapp/client.ts, Palier 6 — stub
 * documenté tant que WHATSAPP_ACCESS_TOKEN n'est pas configuré).
 *
 * Une facture qui a une promesse de paiement EN COURS (le client a annoncé une date) est ignorée ici : pas de relance qui
 * contredirait ce qu'il vient de dire. Voir src/lib/facturation/promesse.ts.
 *
 * Disponible pour tous les forfaits, y compris Starter — la relance ne
 * dépend pas de disponible("PAIEMENTS_EN_LIGNE") (docs/palier-1-*, section 6).
 */
export async function marquerFacturesEnRetard(tx: TransactionDrizzle, entrepriseId: string): Promise<ResultatRelance[]> {
  const enRetard = await tx
    .update(facture)
    .set({ statut: "EN_RETARD" })
    .where(
      and(
        eq(facture.entrepriseId, entrepriseId),
        lt(facture.dateEcheance, new Date()),
        notInArray(facture.statut, ["PAYEE", "ANNULEE", "EN_RETARD"]),
        // Promesse de paiement en cours : ni passage en retard ni relance tant qu'elle court. Quand elle échoit sans paiement,
        // traiterPromessesEchues() la déclare non tenue (juste avant ce balayage) et la relance repart normalement.
        notExists(tx.select({ un: sql`1` }).from(promessePaiement).where(and(eq(promessePaiement.factureId, facture.id), eq(promessePaiement.statut, "EN_COURS"))))
      )
    )
    .returning({ id: facture.id, numero: facture.numero, montantTTC: facture.montantTTC, dateEcheance: facture.dateEcheance, contactId: facture.contactId });

  if (enRetard.length === 0) return [];

  const [monEntreprise] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const idsContacts = enRetard.map((f) => f.contactId).filter((id): id is string => id !== null);
  const contactsTrouves = idsContacts.length > 0
    ? await tx.select({ id: contact.id, nom: contact.nom, email: contact.email, telephone: contact.telephone }).from(contact).where(inArray(contact.id, idsContacts))
    : [];
  const contactParId = new Map(contactsTrouves.map((c) => [c.id, c]));

  const resultats: ResultatRelance[] = [];
  const enteteLogo = await enteteLogoEmail(entrepriseId);

  for (const f of enRetard) {
    const leContact = f.contactId ? contactParId.get(f.contactId) : undefined;
    if (!leContact) continue;
    const reste = (await lireSolde(tx, f.id, f.montantTTC)).solde || f.montantTTC; // le montant RESTANT dû (des tranches ont pu être payées)

    if (leContact.email) {
      const { subject, html } = gabaritRelanceFacture({
        nomClient: leContact.nom,
        numeroFacture: f.numero,
        montantTTC: f.montantTTC,
        montantRestant: reste,
        dateEcheance: f.dateEcheance,
        nomEntreprise: monEntreprise.nom,
      });
      const { envoye, erreur } = await envoyerEmail({ to: leContact.email, subject, html: enteteLogo + html });
      if (envoye) {
        await journaliserEmailEnvoye(tx, { entrepriseId, contactId: leContact.id, auteurId: null, sujet: subject, souche: { destinataire: leContact.email, html: enteteLogo + html, type: "RELANCE" } });
      }
      resultats.push({ factureId: f.id, numero: f.numero, canal: "email", envoye, erreur });
    }

    // Palier 6 — src/lib/whatsapp/client.ts implémente réellement l'appel à
    // l'API Cloud WhatsApp Business, avec le même traitement "stub
    // documenté" que les autres intégrations externes tant que
    // WHATSAPP_ACCESS_TOKEN n'est pas configuré (voir CLAUDE.md).
    const { envoye: envoyeWhatsapp, erreur: erreurWhatsapp } = await envoyerWhatsApp(
      leContact.telephone,
      `Bonjour ${leContact.nom}, votre facture ${f.numero} d'un montant restant de ${formaterFCFA(reste)} est en retard de paiement. Merci de régulariser dès que possible.`
    );
    resultats.push({ factureId: f.id, numero: f.numero, canal: "whatsapp", envoye: envoyeWhatsapp, erreur: erreurWhatsapp });
  }

  return resultats;
}
