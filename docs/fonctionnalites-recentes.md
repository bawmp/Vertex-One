# Fonctionnalités récentes de Vertex One — mode d'emploi et repères techniques

Document tenu à jour à chaque nouvelle fonctionnalité visible par un client (règle du 2026-10-10 : toute fonctionnalité
est documentée ici **et** reflétée sur le site vitrine — `src/lib/marketing/modules.ts`, avec sa traduction anglaise dans
`src/lib/i18n/catalogue/vitrine-modules.ts`). Pour chaque entrée : ce que ça fait pour l'utilisateur, où le trouver, et
où se trouve le code.

## Transfert de données entre espaces (2026-10-09)

- **Quoi** : exporter les données d'un espace en fichiers CSV, les importer dans un autre espace Vertex One (ou depuis
  Asana/Zoho). Types : contacts et sociétés, leads, deals, produits et services, devis et factures historiques, champs
  personnalisés du contact, modèles d'email.
- **Où** : Paramètres → « Exporter mes données » (`/app/parametres/export`, Administrateur seul) et Paramètres →
  « Importer des données » (`/app/parametres/import`).
- **À savoir** : l'import fait toujours une simulation avant le vrai import ; rejouer un fichier ne crée rien en double.
  Ordre conseillé pour reprendre un espace : champs personnalisés → contacts → leads → deals → produits → devis →
  factures. Limites : 5 000 lignes et 4 Mo par fichier. Ne sont pas exportés : pièces jointes, pièces privées, valeurs des
  champs personnalisés, comptes, mots de passe, clés d'API. Chaque téléchargement est consigné (qui, quoi, combien).
- **Code** : `src/lib/export/`, `src/lib/import/`, `src/app/app/parametres/export|import`, table `journal_export_donnees`
  (migration `0112`).

## Leads depuis le site web de l'entreprise — clés d'API (2026-10-09)

- **Quoi** : un site externe envoie ses demandes (contact, devis, commande…) vers le CRM ; chacune devient un lead,
  assigné au premier Administrateur actif, qui est prévenu par email. Un envoi répété avec la même référence ne crée
  jamais de doublon, et peut **compléter** le lead existant (`miseAJour`).
- **Où** : Paramètres → Intégrations (création et révocation des clés) ; point d'entrée `POST /api/externe/leads`.
- **À savoir** : la clé (`vo_…`) n'est affichée qu'une fois. Elle ne s'envoie jamais depuis un navigateur : l'appel part
  du serveur du site. L'entreprise est toujours celle de la clé. Un espace dont l'abonnement est suspendu reçoit une
  réponse 402. Un nom provisoire (« Prospect … ») est remplacé par le vrai nom, mais une saisie humaine n'est jamais
  écrasée.
- **Code** : `src/app/api/externe/leads/route.ts`, `src/lib/api-externe/`, tests `tests/api-externe-leads.test.ts`.
  Exemples d'émetteurs : `vertex-technology-site/src/lib/vertexone/client.ts`, `Global-Mobility/src/lib/vertexone/client.ts`.

## Profil « immigration et mobilité internationale » (2026-10-09)

- **Quoi** : au choix du secteur à l'inscription, l'espace reçoit des champs de contact adaptés aux dossiers de visa.
- **Code** : `src/lib/profils/immigration.ts`.

## CRM : écrire au client, supprimer (2026-10-08)

- **Écrire** : bouton « Envoyer un email » sur la fiche contact ; l'email part réellement (Resend) au nom de l'entreprise,
  les réponses arrivent à l'expéditeur, le message est conservé dans l'historique du contact. Bouton grisé si le contact n'a
  pas d'adresse.
- **Supprimer** : un lead, un contact ou un deal ne se supprime que par l'Administrateur, avec confirmation ; un contact
  lié à un devis, une facture, un dossier ou un deal est refusé et rien n'est supprimé.
- **Code** : `src/lib/actions/email-client.ts`, `src/app/app/contacts/[id]/`.

## One Docs : supprimer et remplacer (2026-10-08)

