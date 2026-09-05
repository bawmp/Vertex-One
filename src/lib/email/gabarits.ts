import { formaterFCFA } from "@/lib/facturation/calcul";

/**
 * Gabarit minimal — pas de mise en page HTML élaborée tant qu'un client
 * réel n'en a pas exprimé le besoin (voir esprit général du projet : ne
 * pas construire au-delà de ce qui est demandé).
 */
export function gabaritRelanceFacture({
  nomClient,
  numeroFacture,
  montantTTC,
  dateEcheance,
  nomEntreprise,
}: {
  nomClient: string;
  numeroFacture: string;
  montantTTC: number;
  dateEcheance: Date;
  nomEntreprise: string;
}): { subject: string; html: string } {
  const dateFormatee = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(dateEcheance);

  return {
    subject: `Relance — facture ${numeroFacture} en attente de paiement`,
    html: `
      <p>Bonjour ${nomClient},</p>
      <p>
        La facture <strong>${numeroFacture}</strong> d'un montant de <strong>${formaterFCFA(montantTTC)}</strong>,
        dont l'échéance était fixée au ${dateFormatee}, n'a pas encore été réglée.
      </p>
      <p>Merci de bien vouloir procéder au règlement dans les meilleurs délais.</p>
      <p>Cordialement,<br>${nomEntreprise}</p>
    `.trim(),
  };
}
