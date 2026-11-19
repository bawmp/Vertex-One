/** Prospects qualifiés : l'espace où l'on relance par e-mail ou WhatsApp les leads qualifiés, jusqu'à ce qu'ils deviennent clients. */
export const PROSPECTS: Record<string, string> = {
  // Menu, titres, liste
  "Prospects qualifiés": "Qualified prospects",
  "Les personnes intéressées que vous avez qualifiées. Relancez-les par e-mail ou WhatsApp ; elles ne deviennent des contacts que lorsqu'elles sont clientes.":
    "The interested people you have qualified. Follow them up by email or WhatsApp; they only become contacts once they are customers.",
  "Rechercher un prospect…": "Search a prospect…",
  "Rechercher un prospect": "Search a prospect",
  "Filtrer les prospects": "Filter prospects",
  Tous: "All",
  "À relancer": "To follow up",
  "Rappels prévus": "Scheduled reminders",
  "Relancés récemment": "Recently followed up",
  "Jamais relancé": "Never followed up",
  "Rappel prévu": "Reminder set",
  "Relancé récemment": "Recently followed up",
  "Qualifié le {date}": "Qualified on {date}",
  "Dernière relance : {date} ({n} au total)": "Last follow-up: {date} ({n} in total)",
  "Rappel le {date}": "Reminder on {date}",
  "Suivi par {nom}": "Handled by {nom}",
  "Aucun prospect ne correspond.": "No prospect matches.",
  "Aucun prospect qualifié pour le moment.": "No qualified prospects yet.",
  "Essayez un autre filtre, ou effacez la recherche.": "Try another filter, or clear the search.",
  "Quand vous passez un lead au statut « Qualifié », il arrive ici pour être relancé jusqu'à ce qu'il devienne client.":
    "When you set a lead to “Qualified”, it arrives here to be followed up until it becomes a customer.",
  "{n} prospects qualifiés à relancer par e-mail ou WhatsApp.": "{n} qualified prospects to follow up by email or WhatsApp.",
  "{n} prospect qualifié à relancer par e-mail ou WhatsApp.": "{n} qualified prospect to follow up by email or WhatsApp.",
  "Plus d'options de relance": "More follow-up options",

  // Devenir client
  "Devenir client": "Become a customer",
  "Devenu client": "Became a customer",
  "Créer le contact ?": "Create the contact?",
  "Créer le contact et l'opportunité ?": "Create the contact and the opportunity?",
  "Oui, devenir client": "Yes, become a customer",
  "Voir le contact": "View the contact",
  "Passez ce lead au statut « Qualifié » pour qu'il rejoigne les prospects qualifiés, où vous pourrez le relancer jusqu'à ce qu'il devienne client.":
    "Set this lead to “Qualified” so it joins the qualified prospects, where you can follow it up until it becomes a customer.",
  "Historique des relances": "Follow-up history",

  // Panneau de relance
  "Façon de relancer": "Way to follow up",
  "E-mail": "Email",
  "Appel / note": "Call / note",
  Rappel: "Reminder",
  "Modèle (facultatif)": "Template (optional)",
  "Aucun modèle : je rédige moi-même": "No template: I write it myself",
  "À : {email}": "To: {email}",
  "Pour : {numero}": "For: {numero}",
  "Pièces jointes (facultatif)": "Attachments (optional)",
  "Cinq fichiers au plus, 4 Mo en tout (image, PDF, Word, Excel).": "Up to five files, 4 MB in total (image, PDF, Word, Excel).",
  "Ce prospect n'a pas d'adresse e-mail renseignée. Utilisez WhatsApp ou ajoutez son adresse sur sa fiche.":
    "This prospect has no email address. Use WhatsApp or add their address on their record.",
  "Complétez ou retirez : {elements}.": "Complete or remove: {elements}.",
  "E-mail envoyé. Il est noté dans l'historique.": "Email sent. It is recorded in the history.",
  "Envoyer l'e-mail": "Send the email",
  "Impossible d'ouvrir WhatsApp.": "Could not open WhatsApp.",
  "Écrivez votre message…": "Write your message…",
  "WhatsApp s'ouvre avec ce message déjà écrit : vous appuyez vous-même sur « Envoyer ».":
    "WhatsApp opens with this message already written: you press “Send” yourself.",
  "WhatsApp est ouvert. La relance est notée dans l'historique.": "WhatsApp is open. The follow-up is recorded in the history.",
  "Ouvrir WhatsApp": "Open WhatsApp",
  "Ce que vous notez": "What you are recording",
  "J'ai appelé ce prospect": "I called this prospect",
  "Une remarque": "A remark",
  "Ce qui s'est dit": "What was said",
  "Noté dans l'historique.": "Recorded in the history.",
  "Me le rappeler le": "Remind me on",
  "Enregistrer le rappel": "Save the reminder",
  "Retirer le rappel": "Remove the reminder",
  "Rappel enregistré : ce prospect passera « à relancer » ce jour-là.": "Reminder saved: this prospect will show as “to follow up” that day.",
  "Rappel retiré.": "Reminder removed.",

  // Messages d'erreur des actions
  "L'objet est trop long (200 caractères au plus).": "The subject is too long (200 characters at most).",
  "Le message est trop court.": "The message is too short.",
  "Le message est trop long.": "The message is too long.",
  "Le message est trop long pour WhatsApp (1 500 caractères au plus).": "The message is too long for WhatsApp (1,500 characters at most).",
  "Vous n'avez pas le droit de relancer ce prospect.": "You are not allowed to follow up this prospect.",
  "Vous n'avez pas le droit de modifier ce prospect.": "You are not allowed to edit this prospect.",
  "Prospect introuvable.": "Prospect not found.",
  "Prospect introuvable ou déjà devenu client.": "Prospect not found or already a customer.",
  "Ce prospect n'a pas d'adresse e-mail renseignée.": "This prospect has no email address.",
  "Échec de l'envoi de l'e-mail.": "The email could not be sent.",
  "Le numéro de ce prospect n'est pas utilisable sur WhatsApp.": "This prospect's number cannot be used on WhatsApp.",
  "Écrivez au moins quelques mots.": "Write at least a few words.",
  "Le texte est trop long.": "The text is too long.",
  "Choisissez aujourd'hui ou une date à venir.": "Choose today or a future date.",
  "Le rappel ne peut pas dépasser un an.": "The reminder cannot be more than a year away.",
  "Qualifiez d'abord ce lead : seul un prospect qualifié peut devenir client.": "Qualify this lead first: only a qualified prospect can become a customer.",

  // Modèles de relance (objet, e-mail, WhatsApp)
  "Prise de nouvelles": "Checking in",
  "Suite à notre échange": "Following our conversation",
  "Bonjour {nom},\n\nJe reviens vers vous suite à notre échange. Avez-vous eu le temps d'y réfléchir ? Je reste à votre disposition pour répondre à toutes vos questions.\n\nCordialement,\n{entreprise}":
    "Hello {nom},\n\nI am getting back to you following our conversation. Have you had time to think it over? I remain at your disposal to answer any questions.\n\nKind regards,\n{entreprise}",
  "Bonjour {nom}, c'est {entreprise}. Je reviens vers vous suite à notre échange : avez-vous eu le temps d'y réfléchir ? Je reste à votre disposition.":
    "Hello {nom}, this is {entreprise}. I am getting back to you following our conversation: have you had time to think it over? I remain at your disposal.",
  "Rappel de votre demande": "Reminder of your request",
  "Votre demande chez {entreprise}": "Your request with {entreprise}",
  "Bonjour {nom},\n\nVous nous avez contactés récemment et nous souhaitons nous assurer que nous avons bien répondu à votre besoin. Pouvons-nous faire le point ensemble ?\n\nCordialement,\n{entreprise}":
    "Hello {nom},\n\nYou contacted us recently and we want to make sure we have properly answered your need. Can we take stock together?\n\nKind regards,\n{entreprise}",
  "Bonjour {nom}, c'est {entreprise}. Vous nous avez contactés récemment : pouvons-nous faire le point sur votre besoin ?":
    "Hello {nom}, this is {entreprise}. You contacted us recently: can we take stock of your need?",
  "Proposer un rendez-vous": "Suggest a meeting",
  "Un échange rapide ?": "A quick chat?",
  "Bonjour {nom},\n\nSeriez-vous disponible pour un court échange (appel ou rendez-vous) cette semaine afin de préciser votre projet ? Indiquez-moi le moment qui vous convient.\n\nCordialement,\n{entreprise}":
    "Hello {nom},\n\nWould you be available for a short chat (call or meeting) this week to clarify your project? Let me know what time suits you.\n\nKind regards,\n{entreprise}",
  "Bonjour {nom}, c'est {entreprise}. Seriez-vous disponible pour un court échange cette semaine ? Dites-moi quel moment vous convient.":
    "Hello {nom}, this is {entreprise}. Would you be available for a short chat this week? Let me know what time suits you.",
  "Dernière relance": "Last follow-up",
  "Votre projet est-il toujours d'actualité ?": "Is your project still current?",
  "Bonjour {nom},\n\nSans nouvelle de votre part, je me permets une dernière relance : votre projet est-il toujours d'actualité ? Si ce n'est plus le cas, dites-le-moi simplement, je ne vous solliciterai plus.\n\nCordialement,\n{entreprise}":
    "Hello {nom},\n\nHaving heard nothing from you, I am sending one last follow-up: is your project still current? If it is not, just tell me and I will not contact you again.\n\nKind regards,\n{entreprise}",
  "Bonjour {nom}, c'est {entreprise}. Votre projet est-il toujours d'actualité ? Si ce n'est plus le cas, dites-le-moi simplement.":
    "Hello {nom}, this is {entreprise}. Is your project still current? If it is not, just tell me.",
};