- **Quoi** : supprimer un document ou le remplacer par une nouvelle version, avec confirmation. Un document sensible
  (pièce d'identité, données de santé) reste réservé au responsable du dossier et à l'Administrateur.
- **Code** : `src/lib/actions/document.ts`.

## Logo de l'entreprise (2026-10-08)

- **Quoi** : chaque espace peut mettre son logo ; il s'affiche sur les devis, factures, emails et pages envoyées aux
  clients, toujours sur un panneau blanc, entier, jamais rogné.
- **Code** : `src/components/logo-entreprise.tsx`.

## Formulaires et paiements — nouvelle boîte à outils (2026-10-10)

- **Quoi** : champs à libellé flottant, cartes de choix, écrans de paiement animés (attente avec ondes et étapes, succès
  avec coche dessinée, échec), jauge de solidité du mot de passe, saisie du code à 6 chiffres case par case, frise
  « consulter → répondre → régler » sur les pages client.
- **Où c'est appliqué** : abonnement et page d'accès suspendu ; facture, devis, signature et réservation envoyés aux
  clients ; connexion, inscription, mot de passe oublié et réinitialisation ; nouveau contact, lead, deal et devis.
- **Pour un nouveau formulaire** (règles) :
  - utiliser `src/components/formulaire/` : `Champ`, `ChampZone`, `ChampSelect`, `ChoixCartes`, `CadreFormulaire`,
    `SectionFormulaire` ; pour un paiement `ecrans-paiement.tsx` ; pour une page client `parcours-client.tsx` ;
  - **garder les `id`, `name` et les textes de boutons** (les tests Playwright et les Server Actions en dépendent) ;
  - tout texte passe par `t()`/`m()` avec sa traduction anglaise (test `tests/i18n-catalogue.test.ts`), sauf les pages
    publiques envoyées au client, pas encore traduites ;
  - couleurs : uniquement les jetons de la charte (jamais d'hexadécimal), sauf la couleur d'une marque tierce
    (MTN, Orange) ;
  - les animations sont des classes CSS de `src/app/globals.css` (`animate-onde-paiement`, `animate-trace-coche`…) et
    s'éteignent avec `prefers-reduced-motion`.
- **Pas encore converti** : environ 120 formulaires (RH, comptabilité, projets, achats, recrutement…). La boîte à outils
  est prête, la conversion se fait module par module.

## One Recruit : le candidat est prévenu à chaque changement de statut (2026-10-11)

- **Quoi** : quand un recruteur change le statut d'une candidature (en examen, entretien, offre, embauche, rejet), le candidat reçoit un email au nom de l'entreprise ; sa réponse arrive au recruteur qui a fait le changement. Rien n'est envoyé si le statut ne change pas, si la candidature repasse à « Reçue », si le candidat n'a pas laissé d'adresse, ou à l'annulation et au rétablissement d'une candidature (boutons « Annuler » / « Rétablir »).
- **Où** : Recrutement → liste des candidatures (la phrase sous le statut dit si le candidat sera prévenu) ; réglage « Prévenir les candidats par email » dans Recrutement → Paramètres, activé par défaut.
- **À savoir** : l'envoi part après la réponse, jamais pendant la sauvegarde — un échec d'envoi ne défait pas le changement de statut. Les textes par défaut sont sobres (le rejet remercie sans donner de motif) et **personnalisables** par entreprise dans Paramètres → Modèles d'email, section « Candidatures » : un modèle par statut, variables `{{candidat}}`, `{{poste}}`, `{{entreprise}}`, aperçu en direct avec des valeurs d'exemple, bouton « Rétablir le texte par défaut ». Le HTML saisi dans un modèle est neutralisé et l'objet reste sur une seule ligne.
- **Code** : `src/lib/recrutement/notification.ts`, `changerStatutCandidature()` dans `src/lib/actions/recrutement.ts`, colonne `parametre_recrutement.notifier_candidats` (migration `0113`), cinq nouveaux types dans l'enum `type_modele_email` (migration `0114`), modèles par défaut dans `src/lib/email/modeles.ts`, tests `tests/recrutement-notification.test.ts` (dont la fuite entre entreprises).

## Paiement Mobile Money — état au 2026-10-10

- Le paiement direct (sans redirection) est branché pour l'abonnement et pour Global Mobility. La confirmation vient de
  la relecture du statut chez Aangaraa Pay, jamais de la seule notification.
- **Point ouvert** : le paiement direct renvoie encore une erreur 400 chez certains opérateurs et la demande de validation
  MTN n'arrive pas ; réponse du support Aangaraa Pay attendue. Le lien hébergé de secours expose la clé d'application dans
  le code de sa page : à trancher (garder, couper ou renouveler la clé).
