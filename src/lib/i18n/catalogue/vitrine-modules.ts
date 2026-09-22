/** Site vitrine : description de chaque module (src/lib/marketing/modules.ts). */
export const VITRINE_MODULES: Record<string, string> = {
  // One CRM
  "Prospects, opportunités et pipeline commercial, du premier contact à la facture.": "Prospects, opportunities and sales pipeline, from first contact to invoice.",
  "Suivi des prospects du statut Nouveau à Gagné/Perdu, avec qualification et proposition comme étapes intermédiaires":
    "Prospect tracking from New to Won/Lost, with qualification and proposal as intermediate stages",
  "Chaque opportunité est assignée à une personne précise, avec une visibilité selon la portée (toute l'équipe, son équipe, ou seulement les siennes)":
    "Each opportunity is assigned to a specific person, with visibility depending on scope (the whole team, their team, or only their own)",
  "Tâches et réunions rattachées directement à une opportunité": "Tasks and meetings attached directly to an opportunity",
  "Conversion en un clic d'une opportunité gagnée vers un devis puis une facture — aucune ressaisie": "One-click conversion of a won opportunity into a quote and then an invoice — no re-entry",

  // One Books
  "Facturation, achats et comptabilité SYSCOHADA dans un seul module — du devis au paiement Mobile Money.": "Invoicing, purchasing and SYSCOHADA accounting in a single module — from quote to Mobile Money payment.",
  "Numéro de facture généré uniquement au moment exact de l'émission, jamais avant, par une opération protégée contre les doublons":
    "Invoice number generated only at the exact moment of issue, never before, by an operation protected against duplicates",
  "TVA calculée ligne par ligne à 19,25 %, avec blocage de toute émission tant que le NIU de l'entreprise n'est pas renseigné":
    "VAT calculated line by line at 19.25%, with any issuing blocked until the company's NIU (tax ID) is entered",
  "Acomptes, bons de commande, factures récurrentes et reçus de vente": "Down payments, purchase orders, recurring invoices and sales receipts",
  "Relance automatique des factures impayées, sans intervention manuelle": "Automatic reminders for unpaid invoices, with no manual intervention",
  "Paiement en ligne Mobile Money (Orange Money, MTN MoMo) directement depuis la facture, via Aangaraa Pay": "Online Mobile Money payment (Orange Money, MTN MoMo) directly from the invoice, via Aangaraa Pay",
  "Le client reçoit un lien : il consulte son devis, l'accepte ou le refuse en indiquant pourquoi — l'acceptation crée automatiquement la facture":
    "The client receives a link: they view their quote, accept it or decline it with a reason — acceptance creates the invoice automatically",
  "Sur sa facture, le client l'accepte ou la conteste (motif obligatoire), puis la règle tout de suite ou plus tard depuis le même lien":
    "On their invoice, the client accepts or disputes it (reason required), then pays right away or later from the same link",
  "Chaque réponse du client est horodatée, avec son adresse IP, et l'équipe est prévenue par email": "Each client response is time-stamped, with their IP address, and the team is notified by email",
  "Achats : fiches fournisseurs et bons de commande d'achat, convertibles directement en facture fournisseur": "Purchasing: supplier records and purchase orders, directly convertible into a supplier invoice",
  "Suivi des factures fournisseurs en retard, distinct du suivi des impayés clients ; une facture se marque payée ou s'annule en gardant l'historique":
    "Tracking of overdue supplier invoices, separate from tracking client unpaid invoices; an invoice is marked paid or cancelled while keeping its history",
  "Comptabilité : plan comptable conforme au référentiel SYSCOHADA (classes 1 à 8), soldes calculés automatiquement par entreprise":
    "Accounting: chart of accounts compliant with the SYSCOHADA framework (classes 1 to 8), balances calculated automatically per company",
  "Journaux manuels, rapprochement bancaire par import de relevé, et budgets comparés au réalisé par compte": "Manual journals, bank reconciliation by statement import, and budgets compared with actuals per account",
  "Verrouillage d'une période comptable une fois clôturée": "Locking of an accounting period once closed",
  "La comptabilité reste réservée à l'Administrateur — jamais visible d'un simple employé": "Accounting remains reserved for the Administrator — never visible to an ordinary employee",

  // One People
  "Dossiers employés, congés, pointage et suivi d'activité — hors paie.": "Employee records, leave, attendance and activity tracking — payroll excluded.",
  "Dossier RH créé automatiquement à l'activation d'un compte employé (poste, contrat, date d'embauche)": "HR record created automatically when an employee account is activated (position, contract, hire date)",
  "Salaire jamais rempli automatiquement, visible uniquement par l'Administrateur et l'intéressé": "Salary never filled in automatically, visible only to the Administrator and the person concerned",
  "Demandes de congés avec politiques configurables, pointage, suivi d'activité par employé": "Leave requests with configurable policies, attendance, activity tracking per employee",
  "Sondages internes et tickets RH par catégorie": "Internal surveys and HR tickets by category",
  "Hiérarchie de management à plusieurs niveaux — un manager voit toute son équipe étendue, pas seulement ses subordonnés directs":
    "Multi-level management hierarchy — a manager sees their whole extended team, not only their direct reports",
  "Organisation par département, avec visibilité RH cloisonnée entre départements — un manager ne voit que le sien, sauf permission explicite de l'Administrateur":
    "Organization by department, with HR visibility partitioned between departments — a manager only sees their own, unless explicitly permitted by the Administrator",

  // One Recruit
  "Postes ouverts, candidatures et conversion directe en compte employé.": "Open positions, applications and direct conversion into an employee account.",
  "Postes ouverts et candidatures avec CV stocké en toute sécurité": "Open positions and applications with securely stored CVs",
  "Suivi du candidat de Reçue à Entretien, Offre puis Embauche": "Candidate tracking from Received to Interview, Offer and then Hired",
  "Conversion d'une candidature embauchée directement en compte utilisateur, sans ressaisie": "Conversion of a hired application directly into a user account, with no re-entry",
  "Page carrières publique aux couleurs de l'entreprise, avec dépôt de candidature et CV": "Public careers page in the company's colors, with application and CV submission",
  "Offres modifiables à tout moment, désactivables puis réactivables ; une offre qui a déjà reçu des candidatures se désactive au lieu de se supprimer":
    "Job offers editable at any time, deactivatable and reactivatable; an offer that has already received applications is deactivated rather than deleted",
  "Candidatures corrigeables, annulables (et rétablissables) ou supprimables avec effacement réel du CV": "Applications that can be corrected, cancelled (and restored) or deleted, with real erasure of the CV",

  // One Desk
  "Tickets clients par catégorie, avec assignation et suivi de résolution.": "Customer tickets by category, with assignment and resolution tracking.",
  "Tickets rattachés à un Contact (pas nécessairement un utilisateur du portail)": "Tickets linked to a Contact (not necessarily a portal user)",
  "Catégories avec agent par défaut, assignation manuelle possible": "Categories with a default agent, manual assignment possible",
  "Suivi du statut de Ouvert à Résolu, avec horodatage de la résolution": "Status tracking from Open to Resolved, with a time stamp for the resolution",

  // One Bookings
  "Prise de rendez-vous en ligne, services, disponibilités et intervenants.": "Online appointment booking, services, availability and staff.",
  "Services réservables avec durée, tampon entre rendez-vous et prix en FCFA": "Bookable services with duration, buffer between appointments and price in FCFA",
  "Disponibilités hebdomadaires par intervenant, y compris les coupures (ex. pause déjeuner)": "Weekly availability per staff member, including breaks (e.g. lunch break)",
  "Prix et durée figés au moment de la réservation — une modification ultérieure du service ne change rien aux rendez-vous déjà pris":
    "Price and duration locked at booking time — a later change to the service does not affect appointments already made",
  "Page de réservation publique, partageable directement avec vos clients": "Public booking page, shareable directly with your clients",

  // One Projects
  "Dossiers clients permanents et projets bornés, avec feuille de temps.": "Permanent client files and time-bound projects, with a timesheet.",
  "Distinction claire entre un Dossier client (permanent) et un Projet (une mission précise, avec une fin)": "Clear distinction between a client File (permanent) and a Project (a specific assignment, with an end)",
  "Vocabulaire adapté à votre secteur (Chantier pour un artisan, Mission pour un cabinet)": "Vocabulary adapted to your sector (Site job for a craftsperson, Assignment for a firm)",
  "Feuille de temps avec minuteur démarrable/arrêtable directement sur une tâche": "Timesheet with a timer that can be started/stopped directly on a task",
  "Documents et demandes de signature rattachés directement au projet": "Documents and signature requests attached directly to the project",

  // One Docs & Sign
  "One Docs & Sign": "One Docs & Sign",
  "Stockage classé par sensibilité et signature électronique avec preuve.": "Storage classified by sensitivity and electronic signature with proof.",
  "Documents classés par catégorie — les pièces d'identité et données de santé restent réservées au responsable du dossier et à l'Administrateur, avec journalisation de chaque consultation":
    "Documents classified by category — ID documents and health data remain reserved for the file owner and the Administrator, with every access logged",
  "Signature électronique avec empreinte du document au moment de l'envoi": "Electronic signature with a fingerprint of the document at the time of sending",
  "Code de vérification envoyé par email, adresse IP, appareil et consentement capturés dans un certificat d'audit consultable":
    "Verification code sent by email, IP address, device and consent captured in a viewable audit certificate",
  "Envoi d'un contrat au client depuis son dossier : il lit le document, le signe ou le refuse en indiquant pourquoi":
    "Sending a contract to the client from their file: they read the document, sign it or decline it with a reason",
  "À la signature, le contrat signé et son certificat horodaté (date et heure de Yaoundé) sont rangés directement dans le dossier du client et envoyés à l'Administrateur et au signataire":
    "On signing, the signed contract and its time-stamped certificate (Yaoundé date and time) are filed directly in the client's file and sent to the Administrator and the signer",

  // One Marketing
  "Campagnes email, pages d'atterrissage et relances automatiques — WhatsApp bientôt.": "Email campaigns, landing pages and automatic follow-ups — WhatsApp coming soon.",
  "Campagnes par email, ciblées par statut de prospect ou ancienneté d'inactivité — l'envoi par WhatsApp arrivera dans une prochaine mise à jour":
    "Email campaigns, targeted by prospect status or length of inactivity — sending via WhatsApp will arrive in an upcoming update",
  "Pages d'atterrissage publiques pour capter de nouveaux prospects": "Public landing pages to capture new prospects",
  "Automatisations prêtes à l'emploi — par exemple relancer un prospect resté sans réponse depuis 7 jours": "Ready-to-use automations — for example following up with a prospect who has not answered for 7 days",

  // One Form
  "Formulaires personnalisés à publier via un lien public, réponses centralisées.": "Custom forms to publish via a public link, with centralized responses.",
  "10 types de champs (texte, email, téléphone, nombre, date, choix unique ou multiple, liste déroulante, fichier joint)":
    "10 field types (text, email, phone, number, date, single or multiple choice, drop-down list, attached file)",
  "8 modèles prêts à l'emploi : contact, demande de devis, accompagnement visa, candidature, satisfaction client, inscription à un événement, assistance et rendez-vous":
    "8 ready-to-use templates: contact, quote request, visa support, application, customer satisfaction, event registration, assistance and appointment",
  "Formulaire modifiable, désactivable ou supprimable depuis la liste, champ par champ": "Form editable, deactivatable or deletable from the list, field by field",
  "Lien public partageable, sans compte ni connexion requise pour y répondre": "Shareable public link, no account or login required to respond",
  "Réponses centralisées et consultables directement dans l'application": "Responses centralized and viewable directly in the application",
  "Création automatique d'un Lead CRM à chaque réponse, en option": "Automatic creation of a CRM Lead for each response, optional",
  "Notification par email à chaque nouvelle réponse, en option": "Email notification for each new response, optional",
  "Protection anti-spam intégrée sur le formulaire public": "Built-in anti-spam protection on the public form",
  "Disponibilité programmable : date d'ouverture, date de fermeture, nombre maximal de réponses": "Schedulable availability: opening date, closing date, maximum number of responses",

  // One Vault
  "Identifiants et notes sensibles chiffrés, privés ou partagés avec l'équipe.": "Encrypted credentials and sensitive notes, private or shared with the team.",
  "Mots de passe et notes chiffrés au repos, jamais stockés en clair": "Passwords and notes encrypted at rest, never stored in clear text",
  "Chaque secret est privé par défaut, visible uniquement par son créateur et l'Administrateur": "Each secret is private by default, visible only to its creator and the Administrator",
  "Partage avec toute l'équipe en un clic, pour les identifiants communs": "Sharing with the whole team in one click, for shared credentials",
  "Générateur de mot de passe intégré": "Built-in password generator",
  "Journal de consultation à chaque révélation d'un mot de passe": "Access log for every password reveal",

  // One Chat, annonces, isolation
  "Messagerie d'équipe : canaux, messages directs, groupes privés, fils et pièces jointes.": "Team messaging: channels, direct messages, private groups, threads and attachments.",
  "Canaux par projet, par équipe ou libres, avec un canal Général créé pour vous": "Channels by project, by team or free-form, with a General channel created for you",
  "Messages directs et groupes privés, visibles de leurs seuls membres — pas même de l'Administrateur": "Direct messages and private groups, visible only to their members — not even to the Administrator",
  "Pièces jointes (images, PDF, Word, Excel), réactions par emoji et fils de discussion qui n'encombrent pas la conversation":
    "Attachments (images, PDF, Word, Excel), emoji reactions and discussion threads that do not clutter the conversation",
  "Mentions @nom avec auto-complétion, prévenues par email quand elles restent sans lecture": "@name mentions with auto-completion, notified by email when they remain unread",
  "Recherche dans les messages, limitée aux conversations auxquelles vous avez accès": "Message search, limited to the conversations you have access to",
  "Présence en ligne, compteur de messages non lus et notifications du navigateur": "Online presence, unread message counter and browser notifications",
  "Fil d'annonces internes façon intranet, avec pièces jointes (images, PDF, Word, Excel)": "Internal announcements feed, intranet style, with attachments (images, PDF, Word, Excel)",
  "Isolation stricte entre entreprises clientes": "Strict isolation between client companies",
};
