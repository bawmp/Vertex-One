# Fonctionnalités récentes de Vertex One — mode d'emploi et repères techniques

Document tenu à jour à chaque nouvelle fonctionnalité visible par un client (règle du 2026-10-10 : toute fonctionnalité
est documentée ici **et** reflétée sur le site vitrine — `src/lib/marketing/modules.ts`, avec sa traduction anglaise dans
`src/lib/i18n/catalogue/vitrine-modules.ts`). Pour chaque entrée : ce que ça fait pour l'utilisateur, où le trouver, et
où se trouve le code.

## Fin de parcours : le client est renvoyé vers son espace de suivi (2026-10-23)

- **Quoi** : une fois sa facture payée, le client (page publique `/facture/<jeton>`) voit « Cette facture est réglée. Merci ! » et un bouton **« Accéder à mon espace de suivi »** ; juste après le paiement (moins de 30 minutes), un compte à rebours de 8 s l'y emmène tout seul, avec « rester sur cette page » pour l'annuler (reçu à télécharger). Une facture réglée rouverte plus tard n'affiche que le bouton, jamais de redirection automatique. S'il choisit de payer plus tard, le bouton est déjà là sous la facture. Sans adresse d'espace pour ce client, rien ne change.
- **D'où vient l'adresse** : le site de l'entreprise l'envoie avec la demande (champ `espaceClientUrl` de `POST /api/externe/leads`, stocké sur le lead, repris sur le contact à la conversion) ; ou on la saisit/retire sur la fiche du contact (« Espace de suivi du client »). **Global Mobility** : son site ouvre le suivi du dossier avant d'envoyer la demande et transmet `https://…/suivi/<jeton>` ; les dossiers créés avant ce changement n'ont pas d'adresse : à saisir sur la fiche du contact (le lien est dans l'admin du site, page Demandes).
- **Sécurité** : le client est REDIRIGÉ vers cette adresse, donc seule une adresse **https** propre est acceptée (`adresseEspaceClientSure()`, `src/lib/client-documents/espace-client.ts` : ni `javascript:`, ni `data:`, ni identifiants intégrés, ni espaces, 500 caractères au plus), à l'enregistrement (API et fiche) ET avant d'être transmise à la page publique. La saisie sur la fiche exige le droit de modifier le CRM et un contact dans la portée de l'utilisateur.
- **Code** : colonnes `lead.espace_client_url` et `contact.espace_client_url` (migration `0120`), `src/app/facture/[jeton]/redirection-espace-client.tsx`, `recupererFacturePourClient()` (`espaceClientUrl`, `dernierPaiementLe`), `definirEspaceClientContact()`, `src/app/app/contacts/[id]/espace-client.tsx`, tests `tests/espace-client.test.ts`.
- **Pas encore** : redirection à l'acceptation du devis (choix : après le paiement) ; adresse par entreprise sans lien personnalisé ; portail client de Vertex One (reste réservé aux tickets d'assistance).

## Supprimer un devis en brouillon ; numérotation alignée sur les documents existants (2026-10-23)

- **Supprimer un brouillon** : un devis jamais envoyé (statut « Brouillon ») se supprime depuis la liste des devis (icône corbeille) ou depuis sa fiche (« Supprimer ce brouillon »), après confirmation ; ses lignes et son lien partent avec lui. Un devis envoyé, accepté, refusé ou expiré **ne se supprime pas** (trace de ce qui a été proposé), et une facture non plus (voir CLAUDE.md). Droit de modifier la facturation + devis dans la portée de l'utilisateur ; le statut est relu en base. Le numéro d'un devis supprimé n'est pas réutilisé (la numérotation des devis n'est pas fiscale, seule celle des factures doit rester sans trou). Code : `supprimerDevis()` (`src/lib/actions/devis.ts`), `BoutonSupprimerDevis`, test `tests/suppression-devis.test.ts`.
- **Bug réel corrigé (acceptation d'un devis par le client = « This page couldn't load »)** : les documents copiés d'une entreprise à une autre (transfert Vertex Technology → Global Mobility) gardaient leur numéro, mais **le compteur de l'entreprise d'arrivée était resté en retard** : le numéro suivant (`FAC-2026-000001`) existait déjà et l'insertion violait `facture_entreprise_numero_unique`. Trouvé en rejouant l'acceptation dans une transaction annulée sur la production. Correctif : `incrementerCompteur()` (`src/lib/facturation/numerotation.ts`) **aligne d'abord le compteur sur le plus grand numéro déjà émis** (devis, factures, bons de commande, reçus, acomptes, achats), dans la même instruction atomique ; sans retard, `greatest()` ne change rien (aucun trou, aucun saut). Test : `tests/numerotation-alignement.test.ts`.
- **Seulement les numéros au format du système** (`FAC-2026-000007`, 9 chiffres au plus) comptent pour l'alignement : une facture importée d'un autre outil garde son numéro d'origine (`INV-20241015`, `2024/0045`…), sans rapport avec ce compteur ; la prendre en compte ferait sauter la numérotation, voire dépasserait la capacité de l'entier. Testé.
- **Pour un futur transfert ou import de documents numérotés** : le compteur se met à niveau tout seul au prochain document.

## État du devis : la réponse du client se voit (2026-10-22)

