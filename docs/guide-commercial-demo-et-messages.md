# Guide commercial Vertex One — démonstration de 20 minutes et messages WhatsApp

Pour l'équipe qui fait les démonstrations. Objectif du lancement : **10 clients payants en 90 jours**. Deux secteurs d'abord : **mobilité et voyage**, puis **agences et services**.

Règle d'or : une démonstration ne sert pas à tout montrer. Elle sert à **résoudre le problème de la personne en face** et à **fixer une date de décision**. Une démonstration qui se termine par « je réfléchis » sans date est une démonstration perdue.

---

## 0. Avant de commencer

**Votre démonstration.**
- **Agences et services : utilisez l'entreprise de démonstration publique « Atelier Kalyss »** (bouton « Voir la démo » du site, ou connexion directe). Elle est déjà remplie : comptes clients, contacts, leads et opportunités, devis, factures, paiements, projets, messagerie. Rien à préparer.
- **Mobilité et voyage : utilisez « DEMO Mobilité »**, une entreprise privée préparée pour cela (profil mobilité). Atelier Kalyss est une agence (vocabulaire « Compte client » et « Projet ») : elle ne montre ni le vocabulaire « Dossier » et « Démarche », ni les champs de voyage. « DEMO Mobilité » contient : 3 dossiers et 4 clients avec Nationalité, Pays de destination, Type de visa et date du rendez-vous consulaire remplis ; 3 leads ; 4 opportunités ; 3 services (dossier de visa études, accompagnement au rendez-vous consulaire, assistance billet et hébergement) ; **un devis envoyé, un devis accepté dont la facture est payée à moitié par Orange Money (Amina Bello), et un devis accepté dont la facture est en retard (Tchoumi & Fils)** ; une démarche avec ses étapes ; quelques messages d'équipe. Rien de plus à préparer : les pièces privées (passeport) se montrent en direct en ajoutant un document de la catégorie « Pièce d'identité ».
  - **Création** (une seule fois par base, à faire par la personne technique) : `npx tsx scripts/creer-demo-mobilite.ts`. Le mot de passe est tiré au hasard et écrit dans un fichier sur le Bureau (jamais dans le dépôt ni à l'écran) ; l'adresse de connexion est `demo-mobilite@vertex-one-demo.local`. Le nom commence par « DEMO » : la Console interne l'exclut des chiffres d'acquisition. N'écrivez jamais « TEST » : vos outils de nettoyage suppriment ces entreprises.

**Avant chaque démonstration avec Atelier Kalyss** (c'est un compte public et partagé) :
- Connectez-vous **10 minutes avant** et vérifiez que les données sont intactes : un autre visiteur a pu modifier ou supprimer des éléments depuis votre dernière utilisation.
- Ne saisissez jamais de vraies informations de prospect dedans : tout le monde peut les voir. Créez les exemples pendant la démonstration avec des noms fictifs.
- À la fin, **ne laissez pas** le prospect créer son espace dans Atelier Kalyss : il crée le sien avec votre lien de suivi (voir la section 6).

**Les cinq questions de qualification** (5 minutes, avant de montrer quoi que ce soit) :
1. Combien de clients ou de dossiers suivez-vous en ce moment ?
2. Où sont vos informations aujourd'hui : WhatsApp, Excel, cahier, mémoire ?
3. Comment envoyez-vous un devis ou une facture ? Combien de temps cela prend-il ?
4. Comment vos clients vous paient-ils ? Y a-t-il des retards, des relances à faire à la main ?
5. Qui décide, et quand voulez-vous que ce soit réglé ?

Notez les réponses : vous les réutiliserez dans la conclusion.

**Ce qu'on ne dit jamais**
- Que le paiement Mobile Money est « instantané » ou « direct » : le client paie depuis son téléphone et le règlement apparaît dans l'outil, mais les **fonds sont reversés avec un délai** (le délai dépend du prestataire de paiement : n'annoncez aucun nombre de jours).
- Que la paie, la CNPS ou l'IRPP sont calculées : **non**, ce n'est pas dans le produit.
- Qu'une fonctionnalité existe si vous n'en êtes pas sûr : « Je vérifie et je reviens vers vous aujourd'hui » vaut mieux qu'une promesse fausse.
- Que le tirage ou le résultat d'un tiers est garanti (valable pour tout ce qui dépend d'une autorité).

