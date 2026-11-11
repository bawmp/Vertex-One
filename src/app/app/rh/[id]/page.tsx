import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc, and, ne } from "drizzle-orm";
import { ArrowLeft, Award, Briefcase, Building2, Cake, CalendarDays, CalendarRange, ClipboardList, Clock, Download, FolderOpen, Hash, Hourglass, IdCard, ListChecks, LogOut, MapPin, Phone, ShieldAlert, ShieldCheck, UserRound, Wallet, Wifi } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, dossierRH, utilisateur, demandeConge, evaluation, pointage, politiqueConge, politiqueCongePalier, revisionSalaire, documentRH, regularisationPointage, shift, service, autorisationDepartementRh } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { peutVoirSalaire as calculerPeutVoirSalaire } from "@/lib/rh/acces";
import { debutJournee } from "@/lib/rh/pointage";
import { calculerDroitAnnuelConge } from "@/lib/rh/politique-conge";
import { BlocRepliable } from "@/components/fiche/bloc-repliable";
import { CarteFiche, FicheHero, LigneInfo, ListeInfos, RubanHero, TuileChiffre } from "@/components/fiche/fiche-ui";
import { ancienneteTexte, LIBELLE_CONTRAT, LIBELLE_ROLE, libelleStatutTache, tauxTachesTerminees } from "@/lib/rh/fiche-affichage";
import { Badge } from "@/components/ui/badge";
import { BoutonPointage } from "./bouton-pointage";
import { FormulaireDemandeConge } from "./formulaire-demande-conge";
import { ListeDemandesConge } from "./liste-demandes-conge";
import { FormulaireDossierRH } from "./formulaire-dossier-rh";
import { BlocStagePro } from "./bloc-stage-pro";
import { joursRestants as joursRestantsStage } from "@/lib/rh/stage";
import { FormulaireEvaluation } from "./formulaire-evaluation";
import { ListeEvaluations } from "./liste-evaluations";
import { FormulairePolitiqueConge } from "./formulaire-politique-conge";
import { BoutonCrediterConge } from "./bouton-crediter-conge";
import { FormulaireRevisionSalaire } from "./formulaire-revision-salaire";
import { ListeRevisionsSalaire } from "./liste-revisions-salaire";
import { BlocPaie } from "./bloc-paie";
import { modificationsRecues } from "@/lib/rh/fiches-ouvertes";
import { paiementsDuDossier, primesDuDossier } from "@/lib/rh/paie";
import { FormulaireDocumentRH } from "./formulaire-document-rh";
import { ListeDocumentsRH } from "./liste-documents-rh";
import { FormulaireRegularisation } from "./formulaire-regularisation";
import { ListeRegularisations } from "./liste-regularisations";
import { FormulaireShift } from "./formulaire-shift";
import { PhotoFiche } from "./photo-fiche";
import { FormulaireInfosPersonnelles } from "./formulaire-infos-personnelles";
import { adressePhoto } from "@/lib/rh/photo-affichage";
import { ageAu, libelleDelai, prochainAnniversaire } from "@/lib/rh/anniversaires-regles";
import { estEnRetard, tachesDuCollaborateur } from "@/lib/rh/taches-collaborateur";
import { lireTachesPoste, peutGererTachesPoste } from "@/lib/rh/taches-poste";
import { ListeTachesPoste } from "./carte-taches-poste";
import { getT } from "@/lib/i18n/langue";


