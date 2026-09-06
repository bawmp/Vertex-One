/**
 * API Cloud WhatsApp Business (Meta, direct) — même traitement que
 * Migadu/NotchPay/Resend/le prestataire de chat avant configuration (voir
 * CLAUDE.md) : le code réel est en place, mais aucun appel réseau n'a lieu
 * tant que WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID ne sont pas
 * configurés — un avertissement clair plutôt qu'un échec silencieux.
 *
 * Message texte simple (pas de modèle pré-approuvé Meta) : suffisant pour un
 * MVP, mais Meta exige un modèle de message approuvé pour initier une
 * conversation en dehors de la fenêtre de 24h suivant le dernier message du
 * client — limite réelle de l'API, pas une simplification de ce projet.
 */
export async function envoyerWhatsApp(telephone: string, message: string): Promise<{ envoye: boolean; erreur?: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.warn(`[whatsapp] WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID non configurés — message non envoyé (destinataire: ${telephone})`);
    return { envoye: false, erreur: "WhatsApp non configuré" };
  }

  try {
    const reponse = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telephone.replace(/[^\d+]/g, ""),
        type: "text",
        text: { body: message },
      }),
    });

    if (!reponse.ok) {
      const detail = await reponse.text();
      console.error(`[whatsapp] échec d'envoi à ${telephone} :`, detail);
      return { envoye: false, erreur: `Échec de l'API WhatsApp (${reponse.status})` };
    }

    return { envoye: true };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    console.error(`[whatsapp] erreur réseau vers ${telephone} :`, message);
    return { envoye: false, erreur: message };
  }
}