- **Quoi** : quand le client répond depuis son lien, l'état du devis le dit : « Accepté par le client » / « Refusé par le client » (badge vert ou rouge) dans la liste des devis, sur la fiche du devis, sur la fiche du contact et sur celle du deal. Sur la fiche du devis, un bandeau donne la date et l'heure de la réponse et la facture créée automatiquement (acceptation), ou le motif (refus). Un devis marqué accepté par un collaborateur reste « Accepté » tout court : il n'y a pas de date de réponse du client, et il n'est jamais présenté comme la décision du client.
- **Code** : `statutDevisAffiche()` (`src/lib/libelles.ts`, repose sur `devis.reponseLe` posé par l'acceptation ou le refus public), `src/app/app/facturation/devis/[id]/page.tsx`.
- **Pas encore** : une notification dans l'application (cloche, compteur) à la réponse du client ; aujourd'hui l'alerte part par email à l'assigné et au créateur du devis.

## Aperçu avant envoi et souche des emails envoyés (2026-10-22)

- **Aperçu avant envoi** : sur un devis ou une facture, « Aperçu avant envoi » ouvre une fenêtre avec l'email tel qu'il partira (destinataire,
  objet, message, pièce jointe) à côté du vrai PDF. Rien n'est envoyé ni enregistré tant qu'on ne clique pas sur « Envoyer au client par
  email ». Sous 1024 px de large, deux onglets « Message » et « Document (PDF) » (un seul volet à la fois) ; au-dessus, côte à côte ; un lien « Ouvrir dans un nouvel onglet » sert de secours si le navigateur n'affiche pas le PDF intégré. Si le client n'a pas d'adresse email, l'aperçu le dit et l'envoi est désactivé. L'email est composé par le même code que l'envoi
  réel (`composerEmailDevis()` / `composerEmailFacture()`), donc l'aperçu ne peut pas différer de ce qui part.
- **Retour après avoir modifié le message** : « Personnaliser le message » (sur un devis ou une facture) ouvre le bon modèle d'email avec un bouton « Retour au devis » / « Retour à la facture » en haut, et de nouveau juste après « Enregistrer » ; on revient envoyer. Sans page d'origine (arrivée par le menu), la page des modèles affiche un bouton « Retour » (`BoutonRetour`, page précédente du navigateur). Le chemin de retour (`?retour=`) n'accepte qu'une page interne de l'application (`cheminRetourSur()`, `src/lib/navigation-retour.ts`, testé contre les redirections ouvertes).
- **Souche** : chaque email envoyé à un client (devis, facture, bon de commande, reçu, acompte, contrat, relance, campagne, confirmation
  après acceptation d'un devis) est conservé tel quel dans `email_envoye` : destinataire, objet, corps, noms et tailles des pièces jointes,
  date, auteur. **Paramètres → Emails envoyés** : liste, recherche (destinataire, objet) et filtre par type ; le détail affiche le message
  dans un cadre isolé. L'Administrateur voit tous les envois de l'entreprise, les autres seulement les leurs (jamais un envoi automatique
  ni celui d'un collègue).
- **Sur la fiche du contact** : une section « Emails envoyés » liste ses emails (objet, date, pièce jointe) ; un clic ouvre la copie complète, qui renvoie à la fiche. Mêmes règles de visibilité (`listerSoucheContact()`).
- **Pas conservé** : le PDF joint lui-même (il se régénère depuis le document) ; les emails qui ne passent pas par `journaliserEmailEnvoye()`
  (alertes internes à l'équipe, messages de candidats, emails d'accès) ne sont pas dans la souche.
- **Code** : `emailEnvoye` (migration `0119`, RLS + FORCE), `journaliserEmailEnvoye(..., { souche })` (`src/lib/crm/journaliser-email.ts`),
  `src/lib/email/souche.ts`, `src/app/app/parametres/emails-envoyes/`, `src/app/app/facturation/apercu-avant-envoi.tsx`,
  tests `tests/souche-emails.test.ts` (isolation entre entreprises incluse).

## Logo en filigrane sur les documents de vente (2026-10-22)

- **Quoi** : le logo de l'entreprise apparaît en filigrane (centré, très pâle, sous le texte) sur chaque page de ses devis, factures, bons de
  commande, reçus et factures d'acompte. Sans logo enregistré (Paramètres → Entreprise), rien n'est ajouté ; le logo officiel Vertex One
  n'est jamais substitué sur le document d'un client.
- **Code** : `DocumentCommercialPDF` (`src/lib/pdf/document-commercial.tsx`, prop `filigrane`, activée par défaut), test `tests/pdf-filigrane.test.ts`.
- **Formats** : react-pdf ne dessine que le PNG et le JPEG ; un logo SVG, WebP ou GIF est converti en PNG à la volée pour le PDF (`src/lib/pdf/logo.ts`, bibliothèque `sharp` ; le fichier d'origine reste intact). **Un SVG qui contient du texte n'est pas converti** (les polices manquent sur le serveur : les lettres deviendraient des carrés) : le document sort sans logo plutôt qu'avec un logo abîmé ; un SVG dont les lettres sont des tracés se convertit bien. **Un logo PNG ou JPEG est le choix sûr** (le formulaire du logo le conseille). Un autre format, ou une conversion impossible, donne un document sans logo ni filigrane. Si le rendu échoue malgré tout, il est refait sans logo et l'erreur est journalisée (`[pdf]`).
- **Montants** : dans les PDF, les milliers sont séparés par une espace ordinaire (« 150 000 FCFA ») grâce à `formaterFCFAPourPDF()` ; l'espace fine insécable du format français (U+202F) n'existe pas dans la police standard des PDF et s'y dessinait « / » (« 150/000 »). L'interface web et les emails gardent `formaterFCFA()`.
- **Réglage** : Paramètres → Personnalisation → « Afficher le logo en filigrane sur les devis, factures et autres documents PDF » (case à cocher, enregistrée aussitôt, activée par défaut) ; colonne `entreprise.filigrane_documents` (migration `0121`), action `definirFiligraneDocuments()`, droit de modifier les paramètres. Décoché : plus de filigrane sur tous les PDF de vente de l'entreprise ; le logo d'en-tête reste.
- **Pas encore** : certificat de signature, documents rédigés dans One Docs.

## Interface plus accueillante : tableau de bord et états vides (2026-10-22)

- **Quoi** : l'accueil salue la personne par son prénom, affiche la date du jour et propose des raccourcis (nouveau contact, nouveau devis,
  factures) selon ses droits. L'Administrateur voit une liste « Premiers pas » (premier contact, premier devis ou facture, inviter un
  collègue) avec une barre d'avancement, qui disparaît d'elle-même quand tout est fait. Une liste vide montre une icône, un titre et une
  phrase qui dit quoi faire (contacts pour commencer).
- **Code** : `src/app/app/page.tsx`, composant réutilisable `src/components/etat-vide.tsx` (à utiliser à la place d'une ligne « Aucun … »).
- **Appliqué à** : contacts, leads, deals, comptes, documents, produits. Les autres listes gardent leur ligne de texte.

## Supprimer un Manager, un Employé ou un client du portail (2026-10-22)

- **Quoi** : dans Paramètres → Équipe, l'Administrateur retire un Manager, un Employé (bouton « Supprimer » sur sa ligne, confirmation en ligne)
  ou un client du portail (section « Clients du portail »). Le compte ne peut plus se connecter, sort des listes, ses sessions et son mot de
  passe sont effacés, son adresse email est libérée (on peut réinviter la personne) et ceux qu'il encadrait n'ont plus de manager.
  **Son historique reste** (documents, tâches, messages gardent leur auteur) : une facture ne s'efface jamais.
- **Désactiver / activer** : le même écran propose « Désactiver » (accès coupé tout de suite, sessions fermées, mot de passe conservé) et, sur un
  compte désactivé, « Activer » (l'accès revient tel quel). Valable pour Manager, Employé et client du portail ; `definirActivationCompte()`.
- **Invitations** : chaque invitation en attente ou expirée a un bouton « Annuler l'invitation » (le lien ne permet plus de créer de compte ;
  `annulerInvitation()`). Supprimer un compte annule aussi ses invitations restées sans suite, et une invitation déjà utilisée dont le compte
  a été supprimé n'est plus listée. Une invitation utilisée ne s'annule pas : on désactive ou supprime le compte.
- **Visibilité** : un compte supprimé n'apparaît plus dans les listes de choix (supports, tickets RH, départs, export, projets, recrutement,
  réservations), ni dans la liste RH ; un compte désactivé ou supprimé n'est plus réservable depuis la page publique de réservation.
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

## Factures et devis : le client paie sans quitter la page (2026-10-25)

- **Quoi** : depuis le lien d'une facture (ou d'un devis accepté, qui crée la facture), le client clique sur « Payer maintenant », saisit son numéro Mobile Money et son opérateur (Orange ou MTN), valide la demande qui arrive sur son téléphone, et la page confirme le paiement. Plus de page de paiement externe à ouvrir. L'équipe dispose du même parcours dans la fiche d'une facture (« Encaisser par Mobile Money »), pour un client au téléphone ou au guichet.
- **À savoir** : le paiement par carte bancaire n'est plus proposé pour les factures (Mobile Money uniquement, comme sur Global Mobility et Vertex Technology). Si le client ferme sa page après avoir validé, le serveur relit le statut chez Aangaraa Pay dans la minute et règle la facture. Au plus 5 tentatives par heure et par facture, et pas de seconde invite pendant 90 secondes.
- **Code** : `declencherPaiementDirectFacture()` (`src/lib/facturation/paiement-en-ligne.ts`), `payerFacturePublic()` / `verifierPaiementFacturePublic()` (`src/lib/actions/client-documents.ts`), `declencherPaiementFactureInterne()` (`src/lib/actions/facture.ts`), `relireEtConfirmerFacture()` (`src/lib/paiement/confirmation.ts`), composant `src/components/formulaire/paiement-mobile-money.tsx`, migration `0122` (colonnes `pay_token`, `raison_echec` sur `tentative_paiement_facture`), tests `tests/paiement-direct-facture.test.ts`.

## Factures : le client peut payer en plusieurs fois (2026-10-25)

- **Quoi** : sur le lien de sa facture, le client choisit « Tout le solde » ou « Une tranche » : il saisit le montant qu'il peut payer (au moins 1 000 FCFA, jusqu'au solde) ou prend un montant rapide, valide sur son téléphone, puis voit « Tranche reçue — il vous reste X ». Il peut payer la tranche suivante tout de suite ou plus tard depuis le même lien. L'équipe a le même choix dans « Encaisser par Mobile Money » sur la fiche d'une facture.
- **Où** : le réglage « Permettre à vos clients de payer leurs factures en plusieurs fois » est dans Paramètres → Personnalisation → Paiement des factures (activé par défaut). La fiche facture montre chaque règlement et « Reste à payer ».
- **À savoir** : la facture devient « Partiellement payée » après une tranche (elle reste « En retard » si elle l'était), puis « Payée » quand le total est atteint. Chaque tranche est un règlement distinct avec ses écritures comptables. « Marquer comme payée » règle seulement ce qui reste dû. La relance de retard annonce le montant restant. Au plus 5 tentatives par heure et par facture ; une tranche en attente de validation réserve son montant pendant 5 minutes.
- **Code** : `src/lib/facturation/tranche.ts` (règles pures) et `solde.ts`, `declencherPaiementDirectFacture()` (paramètre `montant`), `confirmerTentativeFacture()` (`src/lib/paiement/confirmation.ts`), composant `src/components/formulaire/paiement-mobile-money.tsx`, migration `0123`, tests `tests/tranche-logique.test.ts` et `tests/paiement-tranches.test.ts`.

## Chaque paiement de facture prévient l'Administrateur par email (2026-10-25)

- **Quoi** : dès qu'un client paie une facture par Mobile Money (en totalité ou par tranche), les Administrateurs actifs du compte reçoivent un email : nom du client, numéro de facture, montant, opérateur, et soit « facture entièrement réglée », soit le reste à payer, avec un lien vers la facture. Le paiement de l'abonnement à Vertex One prévenait déjà les Administrateurs.
- **À savoir** : l'email part après la confirmation, jamais pendant la réponse au client, et un échec d'envoi n'empêche jamais l'enregistrement du paiement. Un même paiement n'est notifié qu'une fois, même si le prestataire le signale plusieurs fois. Un paiement refusé, un montant inattendu ou une facture déjà réglée à la main n'envoient rien. Les pointages manuels faits par l'équipe ne sont pas notifiés (c'est elle qui les saisit).
- **Code** : `confirmerTentativeFacture()` et `notifierSansBloquer()` (`src/lib/paiement/confirmation.ts`), gabarit `gabaritPaiementFactureRecu()` (`src/lib/email/gabarits.ts`), destinataires `adressesAAlerter()` (`src/lib/notifications/equipe.ts`), tests `tests/paiement-notification-admin.test.ts`.

## Le client reçoit sa facture à jour après chaque paiement (2026-10-25)

- **Quoi** : après chaque paiement d'une facture par Mobile Money (en totalité ou par tranche), le client reçoit un email **au nom de l'entreprise, avec son logo en tête**, qui confirme le montant reçu, indique ce qui reste à payer (ou « entièrement réglée »), donne le lien privé de sa facture (pour payer la suite) et joint **la facture en PDF à jour**.
- **Le PDF** d'une facture qui a reçu des règlements affiche, sous le total, « Déjà réglé » et « Reste à payer » : même chose pour le PDF envoyé par email, téléchargé depuis le lien du client ou depuis la fiche de la facture. Une facture sans règlement reste identique à avant.
- **À savoir** : l'email part à l'adresse de la fiche contact du client ; s'il n'en a pas, rien ne part et l'Administrateur le lit dans sa propre notification. L'envoi ne ralentit jamais le client et un échec n'empêche pas l'enregistrement du paiement. L'email est conservé dans l'historique du contact (Paramètres → Emails envoyés). Un pointage manuel (« Marquer comme payée ») n'envoie pas de reçu au client.
- **Code** : `envoyerRecuAuClient()` (`src/lib/paiement/confirmation.ts`), `gabaritRecuPaiementClient()` (`src/lib/email/gabarits.ts`), prop `montantRegle` (`src/lib/pdf/document-commercial.tsx`), tests `tests/paiement-recu-client.test.ts`.

## Les paiements faits sur votre site deviennent des factures dans Vertex One (2026-10-25)

- **Quoi** : quand un client paie sur un site relié à Vertex One (Global Mobility, Vertex Technology), la facture payée est créée automatiquement dans votre compte : le client est ajouté (ou retrouvé) dans vos contacts, la facture reçoit son numéro, le règlement et les écritures comptables sont enregistrés, et **le client reçoit sa facture en PDF par email, à votre nom, avec votre logo**. Vous recevez aussi un email « Paiement reçu ». Dans l'admin du site, la fiche de la demande affiche le numéro de la facture, un lien pour la voir et pour la télécharger en PDF.
- **Où** : Paramètres → Intégrations : chaque clé d'API a un bouton « Autoriser les factures » (refusé par défaut). Dans l'admin du site, le bouton « Générer la facture » rattrape un paiement fait avant la mise en service ou dont la création a échoué.
- **À savoir** : la TVA est déduite du montant payé selon vos réglages (entreprise assujettie ou non). Si Vertex One est injoignable au moment du paiement, le site réessaie tout seul toutes les 5 minutes pendant 30 jours. Les paiements confirmés avant la mise en service ne sont jamais facturés automatiquement. Une facture créée ne peut jamais être supprimée (seul un avoir l'annule).
- **Code** : `src/app/api/externe/factures/route.ts`, `src/lib/api-externe/facture.ts`, `src/lib/paiement/recu-facture.ts`, migration `0124`, tests `tests/api-externe-factures.test.ts` ; côté sites : `src/lib/vertexone/facturation.ts`.

## Clés d'API : une pour les leads, une pour les factures, suppression d'une clé révoquée (2026-10-26)

- **Quoi** : Paramètres → Intégrations permet de créer une clé pour les leads et une autre, autorisée à facturer, pour les factures des paiements faits sur un site : la fuite de l'une ne donne jamais le droit de créer des factures. Une clé **révoquée** peut maintenant être supprimée définitivement (bouton « Supprimer » sur sa ligne) ; une clé encore active doit d'abord être révoquée.
- **À savoir** : supprimer une clé ne touche ni les leads ni les factures déjà créés avec elle. Côté site, la clé des factures se place dans `VERTEXONE_FACTURES_API_KEY` ; si cette variable est absente, le site utilise la clé des leads (qui doit alors être autorisée à facturer).
- **Code** : `supprimerCleApi()` (`src/lib/actions/cle-api.ts`), `cleFacturation()` (`src/lib/vertexone/facturation.ts` des sites), tests `tests/cle-api-facturation.test.ts`.


## L'acompte encaissé se déduit tout seul de la facture du client (2026-10-26)

- **Quoi** : dès qu'une facture d'acompte est **encaissée**, son montant est déduit de la facture du même client, et la facture affiche clairement ce qui a été déduit et le **reste à payer**. Dans l'autre sens aussi : si l'acompte était déjà encaissé quand la facture est émise (depuis un devis accepté, un bon de commande, une facture récurrente ou une entrée de temps), il est déduit dès l'émission.
- **Règles** : l'acompte ne s'applique qu'à une facture du **même client** ; si l'acompte et la facture sont chacun rattachés à une affaire, ce doit être la **même affaire**. Application **partielle** : on déduit le plus petit du reste de l'acompte et du solde de la facture ; ce qui reste de l'acompte attend la facture suivante. Plusieurs factures ouvertes : la plus ancienne d'abord. Une facture déjà payée n'est jamais touchée ; un acompte seulement émis (non encaissé) ne déduit rien. Un acompte rattaché à une autre affaire (ou un cas particulier) reste applicable à la main (bouton « Appliquer », désormais partiel lui aussi).
- **Où le client le voit** : le PDF de la facture (« Acompte ACO-… » (en négatif), « Déjà réglé », puis « Reste à payer » en gras), la page publique envoyée au client (récapitulatif Total TTC / acompte déduit / reste à payer) et, côté équipe, la liste des paiements de la facture (« Acompte ACO-… »). La facture passe à « Partiellement payée » (ou « Payée » si l'acompte couvre tout) et le client paie ensuite le reste en ligne, en une fois ou par tranches, comme d'habitude.
- **Comptabilité** : aucun mouvement de trésorerie à la déduction (l'argent est entré à l'encaissement de l'acompte) : l'avance (419100) est soldée contre la créance client (411000). Une déduction n'est jamais proposée en rapprochement bancaire.
- **Code** : `src/lib/facturation/acompte.ts` (`appliquerAcomptesSurFacture`, `appliquerAcompteSurFacturesOuvertes`, `deduireAcompteManuellement`, `extraireAcomptesDeduits`) ; la déduction est un **règlement** (moyen « manuel », référence `acompte:<numéro>`), donc le solde, le statut et l'email de reçu la reflètent sans cas particulier ; prop `acomptesDeduits` (`src/lib/pdf/document-commercial.tsx`) ; tests `tests/acompte-deduction.test.ts`. Aucune migration.

## L'invitation d'un collaborateur part par email (2026-10-26)

- **Quoi** : Paramètres → Équipe → « Inviter » envoie directement un email à la personne (Manager, Employé, ou client du portail), **au nom de l'entreprise avec son logo**. Elle ouvre le lien, choisit son mot de passe (8 caractères minimum), puis se connecte à chaque fois avec **son adresse email et ce mot de passe**. Plus de lien à copier-coller (il reste affiché en secours).
- **Où** : dans la liste des invitations, « Renvoyer par email » pour une invitation encore valable (même lien, aucun nouveau jeton) ; le lien expire toujours au bout de 72 heures.
- **À savoir** : si l'email ne peut pas partir (service d'envoi indisponible), l'invitation est quand même créée et le message l'indique avec le lien à transmettre. Les noms saisis sont échappés dans l'email. Un mot de passe oublié se récupère par « Mot de passe oublié » ou « Renvoyer un accès » (inchangé).
- **Code** : `src/lib/invitations/envoi.ts` (`composerEmailInvitation`, `envoyerEmailInvitation`), `creerInvitation()` et `renvoyerInvitationParEmail()` (`src/lib/actions/invitation.ts`), `bouton-renvoyer-invitation.tsx`, tests `tests/invitation-email.test.ts`. Aucune migration.

## L'espace client montre aussi les factures et les devis (2026-10-26)

- **Quoi** : un client invité au portail (`/portail`) voit maintenant, au-dessus de ses tickets d'assistance, **« Mes factures »** (numéro, date, montant, statut À payer / Partiellement payée / Payée / En retard, et le **reste à payer** quand un acompte ou une tranche a déjà été réglé) et **« Mes devis »** (numéro, montant, validité, statut En attente de votre réponse / Accepté / Refusé / Expiré). Un clic ouvre la page habituelle du document, la même que celle de l'email : le client y télécharge le PDF, paie (Mobile Money, en une fois ou par tranches), accepte ou refuse.
- **À savoir** : le client ne voit que les documents de SA fiche contact (jamais ceux d'un autre client, d'une autre entreprise), et jamais un brouillon de devis. Un document ne s'ouvre que si son identifiant appartient bien à son contact : `/portail/facture/<id>` et `/portail/devis/<id>` vérifient la propriété, créent au besoin le lien privé habituel (un seul par document, réutilisé) et y redirigent.
- **Code** : `src/lib/portail/documents.ts` (`lireDocumentsDuContact`, `trouverFactureDuContact`, `trouverDevisDuContact`), `src/app/portail/page.tsx`, routes `src/app/portail/{facture,devis}/[id]/route.ts`, tests `tests/portail-documents.test.ts` (dont le test de fuite entre clients et entre entreprises). Aucune migration.

## Réglage « Les managers voient toute l'entreprise » (2026-10-26)

- **Pourquoi** : par défaut, un Manager ne voit que les fiches assignées à lui ou à son équipe (les personnes dont il est le manager). Un nouveau manager sans équipe ni fiches à lui voit donc un espace vide, même si l'entreprise a des données.
- **Quoi** : Paramètres → « Visibilité des managers » : une case, désactivée par défaut, réservée à l'Administrateur. Activée, les Managers voient les contacts, devis, factures, projets, dossiers, documents, signatures, contrats, achats, réservations et tickets de **toute l'entreprise**.
- **Ce qui ne change pas** : leurs droits (ils ne suppriment toujours rien, n'ont ni la comptabilité ni les paramètres) ; la **RH** (dossiers, congés, salaires), le **recrutement** et la **messagerie** gardent leur règle d'équipe ; la restriction de modules choisie par l'Administrateur pour chaque personne reste prioritaire (un module fermé le reste) ; les Employés ne sont pas concernés ; les documents d'identité et de santé gardent leur accès restreint.
- **Code** : colonne `entreprise.managers_voient_tout` (migration `0125`), `portee()` et `MODULES_OUVERTS_AUX_MANAGERS` (`src/lib/permissions.ts`), lecture une fois par requête dans `recupererUtilisateurConnecte()` (`src/lib/session.ts`), `definirManagersVoientTout()` (`src/lib/actions/entreprise-branding.ts`), tests `tests/managers-voient-tout.test.ts`.

## Recrutement partagé entre les entreprises d'un groupe (2026-10-26)

- **Quoi** : deux entreprises d'un même groupe peuvent voir les postes et les candidatures l'une de l'autre, et leurs Managers les gérer. C'est une **exception volontaire** à l'isolation entre filiales (décidée jusque-là : aucun partage de données), limitée au recrutement.
- **Activation** : Recrutement → Paramètres → « Partager le recrutement avec le groupe » (Administrateur, désactivé par défaut). Le partage n'a d'effet que si **les deux** entreprises l'ont coché ; l'écran indique l'état de chaque autre entreprise du groupe. Quitter le groupe ou décocher le coupe aussitôt, des deux côtés.
- **Ce que voient l'Administrateur et les Managers** (qui ont accès au module Recrutement ; jamais les Employés) : sur la page Recrutement, les candidatures de l'autre entreprise (toutes, pas seulement celles qui leur sont assignées) avec un badge au nom de l'entreprise, leurs CV, et sur la page Postes une liste en lecture seule des postes du groupe.
- **Ce qu'ils peuvent faire** : changer le statut d'une candidature (le candidat est prévenu **au nom de l'entreprise qui a publié le poste** : ses modèles d'email, son logo, ses réglages) et corriger ses coordonnées. **Pas** : supprimer, convertir en employé (créer le compte), assigner, ni modifier les postes : cela reste à l'entreprise propriétaire.
- **Sécurité** : la RLS n'est pas élargie. Le partage rouvre une transaction DANS l'entreprise propriétaire, avec un identifiant d'entreprise que le serveur déduit lui-même de la base (même groupe, réglage actif des deux côtés), jamais du navigateur. Une candidature introuvable renvoie la même absence de résultat qu'une candidature d'une entreprise non partenaire.
- **Code** : colonne `entreprise.recrutement_partage_groupe` (migration `0126`), `src/lib/recrutement/partage.ts`, `src/lib/actions/recrutement.ts` (`resoudreProprietaireCandidature`, `definirRecrutementPartage`), route du CV, pages Recrutement / Postes / Paramètres, tests `tests/recrutement-partage-groupe.test.ts` (dont isolation entre groupes, entreprise qui n'a pas activé, Employé, RLS inchangée).

## Équipe de la console interne : un collaborateur gère Vertex One avec vous (2026-10-26)

- **Quoi** : la console interne (`/plateforme` : entreprises clientes, abonnements) n'était ouverte qu'aux emails de la variable `PLATEFORME_ADMINS`. Le **propriétaire** (ces emails) peut maintenant ajouter des **collaborateurs** depuis la console : menu « Équipe » (visible de lui seul) → email → Ajouter. Retrait en un clic, effet immédiat.
- **Droits** : un collaborateur voit tout ce que voit la console, et peut prolonger un essai, suspendre et réactiver une entreprise ; chaque action est journalisée **à son nom** (historique de l'entreprise). Il ne peut **ni ajouter ni retirer personne**, ni accéder à la page Équipe : le propriétaire garde seul le contrôle total.
- **À savoir** : la personne doit déjà avoir un compte Vertex One actif (par exemple invitée dans votre entreprise) ; sans cela on refuse l'ajout, sinon quelqu'un pourrait créer un compte avec cette adresse avant elle et hériter de l'accès. Un retrait garde la ligne (qui l'a ajouté, quand, qui l'a retiré) et peut être rétabli ; le compte désactivé d'un collaborateur n'a plus aucun accès. Le propriétaire (liste blanche) n'a pas besoin de figurer dans la table et ne peut pas être retiré par ce biais : seul qui contrôle la variable `PLATEFORME_ADMINS` sur Vercel le modifie.
- **Code** : table `membre_plateforme` (migration `0127`, niveau plateforme, sans `entreprise_id` ni RLS, comme `groupe`), `niveauPlateforme()` (`src/lib/plateforme/acces-logique.ts`), `niveauPlateformeCourant()` / `estProprietairePlateforme()` (`acces.ts`), `src/lib/plateforme/equipe.ts`, `ajouterMembrePlateforme()` / `revoquerMembrePlateforme()` (`src/lib/actions/plateforme.ts`), page `/plateforme/equipe`, tests `tests/equipe-plateforme.test.ts`.

## Fiches des stagiaires : professionnels et académiques (2026-10-27)

- **Deux sortes, volontairement différentes** :
  - **Stagiaire professionnel** : un employé de contrat « Stage » qui occupe déjà un poste, en **période probatoire**, rémunéré. Il a son compte et son dossier RH habituels (évaluations, congés, pointage, indemnité saisie comme un salaire, **visible de l'Administrateur et de l'intéressé seulement**). On l'ajoute par invitation avec le type de contrat « Stage » (ou en convertissant une candidature). Sa date de fin de stage est la « date de fin de contrat » de son dossier.
  - **Stagiaire académique** : un étudiant en stage de formation, **sans compte**. Une fiche : identité et contact, établissement, filière, niveau, tuteur à l'école, référence de la convention, mission, département, maître de stage (un employé), dates, indemnité mensuelle (**Administrateur seul**) et évaluation.
- **Où** : Ressources humaines → « Stagiaires » (Administrateur et Managers) : deux listes avec un badge « fin dans X j » à 14 jours, et « fin dépassée : décision à prendre » ensuite.
- **Fin de stage** : pour un **professionnel**, sur son dossier RH, l'Administrateur décide : **embauché** (le contrat devient CDI ou CDD avec la date d'effet, le compte est conservé) ou **non retenu** (date de départ posée, **compte désactivé**, dossier et historique conservés) ; une décision ne se reprend pas. Pour un **académique** : « stage terminé » ou « interrompu » avec l'évaluation finale ; ou « le prendre dans l'entreprise » (Administrateur) : une invitation à son email est créée (rôle, contrat Stage/CDD/CDI, date d'entrée) et la fiche passe à « embauché ».
- **Visibilité** : l'Administrateur voit tout ; un Manager voit les stagiaires de son équipe (et, pour les académiques, ceux dont le maître de stage est dans son équipe ou qu'il a créés), jamais l'indemnité des académiques ; un Employé n'en voit aucun. Une fiche d'une autre entreprise n'est jamais visible (RLS).
- **Code** : colonnes `dossier_rh.decision_stage` / `date_decision_stage` / `motif_decision_stage` et table `stagiaire_academique` (RLS + FORCE), migration `0128` ; `src/lib/rh/stage.ts`, `src/lib/actions/stagiaires.ts`, pages `src/app/app/rh/stagiaires/` et bloc `src/app/app/rh/[id]/bloc-stage-pro.tsx` ; tests `tests/stagiaires.test.ts`.

## Fiche de présence journalière, tenue par un gérant (2026-10-27)

- **Quoi** : Ressources humaines → « Présences » : une fiche par jour pour toute l'entreprise, sur laquelle le **gérant** fait l'appel. Chaque employé se marque **Présent / Retard / Absent / Congé** d'un clic, avec heures d'arrivée et de départ (bouton « maintenant »), une remarque (justification) et la trace de qui a saisi. Synthèse cliquable (effectif, présents, retards, absents, congés, à renseigner), recherche, navigation de jour en jour, **« Tous présents »** pour l'appel rapide, enregistrement automatique ligne par ligne. Un congé **approuvé** apparaît tout seul comme « Congé » ; un retard est **suggéré** quand l'arrivée dépasse l'heure du shift (tolérance comprise).
- **Le gérant** : l'Administrateur le désigne (un Manager, ou lui-même) dans « Réglages de la fiche » et **peut le changer à tout moment** : l'ancien gérant perd aussitôt l'accès. Les autres Managers et les Employés n'ont pas accès à la fiche. Le gérant modifie le jour même et les 31 jours précédents ; l'Administrateur n'a pas cette limite ; aucun jour futur.
- **Validation** : le gérant **valide** la fiche du jour (elle n'est plus modifiable que par l'Administrateur, qui peut la **rouvrir**). **PDF professionnel** (logo, couleur de marque, synthèse, tableau par entreprise, mention de validation, zones de signature du gérant et de l'Administrateur) prêt à imprimer.
- **Entreprises d'un même groupe** : si l'Administrateur le souhaite, il **joint** des entreprises du groupe à sa fiche pour que tous les employés soient gérés au même endroit. Il faut que **les deux entreprises aient activé** « Partager les présences avec le groupe » (comme pour le recrutement) ; chaque présence reste enregistrée **dans l'entreprise de l'employé** (la sécurité entre entreprises n'est jamais élargie) ; si l'une coupe le partage, l'autre est aussitôt détachée.
- **Code** : colonnes `entreprise.gerant_presences_id` / `presences_partagees_groupe`, `pointage.remarque` / `saisi_par_id` / `saisi_le`, tables `jonction_presence` et `validation_presence` (RLS + FORCE), migration `0129` ; `src/lib/rh/presences.ts` (+ `presences-commun.ts`, pur, partagé avec le navigateur), `src/lib/actions/presences.ts`, page et PDF `src/app/app/rh/presences/`, `src/lib/pdf/fiche-presence.tsx` ; tests `tests/presences.test.ts` (dont isolation entre entreprises, groupe sans accord, gérant remplacé, validation).

## Stagiaire professionnel : invitation avec date de fin (2026-10-27)

Page **Stagiaires** (RH) : deux boutons distincts. « Stagiaire professionnel » ouvre l'invitation d'équipe (Paramètres → Équipe) déjà réglée sur le contrat Stage ; la **date de fin du stage est obligatoire** (idem pour un CDD) et suit à l'activation du compte dans le dossier RH (`dossier_rh.date_fin_contrat`), ce qui alimente les alertes « fin dans N j » et la décision embauché / non retenu. « Stagiaire académique » reste la fiche d'un étudiant sans compte. Deux encadrés expliquent la différence en tête de page.

Repères : `invitation.date_fin_propose` (migration 0130), `src/lib/actions/invitation.ts` (`creerInvitation`, `accepterInvitation`), `src/app/app/parametres/equipe/formulaire-invitation.tsx` (`?stage=pro`), `src/app/app/rh/stagiaires/page.tsx`.

**Mise à jour (2026-10-27) — les Managers invitent aussi un stagiaire professionnel.** Le bouton « Stagiaire professionnel » mène à `/app/rh/stagiaires/nouveau-pro` (email, poste, début et fin du stage), ouvert à l'Administrateur et aux Managers (droit RH/CREER) ; l'invitation est bornée côté serveur : rôle toujours Employé, contrat toujours Stage, le Manager en est d'office le responsable (le stagiaire entre dans son équipe), l'indemnité reste réservée à l'Administrateur. Code : `inviterStagiaireProAction` dans `src/lib/actions/stagiaires.ts`. Le stagiaire académique était déjà ouvert aux Managers.


## One Chat : notifications push, réglages et sourdine (2026-10-28)

- **Quoi** : quand quelqu'un vous écrit, vous êtes **prévenu tout de suite sur vos appareils, même Vertex One fermé** (notification du téléphone ou de l'ordinateur), au lieu d'attendre le prochain passage du badge ou l'email de 3 minutes. Un clic sur la notification ouvre directement la conversation et le message.
- **Activer** : One Chat → panneau « **Mes notifications** » (colonne de gauche) → « Activer sur cet appareil », puis autoriser les notifications dans le navigateur. « Envoyer un essai » vérifie que ça marche. À faire sur chaque appareil (ordinateur, téléphone). **iPhone / iPad** : touchez Partager → « Sur l'écran d'accueil », ouvrez Vertex One depuis l'icône, puis activez les notifications (Apple l'exige).
- **Pour quoi vous êtes prévenu** (réglable par chaque personne) : *Messages privés et mentions* (par défaut : messages directs, groupes privés et @mentions), *Tous les messages* (aussi les canaux ouverts à l'équipe), *Directs et mentions*, ou *Aucune notification*. Deux cases : jouer un son, et afficher ou non le texte du message dans la notification (décochée : « Nouveau message », rien du texte sur un écran verrouillé).
- **Sourdine** : le bouton « Mettre en sourdine » en haut d'une conversation coupe ses notifications pour vous ; **une @mention vous prévient quand même**.
- **Quand Vertex One est ouvert et visible** : pas de notification système (vous regardez l'écran) : un petit son (si gardé) et la conversation se met à jour **aussitôt**, sans attendre 3 secondes.
- **Sécurité** : seules les personnes qui peuvent réellement voir la conversation reçoivent une notification (un groupe privé reste privé, même pour l'Administrateur). À la déconnexion, l'appareil cesse de recevoir les messages de ce compte. L'email de secours (message direct ou mention non lu depuis 3 minutes) reste actif.
- **Mise en place (administrateur technique)** : migration `0131` (tables `abonnement_push`, `preference_notification`, `canal_sourdine`, RLS + FORCE) ; variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (en local dans `.env.local`, et sur Vercel). Sans elles, le panneau l'indique et rien n'est envoyé.
- **Code** : `src/lib/messagerie/push.ts` (qui, quoi, envoi), `src/lib/messagerie/push-client.ts` et `public/sw.js` (côté navigateur), `src/lib/actions/notifications-chat.ts`, `src/app/app/messagerie/{mes-notifications,sourdine-canal,gestionnaire-push}.tsx`, `src/app/manifest.ts` ; tests `tests/messagerie-push.test.ts`, `tests/sw-notifications.test.ts`, `tests-e2e/one-chat-notifications.spec.ts`.


## One Chat : répondre à un message précis (2026-10-28)

- **Quoi** : dans une conversation, survolez un message et cliquez sur la flèche **« Répondre à ce message »** : un bandeau « Réponse à … » s'affiche au-dessus du champ de saisie (croix pour annuler), et votre message part avec un **aperçu du message d'origine** (auteur et début du texte) au-dessus de son texte. Un clic sur cet aperçu **ramène au message d'origine** (mis en évidence quelques secondes), même s'il est loin dans l'historique.
- **Différence avec le fil** : la réponse reste dans la conversation, à sa place, pour que tout le monde la voie ; le fil (« Répondre dans un fil ») garde les échanges de détail à part.
- **Notification** : la personne dont vous citez le message est prévenue (« X a répondu à votre message »), même dans un canal ouvert ou en sourdine, selon ses réglages.
- **Confidentialité** : on ne peut citer qu'un message de la même conversation ; si le message d'origine est supprimé, l'aperçu devient « Message supprimé » (le texte n'est plus affiché nulle part).
- **Mise en place** : migration `0132` (colonne `cite_message_id`).
- **Code** : `src/lib/actions/messagerie.ts` (`citeId`), `src/lib/messagerie/acces.ts` (`construireCitation`, `enrichir`), `src/app/app/messagerie/{ligne-message,compositeur,conversation}.tsx`, `src/lib/messagerie/push.ts` ; tests `tests/messagerie-groupes-reactions-fils-recherche.test.ts`, `tests/messagerie-push.test.ts`.


## One Chat : interface modernisée et animée (2026-10-28)

- **Quoi** : chaque personne a un **avatar aux initiales** (teinte stable dans la charte bleu et orange) avec un point de présence qui pulse quand elle est en ligne ; les messages sont des bulles arrondies (les vôtres en dégradé bleu marine), regroupées par auteur, avec l'heure au survol ; les nouveaux messages **arrivent en glissant**, les réactions **rebondissent**, les pastilles de non-lus aussi ; le séparateur de jour dit **« Aujourd'hui »**, **« Hier »** ou la date complète.
- **Conversation** : un bouton flottant **« ↓ N nouveaux messages »** apparaît quand vous lisez l'historique pendant que d'autres messages arrivent ; l'en-tête du canal montre son icône (ou l'avatar et la présence de l'interlocuteur) ; une conversation vide affiche une illustration.
- **Saisie** : champ arrondi qui s'illumine au clic, **sélecteur d'emojis** (insérés à l'endroit du curseur), bouton d'envoi animé, compteur de caractères près de la limite de 4 000.
- **Fil de discussion** : le panneau glisse depuis la droite et affiche un squelette pendant le chargement.
- **Accessibilité** : toutes les animations s'éteignent quand l'appareil demande de réduire les animations (`prefers-reduced-motion`).
- **Code** : classes `animate-chat-*` dans `src/app/globals.css` ; `src/app/app/messagerie/{avatar-personne,ligne-message,compositeur,conversation,fil-discussion,panneau-personnes,page}.tsx`. Aucune migration.


## Modifier un contact, un produit ou service du catalogue, un service de réservation (2026-10-28)

- **Contact enregistré** : sur la fiche, bouton **« Modifier »** : formulaire prérempli (nom, société, fonction, téléphone, email). Les notes, les champs personnalisés et l'espace client gardent leurs éditeurs. Droit « modifier » du CRM requis ; un Employé ne modifie que ses contacts (portée), un Manager ceux de son équipe ; la société choisie doit être de votre entreprise.
- **Produit ou service du catalogue** : un **crayon** sur chaque ligne de la liste, ou le bouton **« Modifier »** de la fiche : nom, description, prix de vente et prix d'achat. Le **type** (bien ou service) et le **stock** ne se changent pas ici (les ventes et achats pilotent le stock). Les devis et factures déjà établis gardent leur prix ; seuls les prochains documents reprennent les nouvelles valeurs. Administrateur et Manager ; l'Employé reste en lecture seule.
- **Service de réservation (One Bookings → Services)** : bouton **« Modifier »** sur chaque service (nom, description, durée, battement, prix), Administrateur seul. Les réservations déjà prises gardent leur durée et leur prix.
- **Code** : `modifierContact` (`src/lib/actions/contact.ts`, page `src/app/app/contacts/[id]/modifier/`), `modifierProduit` (`src/lib/actions/produit.ts`, `src/app/app/produits/[id]/formulaire-modifier-produit.tsx`), `modifierServiceReservable` (`src/lib/actions/reservations.ts`, `src/app/app/reservations/services/carte-service.tsx`) ; tests `tests/modifier-contact-produit.test.ts`, `tests/reservation-modifier-service.test.ts`, `tests-e2e/modifier-contact-produit.spec.ts`, `tests-e2e/reservations-modifier-service.spec.ts`. Aucune migration.


## Promesse de paiement : noter quand un client dit qu'il paiera à une date (2026-10-28)

- **Quoi** : quand un client vous dit « je paie dans une semaine », vous le **matérialisez** sur la facture : date, montant promis, comment il l'a annoncé (appel, WhatsApp, rendez-vous), une note. **Tant que la promesse court, les relances automatiques de cette facture sont suspendues** : le client n'est pas relancé alors qu'il vient de s'engager.
- **Noter** : fiche de la facture → bloc **« Promesse de paiement »** → « Noter une promesse ». Toute personne qui peut modifier les factures (dans sa portée) peut le faire. Une nouvelle date **remplace** la précédente (qui reste dans l'historique) ; « Retirer la promesse » la supprime et les relances reprennent.
- **Ce qui se passe ensuite, tout seul** : si le client paie (Mobile Money ou règlement pointé) la somme promise, la promesse passe à **« tenue »** ; si la date (plus un jour de grâce) passe sans paiement, elle passe à **« non tenue »**, **les relances reprennent**, et vous êtes **alerté par email** (les Administrateurs et la personne qui l'avait notée). Chaque promesse apparaît aussi dans l'**historique du contact**.
- **Suivi** : un badge **« Promis le … »** dans la liste des factures, et un encart **« Promesses de paiement attendues cette semaine »** en haut de One Books → Facturation (qui rappeler, pour quelle facture, quand).
- **Côté client** : sur sa page de facture, après avoir accepté la facture, **« Payer plus tard »** ouvre **« Je paierai le… »** : il choisit une date (à partir de demain, 60 jours au plus) et peut laisser un mot ; vous êtes prévenu par email et la promesse apparaît sur la fiche. Il peut changer sa date. Tant qu'elle court, il n'est pas relancé.
- **Mise en place (administrateur technique)** : migration `0133` (table `promesse_paiement`, RLS + FORCE). Les relances et la résolution passent par la tâche planifiée quotidienne existante.
- **Code** : `src/lib/facturation/promesse-regles.ts` (règles), `promesse.ts` (base, résolution, balayage), `src/lib/actions/promesse-paiement.ts` (équipe), `promettrePaiementPublic` dans `src/lib/actions/client-documents.ts`, `src/app/app/facturation/factures/[id]/carte-promesse.tsx`, `encart-promesses.tsx`, `src/app/facture/[jeton]/promesse-client.tsx` ; tests `tests/promesse-paiement.test.ts`, `tests-e2e/promesse-paiement.spec.ts`.


## Abonnement Vertex One : 25 000 FCFA/mois, prix de lancement garanti, formule annuelle (2026-10-31)

- **Prix** : 25 000 FCFA/mois par entreprise (avant : 50 000), tous modules inclus, utilisateurs illimités. Une seule source pour tous les montants (paiement, page d'abonnement, site vitrine, Kyria) : `src/lib/abonnement/tarif.ts`.
- **Prix de lancement garanti 12 mois** : toute entreprise créée jusqu'au **31 mars 2027** garde le prix de lancement pendant 12 mois à partir de SA création, même si le prix standard monte ensuite (la garantie se déduit de la date de création : rien à stocker). La page Abonnement affiche « Prix de lancement garanti jusqu'au … ». **Pour relever le prix plus tard** : modifier `PRIX_MENSUEL_STANDARD` dans `tarif.ts` (aujourd'hui égal au prix de lancement : la garantie ne joue donc qu'à partir de ce moment). Changer la date de fin d'offre ou la durée : `OFFRE_LANCEMENT_JUSQU_AU`, `GARANTIE_LANCEMENT_MOIS`.
- **Formule annuelle** : **250 000 FCFA pour 12 mois** (2 mois offerts), un seul paiement Mobile Money. Choix « Mensuel / Annuel » dans le formulaire de paiement (page Abonnement et page « Accès suspendu »). Le serveur décide du montant et de la durée (`montantEtMois`) : jamais une valeur venue du navigateur. Une entreprise qui paie à l'année voit son échéance avancée de **365 jours** (30 pour un mois). Un paiement dont le montant ne correspond pas à la tentative n'est jamais confirmé (250 000 attendu pour une tentative annuelle).
- **Site vitrine** : page Tarifs (badge « Prix de lancement garanti », ligne « Ou 250 000 FCFA pour 12 mois »), deux questions de FAQ (prix de lancement, paiement annuel — la première disparaît quand l'offre est close) ; Kyria connaît les deux faits.
- **Mise en place (administrateur technique)** : migration `0134` (colonne `mois` sur `tentative_paiement_abonnement`, défaut 1) **à appliquer en production AVANT de pousser le code**. Tests : `tests/abonnement-tarif.test.ts`, `tests/aangaraa-confirmation.test.ts` (paiement annuel, montant erroné).
- **Palier équipe (confirmé par l'utilisateur le 2026-10-31)** : à partir de **50 utilisateurs actifs**, l'abonnement passe à **45 000 FCFA/mois pour toute l'entreprise** (450 000 FCFA pour 12 mois en formule annuelle) : un prix fixe d'équipe, jamais un prix par utilisateur. Sont comptés les membres **ACTIFS** de l'entreprise (admin, managers, employés) ; ne comptent pas les invitations en attente, les comptes désactivés ou supprimés, ni les clients du portail (`src/lib/abonnement/utilisateurs.ts`, filtre explicite sur `entrepriseId`). Le nombre est relu **à chaque paiement**, côté serveur : un abonnement annuel déjà réglé n'est pas recalculé en cours d'année, le palier s'applique au renouvellement suivant ; l'entreprise qui repasse sous 50 retrouve le prix de base (et sa garantie de lancement tant qu'elle court). La garantie du prix de lancement ne protège que le palier de base. Constantes : `SEUIL_EQUIPE`, `PRIX_MENSUEL_EQUIPE` dans `tarif.ts`. La page Abonnement indique le nombre d'utilisateurs actifs et le seuil ; le site vitrine, les FAQ et Kyria l'annoncent (les textes « sans coût supplémentaire par utilisateur » ont été corrigés). Tests : `tests/abonnement-palier-equipe.test.ts` (base réelle : invités, désactivés, clients du portail et autre entreprise non comptés), `tests/abonnement-tarif.test.ts`.
- **À savoir** : un paiement Mobile Money de 250 000 FCFA peut dépasser le plafond par transaction de certains comptes ou opérateurs ; le client qui est refusé peut choisir la formule mensuelle.


## Acquisition : d'où viennent les inscriptions, qui facture, qui paie (2026-10-31)

- **Quoi** : un lien de campagne porte sa provenance (`?utm_source=facebook&utm_medium=pub&utm_campaign=mobilite-nov`, ou `?ref=CODE` pour un parrainage) ; le navigateur la mémorise 60 jours (cookie `vertexone-origine`, premier contact : un retour direct ne l'écrase pas, un nouveau lien de campagne oui) et l'inscription la range sur l'entreprise (`origine_source`, `origine_support`, `origine_campagne`, `origine_parrain`). Sans paramètre, le référent donne la source (facebook, google, whatsapp…), sinon « direct ». `?secteur=immigration|agence|cabinet|artisan|generique` présélectionne le secteur à l'inscription.
- **Console interne → Acquisition** (`/plateforme/acquisition`, staff seulement) : objectif de **10 clients payants** avec jauge, inscrits (7 j / 30 j), essais en cours, **activation** (première facture émise dans les 7 jours), **conversion essai → payant**, revenu mensuel réel (dernier paiement confirmé ÷ mois couverts, abonnements en cours), tableaux **par origine / secteur / campagne / code de parrainage**, et la liste **« À relancer aujourd'hui »** : pour chaque essai, l'action du jour (jour 1 importer, jour 3 première facture, jour 7 premier paiement Mobile Money, fin d'essai : conclure), ses étapes franchies (contacts, facture, paiement client). Un **payant** est une entreprise dont au moins un paiement d'abonnement est CONFIRMÉ.
- **Exclus des chiffres** : la démo publique, les entreprises « TEST … » et celles que l'équipe crée pour ses démonstrations, à nommer **« DEMO … »** (jamais « TEST », que les outils de nettoyage suppriment).
- **Sécurité** : toute valeur d'origine venue du navigateur est nettoyée (minuscules, `a-z 0-9 _ . -`, 60 caractères) côté serveur ; donnée de suivi seulement, jamais utilisée pour un droit d'accès.
- **Mise en place (administrateur technique)** : migration `0135` (4 colonnes sur `entreprise`) **à appliquer en production AVANT de pousser le code** (l'inscription écrit ces colonnes). Les inscriptions d'avant apparaissent « inconnue », jamais « direct ».
- **Code** : `src/lib/acquisition/origine.ts` (lecture et nettoyage), `src/components/capture-origine.tsx`, `src/lib/acquisition/stats.ts` (indicateurs, purs), `src/lib/plateforme/acquisition.ts` (lecture en base, rôle plateforme), `src/app/plateforme/acquisition/page.tsx`. Tests : `tests/acquisition-origine.test.ts` (règles pures), `tests/acquisition-base.test.ts` (base réelle), `tests-e2e/acquisition-origine.spec.ts` (lien de campagne puis inscription).
- **Guide de l'équipe commerciale** : `docs/guide-commercial-demo-et-messages.md` (démonstrations de 20 minutes mobilité et agences, objections, messages WhatsApp, liens de suivi, rituel du lundi).


## Stock : historique, corrections et inventaire (2026-11-02, étape 1 sur 5)

- **Quoi** : chaque variation du stock d'un produit suivi laisse une ligne dans son historique (vente, achat reçu, entrée, sortie, inventaire, stock de départ) avec la quantité, le stock obtenu, la date, la personne et le document d'origine (un clic mène à la facture). Fiche produit → onglet **Stock**.
- **Mode d'emploi** : produit non suivi → « Activer le suivi du stock » (une seule question : combien en avez-vous ?). Produit suivi → trois cartes : **J'en ai reçu** (livraison, retour client, article retrouvé), **J'en ai perdu** (casse, perte, vol, périmé, usage interne), **J'ai compté** (on saisit ce qu'il y a vraiment, l'écart se calcule). Un aperçu « stock après » s'affiche avant d'enregistrer. **Produits → Faire l'inventaire** : tous les produits suivis dans un tableau, on tape les quantités comptées, l'écart apparaît en vert/rouge, seules les lignes remplies sont enregistrées.
- **Règles** : un retrait ne dépasse jamais le stock disponible ; un inventaire peut descendre à 0, jamais en dessous ; le motif vient d'une liste fermée vérifiée côté serveur ; droit `PRODUITS/MODIFIER` requis. Les ventes restent possibles en rupture (stock négatif toléré, comme avant).
- **Comptabilité** : aucune écriture de stock à cette étape (les achats restent en 601). La valorisation du stock et l'écriture de variation de stock (311 / 603), par inventaire intermittent, viennent à l'étape 5.
- **Mise en place (administrateur technique)** : migration `0136` (table `mouvement_stock`, RLS + FORCE) **à appliquer en production AVANT de pousser le code**. L'historique commence à la mise en service : les mouvements passés n'y sont pas reconstitués.
- **Code** : `src/lib/produits/stock.ts` (mouvements, `corrigerStock`, `activerSuiviStock`; **tout mouvement passe par là**), `motifs-stock.ts`, actions `corrigerStockProduit` / `activerSuiviStockProduit` / `enregistrerInventaire` (`src/lib/actions/produit.ts`), `src/app/app/produits/[id]/ajuster-stock.tsx`, `src/app/app/produits/inventaire/`. Tests : `tests/stock-historique.test.ts` (mouvements signés, plafonds, motifs, inventaire, activation, **fuite entre entreprises**).
- **Pas encore** : seuils et alertes (étape 2), valorisation et dépôts (étape 5), remise en stock à l'annulation d'une facture.


## Stock : alertes de stock bas (2026-11-02, étape 2 sur 5)

- **Quoi** : chaque produit suivi peut avoir un **seuil d'alerte** (« prévenez-moi à partir de N »). Fiche produit → onglet **Stock** → carte « Alerte de stock bas ». Dans la liste des produits, le badge devient orange « Stock bas : N » à partir du seuil, rouge « Épuisé » à zéro (même sans seuil : zéro en rayon est toujours signalé). Un bandeau en haut de la liste dit combien de produits sont à réapprovisionner, avec un lien « Voir ces produits » (filtre `?filtre=a-reapprovisionner`).
- **Règles** : seuil entier de 0 à 1 000 000, champ vide = pas d'alerte ; réservé aux biens dont le suivi est activé ; droit `PRODUITS/MODIFIER` ; le produit est relu sous la protection par entreprise (jamais celui d'une autre). Règle pure `src/lib/produits/niveau-stock.ts` (`niveauStock`, `aReapprovisionner`).
- **Mise en place (administrateur technique)** : migration `0137` (colonne `produit.seuil_alerte`, nullable) **à appliquer en production AVANT de pousser le code**, avec la `0136` si elle n'y est pas encore. Tests : `tests/stock-alertes.test.ts`.
- **Pas encore** : alerte par email ou notification quand un produit franchit son seuil.


## Comptabilité : grand livre, balance et journaux par période (2026-11-02, étape 3 sur 5)

- **Quoi** : trois livres dans **One Books → Comptable** (« Grand livre », « Balance », « Journaux par période »), une seule page `/app/comptabilite/livres?vue=…` avec trois onglets. Une **période** (boutons « Ce mois », « Ce trimestre », « Cette année », « Année dernière », ou deux dates) et, pour le grand livre, un **compte** au choix. Bouton **Exporter en CSV** (Excel français) pour la période affichée.
- **Grand livre** : par compte, le **solde reporté** (tout ce qui précède la période), chaque écriture avec le **solde cumulé** (D = débiteur, C = créditeur) et les totaux. **Balance** : ouverture, mouvements et clôture (débit/crédit), avec un message vert « Comptabilité équilibrée » ou un avertissement si débits ≠ crédits. **Journaux** : ventes (VT), achats (AC), trésorerie (TR), opérations diverses (OD), déduits de l'origine de l'écriture (il n'y a pas de code de journal enregistré : un règlement est classé en trésorerie, un journal manuel en opérations diverses).
- **Règles** : réservé à l'Administrateur (`COMPTABILITE/VOIR`) et au forfait Business (comptabilité complète), revérifiés par la page ET par l'export ; dates lues à l'heure de Douala (31/12 23 h 30 reste dans l'année) ; l'affichage est limité à 1 000 écritures (le CSV les contient toutes) ; les écritures sont lues sous la protection par entreprise.
- **Aucune migration** : tout se lit dans `ecriture_comptable`. Code : `src/lib/comptabilite/livres.ts` (règles pures + lectures), `livres-export.ts`, `src/app/app/comptabilite/livres/` (page + `export/route.ts`). Tests : `tests/comptabilite-livres.test.ts` (périodes, report, cumul, équilibre, journaux, bornes à Douala, **fuite entre entreprises**).
- **Pas encore** : PDF, filtre par journal, rapprochement d'une ligne de grand livre vers son document d'origine (étapes suivantes si besoin).


## Comptabilité : déclaration de TVA et comptes personnalisés (2026-11-02, étape 4 sur 5)

- **Déclaration de TVA** (One Books → Comptable → « Déclaration de TVA », `/app/comptabilite/tva`) : pour une période (mois en cours par défaut ; « Mois dernier », « Ce trimestre », « Cette année » ou deux dates), le **chiffre d'affaires hors taxe** (comptes de ventes, classe 70), la **TVA collectée** (compte 443200, nette des avoirs), la **TVA déductible** (compte 445200), puis la **TVA à payer** ou le **crédit de TVA à reporter**. Case facultative « Crédit de TVA reporté » (celui de la déclaration précédente, saisi par vous, jamais deviné) qui vient en déduction. Détail des écritures des deux côtés, bouton **Exporter en CSV** (synthèse + détail). Un message prévient si l'entreprise est réglée comme non assujettie. **Tableau de travail pour le comptable, pas une télédéclaration** : rien n'est déposé auprès de la DGI.
- **Comptes personnalisés** (Plan comptable → « Ajouter un compte ») : numéro de **6 chiffres** commençant par la classe (la classe s'affiche en clair pendant la saisie), intitulé de 2 à 80 caractères. Jamais un numéro du référentiel SYSCOHADA ni un numéro déjà pris. Le compte, marqué « Personnalisé », est **visible de la seule entreprise** qui l'a créé et s'utilise partout (journaux manuels, dépenses, budgets, balance, bilan par sa classe). On peut modifier son intitulé (jamais son numéro) ; **la suppression est refusée dès qu'il sert** (écriture, dépense, budget). Réservé à l'Administrateur (`COMPTABILITE/CREER|MODIFIER|SUPPRIMER`), forfait Business.
- **Sécurité** : `compte_comptable` porte maintenant `entreprise_id` (nul = référentiel). RLS + FORCE : lecture = référentiel + comptes de l'entreprise, écriture = ses comptes uniquement (le rôle applicatif ne peut plus modifier le référentiel : celui-ci se charge avec le rôle propriétaire). Le numéro n'est plus unique globalement mais par entreprise (index partiels).
- **Mise en place (administrateur technique)** : migration `0138` **à appliquer en production AVANT de pousser le code**, après `0136` et `0137`. Elle retire la contrainte d'unicité sur `numero` (remplacée par deux index partiels) et active la RLS sur `compte_comptable`. Un script qui charge le plan comptable doit viser `ON CONFLICT (numero) WHERE entreprise_id IS NULL` (déjà fait dans `importerPlanComptable`).
- **Code** : `src/lib/comptabilite/tva.ts`, `comptes-personnalises.ts` + `classe-compte.ts`, actions `src/lib/actions/compte-personnalise.ts`, pages `src/app/app/comptabilite/tva/` et `plan-comptable/` (`ajouter-compte.tsx`, `actions-compte.tsx`). Tests : `tests/comptabilite-tva.test.ts`, `tests/comptes-personnalises.test.ts` (**fuite entre entreprises**, référentiel intouchable, suppression refusée si utilisé).


## Stock : valeur du stock et écriture de variation (2026-11-02, étape 5a sur 5)

- **Quoi** : Produits → **Valeur du stock** (`/app/produits/valorisation`). Chaque bien suivi vaut « stock × **coût moyen pondéré** » (jamais moins que zéro si le stock est négatif) ; total en haut, tableau produit par produit. Le coût moyen se recalcule à chaque **achat facturé** (facture fournisseur, ou bon de commande converti) : moyenne pondérée des quantités, ou prix de l'achat si le stock était vide ou négatif. Une vente sort le stock à ce coût sans le modifier ; un achat sans prix et une correction manuelle ne le changent pas. Au démarrage du suivi, il vaut le prix d'achat du produit.
- **Comptabilité (inventaire intermittent SYSCOHADA)** : les achats restent en charge (compte 601) au fil de l'eau. Sous la valeur, un bloc « Dans la comptabilité » compare le **stock déjà constaté (compte 311000)** à sa valeur réelle. S'ils diffèrent, un bouton **« Constater la variation de … »** (avec une date, aujourd'hui par défaut) passe **une écriture équilibrée** : débit 311000 / crédit **603000** « Variations des stocks de biens achetés » quand le stock a pris de la valeur, l'inverse quand il en a perdu. L'écriture est un **journal manuel numéroté** (visible dans « Journaux manuels », grand livre et balance). Le montant est toujours l'écart avec le solde réel du compte 311000 : **refaire l'opération sans mouvement ne produit rien**. Date future et période verrouillée refusées. Réservé à qui peut écrire en comptabilité (Administrateur) et au forfait Business ; le tableau de valeur, lui, est visible de qui voit les produits.
- **Au passage** : le stock saisi à la création d'un produit ou importé (CSV/Excel) ouvre maintenant son historique (ligne « Stock de départ »), ce qui manquait à l'étape 1.
- **Mise en place (administrateur technique)** : migration `0139` (colonne `produit.cout_moyen`, reprise du prix d'achat pour les produits déjà suivis, et création du compte référentiel 603000) **à appliquer en production AVANT de pousser le code**, après `0136` à `0138`. Le compte 603000 est aussi dans `plan-comptable-syscohada.ts`.
- **Code** : `src/lib/produits/stock.ts` (`nouveauCoutMoyen`, calcul SQL atomique dans l'UPDATE), `valorisation.ts`, action `src/lib/actions/valorisation-stock.ts`, page `src/app/app/produits/valorisation/`. Tests : `tests/stock-valorisation.test.ts` (pondération, vente neutre, stock vide/négatif, écriture équilibrée 311/603, idempotence, sens inverse, verrou, **fuite entre entreprises**).
- **Pas encore** : valeur par date passée (la valeur est celle d'aujourd'hui), plusieurs dépôts (5b), clôture d'exercice (5c).


## Stock : plusieurs dépôts (2026-11-02, étape 5b sur 5)

- **Quoi** : Produits → **Dépôts** (`/app/produits/depots`) : boutique, entrepôt… Chaque entreprise a toujours un **dépôt principal** (« Dépôt principal », créé tout seul) ; on peut en ajouter, les renommer, choisir lequel est le principal, et **archiver** un dépôt vide qui n'est pas le principal. Compteur par dépôt (produits et articles en stock).
- **Où va le stock** : le **dépôt principal reçoit les ventes et les achats de vos documents** (devis accepté, facture, ticket de vente, facture fournisseur…). Pour vendre depuis la boutique, on la **définit comme dépôt principal** (les prochains documents y seront enregistrés) ou on transfère le stock vers elle. Le stock total d'un produit reste la somme de ses dépôts.
- **Fiche produit → onglet Stock** (dès qu'il y a au moins deux dépôts) : **répartition par dépôt**, choix du **dépôt** dans « J'en ai reçu / perdu / compté » (l'aperçu part du contenu de ce dépôt) et carte **Transférer entre dépôts** (depuis, vers, quantité, remarque ; jamais plus que le dépôt de départ ne contient). Un transfert laisse **deux lignes d'historique** (sortie, entrée) et ne change pas le total. L'**inventaire** (Produits → Faire l'inventaire) se fait dépôt par dépôt.
- **Garanties** : somme des dépôts = stock total ; tout écart (stock créé par un ancien code, d'avant les dépôts) est résorbé sur le dépôt principal à la lecture. Un retrait ou un inventaire se mesure sur le dépôt visé. Droit `PRODUITS/MODIFIER`.
- **Mise en place (administrateur technique)** : migration `0140` (tables `depot` et `stock_depot` avec RLS + FORCE, colonne `mouvement_stock.depot_id`, deux valeurs de type de mouvement, création d'un dépôt principal par entreprise et reprise du stock existant dedans) **à appliquer en production AVANT de pousser le code**, après `0136` à `0139`.
- **Code** : `src/lib/produits/depots.ts` (dépôts, répartition, transferts, résorption), `stock.ts` (chaque mouvement alimente `stock_depot`), actions `src/lib/actions/depot.ts`, pages `src/app/app/produits/depots/`, `[id]/transfert-stock.tsx`, `ajuster-stock.tsx`, `inventaire/`. Tests : `tests/stock-depots.test.ts` (principal unique, reprise, ventes/achats, transferts et plafonds, corrections par dépôt, archivage, **fuite entre entreprises**).
- **Pas encore** : choisir le dépôt directement sur un devis, une facture ou un achat (aujourd'hui toujours le principal) ; valeur du stock ventilée par dépôt (elle reste globale) ; seuil d'alerte par dépôt.


## Comptabilité : clôture d'exercice et dossier de l'expert-comptable (2026-11-02, étape 5c sur 5)

- **Clôture** (One Books → Comptable → « Clôture d'exercice », `/app/comptabilite/cloture`) : une carte par exercice (année civile) avec produits, charges et **résultat prévu**. La clôture (1) passe une **écriture de clôture** (journal manuel « Clôture de l'exercice AAAA ») qui solde chaque compte de charges (classe 6), de produits (7) et HAO (8) et porte le résultat au **crédit du 120000** (bénéfice) ou au **débit du 129000** (perte) ; (2) enregistre la clôture (résultat, date, auteur) ; (3) **verrouille la comptabilité** jusqu'au 31/12. Les comptes de bilan (classes 1 à 5) se **reportent à nouveau d'eux-mêmes** : le grand livre est continu, le solde d'ouverture de l'exercice suivant est déjà le bon, les comptes de gestion repartent à zéro.
- **Garde-fous** : on ne clôture qu'**après le 31 décembre**, **dans l'ordre** (pas 2024 avant 2023), **une seule fois** par exercice, et pas si le **stock n'est pas à jour** en comptabilité (constater d'abord la variation, voir « Valeur du stock ») ni si la comptabilité est déjà verrouillée jusqu'à la fin de l'exercice. Une case de confirmation rappelle le verrouillage. Réservé à l'Administrateur (`COMPTABILITE/CREER` et `MODIFIER`), forfait Business, tout revérifié côté serveur ; tout ou rien (une transaction).
- **Dossier de l'expert-comptable** : bouton **ZIP** sur chaque exercice (clôturé ou non), un seul fichier avec `LISEZMOI.txt`, `grand-livre.csv`, `balance.csv`, `journaux.csv`, `plan-comptable.csv` (avec soldes), `compte-de-resultat.csv`, `bilan.csv` et `tva.csv` (mois par mois). Le compte de résultat d'un exercice déjà clôturé est lu **sans** son écriture de clôture, sinon il serait à zéro. Chaque téléchargement est consigné au journal des exports.
- **Mise en place (administrateur technique)** : migration `0141` (table `cloture_exercice`, RLS + FORCE, unique par entreprise et année) **à appliquer en production AVANT de pousser le code**, après `0136` à `0140`.
- **Code** : `src/lib/comptabilite/cloture.ts` (règle pure `calculerPlanCloture`, `apercuCloture`, `cloturerExercice`), `dossier-expert.ts`, `src/lib/export/zip.ts` (archive ZIP sans dépendance), action `src/lib/actions/cloture.ts`, pages `src/app/app/comptabilite/cloture/` (+ `dossier/route.ts`). Tests : `tests/comptabilite-cloture.test.ts` (bénéfice, perte, ordre, double clôture, verrou, reports, dossier, **fuite entre entreprises**).
- **Pas encore** : annuler une clôture (il faut déverrouiller et passer une écriture inverse à la main), exercice décalé (hors année civile), valeur du stock à la date de clôture (elle est celle d'aujourd'hui), PDF.


## Entreprises de produits et entreprises de services (2026-11-02)

- **Quoi** : le stock n'est plus offert à tout le monde. Une entreprise de **services** (agence, cabinet, artisan, immigration…) n'en voit rien : pas de case « Suivre le stock » à la création d'un produit, pas d'onglet Stock sur la fiche, pas de boutons Dépôts, Inventaire, Valeur du stock ni d'alertes de stock bas ; les pages de stock ouvertes à la main affichent une explication avec un lien vers le réglage. Une entreprise de **produits** a tout, et le type « Bien » est proposé d'office à la création d'un produit.
- **Comment on choisit** : à l'inscription, nouveau secteur **« Commerce : vente de produits »** (stock activé d'emblée) ; ou, à tout moment, **Paramètres → Entreprise → « Produits et stock »** (bouton Activer / Désactiver, réservé à l'Administrateur). Les entreprises existantes sont en mode services, **sauf** celles qui suivaient déjà le stock de produits (activées par la migration).
- **Règles** : chaque action de stock (corriger, transférer, inventaire, seuil, dépôts, variation de stock, suivi à la création) **revérifie le réglage côté serveur** : l'interface cachée ne suffit jamais. On **ne peut pas désactiver** la gestion de stock tant qu'un produit est suivi (sinon les ventes bougeraient un stock que plus personne ne voit). Les ventes et achats des documents continuent de mettre à jour les produits déjà suivis.
- **Mise en place (administrateur technique)** : migration `0142` (colonne `entreprise.gere_stock`, faux par défaut, vrai pour les entreprises qui ont déjà des produits suivis) **à appliquer en production AVANT de pousser le code**, après `0136` à `0141`.
- **Code** : `src/lib/produits/gestion-stock.ts` (`gestionStockActive`, `modifierGestionStock`, message commun), action `src/lib/actions/gestion-stock.ts`, carte `parametres/entreprise/carte-gestion-stock.tsx`, `src/components/stock-desactive.tsx`, contrôles ajoutés aux actions de `produit.ts`, `depot.ts`, `valorisation-stock.ts`, inscription (secteur `commerce`). Tests : `tests/gestion-stock-reglage.test.ts`.
- **Pas encore** : arrêter le suivi du stock d'un produit (donc désactiver après avoir suivi un produit), modèles de documents et vocabulaire propres au commerce.


## Annulation d'une facture, d'un ticket ou d'une facture fournisseur : stock remis, écritures contre-passées (2026-11-02, priorité 1.1)

- **Quoi** : avant, annuler ne changeait que le statut ; le stock et la comptabilité restaient comme si la vente avait eu lieu. Maintenant, annuler une **facture** (« Annuler » sur sa fiche), un **ticket de vente** ou une **facture fournisseur** : (1) **contre-passe** ses écritures comptables (une écriture miroir, débit et crédit inversés, datée du jour, avec la mention « Annulation — … » ; rien n'est supprimé ni modifié) ; (2) **remet les articles en stock** pour une vente (dans le dépôt d'où ils étaient sortis), ou les **retire** pour un achat, avec une ligne « Document annulé » dans l'historique du produit.
- **Les règlements déjà reçus ou payés ne sont pas contre-passés** : l'argent reçu reste reçu, le client apparaît créditeur du montant versé (à lui rembourser) ; de même pour un paiement fournisseur déjà effectué. C'est le comportement comptable attendu.
- **Garanties** : annuler deux fois ne change rien (chaque écriture d'origine n'est contre-passée qu'une fois, index unique ; chaque produit n'est repris qu'une fois par document). Une **période verrouillée** refuse l'annulation (message clair, rien n'est modifié). Un document d'avant l'historique du stock (aucun mouvement enregistré) ne touche pas au stock. Jamais d'effet sur une autre entreprise.
- **À savoir** : le coût moyen n'est pas recalculé quand un achat annulé ressort du stock ; une annulation d'achat peut rendre le stock négatif si les articles ont déjà été vendus (toléré, comme une vente en rupture). L'annulation reste « totale » : les avoirs partiels et les retours de marchandises sont la priorité 1.2 de `docs/stock-comptabilite-feuille-de-route.md`.
- **Mise en place (administrateur technique)** : migration `0143` (colonne `ecriture_comptable.contrepasse_id` et index unique) **à appliquer en production AVANT de pousser le code**, après `0136` à `0142`.
- **Code** : `src/lib/comptabilite/contre-passation.ts`, `defaireMouvementsDocument` dans `src/lib/produits/stock.ts`, branchés dans `annulerFacture` (`actions/facture.ts`), `annulerRecuVente` (`actions/recu-vente.ts`) et `annulerFactureFournisseur` (`actions/facture-fournisseur.ts`). Tests : `tests/annulation-document.test.ts` (facture avec règlement, double annulation, ticket, facture fournisseur, dépôt d'origine après transfert, période verrouillée, **fuite entre entreprises**).


## Avoirs partiels et retours de marchandises (2026-11-02, priorité 1.2)

- **Quoi** : sur la fiche d'une facture, carte **« Avoirs et retours »** → **Créer un avoir**. Un tableau liste les lignes de la facture avec « Facturé N, déjà crédité N » et ce qui **reste à créditer** ; on tape la quantité à créditer par ligne (laisser vide ce qui ne change pas), on indique un **motif**, et le **montant de l'avoir** (TVA comprise) se calcule pendant la saisie. Pour les produits dont le stock est suivi, la case **« Article en bon état »** décide de **remettre ou non les articles en stock** (un article cassé ne revient pas). Les avoirs émis s'affichent avec leur numéro (**AV-AAAA-NNNNNN**, série propre, sans trou) et le **montant net** de la facture. Le bouton d'annulation totale s'appelle maintenant **« Annuler toute la facture »**.
- **Effets** : (1) le **montant restant dû** baisse d'autant (la facture d'origine ne change jamais ; tous les calculs de solde, relances, promesses, paiement en ligne et acomptes se font sur le net) ; (2) la vente des seules lignes créditées est **contre-passée en comptabilité** (produits et TVA facturée au débit, Clients au crédit) ; (3) les articles cochés **reviennent en stock**, dans le dépôt d'où ils étaient sortis ; (4) la facture devient **payée** si les règlements couvrent le net restant, et **annulée** quand elle est entièrement créditée.
- **Garde-fous** (revérifiés côté serveur) : jamais plus que ce qui a été facturé, tous avoirs confondus ; une ligne une seule fois par avoir ; deux décimales au plus ; des quantités **entières** pour le stock ; **jamais de remise en stock d'une prestation** ni d'un produit non suivi ; motif de 3 à 300 caractères ; période comptable verrouillée = refus, rien n'est modifié ; une facture déjà créditée en partie **ne peut plus être annulée en bloc** (on crédite le reste par un dernier avoir). Droit `FACTURATION/MODIFIER`, comme l'annulation.
- **Mise en place (administrateur technique)** : migration `0144` (tables `avoir_client` et `ligne_avoir_client`, RLS + FORCE, compteur `entreprise.compteur_avoirs_client`) **à appliquer en production AVANT de pousser le code**, après `0136` à `0143`.
- **Code** : `src/lib/facturation/avoir-client.ts` (règles, création), `solde.ts` (`montantNetFacture`, `lireSolde` sur le net), `ecritures.ts` (`genererEcrituresAvoirClient`), `stock.ts` (`entrerStockDocument`), action `src/lib/actions/avoir-client.ts`, carte `factures/[id]/carte-avoirs.tsx`. Tests : `tests/avoir-client.test.ts` (montants et TVA exacts, écritures miroir, stock remis ou non, plafonds, garde-fous, facture payée puis annulée, verrou, **fuite entre entreprises**).
- **Pas encore** : PDF de l'avoir et envoi par email au client, avoir sur une facture fournisseur (priorité à venir), remboursement enregistré (l'argent déjà reçu reste au crédit du client dans les comptes).


## Choix du dépôt sur chaque document (2026-11-02, priorité 1.3)

- **Quoi** : un document qui bouge le stock peut nommer son dépôt. Une liste **« Dépôt d'où sort le stock »** (ventes) ou **« Dépôt où entre le stock »** (achats) apparaît dans les formulaires de **devis, bon de commande client, facture périodique, ticket de vente, bon de commande fournisseur et facture fournisseur**, **seulement** pour une entreprise de produits qui a **au moins deux dépôts** (sinon rien ne change : le dépôt principal est utilisé). Le dépôt principal est présélectionné.
- **Le dépôt suit le document** : un devis accepté, un bon de commande converti, une facture périodique générée ou un bon de commande fournisseur converti **transmettent leur dépôt** à la facture créée et au mouvement de stock. L'annulation d'un document et les articles remis en stock par un avoir reviennent **dans le dépôt d'origine** (déjà le cas depuis les priorités 1.1 et 1.2).
- **Garde-fous** : le dépôt envoyé par le formulaire est **revérifié côté serveur** (un dépôt actif de CETTE entreprise : jamais celui d'une autre, ni un dépôt archivé) ; si un dépôt est archivé entre la création du document et le mouvement, le stock bouge dans le **dépôt principal** ; sans choix, dépôt principal. Seuls les produits dont le stock est suivi sont concernés.
- **Mise en place (administrateur technique)** : migration `0145` (colonne nullable `depot_id` sur `devis`, `facture`, `bon_commande_vente`, `facture_recurrente`, `recu_vente`, `bon_commande_achat`, `facture_fournisseur`) **à appliquer en production AVANT de pousser le code**, après `0136` à `0144`. Les documents existants gardent `depot_id` vide : dépôt principal, comme avant.
- **Code** : `verifierDepotDocument` et `resoudreDepotDocument` (`src/lib/produits/depots.ts`), `depotId` dans le contexte des mouvements (`stock.ts`), `src/components/choix-depot-document.tsx` + action `lireDepotsFormulaire` (`actions/depot.ts`), lecture et stockage du choix dans les six actions de création, héritage dans `acceptation-devis.ts`, `bon-commande-vente.ts`, `recurrence.ts`, `bon-commande-achat.ts`. Tests : `tests/depot-documents.test.ts` (vente et achat dans le dépôt choisi, annulation dans le dépôt d'origine, devis accepté, dépôt étranger ou archivé, **fuite entre entreprises**).
- **Pas encore** : un dépôt par ligne d'un même document, ni un dépôt par défaut par utilisateur ; changer le dépôt d'un document après sa création.


## Interdire la vente en rupture et arrêter le suivi d'un produit (2026-11-02, priorités 1.4 et 1.5)

- **Interdire la vente en rupture** (Paramètres → Entreprise → « Produits et stock », visible quand le stock est activé) : réglage par entreprise, **désactivé par défaut** (le stock négatif reste toléré, comme avant). Activé, il **refuse avec un message clair** — « Stock insuffisant pour « Sac de riz » dans le dépôt « Dépôt principal » : 5 disponible(s), 6 demandé(s). » — un **ticket de vente**, la **conversion d'un bon de commande client en facture** et l'**acceptation d'un devis par l'équipe** (« Marquer accepté »), AVANT toute écriture. Le contrôle se fait sur le **dépôt visé** (celui du document, sinon le principal), pas sur le total, produit par produit (deux lignes du même produit se cumulent) ; les services et les produits non suivis ne sont jamais bloqués.
- **Jamais bloqués, par choix** : l'acceptation d'un devis par le **client** depuis son lien public (on ne refuse pas un client qui accepte) et les **factures périodiques** générées par la tâche planifiée (aucun humain pour lire un message) ; ces ventes passent et le stock peut devenir négatif, ce que l'équipe voit dans l'alerte « épuisé ».
- **Arrêter le suivi du stock d'un produit** (fiche produit → onglet Stock → carte « Arrêter le suivi du stock », en deux temps avec confirmation) : ce qui restait en stock **sort du suivi** par une ligne **« Fin du suivi du stock »** par dépôt dans l'historique (le stock tombe à zéro), le produit n'est plus suivi, son **seuil d'alerte est retiré**, les ventes et achats ne le touchent plus. **Réversible** : réactiver le suivi repart d'un stock de départ saisi. Une fois **tous** les produits sortis du suivi, la **gestion de stock peut se désactiver** (Paramètres), ce que la règle « pas de désactivation tant qu'un produit est suivi » interdisait jusqu'ici.
- **Mise en place (administrateur technique)** : migration `0146` (colonne `entreprise.bloquer_vente_rupture`, faux par défaut) **à appliquer en production AVANT de pousser le code**, après `0136` à `0145`. L'arrêt du suivi n'a besoin d'aucune migration.
- **Code** : `verifierStockSuffisant` et `arreterSuiviStock` (`src/lib/produits/stock.ts`), `blocageRuptureActif` et `modifierBlocageRupture` (`gestion-stock.ts`), actions `changerBlocageRupture` et `arreterSuiviStockProduit`, `accepterDevis` et `convertirBonCommandeVenteEnFacture` qui renvoient maintenant un message (boutons clients `bouton-accepter-devis.tsx` et `bouton-convertir-bcv.tsx`), `produits/[id]/arreter-suivi.tsx`. Tests : `tests/rupture-et-arret-suivi.test.ts` (option par défaut, message précis, cumul des lignes, contrôle par dépôt, services et produits non suivis, **option de A sans effet sur B**, arrêt du suivi, réactivation, désactivation du stock, **B ne peut pas arrêter le suivi d'un produit de A**).


## Clients et fournisseurs : grand livre auxiliaire, lettrage, balance âgée (2026-11-02, priorité 2.1)

- **Quoi** : One Books → Comptable → **« Clients et fournisseurs »** (`/app/comptabilite/tiers`). Quatre vues : **Clients** ou **Fournisseurs**, chacune en **Grand livre auxiliaire** ou **Balance âgée**.
- **Grand livre auxiliaire** : le compte de CHAQUE client (compte 411000) ou fournisseur (401000), écriture par écriture, avec solde reporté, solde cumulé (D/C), totaux, période au choix (mois, trimestre, année ou dates) et filtre sur un seul tiers ; **export CSV**. Le tiers d'une écriture est celui de son document : la facture, son règlement et ses avoirs pour un client ; la facture fournisseur et ses paiements pour un fournisseur.
- **Lettrage** : toutes les écritures d'un même document forment un groupe ; quand elles **s'annulent** (facture entièrement réglée, avoirs compris), chaque ligne reçoit la même **lettre** (A, B, … Z, AA…) dans la colonne « Lettrage ». Il est **calculé, jamais saisi** : il suit toujours les règlements enregistrés, sur tout l'historique (pas seulement la période affichée), et un règlement partiel ne lettre rien.
- **Balance âgée** : ce que chaque client vous doit (ou ce que vous devez à chaque fournisseur) **encore**, net des règlements et des avoirs, classé par **retard d'échéance** : non échu, 1 à 30 jours, 31 à 60, 61 à 90, plus de 90 ; les retards sont en rouge, les clients les plus en retard d'abord, avec les numéros et échéances des factures concernées ; **export CSV**.
- **Aucune migration** : tout se lit dans les écritures et les documents. Code : `src/lib/comptabilite/tiers.ts` (règles pures et lectures), `tiers-export.ts`, page `src/app/app/comptabilite/tiers/`, quatre vues de plus dans la route d'export `livres/export`. Tests : `tests/comptabilite-tiers.test.ts` (lettres, lettrage, grand livre, tranches, balance âgée clients et fournisseurs nette des avoirs, **fuite entre entreprises**).
- **Pas encore** : lettrage manuel d'écritures de documents différents, relevé de compte envoyé au client, rapprochement automatique des acomptes.


## Rouvrir un exercice clôturé (2026-11-02, priorité 2.2)

- **Quoi** : sur la page **Clôture d'exercice**, le **dernier** exercice clôturé porte un bouton **« Rouvrir cet exercice »**. Il demande un **motif obligatoire** (5 à 300 caractères) et une **case de confirmation**. La réouverture : (1) **contre-passe l'écriture de clôture à la date de fin de l'exercice** (elle n'est jamais supprimée : le grand livre montre la clôture puis son annulation) ; (2) **rétablit le verrouillage d'avant la clôture** ; (3) **retire la clôture**, pour pouvoir corriger puis clôturer de nouveau ; (4) garde une **trace** (exercice, motif, auteur, date, résultat annulé), affichée dans « Historique des réouvertures ».
- **Règles** : on remonte **dans l'ordre inverse** (impossible de rouvrir 2023 tant que 2024 est clôturé) ; un exercice non clôturé ne se rouvre pas ; une écriture déjà annulée ne l'est pas deux fois ; tout ou rien (une transaction) ; Administrateur, forfait Business, tout revérifié côté serveur.
- **Mise en place (administrateur technique)** : migration `0147` (colonne `cloture_exercice.verrou_avant`, table `reouverture_exercice` avec RLS + FORCE, et **douze nouveaux comptes** du plan SYSCOHADA — 191000, 244000, 244100, 245000, 284000, 284100, 284500, 408000, 418000, 476000, 477000, 691000 — utilisés par les régularisations et les immobilisations qui suivent) **à appliquer en production AVANT de pousser le code**, après `0136` à `0146`. Une clôture faite avant cette migration n'a pas de verrou d'avant enregistré : à sa réouverture, le verrouillage est retiré (aucun verrou).
- **Code** : `rouvrirExercice`, `listerReouvertures`, `dernierExerciceCloture` (`src/lib/comptabilite/cloture.ts`), action `rouvrirExerciceAction`, `cloture/bouton-reouverture.tsx`. Tests : `tests/reouverture-exercice.test.ts` (annulation à la fin de l'exercice, verrou rétabli, trace, nouvelle clôture, ordre inverse, motif, **fuite entre entreprises**).


## États financiers par rubriques SYSCOHADA, avec PDF (2026-11-02, priorité 2.3)

- **Quoi** : One Books → Comptable → **« États financiers »** (`/app/comptabilite/etats`), un onglet par exercice. **Bilan** : actif en colonnes **Brut / Amortissements / Net** (actif immobilisé, actif circulant, trésorerie-actif) et passif (capitaux propres, dettes financières, passif circulant, trésorerie-passif), avec les références de rubriques (AD, AI, BB, CJ, DJ…) et un message « bilan équilibré » ou un avertissement. **Compte de résultat** avec ses **soldes intermédiaires** : marge commerciale, chiffre d'affaires, valeur ajoutée, excédent brut d'exploitation, résultat d'exploitation, résultat financier, résultat des activités ordinaires, résultat hors activités ordinaires, résultat net. Bouton **Télécharger le PDF** (bilan et compte de résultat, deux pages A4).
- **Fiabilité** : chaque compte tombe dans UNE rubrique d'après son numéro et le sens de son solde ; un solde « à rebours » (un client créditeur, un fournisseur débiteur) passe automatiquement de l'autre côté du bilan au lieu d'être ignoré ; les amortissements viennent en déduction de leur immobilisation. Le **résultat net** vaut toujours la somme des comptes 6, 7 et 8, et le **total de l'actif égale celui du passif** quand la comptabilité est équilibrée (vérifié par les tests). Un exercice déjà **clôturé** garde son compte de résultat lisible (l'écriture de clôture est ignorée) et son résultat apparaît au bilan par le compte 120000.
- **Dossier de l'expert-comptable** : le ZIP contient maintenant aussi `etats-financiers.pdf` (neuf fichiers).
- **À savoir** : présentation **par rubriques adaptée au plan comptable de Vertex One**, pas la liasse fiscale complète (annexes, tableau des flux de trésorerie) : la mention « brouillon à faire valider par votre comptable » figure sur l'écran et sur le PDF. Chaque téléchargement du PDF est consigné au journal des exports. Aucune migration.
- **Code** : `src/lib/comptabilite/etats-syscohada.ts` (règles pures), `etats-donnees.ts`, `src/lib/pdf/etats-financiers.tsx`, page et route PDF dans `src/app/app/comptabilite/etats/`. Tests : `tests/etats-syscohada.test.ts` (amortissements, soldes à rebours, résultat, identité du résultat net, services sans marchandises, exercice clôturé, génération du PDF, **fuite entre entreprises**).
