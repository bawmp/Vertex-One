/** Phrases composées avec des valeurs ({n}, {nom}, {date}…) et pluriels (deux clés : « {n} deal visible. » / « {n} deals visibles. »). */
export const PHRASES: Record<string, string> = {
  // Connexion
  "Pas encore de compte ?": "Don't have an account yet?",
  "Déjà inscrit ?": "Already registered?",

  // CRM, deals
  "{n} deals visibles.": "{n} deals visible.",
  "{n} deal visible.": "{n} deal visible.",
  "Total enregistrements {n}": "Total records {n}",
  "Aucune facture émise de {montant} FCFA ou moins pour appliquer ce solde.": "No invoice issued for {montant} FCFA or less to apply this balance to.",
  "par {auteur}": "by {auteur}",

  // Facturation
  "Pour le deal": "For the deal",
  "{numero} — relance {canal} : envoyée": "{numero} — {canal} reminder: sent",
  "{numero} — relance {canal} : non envoyée ({erreur})": "{numero} — {canal} reminder: not sent ({erreur})",
  "Voir la facture {numero}": "View invoice {numero}",
  "NIU émetteur : {niu}": "Issuer tax ID (NIU): {niu}",
  "Facture annulée — motif : {motif}": "Invoice cancelled — reason: {motif}",
  "{n} factures impayées": "{n} unpaid invoices",
  "{n} facture impayée": "{n} unpaid invoice",
  "{n} factures fournisseurs impayées": "{n} unpaid supplier invoices",
  "{n} facture fournisseur impayée": "{n} unpaid supplier invoice",
  "Flux de trésorerie — depuis le {date}": "Cash flow — since {date}",
  "Stock : {n}": "Stock: {n}",
  "Vente : {prix}": "Sale: {prix}",
  "Achat : {prix}": "Purchase: {prix}",
  "Articles en vente ({type})": "Items for sale ({type})",
  "Créé le {date} par {nom}": "Created on {date} by {nom}",

  // Projets
  "Nouveau {objet}": "New {objet}",
  "{objet} sans travail en cours": "{objet} with no work in progress",
  "Signé le {date}": "Signed on {date}",
  Signé: "Signed",
  "jusqu'au {date}": "until {date}",
  "Échéance : {date}": "Due: {date}",
  "Aucun {objet} pour le moment dans ce {parent}.": "No {objet} yet in this {parent}.",
  "{n}h enregistrées au total": "{n}h recorded in total",
  " · {n} entrées à facturer": " · {n} entries to invoice",
  " · {n} entrée à facturer": " · {n} entry to invoice",
  "Semaine du {debut} au {fin}": "Week of {debut} to {fin}",
  "{objet} et Projets sont disponibles à partir du forfait Pro.": "{objet} and Projects are available from the Pro plan.",
  "Aucun {objet} pour le moment — un devis accepté en ouvre un automatiquement.": "No {objet} yet — an accepted quote opens one automatically.",
  "Aucune tâche pour le moment dans ce {objet}.": "No tasks yet in this {objet}.",
  "Un minuteur est en cours sur": "A timer is running on",
  "Aucune heure enregistrée pour le moment sur ce {objet}.": "No hours recorded yet on this {objet}.",
  "Le client y consulte le document, l'accepte ou le refuse et peut le régler en ligne.": "The client views the document there, accepts or declines it, and can pay it online.",

  // Messagerie
  "{n} membres": "{n} members",
  "{n} membre": "{n} member",
  "{n} réponses": "{n} replies",
  "{n} réponse": "{n} reply",
  "· projet {nom}": "· project {nom}",

  // Annonces, équipe
  "Image, PDF, Word ou Excel — {n} fichiers, {taille} au total": "Image, PDF, Word or Excel — {n} files, {taille} in total",
  "{n} modules sur {total}": "{n} modules of {total}",
  "{n} module sur {total}": "{n} module of {total}",

  // Import de données
  "3. Associer les colonnes — {type}": "3. Map the columns — {type}",
  "{n} ligne(s) lues dans « {nom} ». Les colonnes reconnues sont déjà associées ; vérifiez-les et complétez au besoin. Un champ marqué * est obligatoire.":
    "{n} row(s) read from “{nom}”. Recognized columns are already mapped; check them and complete as needed. A field marked * is required.",
  "À associer : {liste}.": "To map: {liste}.",
  "… et {n} autre(s).": "… and {n} more.",
  "Reprenez vos données depuis Asana, Zoho One (CRM, Books, Projects…) ou toute autre application qui sait exporter en CSV ou Excel (.xlsx). Rien n'est enregistré avant que vous ayez vu le résultat d'une simulation et confirmé. Jusqu'à {n} lignes et 4 Mo par fichier.":
    "Bring your data over from Asana, Zoho One (CRM, Books, Projects…) or any other application that can export to CSV or Excel (.xlsx). Nothing is saved until you have seen the result of a simulation and confirmed. Up to {n} rows and 4 MB per file.",
};
