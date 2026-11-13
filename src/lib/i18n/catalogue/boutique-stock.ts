/** Boutique en ligne connectée : écran Paramètres → Intégrations et messages des actions. */
export const BOUTIQUE_STOCK: Record<string, string> = {
  "Déconnecter « {nom} » ? Le site ne pourra plus lire le stock ni vous envoyer ses commandes.":
    "Disconnect “{nom}”? The site will no longer be able to read the stock or send you its orders.",
  "Boutique en ligne : un seul stock": "Online shop: one single stock",
  "Votre site vend, Vertex One garde le stock : chaque commande du site le fait baisser ici, et le site lit ce qui reste pour afficher « en stock » ou « rupture ». Vous ne saisissez plus le stock à deux endroits.":
    "Your site sells, Vertex One keeps the stock: every order from the site lowers it here, and the site reads what is left to show “in stock” or “out of stock”. You no longer enter the stock in two places.",
  "Connectez votre site": "Connect your site",
  "dernier échange : {date}": "last exchange: {date}",
  "aucun échange pour l'instant : le site n'est pas encore branché": "no exchange yet: the site is not plugged in yet",
  "{n} commande(s) reçue(s) en 30 jours": "{n} order(s) received in 30 days",
  "Le site voit et fait baisser le stock du dépôt :": "The site sees and lowers the stock of the warehouse:",
  "Dépôt de la boutique": "Shop warehouse",
  principal: "main",
  "Connecter un autre site": "Connect another site",
  "Donnez un nom à votre site, c'est tout.": "Just give your site a name, that's all.",
  "Nom du site": "Site name",
  "Ex. : Ma boutique en ligne": "E.g. My online shop",
  Connecter: "Connect",
  "« {nom} » est connecté. Copiez cette clé maintenant : elle ne sera plus jamais affichée.":
    "“{nom}” is connected. Copy this key now: it will never be shown again.",
  "À transmettre au développeur de votre site :": "To give to your site's developer:",
  "Clé": "Key",
  "Copié": "Copied",
  "Copier le tout": "Copy everything",
  "Gardez cette clé secrète, comme un mot de passe : qui la possède peut faire baisser votre stock.":
    "Keep this key secret, like a password: whoever has it can lower your stock.",
  "Reliez vos produits": "Link your products",
  "Chaque produit de Vertex One doit porter le MÊME code que sur votre site, dans le champ « Code-barres » de sa fiche. C'est ce code qui permet de savoir de quel article parle une commande.":
    "Each Vertex One product must carry the SAME code as on your site, in the “Barcode” field of its page. This code is how an order tells which item it is about.",
  "Aucun produit n'a encore son stock suivi. Activez le suivi dans la fiche de chaque produit, ou importez vos produits avec leur stock et leur code.":
    "No product has its stock tracked yet. Turn tracking on in each product's page, or import your products with their stock and code.",
  "Importer mes produits": "Import my products",
  "{avec} produit(s) sur {total} ont un code et seront reconnus par votre site.": "{avec} product(s) out of {total} have a code and will be recognised by your site.",
  "Compléter les {n} produit(s) sans code": "Complete the {n} product(s) without a code",
  "Tous vos produits sont reliés": "All your products are linked",
  "Produits reliés à votre site": "Products linked to your site",
  "Votre site a vendu des articles que Vertex One ne reconnaît pas": "Your site sold items that Vertex One does not recognise",
  "Les commandes ont bien été enregistrées, mais leur stock n'a pas baissé. Ouvrez le produit correspondant et saisissez ce code dans son champ « Code-barres » : les prochaines commandes seront reconnues.":
    "The orders were recorded, but their stock did not go down. Open the matching product and type this code in its “Barcode” field: the next orders will be recognised.",
  "{n} fois": "{n} times",
  "Produits vendus par le site dont le stock n'est pas suivi": "Products sold by the site whose stock is not tracked",
  "Activez le suivi du stock dans leur fiche pour que les commandes du site les fassent baisser.":
    "Turn on stock tracking in their page so that the site's orders lower them.",
  "Suivez ce que reçoit Vertex One": "Follow what Vertex One receives",
  "Aucune commande reçue de votre site pour l'instant. Elles apparaîtront ici dès que votre développeur aura branché le site.":
    "No order received from your site yet. They will appear here as soon as your developer has plugged the site in.",
  "{n} article(s)": "{n} item(s)",
  "Stock mis à jour": "Stock updated",
  "{n} à vérifier": "{n} to check",
  "Chaque commande laisse une ligne « Vente » dans l'historique du stock du produit, et les alertes de stock bas fonctionnent comme d'habitude.":
    "Each order leaves a “Sale” line in the product's stock history, and low-stock alerts work as usual.",
  "Trois appels, toujours depuis le serveur de votre site (jamais depuis le navigateur du visiteur : la clé y serait visible).":
    "Three calls, always from your site's server (never from the visitor's browser: the key would be visible there).",
  "« reference » est obligatoire : renvoyer la même référence ne fait jamais sortir le stock deux fois. « code » est le code-barres du produit dans Vertex One. Une commande n'est jamais refusée pour cause de stock ou de code inconnu : les lignes à vérifier (« inconnu », « non_suivi ») sont signalées dans la réponse (« aVerifier »). « disponible » ne descend jamais sous 0. Réponses : 201 enregistrée, 200 déjà reçue, 400 données invalides, 401 clé invalide, 402 abonnement suspendu, 403 clé non autorisée au stock, 404 référence inconnue (annulation), 429 trop de requêtes.":
    "“reference” is required: sending the same reference never takes the stock out twice. “code” is the product's barcode in Vertex One. An order is never refused because of stock or an unknown code: lines to check (“inconnu”, “non_suivi”) are flagged in the response (“aVerifier”). “disponible” never goes below 0. Responses: 201 recorded, 200 already received, 400 invalid data, 401 invalid key, 402 subscription suspended, 403 key not allowed for stock, 404 unknown reference (cancellation), 429 too many requests.",
  "Donnez un nom à votre site (2 caractères minimum).": "Give your site a name (2 characters minimum).",
  "Ce dépôt n'existe pas ou n'est plus actif.": "This warehouse does not exist or is no longer active.",
  "Connexion introuvable.": "Connection not found.",
};
