/** Compte ElyonPay propre à chaque entreprise : les paiements Mobile Money de ses clients arrivent directement chez elle. */
export const PAIEMENT_COMPTE: Record<string, string> = {
  // Fiche facture (équipe)
  "ElyonPay a refusé la clé de votre compte : reconnectez-le pour que vos clients puissent payer en ligne.":
    "ElyonPay rejected your account key: reconnect it so your customers can pay online.",
  "Paiement en ligne non activé : branchez votre compte ElyonPay pour que vos clients puissent payer par Mobile Money.":
    "Online payment is not enabled: connect your ElyonPay account so your customers can pay by Mobile Money.",
  "Brancher mon compte": "Connect my account",
  "Demandez à l'Administrateur de le brancher (Paramètres).": "Ask the Administrator to connect it (Settings).",

  // Menu et page de réglages
  "Paiement Mobile Money": "Mobile Money payment",
  "Vos clients paient leurs factures par Orange Money ou MTN MoMo, et l'argent arrive directement sur VOTRE compte ElyonPay.":
    "Your customers pay their invoices by Orange Money or MTN MoMo, and the money goes straight to YOUR ElyonPay account.",
  "Compte branché": "Account connected",
  "À reconnecter": "Needs reconnecting",
  "Non branché": "Not connected",
  "Comment ça marche": "How it works",
  "• L'argent va directement sur votre compte ElyonPay : Vertex One ne le reçoit jamais et ne le détient jamais.":
    "• The money goes straight to your ElyonPay account: Vertex One never receives it and never holds it.",
  "• Les frais d'ElyonPay et les délais de reversement vers votre téléphone ou votre banque dépendent de votre contrat avec ElyonPay, pas de Vertex One.":
    "• ElyonPay's fees and the payout times to your phone or bank depend on your contract with ElyonPay, not on Vertex One.",
  "• Votre client paie exactement le montant de sa facture, sans frais ajoutés.": "• Your customer pays exactly the invoice amount, with no added fees.",
  "• Vertex One enregistre le paiement dans votre comptabilité dès qu'ElyonPay le confirme, et prévient votre client et vous par e-mail.":
    "• Vertex One records the payment in your accounting as soon as ElyonPay confirms it, and notifies your customer and you by email.",
  "• Sans compte branché, vos clients ne voient pas « Payer maintenant » : vous pointez les règlements à la main (espèces, virement, Mobile Money reçu directement).":
    "• Without a connected account, your customers do not see “Pay now”: you record payments by hand (cash, transfer, Mobile Money received directly).",
  "Le paiement en ligne est suspendu : ElyonPay a refusé la clé de ce compte (clé régénérée ou révoquée ?). Entrez la nouvelle clé ci-dessous pour le rétablir.":
    "Online payment is suspended: ElyonPay rejected this account's key (regenerated or revoked?). Enter the new key below to restore it.",
  "Identifiant marchand": "Merchant ID",
  "Nom affiché au payeur": "Name shown to the payer",
  "Clé d'API": "API key",
  "Dernière vérification": "Last check",
  "Remplacer la clé ou le compte": "Replace the key or the account",
  "Brancher mon compte ElyonPay": "Connect my ElyonPay account",
  "Où trouver mes identifiants ?": "Where do I find my credentials?",
  "1. Créez (ou ouvrez) votre compte marchand sur ElyonPay et connectez-vous à votre tableau de bord.":
    "1. Create (or open) your merchant account on ElyonPay and sign in to your dashboard.",
  "2. Notez votre identifiant marchand, et copiez votre clé d'API de PRODUCTION (vous pouvez la régénérer depuis le tableau de bord ; elle n'est pas la même que celle du bac à sable).":
    "2. Note your merchant ID, and copy your PRODUCTION API key (you can regenerate it from the dashboard; it is not the same as the sandbox one).",
  "3. Collez-les ci-dessus. Faites ensuite un petit paiement de test depuis une de vos factures pour vérifier que tout est bien relié.":
    "3. Paste them above. Then make a small test payment from one of your invoices to check that everything is properly linked.",
  "Site d'ElyonPay": "ElyonPay website",
  "Documentation ElyonPay": "ElyonPay documentation",
  "L'identifiant marchand ne peut pas être vérifié sans effectuer un paiement : s'il est faux, le premier paiement d'un client échouera avec un message d'erreur et vous pourrez le corriger ici.":
    "The merchant ID cannot be checked without making a payment: if it is wrong, a customer's first payment will fail with an error message and you can correct it here.",

  // Formulaire
  "Identifiant marchand ElyonPay": "ElyonPay merchant ID",
  "Nom affiché à vos clients au moment de payer": "Name shown to your customers when they pay",
  "Nouvelle clé d'API (pour remplacer la clé actuelle)": "New API key (to replace the current key)",
  "Clé d'API ElyonPay": "ElyonPay API key",
  "La clé est testée auprès d'ElyonPay avant d'être enregistrée, puis chiffrée. Elle ne sera plus jamais affichée.":
    "The key is tested with ElyonPay before being saved, then encrypted. It will never be shown again.",
  "Compte ElyonPay branché : vos clients peuvent maintenant payer leurs factures en ligne.": "ElyonPay account connected: your customers can now pay their invoices online.",
  "Vérification auprès d'ElyonPay…": "Checking with ElyonPay…",
  "Vérifier et remplacer": "Check and replace",
  "Vérifier et brancher": "Check and connect",
  "Vos clients ne pourront plus payer en ligne. Retirer le compte ?": "Your customers will no longer be able to pay online. Remove the account?",
  "Oui, retirer": "Yes, remove",
  "Retirer ce compte": "Remove this account",

  // Messages d'erreur des actions
  "L'identifiant marchand est un nombre (ex. 595).": "The merchant ID is a number (e.g. 595).",
  "Le nom affiché au payeur est trop court.": "The name shown to the payer is too short.",
  "Le nom affiché au payeur est trop long (60 caractères au plus).": "The name shown to the payer is too long (60 characters at most).",
  "La clé d'API est trop courte : copiez-la en entier depuis votre tableau de bord ElyonPay.": "The API key is too short: copy it in full from your ElyonPay dashboard.",
  "La clé d'API est trop longue.": "The API key is too long.",
  "La clé d'API ne doit contenir ni espace ni retour à la ligne.": "The API key must not contain spaces or line breaks.",
  "Seul l'Administrateur peut brancher le compte de paiement.": "Only the Administrator can connect the payment account.",
  "Un paiement est en cours : attendez quelques minutes qu'il se termine avant de changer de compte.": "A payment is in progress: wait a few minutes for it to finish before changing the account.",
  "ElyonPay a refusé cette clé d'API. Vérifiez que vous avez copié la clé de PRODUCTION en entier, ou régénérez-la dans votre tableau de bord ElyonPay.":
    "ElyonPay rejected this API key. Check that you copied the PRODUCTION key in full, or regenerate it in your ElyonPay dashboard.",
  "Impossible de joindre ElyonPay pour vérifier la clé. Réessayez dans un instant.": "Could not reach ElyonPay to check the key. Try again in a moment.",
  "Seul l'Administrateur peut retirer le compte de paiement.": "Only the Administrator can remove the payment account.",
  "Un paiement est en cours : attendez quelques minutes qu'il se termine avant de retirer le compte.": "A payment is in progress: wait a few minutes for it to finish before removing the account.",
};