---

## 1. Démonstration — mobilité et voyage (20 minutes)

*Public : cabinets de visa, agences de voyage, consultants en mobilité et études à l'étranger.*

| Minutes | Ce que vous faites | Ce que vous dites |
|---|---|---|
| 0–5 | Les cinq questions. | « Montrez-moi comment vous suivez un dossier aujourd'hui. » |
| 5–8 | Ouvrir **un dossier** (le vocabulaire est celui du métier : *Dossier*, *Démarche*). Montrer les champs **Nationalité, Pays de destination, Type de visa, Date du rendez-vous consulaire**. | « Tout ce que vous cherchez dans WhatsApp est sur une seule fiche, avec l'historique. » |
| 8–10 | Montrer les **pièces privées** : le passeport d'un client est un document **restreint** (administrateur et responsable du dossier seulement), et chaque consultation est **consignée**. | « Les passeports ne traînent pas dans un groupe WhatsApp. » |
| 10–14 | Créer un **devis**, l'envoyer par lien. Montrer la page du client : il **accepte en ligne**, sans compte. Puis la **facture** : le client choisit **payer maintenant** (Orange Money ou MTN MoMo) ou **plus tard**, et peut payer **en plusieurs fois**. | « Vous n'envoyez plus de photo de facture. Le client paie depuis son téléphone et vous voyez le règlement. » |
| 14–16 | Montrer une facture en retard : **relance automatique** et **promesse de paiement** (« je paie vendredi » : la relance se met en pause jusqu'à cette date). | « Fini de relancer à la main chaque semaine. » |
| 16–18 | Envoyer un contrat à **signer en ligne** (le client signe depuis son téléphone, le PDF signé est rangé dans son dossier). Montrer en une phrase les **rendez-vous en ligne** et la messagerie d'équipe. | « Le contrat signé arrive tout seul dans le dossier. » |
| 18–20 | **Conclusion** (section 3). | Reprendre ses propres mots de la qualification. |

**Les trois phrases à retenir pour ce secteur :** « tout le dossier au même endroit », « le passeport n'est visible que par les personnes autorisées », « le client paie depuis son téléphone ».

---

## 2. Démonstration — agences et services (20 minutes)

*Public : agences, prestataires de services, cabinets de conseil, formateurs.*

| Minutes | Ce que vous faites | Ce que vous dites |
|---|---|---|
| 0–5 | Les cinq questions. | « Où perdez-vous du temps chaque semaine ? » |
| 5–8 | Le **CRM** : un prospect, le pipeline, passer l'opportunité au stade suivant. | « Vous voyez ce qui est en discussion, ce qui est gagné, ce qui dort. » |
| 8–12 | Du **devis** à la **facture** : envoi par lien, acceptation en ligne, facture, paiement Mobile Money par le client, paiement en plusieurs fois si besoin. | « Du devis à l'argent reçu, sans quitter l'outil. » |
| 12–15 | Les **factures récurrentes** (les clients au mois) et les **relances automatiques** + promesse de paiement. | « Les abonnements de vos clients partent tout seuls. » |
| 15–18 | Les **projets** : tâches, **feuille de temps** avec minuteur sur une tâche, messagerie d'équipe. | « Vous savez combien d'heures chaque projet a coûté. » |
| 18–20 | **Conclusion** (section 3). | Reprendre ses propres mots. |

**Si le prospect vient d'Asana ou de Zoho :** montrer l'**import** (contacts, projets et tâches, devis et factures historiques) : « vous ne repartez pas de zéro ». Les factures importées gardent leur numéro d'origine et ne génèrent aucune écriture comptable en double.

---

## 3. La conclusion (les deux dernières minutes)

1. **Résumer en une phrase** avec ses mots : « Vous m'avez dit que vous perdiez X à Y : voilà comment on le règle. »
2. **Proposer l'essai accompagné** : « On crée votre espace maintenant, 14 jours gratuits, sans carte. **Je vous aide à importer vos contacts**, et on envoie votre première facture ensemble avant vendredi. »
3. **Donner la date** : « Le prix de lancement de **25 000 FCFA par mois** est garanti 12 mois pour les entreprises inscrites jusqu'au **31 mars 2027**. Vous décidez à la fin de l'essai ; je vous appelle le jour 11 pour faire le point. »
4. **Proposer l'annuel au moment du paiement** : « **250 000 FCFA pour 12 mois**, soit deux mois offerts, et un seul paiement Mobile Money. »
5. **Prendre le rendez-vous suivant avant de raccrocher** (jour 3 : la première facture).

Si l'entreprise compte **50 utilisateurs actifs ou plus** : le prix passe à **45 000 FCFA par mois pour toute l'équipe** (450 000 FCFA à l'année) : un prix fixe d'équipe, jamais par utilisateur.

---

## 4. Les objections

| Objection | Réponse honnête |
|---|---|
| « J'ai déjà Excel et WhatsApp. » | « Ça marche tant que vous êtes peu nombreux. Montrez-moi le dernier dossier que vous avez eu du mal à retrouver. » Puis revenir au dossier de la démonstration. Ne dénigrez pas leur méthode actuelle. |
| « C'est trop cher. » | Comparer au temps perdu qu'ils ont décrit eux-mêmes en qualification. 25 000 FCFA, c'est un prix **par entreprise**, tous les modules, toute l'équipe (jusqu'à 49 utilisateurs actifs). L'annuel offre deux mois. |
| « Je vais réfléchir. » | « Bien sûr. Qu'est-ce qui vous ferait dire oui ? » Puis proposer l'essai : il n'engage à rien. Fixer une date. |
| « Mes données sont-elles en sécurité ? » | « Les données de chaque entreprise sont isolées de celles des autres, et vous pouvez **exporter vos données** en fichiers CSV à tout moment. » N'affirmez aucune certification. |
| « Et si j'arrête ? » | « Vous exportez vos données et vous partez. Rien ne vous retient. » |
| « Mon équipe ne saura pas s'en servir. » | « On vous accompagne pour la première facture, et les rôles limitent ce que chacun voit : un prestataire ne voit que ce que vous décidez. » |
| « Vous êtes qui ? » | Parler de vos références réelles (Global Mobility, BoOKet) **uniquement avec leur accord**. |

---

## 5. Les messages WhatsApp

Ton : vouvoiement, court, une seule question à la fois, jamais plus de cinq lignes.

**Premier contact — mobilité et voyage**
> Bonjour [Prénom], c'est [Votre prénom] de Vertex One. Je vois que vous gérez des dossiers de visa / d'études à l'étranger. Beaucoup de cabinets nous disent perdre du temps à relancer leurs clients et à retrouver les pièces. Puis-je vous montrer en 15 minutes comment on règle ça ? Vous êtes plutôt disponible [jour] ou [jour] ?

**Premier contact — agences et services**
> Bonjour [Prénom], c'est [Votre prénom] de Vertex One. Vos clients vous paient comment aujourd'hui, et qui fait les relances ? Nous aidons des agences à envoyer devis et factures par lien et à se faire payer par Mobile Money, le tout au même endroit. 15 minutes pour vous le montrer cette semaine ?

**Après la démonstration (le jour même)**
> Merci pour votre temps, [Prénom]. Comme convenu, voici le lien pour créer votre espace : [lien avec suivi]. Je vous aide à importer vos contacts et on envoie votre première facture ensemble [jour]. Le prix de lancement de 25 000 FCFA/mois est garanti 12 mois jusqu'au 31 mars. Je vous appelle le [date, jour 11] pour votre décision.

**Jour 1 — importer ses contacts**
> Bonjour [Prénom], bien commencé ? La première étape : vos contacts. Envoyez-moi votre fichier Excel ou la liste, je m'occupe de l'import. On fait ça ce soir ou demain matin ?

**Jour 3 — la première facture**
> [Prénom], une petite étape qui change tout : envoyer votre première facture depuis Vertex One. 10 minutes ensemble, aujourd'hui ou demain ? Vous verrez votre client la recevoir par lien et pouvoir payer depuis son téléphone.

**Jour 7 — le premier paiement client**
> [Prénom], vous avez émis [N] facture(s) : très bien. Avez-vous déjà fait payer un client par Orange Money ou MTN MoMo depuis le lien ? Je vous montre comment, c'est ce qui vous fera gagner le plus de temps.

**Jour 11 — conclure**
> Bonjour [Prénom], votre essai se termine dans 3 jours. Vous avez [résumé : « émis X factures, importé Y contacts »]. Pour continuer : 25 000 FCFA/mois, ou 250 000 FCFA pour 12 mois (deux mois offerts). Le lien de paiement est dans Paramètres → Abonnement. Je suis là si vous avez une question.

**Essai terminé sans paiement**
> Bonjour [Prénom], votre essai est terminé et votre espace est conservé. Qu'est-ce qui vous a manqué, ou fait hésiter ? Si c'est le moment, je peux prolonger de quelques jours le temps que nous finissions ensemble.

*(La prolongation d'essai se fait depuis la Console interne.)*

**Un prescripteur (expert-comptable, cabinet de conseil, incubateur)**
> Bonjour [Prénom], vos clients PME me disent souvent qu'ils perdent du temps à facturer et à relancer. Nous avons une solution locale payable en Mobile Money. Si vous la recommandez, [avantage : un mois offert pour chaque client amené / une commission]. Un code à votre nom suivra chaque client que vous nous envoyez. Je vous la montre en 15 minutes ?

**Demander un parrainage (client satisfait, après son premier paiement)**
> Merci pour votre confiance, [Prénom]. Connaissez-vous une ou deux entreprises qui auraient besoin de la même chose ? Si vous me les présentez, [avantage]. Je peux vous préparer un message à leur transmettre.

---

## 6. Les liens de suivi

Chaque canal a son **lien**. Quand quelqu'un s'inscrit, la Console interne (**Acquisition**) sait d'où il vient, combien ont émis leur première facture et combien paient. Ajoutez simplement les paramètres à l'adresse du site.

| Canal | Lien à envoyer |
|---|---|
| Publicité Facebook, mobilité | `https://vertexone.cm/inscription?secteur=immigration&utm_source=facebook&utm_medium=pub&utm_campaign=mobilite-nov` |
| Publicité Facebook, agences | `https://vertexone.cm/inscription?secteur=agence&utm_source=facebook&utm_medium=pub&utm_campaign=agences-nov` |
| Message WhatsApp direct | `https://vertexone.cm/inscription?secteur=immigration&utm_source=reseau&utm_medium=whatsapp` |
| Un prescripteur (un code par personne) | `https://vertexone.cm/inscription?ref=cabinet-ngono` |
| Après une démonstration | `https://vertexone.cm/inscription?secteur=agence&utm_source=demo` |

Le secteur (`secteur=immigration`, `agence`, `cabinet`, `artisan`) est **présélectionné** : le prospect peut le changer. Écrivez les codes en minuscules, sans accent ni espace. Un visiteur qui revient s'inscrire seul quelques jours plus tard reste attribué à la campagne qui l'a amené (60 jours).

---

## 7. Le rituel de la semaine (30 minutes, le lundi)

Ouvrir **Console interne → Acquisition** et lire cinq chiffres :
1. **Clients payants** et ce qu'il reste pour atteindre 10.
2. **Essais en cours** et **à relancer aujourd'hui** (le tableau donne l'action : jour 1, jour 3, jour 7, conclure).
3. **Activation** : part des inscrits qui ont émis une facture dans les 7 jours. En dessous de la moitié, le problème est l'accompagnement, pas le produit.
4. **Conversion essai → payant.**
5. **Par origine** et **par campagne** : arrêtez ce qui ne rapporte aucun payant après deux semaines et un budget raisonnable.

Puis décider : combien de contacts, de démonstrations et de relances cette semaine ? Le plan de départ : environ 12 contacts, 3 démonstrations, 2 essais lancés, 1 client payant par semaine.

---

## 8. Budget publicitaire de 100 000 FCFA (suggestion)

- **50 000** : test Facebook, deux secteurs, deux semaines. L'objectif est de mesurer le **coût par inscrit** et surtout **par client payant**, pas de remplir l'agenda.
- **30 000** : contacts directs (crédit de communication, données pour les démonstrations).
- **20 000** : réserve, à placer sur ce qui marche.

Arrêtez une publicité dont le coût par client payant dépasse **trois mois d'abonnement** (75 000 FCFA).
