/** Prospects qualifiés : envoi groupé et relance automatique (réglages, état, messages d'erreur). */
export const PROSPECTS_AUTO: Record<string, string> = {
  // Menu et libellés
  "Relance des prospects": "Prospect follow-up",
  "Relance de prospect": "Prospect follow-up",
  "Relance automatique de prospect": "Automatic prospect follow-up",

  // Envoi groupé
  "Tout sélectionner": "Select all",
  " et {n} autres": " and {n} more",
  "{n} prospects sélectionnés": "{n} prospects selected",
  "{n} prospect sélectionné": "{n} prospect selected",
  "Écrire par e-mail à la sélection": "Email the selection",
  "Effacer la sélection": "Clear the selection",
  "Sélectionner {nom}": "Select {nom}",
  "Pas d'adresse e-mail : ce prospect ne peut pas recevoir d'e-mail.": "No email address: this prospect cannot receive an email.",
  "Écrire à {n} prospects": "Write to {n} prospects",
  "Écrire à {n} prospect": "Write to {n} prospect",
  "{n} e-mails envoyés.": "{n} emails sent.",
  "{n} e-mail envoyé.": "{n} email sent.",
  "Non envoyés": "Not sent",
  Terminer: "Done",
  "Écrivez {nom} pour insérer le nom de chaque prospect, et {entreprise} pour le nom de votre entreprise.":
    "Write {nom} to insert each prospect's name, and {entreprise} for your company name.",
  "Envoyer à {n} prospects": "Send to {n} prospects",
  "Envoyer à {n} prospect": "Send to {n} prospect",
  "Vous n'avez pas le droit de relancer ces prospects.": "You are not allowed to follow up these prospects.",
  "Sélectionnez au moins un prospect.": "Select at least one prospect.",
  "Un envoi groupé est limité à {n} prospects.": "A bulk send is limited to {n} prospects.",
  "Prospect introuvable": "Prospect not found",
  "Introuvable, hors de votre portée ou déjà client.": "Not found, outside your scope or already a customer.",
  "Pas d'adresse e-mail.": "No email address.",

  // Relance automatique : lien et état
  "Relance automatique : activée": "Automatic follow-up: on",
  "Relance automatique : désactivée": "Automatic follow-up: off",
  "Des e-mails modèles partent tout seuls, aux dates prévues, jusqu'à ce que ce prospect réponde, devienne client ou que vous arrêtiez. Une relance faite à la main retarde le prochain e-mail automatique.":
    "Template emails go out on their own, on the scheduled dates, until this prospect replies, becomes a customer or you stop it. A follow-up done by hand delays the next automatic email.",
  "C'est noté : les relances automatiques sont arrêtées.": "Noted: automatic follow-ups are stopped.",
  "Il a répondu": "They replied",
  "Les relances automatiques de ce prospect sont arrêtées.": "Automatic follow-ups for this prospect are stopped.",
  "Arrêter les relances automatiques": "Stop automatic follow-ups",
  "Les relances automatiques reprennent.": "Automatic follow-ups resume.",
  "Reprendre les relances automatiques": "Resume automatic follow-ups",
  "Prochain e-mail automatique : aujourd'hui (étape {etape} sur {n})": "Next automatic email: today (step {etape} of {n})",
  "Prochain e-mail automatique : le {date} (étape {etape} sur {n})": "Next automatic email: on {date} (step {etape} of {n})",
  "Relance automatique terminée ({n} e-mails envoyés)": "Automatic follow-up finished ({n} emails sent)",
  "Relance automatique arrêtée : il a répondu": "Automatic follow-up stopped: they replied",
  "Relance automatique arrêtée par l'équipe": "Automatic follow-up stopped by the team",
  "Pas d'adresse e-mail : aucune relance automatique": "No email address: no automatic follow-up",
  "Vous recevez ce message parce que vous avez manifesté de l'intérêt pour nos services. Pour ne plus recevoir nos relances, répondez simplement « stop » à cet e-mail.":
    "You are receiving this message because you expressed interest in our services. To stop receiving our follow-ups, simply reply “stop” to this email.",

  // Page de réglages
  "Activer la relance automatique des prospects qualifiés": "Turn on automatic follow-up of qualified prospects",
  "Jours d'envoi après la qualification": "Sending days after qualification",
  "De 1 à 3 nombres croissants. « 3, 7, 14 » : un e-mail 3 jours après la qualification, le suivant 4 jours plus tard (J+7), puis 7 jours plus tard (J+14).":
    "From 1 to 3 increasing numbers. “3, 7, 14”: an email 3 days after qualification, the next one 4 days later (D+7), then 7 days later (D+14).",
  "Plafond d'e-mails automatiques par jour": "Daily cap of automatic emails",
  "Au-delà, les envois restants attendent le lendemain (les plus en retard partent d'abord).": "Beyond that, the remaining sends wait until the next day (the most overdue go first).",
  "Réglages enregistrés.": "Settings saved.",
  "Relance automatique des prospects": "Automatic prospect follow-up",
  Activée: "On",
  Désactivée: "Off",
  "Des e-mails modèles partent tout seuls à vos prospects qualifiés, aux dates choisies, jusqu'à ce qu'ils répondent ou deviennent clients.":
    "Template emails go out on their own to your qualified prospects, on the chosen dates, until they reply or become customers.",
  Réglages: "Settings",
  "Les garde-fous": "The safeguards",
  "• Désactivée tant que vous ne l'activez pas : rien ne part sans votre accord.": "• Off until you turn it on: nothing is sent without your agreement.",
  "• Passage chaque matin, du lundi au samedi, vers 8 h 15 (heure de Douala).": "• Runs every morning, Monday to Saturday, around 8:15 (Douala time).",
  "• La séquence s'arrête toute seule quand le prospect devient client ou n'est plus qualifié, et dès que vous cliquez sur « Il a répondu » ou « Arrêter ».":
    "• The sequence stops on its own when the prospect becomes a customer or is no longer qualified, and as soon as you click “They replied” or “Stop”.",
  "• Une relance faite à la main (e-mail, WhatsApp, appel) retarde le prochain e-mail automatique de 2 jours.":
    "• A follow-up done by hand (email, WhatsApp, call) delays the next automatic email by 2 days.",
  "• Chaque e-mail automatique est écrit au nom de votre entreprise, la réponse arrive à la personne qui suit le prospect, et un rappel « répondez stop » figure au bas du message.":
    "• Each automatic email is written in your company's name, the reply reaches the person handling the prospect, and a “reply stop” reminder appears at the bottom of the message.",
  "• Chaque envoi est noté dans l'historique du prospect (marqué « automatique ») et dans Emails envoyés. Un e-mail qui échoue est réessayé au passage suivant.":
    "• Each send is recorded in the prospect's history (marked “automatic”) and in Sent emails. An email that fails is retried on the next run.",
  "Au prochain passage": "At the next run",
  "Ce qui partirait si vous l'activiez": "What would go out if you turned it on",
  "Aucun e-mail dû aujourd'hui.": "No email due today.",
  "{n} e-mails sont dus ; {max} partiront au prochain passage (plafond du jour), les autres le lendemain.":
    "{n} emails are due; {max} will go out at the next run (daily cap), the others the next day.",
  "{n} e-mails partiraient au prochain passage :": "{n} emails would go out at the next run:",
  "{n} e-mail partirait au prochain passage :": "{n} email would go out at the next run:",
  "étape {etape} sur {n}": "step {etape} of {n}",
  "prévu le {date}": "scheduled for {date}",
  "… et {n} autres": "… and {n} more",
  "{n} autres prospects ont un envoi prévu plus tard.": "{n} other prospects have a send scheduled later.",
  "À l'activation, les prospects qualifiés depuis plusieurs jours reçoivent leur premier e-mail dès le prochain passage, puis les suivants aux écarts prévus.":
    "On activation, prospects qualified several days ago receive their first email at the very next run, then the following ones at the planned intervals.",
  "Les messages envoyés": "The messages sent",
  "Étape {etape} — {libelle}": "Step {etape} — {libelle}",
  "J+{jours}": "D+{jours}",
  "Objet : {objet}": "Subject: {objet}",
  "« {nom} » devient le nom du prospect et « {entreprise} » le nom de votre entreprise, dans la langue de la personne qui suit le prospect.":
    "“{nom}” becomes the prospect's name and “{entreprise}” your company name, in the language of the person handling the prospect.",
  "Voir les prospects qualifiés": "View qualified prospects",
  "Délais invalides : indiquez de 1 à 3 nombres de jours croissants (de 1 à {max}), par exemple 3, 7, 14.":
    "Invalid delays: enter 1 to 3 increasing numbers of days (from 1 to {max}), for example 3, 7, 14.",
  "Le plafond par jour doit être un nombre entier de 1 à {max}.": "The daily cap must be a whole number from 1 to {max}.",
};