export default async function PageDossierRH({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "RH", "VOIR")) notFound();

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    const [ligne] = await tx
      .select({
        id: dossierRH.id,
        utilisateurId: dossierRH.utilisateurId,
        poste: dossierRH.poste,
        dateNaissance: dossierRH.dateNaissance,
        telephone: dossierRH.telephone,
        adresse: dossierRH.adresse,
        urgenceNom: dossierRH.urgenceNom,
        urgenceTelephone: dossierRH.urgenceTelephone,
        photoCle: utilisateur.photoCleStockage,
        typeContrat: dossierRH.typeContrat,
        dateEmbauche: dossierRH.dateEmbauche,
        dateFinContrat: dossierRH.dateFinContrat,
        decisionStage: dossierRH.decisionStage,
        dateDecisionStage: dossierRH.dateDecisionStage,
        motifDecisionStage: dossierRH.motifDecisionStage,
        salaireBase: dossierRH.salaireBase,
        nombrePersonnesACharge: dossierRH.nombrePersonnesACharge,
        soldeConges: dossierRH.soldeConges,
        politiqueCongeId: dossierRH.politiqueCongeId,
        shiftId: dossierRH.shiftId,
        nomComplet: utilisateur.nomComplet,
        role: utilisateur.role,
        managerId: utilisateur.managerId,
        serviceId: utilisateur.serviceId,
      })
      .from(dossierRH)
      .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
      .where(eq(dossierRH.id, id));
    if (!ligne) return null;

    const estProprietaire = ligne.utilisateurId === utilisateurConnecte.utilisateurId;
    if (!estProprietaire) {
      const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
      if (ids !== "TOUT" && !ids.includes(ligne.utilisateurId)) return null;
    }

    const taches = await tachesDuCollaborateur(tx, utilisateurConnecte.entrepriseId, ligne.utilisateurId);
    // Tâches du poste : lisibles par qui voit la fiche (déjà contrôlé ci-dessus) ; poser ou retirer = Administrateur ou manager dont la portée RH contient la personne.
    const tachesPoste = await lireTachesPoste(tx, utilisateurConnecte.entrepriseId, ligne.utilisateurId);
    const peutGererTaches = peutGererTachesPoste(utilisateurConnecte, ligne.utilisateurId, utilisateurConnecte.role === "ADMIN" ? "TOUT" : await idsVisibles(tx, utilisateurConnecte, "RH"));

    const demandes = await tx.select().from(demandeConge).where(eq(demandeConge.dossierRHId, id)).orderBy(desc(demandeConge.creeLe));

    const evaluations = await tx
      .select({ id: evaluation.id, periode: evaluation.periode, commentaire: evaluation.commentaire, evaluateurNom: utilisateur.nomComplet, creeLe: evaluation.creeLe })
      .from(evaluation)
      .innerJoin(utilisateur, eq(evaluation.evaluateurId, utilisateur.id))
      .where(eq(evaluation.dossierRHId, id))
      .orderBy(desc(evaluation.creeLe));

    const aujourdHui = debutJournee(new Date());
    const [pointageAujourdHui] = await tx.select().from(pointage).where(eq(pointage.dossierRHId, id));
    const pointageDuJour = pointageAujourdHui?.date.getTime() === aujourdHui.getTime() ? pointageAujourdHui : null;

    // Politiques de congé (échange du 2026-09-08) — liste des politiques
    // actives pour le formulaire d'assignation, et calcul du droit annuel
    // de la politique déjà assignée le cas échéant (jamais stocké, toujours
    // recalculé — voir src/lib/rh/politique-conge.ts).
    const politiquesActives = await tx
      .select({ id: politiqueConge.id, nom: politiqueConge.nom })
      .from(politiqueConge)
      .where(and(eq(politiqueConge.entrepriseId, utilisateurConnecte.entrepriseId), eq(politiqueConge.actif, true)));

    let politiqueAssignee: { nom: string; droitAnnuel: number } | null = null;
    if (ligne.politiqueCongeId) {
      const [laPolitique] = await tx.select().from(politiqueConge).where(eq(politiqueConge.id, ligne.politiqueCongeId));
      if (laPolitique) {
        const paliers =
          laPolitique.type === "ANCIENNETE"
            ? await tx.select().from(politiqueCongePalier).where(eq(politiqueCongePalier.politiqueCongeId, laPolitique.id))
            : [];
        const droitAnnuel = calculerDroitAnnuelConge(laPolitique, paliers, ligne.dateEmbauche, new Date());
        politiqueAssignee = { nom: laPolitique.nom, droitAnnuel };
      }
    }

    // Historique des révisions de salaire (échange du 2026-09-08) — récupéré
    // sans condition ici (même patron que salaireBase lui-même dans la
    // requête `ligne` ci-dessus) ; la restriction de visibilité (Admin ou
    // l'intéressé) s'applique côté rendu via peutVoirSalaireIci, pas ici.
    const revisionsSalaire = await tx
      .select({
        id: revisionSalaire.id,
        ancienSalaire: revisionSalaire.ancienSalaire,
        nouveauSalaire: revisionSalaire.nouveauSalaire,
        motif: revisionSalaire.motif,
        effectueParNom: utilisateur.nomComplet,
        creeLe: revisionSalaire.creeLe,
      })
      .from(revisionSalaire)
      .innerJoin(utilisateur, eq(revisionSalaire.effectueParId, utilisateur.id))
      .where(eq(revisionSalaire.dossierRHId, id))
      .orderBy(desc(revisionSalaire.creeLe));

    // Primes et bulletins de paie (2026-11-11) : lus SEULEMENT pour l'Administrateur et la personne (même règle que le salaire).
    const voitLaPaie = calculerPeutVoirSalaire(utilisateurConnecte, ligne.utilisateurId);
    const primes = voitLaPaie ? await primesDuDossier(tx, id) : [];
    const paiements = voitLaPaie ? await paiementsDuDossier(tx, id, { seulementEnvoyes: utilisateurConnecte.role !== "ADMIN" }) : [];

    // Modifications faites sur cette fiche par une AUTRE entreprise du groupe (fiches ouvertes, 2026-11-11).
    const modifsAutresEntreprises = await modificationsRecues(tx, [ligne.utilisateurId]);

    // Fichiers RH (échange du 2026-09-08) — récupéré sans condition, même
    // patron que salaireBase/revisionsSalaire ci-dessus ; la restriction de
    // visibilité s'applique côté rendu.
    const documentsRH = await tx
      .select({
        id: documentRH.id,
        nom: documentRH.nom,
        tailleOctets: documentRH.tailleOctets,
        televerseParNom: utilisateur.nomComplet,
        creeLe: documentRH.creeLe,
      })
      .from(documentRH)
      .innerJoin(utilisateur, eq(documentRH.televerseParId, utilisateur.id))
      .where(eq(documentRH.dossierRHId, id))
      .orderBy(desc(documentRH.creeLe));

    // Régularisations de pointage (échange du 2026-09-12) — toutes les
    // demandes du dossier, quel que soit leur statut, pour l'historique.
    const regularisations = await tx.select().from(regularisationPointage).where(eq(regularisationPointage.dossierRHId, id)).orderBy(desc(regularisationPointage.creeLe));

    // Shifts (échange du 2026-09-12) — mêmes patrons que politiquesActives
    // ci-dessus : liste active pour le formulaire d'assignation.
    const shiftsActifs = await tx.select({ id: shift.id, nom: shift.nom }).from(shift).where(and(eq(shift.entrepriseId, utilisateurConnecte.entrepriseId), eq(shift.actif, true)));

    // Manager + département (2026-09-15) — collègues éligibles (tout le
    // monde sauf la personne elle-même), départements existants, et
    // autorisations RH déjà accordées à cette personne pour d'autres
    // départements, pour le formulaire d'édition ci-dessous.
    const [collegues, services, [departementActuel], autorisationsExistantes] = await Promise.all([
      tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), ne(utilisateur.id, ligne.utilisateurId))),
      tx.select({ id: service.id, nom: service.nom }).from(service),
      ligne.serviceId ? tx.select({ nom: service.nom }).from(service).where(eq(service.id, ligne.serviceId)) : Promise.resolve([]),
      tx.select({ serviceId: autorisationDepartementRh.serviceId }).from(autorisationDepartementRh).where(eq(autorisationDepartementRh.utilisateurId, ligne.utilisateurId)),
    ]);

    return {
      ligne,
      taches,
      demandes,
      evaluations,
      pointageDuJour,
      estProprietaire,
      politiquesActives,
      politiqueAssignee,
      revisionsSalaire,
      primes,
      paiements,
      modifsAutresEntreprises,
      documentsRH,
      regularisations,
      shiftsActifs,
      collegues,
      services,
      nomDepartementActuel: departementActuel?.nom ?? null,
      tachesPoste,
      peutGererTaches,
      departementsAutorises: autorisationsExistantes.map((a) => a.serviceId),
    };
  });

  if (!donnees) notFound();
  const { ligne, taches, tachesPoste, peutGererTaches, demandes, evaluations, pointageDuJour, estProprietaire, politiquesActives, politiqueAssignee, revisionsSalaire, primes, paiements, modifsAutresEntreprises, documentsRH, regularisations, shiftsActifs, collegues, services, nomDepartementActuel, departementsAutorises } = donnees;

  const peutVoirSalaireIci = calculerPeutVoirSalaire(utilisateurConnecte, ligne.utilisateurId);
  const peutModifierDossier = utilisateurConnecte.role === "ADMIN";
  const peutTraiterConges = !estProprietaire && peut(utilisateurConnecte, "RH", "MODIFIER");
  const peutEvaluer = !estProprietaire && peut(utilisateurConnecte, "RH", "MODIFIER");
  // Informations personnelles : la personne, l'Administrateur ou son Manager (la portée a déjà été contrôlée plus haut).
  const peutModifierInfos = estProprietaire || utilisateurConnecte.role === "ADMIN" || (utilisateurConnecte.role === "MANAGER" && peut(utilisateurConnecte, "RH", "MODIFIER"));
  const aujourdhuiJour = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());
  const anniversaire = ligne.dateNaissance ? prochainAnniversaire(ligne.dateNaissance, aujourdhuiJour) : null;
  const ageActuel = ligne.dateNaissance ? ageAu(ligne.dateNaissance, aujourdhuiJour) : null;
  const maintenant = new Date();

  const contrat = t(LIBELLE_CONTRAT[ligne.typeContrat] ?? ligne.typeContrat);
  const nomResponsable = collegues.find((c) => c.id === ligne.managerId)?.nomComplet ?? null;
  const jourFr = (d: Date) => new Intl.DateTimeFormat(t.locale, { dateStyle: "long", timeZone: "UTC" }).format(d);
  const tauxTaches = tauxTachesTerminees(taches.ouvertes.length, taches.termineesRecemment);
  const lienHero = "flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70";

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>

      <FicheHero
        avatar={
          <PhotoFiche
            nom={ligne.nomComplet}
            adresse={adressePhoto("utilisateur", ligne.utilisateurId, ligne.photoCle)}
            version={ligne.photoCle ?? ""}
            utilisateurId={ligne.utilisateurId}
            proprietaire={estProprietaire}
            peutChangerPourAutre={utilisateurConnecte.role === "ADMIN" && !estProprietaire}
          />
        }
        nom={ligne.nomComplet}
        sousTitre={ligne.poste}
        badges={
          <>
            <Badge variant="brand">{t(LIBELLE_ROLE[ligne.role] ?? ligne.role)}</Badge>
            <Badge variant="info">{contrat}</Badge>
            {ligne.decisionStage === "EMBAUCHE" ? <Badge variant="success">{t("Embauché(e) après stage")}</Badge> : null}
          </>
        }
        ruban={
          anniversaire && anniversaire.jours <= 7 ? (
            <RubanHero icone={Cake}>{anniversaire.jours === 0 ? t("Joyeux anniversaire !") : t("Anniversaire {delai}", { delai: libelleDelai(anniversaire.jours, t).toLowerCase() })}</RubanHero>
          ) : null
        }
        puces={[
          { icone: CalendarDays, texte: t("Arrivé(e) le {date}", { date: jourFr(ligne.dateEmbauche) }) },
          { icone: Hourglass, texte: t("Ancienneté : {duree}", { duree: ancienneteTexte(ligne.dateEmbauche, maintenant, t) }) },
          ...(nomDepartementActuel ? [{ icone: Building2, texte: nomDepartementActuel }] : []),
          ...(nomResponsable ? [{ icone: UserRound, texte: `Responsable : ${nomResponsable}` }] : []),
          ...(ligne.telephone ? [{ icone: Phone, texte: ligne.telephone }] : []),
        ]}
        actions={
          <>
            <Link href={`/app/rh/${ligne.id}/depart`} className={lienHero}>
              <LogOut className="size-3.5" aria-hidden />
              {t("Départ")}
            </Link>
            {peutModifierDossier ? (
              <Link href={`/app/rh/${ligne.id}/export`} className={lienHero}>
                <Download className="size-3.5" aria-hidden />
                {t("Exporter (CSV)")}
              </Link>
            ) : null}
          </>
        }
      />

      {ligne.typeContrat === "STAGE" || ligne.decisionStage ? (
        <BlocStagePro
          dossierRHId={ligne.id}
          finStage={ligne.dateFinContrat ? ligne.dateFinContrat.toISOString() : null}
          joursRestants={ligne.dateFinContrat ? joursRestantsStage(ligne.dateFinContrat) : null}
          decision={ligne.decisionStage}
          dateDecision={ligne.dateDecisionStage ? ligne.dateDecisionStage.toISOString() : null}
          motifDecision={ligne.motifDecisionStage}
          peutDecider={utilisateurConnecte.role === "ADMIN"}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        {/* ----------------------------- Colonne principale : le travail ----------------------------- */}
        <div className="flex min-w-0 flex-col gap-6">
          <CarteFiche icone={ClipboardList} titre={t("Tâches du poste")} aide={t("Ses responsabilités dans son poste, visibles de la personne et de son manager")}>
            <ListeTachesPoste taches={tachesPoste.map((x) => ({ id: x.id, titre: x.titre, description: x.description, frequence: x.frequence }))} peutGerer={peutGererTaches} cibleId={ligne.utilisateurId} dossierRHId={ligne.id} />
          </CarteFiche>

          <CarteFiche icone={ListChecks} titre={t("Tâches")} aide={t("Projets et activités CRM qui lui sont assignés")}>
            <div className="grid grid-cols-3 gap-3">
              <TuileChiffre valeur={taches.ouvertes.length} libelle={t("En cours")} ton="bleu" />
              <TuileChiffre valeur={taches.enRetard} libelle={t("En retard")} ton={taches.enRetard > 0 ? "alerte" : "neutre"} />
              <TuileChiffre valeur={taches.termineesRecemment} libelle={t("Terminées (30 j)")} ton="succes" />
            </div>
            {tauxTaches !== null ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("Avancement sur 30 jours")}</span>
                  <span className="font-medium tabular-nums text-foreground">{tauxTaches} %</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={tauxTaches} aria-valuemin={0} aria-valuemax={100} aria-label={t("Part de tâches terminées")}>
                  <div className="h-full rounded-full bg-linear-to-r from-marque-bleu-500 to-marque-orange-500" style={{ width: `${tauxTaches}%` }} />
                </div>
              </div>
            ) : null}
            {taches.ouvertes.length === 0 ? (
              <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">{t("Aucune tâche en cours.")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {taches.ouvertes.map((tache) => {
                  const enRetard = estEnRetard(tache.echeance, maintenant);
                  return (
                    <li key={tache.id} className={`flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${enRetard ? "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20" : "bg-card"}`}>
                      <div className="min-w-0">
                        <p className="font-medium">{tache.lien ? <Link href={tache.lien} className="underline-offset-4 hover:underline">{tache.titre}</Link> : tache.titre}</p>
                        <p className="text-xs text-muted-foreground">{tache.origine.startsWith("Projet ") ? t("Projet {titre}", { titre: tache.origine.slice(7) }) : t(tache.origine)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {tache.echeance ? (
                          <span className={`flex items-center gap-1 text-xs ${enRetard ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                            <Clock className="size-3" aria-hidden />
                            {enRetard ? t("En retard · ") : ""}
                            {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "Africa/Douala" }).format(tache.echeance)}
                          </span>
                        ) : null}
                        <Badge variant={tache.statut === "EN_COURS" ? "info" : "neutral"}>{libelleStatutTache(tache.statut, t)}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CarteFiche>

          {estProprietaire || peutModifierDossier || peutTraiterConges ? (
            <CarteFiche
              icone={Wifi}
              titre={t("Pointage")}
              aide={t("Arrivées, départs et régularisations")}
              droite={
                estProprietaire ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <FormulaireRegularisation />
                    <BoutonPointage arrive={Boolean(pointageDuJour?.heureArrivee)} parti={Boolean(pointageDuJour?.heureDepart)} />
                  </div>
                ) : null
              }
            >
              {peutModifierDossier ? <FormulaireShift dossierRHId={ligne.id} shiftId={ligne.shiftId} shifts={shiftsActifs} /> : null}
              {estProprietaire || peutTraiterConges ? <ListeRegularisations regularisations={regularisations} peutTraiter={peutTraiterConges} /> : null}
            </CarteFiche>
          ) : null}

          <CarteFiche icone={CalendarRange} titre={t("Congés")} aide={`Solde : ${t("{n} jour(s)", { n: ligne.soldeConges })}`} ton="vert" droite={estProprietaire ? <FormulaireDemandeConge /> : null}>
            <ListeDemandesConge demandes={demandes} peutTraiter={peutTraiterConges} peutVoirMotifSensible={peutVoirSalaireIci} />
          </CarteFiche>

          <CarteFiche icone={Award} titre={t("Évaluations")} aide={t("Retours périodiques de son responsable")} ton="orange" droite={peutEvaluer ? <FormulaireEvaluation dossierRHId={ligne.id} /> : null}>
            <ListeEvaluations evaluations={evaluations} />
          </CarteFiche>
        </div>

        {/* ----------------------------- Colonne latérale : la personne ----------------------------- */}
        <aside className="flex min-w-0 flex-col gap-6">
          <CarteFiche icone={IdCard} titre={t("Informations personnelles")} aide={t("Visibles de la personne, de l'Administrateur et de son responsable")}>
            <ListeInfos>
              <LigneInfo icone={Cake} intitule={t("Date de naissance")} vide={!ligne.dateNaissance}>
                {ligne.dateNaissance ? `${jourFr(new Date(`${ligne.dateNaissance}T00:00:00Z`))}${ageActuel !== null ? ` (${t("{n} ans", { n: ageActuel })})` : ""}` : t("Non renseignée")}
                {anniversaire && anniversaire.jours <= 30 ? <span className="mt-0.5 block text-xs font-normal text-primary">{t("Anniversaire : {delai}", { delai: libelleDelai(anniversaire.jours, t).toLowerCase() })}</span> : null}
              </LigneInfo>
              <LigneInfo icone={Phone} intitule={t("Téléphone")} vide={!ligne.telephone}>
                {ligne.telephone ?? t("Non renseigné")}
              </LigneInfo>
              <LigneInfo icone={MapPin} intitule={t("Adresse")} vide={!ligne.adresse}>
                {ligne.adresse ?? t("Non renseignée")}
              </LigneInfo>
              <LigneInfo icone={ShieldAlert} intitule={t("Personne à prévenir en cas d'urgence")} vide={!ligne.urgenceNom}>
                {ligne.urgenceNom ? `${ligne.urgenceNom}${ligne.urgenceTelephone ? ` — ${ligne.urgenceTelephone}` : ""}` : t("Non renseignée")}
              </LigneInfo>
            </ListeInfos>
            {peutModifierInfos ? (
              <BlocRepliable titre={estProprietaire ? t("Compléter ou modifier mes informations") : t("Compléter ou modifier ces informations")} ouvertParDefaut={!ligne.dateNaissance || !ligne.telephone}>
                <FormulaireInfosPersonnelles
                  dossierRHId={ligne.id}
                  valeurs={{ dateNaissance: ligne.dateNaissance ?? "", telephone: ligne.telephone ?? "", adresse: ligne.adresse ?? "", urgenceNom: ligne.urgenceNom ?? "", urgenceTelephone: ligne.urgenceTelephone ?? "" }}
                />
              </BlocRepliable>
            ) : null}
          </CarteFiche>

          <CarteFiche icone={Briefcase} titre={t("Poste et contrat")}>
            <ListeInfos>
              <LigneInfo icone={Briefcase} intitule={t("Poste")}>
                {ligne.poste}
              </LigneInfo>
              <LigneInfo icone={Hash} intitule={t("Contrat")}>
                {t("{contrat} — depuis le {date}", { contrat, date: new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(ligne.dateEmbauche) })}
                {ligne.dateFinContrat ? ` (${t("jusqu'au {date}", { date: new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(ligne.dateFinContrat) })})` : ""}
              </LigneInfo>
              <LigneInfo icone={Building2} intitule={t("Département")} vide={!nomDepartementActuel}>
                {nomDepartementActuel ?? t("Non renseigné")}
              </LigneInfo>
              <LigneInfo icone={CalendarRange} intitule={t("Solde de congés")}>
                {t("{n} jour(s)", { n: ligne.soldeConges })}
              </LigneInfo>
              <LigneInfo icone={UserRound} intitule={t("Personnes à charge")}>
                {ligne.nombrePersonnesACharge}
              </LigneInfo>
              <LigneInfo icone={CalendarDays} intitule={t("Politique de congé")} vide={!politiqueAssignee}>
                {politiqueAssignee ? t("{nom} — droit annuel : {n} j.", { nom: politiqueAssignee.nom, n: politiqueAssignee.droitAnnuel }) : t("Aucune")}
              </LigneInfo>
            </ListeInfos>
            {peutModifierDossier ? (
              <div className="flex flex-wrap items-end gap-2 border-t pt-4">
                <FormulairePolitiqueConge dossierRHId={ligne.id} politiqueCongeId={ligne.politiqueCongeId} politiques={politiquesActives} />
                {politiqueAssignee ? <BoutonCrediterConge dossierRHId={ligne.id} droitAnnuel={politiqueAssignee.droitAnnuel} /> : null}
              </div>
            ) : null}
            {peutModifierDossier ? (
              <FormulaireDossierRH
                dossierRHId={ligne.id}
                poste={ligne.poste}
                typeContrat={ligne.typeContrat}
                dateEmbauche={ligne.dateEmbauche}
                dateFinContrat={ligne.dateFinContrat}
                nombrePersonnesACharge={ligne.nombrePersonnesACharge}
                managerId={ligne.managerId}
                serviceId={ligne.serviceId}
                collegues={collegues}
                services={services}
                departementsAutorises={departementsAutorises}
              />
            ) : null}
          </CarteFiche>

          {modifsAutresEntreprises.length > 0 ? (
            <CarteFiche icone={IdCard} titre={t("Modifiée par une autre entreprise")} aide={t("Entreprises du groupe à qui vous avez ouvert cette fiche")} ton="neutre">
              <ul className="flex flex-col gap-2 text-sm">
                {modifsAutresEntreprises.map((mo) => (
                  <li key={mo.id}>
                    <span className="font-medium">{mo.auteurNom}</span> ({mo.auteurEntrepriseNom}) — {mo.champs}
                    <span className="block text-xs text-muted-foreground">{new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(mo.creeLe)}</span>
                  </li>
                ))}
              </ul>
            </CarteFiche>
          ) : null}

          {peutVoirSalaireIci ? (
            <CarteFiche icone={Wallet} titre={t("Rémunération")} aide={t("Confidentiel : visible de la personne et de l'Administrateur seulement")} confidentiel>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-marque-orange-50 px-4 py-3 dark:bg-marque-orange-900/20">
                <div>
                  <p className="text-xs text-muted-foreground">{t("Salaire de base")}</p>
                  <p className="text-xl font-semibold tabular-nums">{ligne.salaireBase != null ? `${new Intl.NumberFormat("fr-FR").format(ligne.salaireBase)} FCFA` : t("Non renseigné")}</p>
                </div>
                <ShieldCheck className="size-6 text-marque-orange-600" aria-hidden />
              </div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{t("Historique de salaire")}</h3>
                {peutModifierDossier ? <FormulaireRevisionSalaire dossierRHId={ligne.id} salaireActuel={ligne.salaireBase} /> : null}
              </div>
              <ListeRevisionsSalaire revisions={revisionsSalaire} />
              <BlocPaie dossierRHId={ligne.id} primes={primes} paiements={paiements} estAdmin={utilisateurConnecte.role === "ADMIN"} salaireRenseigne={Boolean(ligne.salaireBase && ligne.salaireBase > 0)} />
            </CarteFiche>
          ) : null}

          {peutVoirSalaireIci ? (
            <CarteFiche icone={FolderOpen} titre={t("Fichiers")} aide={t("Contrat, pièces et documents RH")} ton="neutre">
              <FormulaireDocumentRH dossierRHId={ligne.id} />
              <ListeDocumentsRH documents={documentsRH} dossierRHId={ligne.id} peutSupprimer={peutModifierDossier} />
            </CarteFiche>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
