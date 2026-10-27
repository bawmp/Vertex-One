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
