# Fonctionnalités récentes de Vertex One — mode d'emploi et repères techniques

Document tenu à jour à chaque nouvelle fonctionnalité visible par un client (règle du 2026-10-10 : toute fonctionnalité
est documentée ici **et** reflétée sur le site vitrine — `src/lib/marketing/modules.ts`, avec sa traduction anglaise dans
`src/lib/i18n/catalogue/vitrine-modules.ts`). Pour chaque entrée : ce que ça fait pour l'utilisateur, où le trouver, et
où se trouve le code.

## Supprimer un Manager, un Employé ou un client du portail (2026-10-22)

- **Quoi** : dans Paramètres → Équipe, l'Administrateur retire un Manager, un Employé (bouton « Supprimer » sur sa ligne, confirmation en ligne)
  ou un client du portail (section « Clients du portail »). Le compte ne peut plus se connecter, sort des listes, ses sessions et son mot de
  passe sont effacés, son adresse email est libérée (on peut réinviter la personne) et ceux qu'il encadrait n'ont plus de manager.
  **Son historique reste** (documents, tâches, messages gardent leur auteur) : une facture ne s'efface jamais.
- **Pas possible** : supprimer son propre compte, un autre Administrateur, ou un compte d'une autre entreprise. Réservé à l'Administrateur.
- **Code** : `supprimerCompte()` (`src/lib/actions/suppression-compte.ts`), statut `SUPPRIME` ajouté à `statut_utilisateur` (migration `0118`),
  `membres-equipe.tsx`, tests `tests/suppression-compte.test.ts` (dont l'isolation entre entreprises).
- **Pas encore** : effacement définitif d'un compte, annulation d'une suppression ; les listes de choix d'un responsable qui ne filtrent pas
  encore sur le statut peuvent afficher un compte supprimé.

## Rédiger un document dans Vertex One (2026-10-22)

- **Quoi** : un éditeur de documents (lettres, contrats, comptes rendus...) dans One Docs : titres, gras/italique/souligné/barré,
  listes, citations, tableaux (lignes/colonnes, fusion), images, alignements, séparateurs et sauts de page. L'en-tête reprend l'identité
  de l'entreprise (logo, nom, adresse, NIU/RCCM et, si elle appartient à un groupe, « Une entreprise du groupe X »), avec une
  référence, la date du jour et deux textes libres ; le pied de page porte trois textes libres et la numérotation (« Page 2 / 5 »,
  « Page 2 » ou aucune, à gauche, au centre ou à droite). L'en-tête s'affiche sur toutes les pages, sur la première seulement
  (papier à en-tête) ou sur les suivantes seulement (version compacte, sans logo). Marges étroites, normales ou larges.
  Enregistrement automatique 1,5 s après la dernière modification ; **aperçu PDF** exact dans la page ; téléchargement en **PDF**
  et en **Word (.docx)** ; « Ajouter aux Documents » range le fichier dans One Docs comme n'importe quel téléversement.
- **Où** : One Docs → « Rédiger un document » (`/app/documents/rediger`). Droits du module Documents : voir (lire, exporter), créer,
  modifier, supprimer ; la portée suit le rôle (un Employé ne voit que ses propres documents).
- **Sécurité** : le contenu est stocké en JSON (jamais en HTML) et **revalidé en liste blanche à chaque enregistrement** (types de
  blocs, styles, attributs, 4 Mo au total, 8 images de 1 Mo, images intégrées PNG/JPEG uniquement — jamais d'adresse distante) ;
  la table `document_redige` porte `entreprise_id`, RLS + FORCE ; l'export revérifie session, droit et portée à chaque appel.
- **Pièges react-pdf trouvés en construisant** (chacun vérifié par essai, voir `DocumentRedigePDF`) : l'en-tête réservé aux pages
  suivantes est un élément dynamique (`render`) qui disparaît du PDF si la page porte un `lineHeight`, si un style est un
  tableau (au lieu d'un objet) ou si l'élément est un composant React (au lieu d'être appelé comme une fonction) ; il ne peut
  pas contenir d'image, d'où la version compacte sans logo. Le texte d'un PDF se vérifie dans les tests en décompressant ses flux.
- **Code** : `src/lib/redaction/` (`contenu.ts`, `mise-en-page.ts`, `identite.ts`, `rendu-pdf.tsx`, `rendu-docx.ts`, `service.ts`),
  `src/lib/actions/redaction.ts`, `src/app/app/documents/rediger/` (liste, éditeur TipTap, route d'export), migration `0117`,
  tests `tests/redaction-rendu.test.ts`, `tests/redaction-isolation.test.ts`, `tests-e2e/redaction-documents.spec.ts`.
- **Pas encore** : liens, polices personnalisées, commentaires, historique des versions, modèles de documents, rattachement à un
  contact ou un dossier, tableaux avec cellules fusionnées en Word dans tous les cas (le rendu PDF les place sur une ligne simple).

## One Recruit : le message au candidat se relit et se modifie avant l'envoi (2026-10-22)

- **Quoi** : quand on change le statut d'une candidature, une fenêtre montre le message qui partirait (modèle de l'entreprise,
  variables remplacées) : l'objet et le texte sont modifiables, puis « Envoyer et changer le statut », « Changer sans prévenir »
  ou « Annuler » (le statut reste inchangé). Sans adresse email, pour « Reçue » ou quand l'entreprise a coupé les notifications,
  le statut change directement, comme avant. Annuler/rétablir une candidature ne prévient toujours personne.
- **Où** : One Recruit → fiche d'une candidature → sélecteur « Statut ». Les modèles par défaut restent dans Paramètres → Modèles d'email.
- **Sécurité** : le destinataire vient TOUJOURS de la candidature en base ; le message modifié est revalidé côté serveur (objet
  sur une ligne de 200 caractères au plus, texte de 5 000 au plus) et échappé en HTML ; ses `{{variables}}` ne sont pas réinterprétées.
- **Code** : `apercuEmailStatut()`, `nettoyerContenuPersonnalise()` et le paramètre `contenu` de `changerStatutEtPreparerEmail()`
  (`src/lib/recrutement/notification.ts`), `apercuEmailStatutCandidature()` et `changerStatutCandidature(..., { objet, corps })`
  (`src/lib/actions/recrutement.ts`), `controles-candidature.tsx`, tests `tests/recrutement-notification.test.ts`.

## Publicités Facebook : les prospects deviennent des leads (2026-10-13)

- **Quoi** : l'Administrateur relie la page Facebook de son entreprise ; chaque prospect qui remplit le formulaire d'une
  de ses publicités (Lead Ads) devient automatiquement un lead du CRM, assigné au premier administrateur, qui est prévenu
  par email. Les réponses du formulaire sont conservées dans le message du lead ; un même prospect renvoyé par Meta ne crée
  jamais de doublon (référence `facebook-<id>`, source « Facebook Ads »). Les messages Messenger viendront plus tard.
- **Où** : Paramètres → Intégrations → « Publicités Facebook » (bouton « Relier ma page Facebook », liste des pages reliées,
  « Déconnecter »). Administrateur seul.
- **Comment ça marche** : connexion Facebook (OAuth) → choix de la page → Vertex One abonne la page aux événements
  `leadgen` → Meta appelle `POST /api/facebook/webhook` à chaque prospect → l'entreprise est retrouvée par la PAGE.
- **Sécurité** : le jeton de page est chiffré (AES-256-GCM, clé dérivée de `META_APP_SECRET`, jamais renvoyé au navigateur) ;
  `connexion_facebook` (stricte, RLS + FORCE) et `routage_facebook_page` (lecture anonyme limitée à « page → entreprise »,
  comme `invitation`) ; l'état OAuth est signé, daté et lié à l'utilisateur et à son navigateur ; chaque webhook est vérifié
  par sa signature `X-Hub-Signature-256` ; une page ne peut être reliée qu'à UNE entreprise ; un espace suspendu ne reçoit rien.
- **À configurer (une fois, côté Vertex Technology)** : une App Meta avec « Facebook Login » et le produit « Webhooks » (objet
  Page, champ `leadgen`) ; dans Vercel : `META_APP_ID`, `META_APP_SECRET`, `FACEBOOK_WEBHOOK_VERIFY_TOKEN` ; URL de rappel du
  webhook `https://vertexone.cm/api/facebook/webhook` ; URI de redirection OAuth `https://vertexone.cm/api/facebook/callback`.
- **Limite importante** : les autorisations `leads_retrieval`, `pages_manage_metadata`, `pages_show_list` et
  `pages_read_engagement` exigent la **vérification de l'application par Meta** (accès avancé, souvent la vérification de
  l'entreprise) pour fonctionner avec des pages qui ne sont pas celles des administrateurs de l'App. Avant cela, seuls les
  rôles de l'App (administrateurs, développeurs, testeurs) peuvent relier leurs pages. **Non vérifié en réel au 2026-10-13** :
  seule la partie Vertex One est testée (Graph simulé, base réelle). Ne pas l'annoncer sur le site vitrine avant un essai réel.
- **Code** : `src/lib/facebook/` (`jetons.ts`, `graph.ts`, `prospect.ts`, `traitement.ts`, `evenements.ts`),
  `src/app/api/facebook/{webhook,callback}`, `src/lib/actions/facebook.ts`, `src/app/app/parametres/integrations/pages-facebook.tsx`,
  migration `0116`, tests `tests/facebook-prospects.test.ts` (dont la fuite entre entreprises).

## Connexion et inscription : refonte animée (2026-10-13)

- **Quoi** : panneau de marque avec diaporama automatique (3 messages, suspendu au survol), cartes de démonstration qui
  flottent, fond en dégradé et motif de points ; apparition en cascade des champs ; à la connexion, avertissement
  « verrouillage majuscules », coche de succès avant l'ouverture de l'espace ; à l'inscription, barre de progression qui
  se remplit pendant la saisie. Tout s'éteint avec `prefers-reduced-motion` ; sur mobile le panneau laisse la place au logo.
- **Code** : `src/components/auth/panneau-marque.tsx`, `src/app/(auth)/`, classes `animate-auth-*` de `globals.css`.
- **Tests** : les parcours Playwright choisissent le secteur par ses cartes (`getByRole("radio", { name: "Agence" })`) — la liste
  déroulante `#secteurProfil` n'existe plus depuis la boîte à outils des formulaires.

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

## Paiement Mobile Money — état au 2026-10-13

- Le paiement direct (sans redirection) est branché pour l'abonnement et pour Global Mobility. La confirmation vient de
  la relecture du statut chez Aangaraa Pay, jamais de la seule notification.
- **Vérifié en réel le 2026-10-13** (Orange et MTN) : le paiement direct fonctionne. L'erreur 400 du 2026-10-08 n'a pas pu
  être reproduite (incident passager du prestataire), et « MTN n'envoie pas d'invite » venait d'un solde MoMo insuffisant :
  MTN refuse aussitôt (`LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED`) quand le solde est inférieur au montant.
- **Message d'échec précis** : le client voit « solde Mobile Money insuffisant », « demande expirée » ou « annulé sur votre
  téléphone » au lieu d'un échec générique (colonne `raison_echec`, `src/lib/aangaraa/messages-echec.ts`).
