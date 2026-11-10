import { m } from "@/lib/i18n/catalogue";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, inArray, and, ne } from "drizzle-orm";
import { Users, Lock, CalendarClock, LogOut, Briefcase, Wallet, Ticket, Smile, GraduationCap, ClipboardCheck, UserPlus, Cake, Network, Workflow } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, dossierRH, demandeConge, demandeDepart, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { traduire } from "@/lib/i18n/traduire";
import { peut, portee } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { tableauEquipe } from "@/lib/rh/equipe";
import { droitSurFiche } from "@/lib/rh/presences";
import { rapportEntreprise, type RapportEntreprise } from "@/lib/rh/rapports";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NombreAnime } from "@/components/nombre-anime";
import { traiterDemandeConge } from "@/lib/actions/rh";
import { traiterDemandeDepart } from "@/lib/actions/depart";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { adressePhoto } from "@/lib/rh/photo-affichage";
import { anniversairesAVenir } from "@/lib/rh/anniversaires";
import { ReglageSouhait } from "./reglage-souhait";
import { anniversairesDesPartenaires, etatPartageFiches, partenairesFiches } from "@/lib/rh/groupe-fiches";
import { libelleDelai } from "@/lib/rh/anniversaires-regles";
import { LIBELLE_CONTRAT, LIBELLE_ROLE } from "@/lib/rh/fiche-affichage";
import { getT } from "@/lib/i18n/langue";

const LIBELLE_TYPE_CONGE: Record<string, string> = { CONGE_PAYE: m("Congé payé"), MALADIE: m("Maladie"), SANS_SOLDE: m("Sans solde"), AUTRE: m("Autre") };
const LIBELLE_TYPE_DEPART: Record<string, string> = { DEMISSION: m("Démission"), LICENCIEMENT: m("Licenciement"), FIN_CONTRAT: m("Fin de contrat"), AUTRE: m("Autre") };
const LIBELLE_TYPE_CONTRAT: Record<string, string> = { CDI: "CDI", CDD: "CDD", STAGE: m("Stage"), PRESTATAIRE: m("Prestataire") };

export default async function PageRH() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès aux Ressources Humaines.")}</p>
      </div>
    );
  }

  // Portée PROPRE (Employé) : redirection directe vers son propre dossier,
  // pas de tableau de bord d'équipe à afficher. Résolu dans une transaction
  // séparée, avant le tableau de bord Manager/Admin, pour ne jamais mélanger
  // les deux formes de résultat possibles dans un seul type de retour.
  if (portee(utilisateurConnecte, "RH") === "PROPRE") {
    const monDossierId = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
      const [monEntreprise] = await tx
        .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
        .from(entreprise)
        .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
      if (!disponible(monEntreprise, "RH")) return null;

      const [monDossier] = await tx.select({ id: dossierRH.id }).from(dossierRH).where(eq(dossierRH.utilisateurId, utilisateurConnecte.utilisateurId));
      return monDossier?.id ?? null;
    });

    if (!monDossierId) {
      return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Lock className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-muted-foreground">{t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.")}</p>
        </div>
      );
    }
    redirect(`/app/rh/${monDossierId}`);
  }

  // Docs/palier-5-*, section 2bis : "ce suivi d'équipe ne nécessite pas le
  // forfait Business" — l'activité de l'équipe (tâches terminées) reste
  // accessible dès le Pro, réutilisant les données Projets/Tâches déjà
  // couvertes par ce forfait. Seule la section "Dossiers RH" (congés,
  // pointage, salaire) est réservée au forfait Business ci-dessous — d'où
  // deux vérifications disponible() séparées plutôt qu'un verrou unique en
  // tête de page.
  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement, souhaitAnniversaire: entreprise.souhaitAnniversaireEmail })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const finMois = new Date(debutMois);
    finMois.setMonth(finMois.getMonth() + 1);

    const projetsDisponible = disponible(monEntreprise, "PROJETS");
    const rhDisponible = disponible(monEntreprise, "RH");

    const activite = projetsDisponible ? await tableauEquipe(tx, utilisateurConnecte.entrepriseId, utilisateurConnecte, debutMois, finMois) : [];

    if (!rhDisponible) {
      return {
        activite,
        projetsDisponible,
        rhDisponible,
        dossiers: [],
        demandesEnAttente: [],
        departsEnAttente: [],
        nomParDossierRHId: {} as Record<string, string>,
        rapport: null as RapportEntreprise | null,
        anniversaires: [] as Awaited<ReturnType<typeof anniversairesAVenir>>,
        dossierParUtilisateur: {} as Record<string, string>,
        anniversairesGroupe: [] as Awaited<ReturnType<typeof anniversairesDesPartenaires>>,
        lienGroupe: false,
        souhaitAnniversaire: false,
      };
    }

    // Tableau de bord (échange du 2026-09-13, "ajoute un tableau de bord au
    // module RH à l'accueil") — réutilise rapportEntreprise() déjà construit
    // pour les Rapports RH consolidés (/app/rh/rapports), même principe que
    // le tableau de bord FACO : aucune nouvelle requête, une agrégation déjà
    // testée. Masse salariale exclue du rapport pour un Manager (portée
    // TOUT sur RH mais jamais le salaire agrégé de toute l'équipe — voir
    // règle non négociable CLAUDE.md, seul l'Administrateur y accède).
    const rapport = await rapportEntreprise(tx, utilisateurConnecte.entrepriseId);

    const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
    const dossiers = await tx
      .select({ id: dossierRH.id, utilisateurId: dossierRH.utilisateurId, poste: dossierRH.poste, nomComplet: utilisateur.nomComplet, photoCle: utilisateur.photoCleStockage, typeContrat: dossierRH.typeContrat, role: utilisateur.role })
      .from(dossierRH)
      .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
      .where(and(ne(utilisateur.statut, "SUPPRIME"), ids === "TOUT" ? eq(dossierRH.entrepriseId, utilisateurConnecte.entrepriseId) : inArray(dossierRH.utilisateurId, ids)));

    const idsDossiersRH = dossiers.map((d) => d.id);
    const demandesEnAttente =
      idsDossiersRH.length > 0
        ? await tx
            .select({
              id: demandeConge.id,
              type: demandeConge.type,
              dateDebut: demandeConge.dateDebut,
              dateFin: demandeConge.dateFin,
              nombreJours: demandeConge.nombreJours,
              dossierRHId: demandeConge.dossierRHId,
            })
            .from(demandeConge)
            .where(and(inArray(demandeConge.dossierRHId, idsDossiersRH), eq(demandeConge.statut, "EN_ATTENTE")))
        : [];

    // Offboarding (échange du 2026-09-08) — même patron que les demandes de
    // congé en attente ci-dessus.
    const departsEnAttente =
      idsDossiersRH.length > 0
        ? await tx
            .select({ id: demandeDepart.id, type: demandeDepart.type, dateDepartSouhaitee: demandeDepart.dateDepartSouhaitee, dossierRHId: demandeDepart.dossierRHId })
            .from(demandeDepart)
            .where(and(inArray(demandeDepart.dossierRHId, idsDossiersRH), eq(demandeDepart.statut, "EN_ATTENTE")))
        : [];

    const nomParDossierRHId = Object.fromEntries(dossiers.map((d) => [d.id, d.nomComplet]));

    // Anniversaires des 30 prochains jours (Administrateur : toute l'entreprise ; Manager : son équipe et ses stagiaires).
    const anniversaires = await anniversairesAVenir(tx, utilisateurConnecte, new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date()), 30);
    const dossierParUtilisateur = Object.fromEntries(dossiers.map((d) => [d.utilisateurId, d.id]));
    // Groupe : anniversaires des entreprises partenaires (partage activé des deux côtés) et lien vers « Équipes du groupe ».
    const jourDouala = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());
    const anniversairesGroupe = await anniversairesDesPartenaires(utilisateurConnecte, jourDouala, 30);
    const lienGroupe = utilisateurConnecte.role === "ADMIN" ? (await etatPartageFiches(utilisateurConnecte.entrepriseId)).groupe : (await partenairesFiches(utilisateurConnecte.entrepriseId)).length > 0;

    return { activite, projetsDisponible, rhDisponible, dossiers, demandesEnAttente, departsEnAttente, nomParDossierRHId, rapport, anniversaires, dossierParUtilisateur, anniversairesGroupe, lienGroupe, souhaitAnniversaire: monEntreprise.souhaitAnniversaire };
  });

  const { activite, projetsDisponible, rhDisponible, dossiers, demandesEnAttente, departsEnAttente, nomParDossierRHId, rapport, anniversaires, dossierParUtilisateur, anniversairesGroupe, lienGroupe, souhaitAnniversaire } = donnees;
  const anniversairesTous = [...anniversaires.map((a) => ({ ...a, entrepriseNom: null as string | null })), ...anniversairesGroupe].sort((a, b) => a.jours - b.jours || a.nom.localeCompare(b.nom, "fr"));
  const anniversairesParUtilisateur = Object.fromEntries(anniversaires.filter((a) => a.type === "UTILISATEUR").map((a) => [a.id, a]));
  const aFichePresence = (await droitSurFiche(utilisateurConnecte)) !== null;
  const ticketsOuverts = rapport ? (rapport.ticketsParStatut["OUVERT"] ?? 0) + (rapport.ticketsParStatut["EN_COURS"] ?? 0) : 0;
  const dico = traduire(utilisateurConnecte.langue);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2.5">
          <Users className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{dico.pages.rh.titre}</h1>
        </div>
        {rhDisponible && (utilisateurConnecte.role === "ADMIN" || utilisateurConnecte.role === "MANAGER") ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {aFichePresence ? (
              <Link href="/app/rh/presences" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ClipboardCheck className="size-3.5" aria-hidden />
                {t("Présences")}
              </Link>
            ) : null}
            <Link href="/app/rh/stagiaires" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <GraduationCap className="size-3.5" aria-hidden />
              {t("Stagiaires")}
            </Link>
            <Link href="/app/rh/organigramme" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <Workflow className="size-3.5" aria-hidden />
              {t("Organigramme")}
            </Link>
            {lienGroupe ? (
              <Link href="/app/rh/groupe" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <Network className="size-3.5" aria-hidden />
                {t("Groupe")}
              </Link>
            ) : null}
            {peut(utilisateurConnecte, "RH", "CREER") ? (
              <Link href="/app/rh/nouveau" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <UserPlus className="size-3.5" aria-hidden />
                {t("Nouvelle fiche")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {demandesEnAttente.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarClock className="size-4" aria-hidden />
            {t("Demandes de congé en attente")}
          </h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {demandesEnAttente.map((d, index) => (
                <div
                  key={d.id}
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  className="flex animate-in fade-in slide-in-from-bottom-1 items-center justify-between gap-3 px-4 py-2.5 text-sm duration-300 fill-mode-both"
                >
                  <div>
                    <p className="font-medium">{nomParDossierRHId[d.dossierRHId] ?? t("Employé")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("{type} — {debut} au {fin} ({n} j.)", { type: t(LIBELLE_TYPE_CONGE[d.type] ?? d.type), debut: new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(d.dateDebut), fin: new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(d.dateFin), n: d.nombreJours })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={traiterDemandeConge.bind(null, d.id, "approuver")}>
                      <Button type="submit" size="xs" variant="outline">
                        {t("Approuver")}
                      </Button>
                    </form>
                    <form action={traiterDemandeConge.bind(null, d.id, "refuser")}>
                      <Button type="submit" size="xs" variant="ghost" className="hover:text-destructive">
                        {t("Refuser")}
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {departsEnAttente.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <LogOut className="size-4" aria-hidden />
            {t("Demandes de départ en attente")}
          </h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {departsEnAttente.map((d, index) => (
                <div
                  key={d.id}
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  className="flex animate-in fade-in slide-in-from-bottom-1 items-center justify-between gap-3 px-4 py-2.5 text-sm duration-300 fill-mode-both"
                >
                  <div>
                    <p className="font-medium">{nomParDossierRHId[d.dossierRHId] ?? t("Employé")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("{type} — souhaitée le {date}", { type: t(LIBELLE_TYPE_DEPART[d.type] ?? d.type), date: new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(d.dateDepartSouhaitee) })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={traiterDemandeDepart.bind(null, d.id, "approuver", undefined)}>
                      <Button type="submit" size="xs" variant="outline">
                        {t("Approuver")}
                      </Button>
                    </form>
                    <form action={traiterDemandeDepart.bind(null, d.id, "refuser", undefined)}>
                      <Button type="submit" size="xs" variant="ghost" className="hover:text-destructive">
                        {t("Refuser")}
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {projetsDisponible ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("Activité de l'équipe (tâches terminées ce mois-ci)")}</h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {activite.map((a, index) => (
                <div
                  key={a.utilisateurId}
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  className="flex animate-in fade-in slide-in-from-bottom-1 items-center justify-between px-4 py-2.5 text-sm duration-300 fill-mode-both"
                >
                  <span>{a.nomComplet}</span>
                  <Badge variant="neutral">{t("{n} tâche(s)", { n: a.tachesTerminees })}</Badge>
                </div>
              ))}
              {activite.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">{t("Aucune donnée pour le moment.")}</p> : null}
            </div>
          </Card>
        </div>
      ) : null}

      {rapport ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("Aperçu")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
              <CardContent className="flex flex-col gap-1">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Briefcase className="size-3.5" aria-hidden />
                  {t("Dossiers actifs")}
                </p>
                <p className="text-xl font-semibold">
                  <NombreAnime valeur={rapport.dossiersActifs} />
                </p>
                {Object.keys(rapport.repartitionContrats).length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {Object.entries(rapport.repartitionContrats)
                      .map(([type, n]) => `${t(LIBELLE_TYPE_CONTRAT[type] ?? type)} : ${n}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
            <Link href="/app/rh/tickets" className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-both">
              <Card interactive className="h-full">
                <CardContent className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Ticket className="size-3.5" aria-hidden />
                    {t("Tickets ouverts")}
                  </p>
                  <p className="text-xl font-semibold">
                    <NombreAnime valeur={ticketsOuverts} />
                  </p>
                </CardContent>
              </Card>
            </Link>
            {utilisateurConnecte.role === "ADMIN" ? (
              <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-both">
                <CardContent className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wallet className="size-3.5" aria-hidden />
                    {t("Masse salariale (base, mensuelle)")}
                  </p>
                  <p className="text-xl font-semibold">{new Intl.NumberFormat("fr-FR").format(rapport.masseSalariale)} FCFA</p>
                </CardContent>
              </Card>
            ) : null}
            {rapport.dernierSondage ? (
              <Link href="/app/rh/sondages" className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both">
                <Card interactive className="h-full">
                  <CardContent className="flex flex-col gap-1">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Smile className="size-3.5" aria-hidden />
                      {t("Dernier sondage — {titre}", { titre: rapport.dernierSondage.titre })}
                    </p>
                    <p className="text-xl font-semibold">
                      <NombreAnime valeur={rapport.dernierSondage.tauxParticipation} suffixe={t("% de participation")} />
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {rhDisponible && (anniversairesTous.length > 0 || utilisateurConnecte.role === "ADMIN") ? (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Cake className="size-3.5" aria-hidden />
            {t("Anniversaires à venir")}
          </h2>
          {anniversairesTous.length === 0 ? <p className="rounded-xl border border-dashed py-5 text-center text-sm text-muted-foreground">{t("Aucun anniversaire dans les 30 prochains jours.")}</p> : null}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {anniversairesTous.slice(0, 6).map((a) => {
              const dossierId = a.type === "UTILISATEUR" ? (dossierParUtilisateur[a.id] ?? null) : null;
              const d = new Date(`${a.date}T00:00:00Z`);
              const jourNum = new Intl.DateTimeFormat(t.locale, { day: "numeric", timeZone: "UTC" }).format(d);
              const moisCourt = new Intl.DateTimeFormat(t.locale, { month: "short", timeZone: "UTC" }).format(d).replace(".", "");
              const aujourdhui = a.jours === 0;
              const contenu = (
                <>
                  <span className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-xl ${aujourdhui ? "bg-marque-orange text-white shadow-sm" : "bg-marque-orange-100 text-marque-orange-800 dark:bg-marque-orange-900/40 dark:text-marque-orange-200"}`}>
                    <span className="text-lg leading-none font-semibold tabular-nums">{jourNum}</span>
                    <span className="text-[10px] font-medium uppercase">{moisCourt}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {a.nom}
                      {a.type === "STAGIAIRE" ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t("(stagiaire)")}</span> : null}
                      {a.entrepriseNom ? <span className="mt-0.5 block w-fit max-w-full rounded-full bg-marque-bleu-50 px-2 py-0.5 text-[10px] font-medium text-marque-bleu-800 dark:bg-marque-bleu-800/40 dark:text-marque-bleu-50">{a.entrepriseNom}</span> : null}
                    </span>
                    <span className={`block text-xs ${aujourdhui ? "font-semibold text-marque-orange-700 dark:text-marque-orange-300" : "text-muted-foreground"}`}>
                      {aujourdhui ? t("Aujourd'hui") : libelleDelai(a.jours, t)} · {t("{n} ans", { n: a.age })}
                    </span>
                  </span>
                </>
              );
              const classes = `flex min-w-0 items-center gap-3 rounded-2xl bg-card p-3 ring-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${aujourdhui ? "ring-marque-orange/50" : "ring-foreground/[0.06]"}`;
              return (
                <li key={`${a.type}-${a.id}`} className="min-w-0">
                  {dossierId ? (
                    <Link href={`/app/rh/${dossierId}`} className={`${classes} survol-elevation`}>
                      {contenu}
                    </Link>
                  ) : (
                    <div className={classes}>{contenu}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">{t("Un email de rappel part chaque matin à l'Administrateur et au responsable de la personne.")}</p>
          {utilisateurConnecte.role === "ADMIN" ? <ReglageSouhait actif={souhaitAnniversaire} /> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("Dossiers RH")}</h2>
        {!rhDisponible ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
            <Lock className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.")}
            </p>
          </div>
        ) : dossiers.length === 0 ? (
          <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">{t("Aucun dossier RH pour le moment.")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dossiers.map((d, index) => {
              const anniv = anniversairesParUtilisateur[d.utilisateurId];
              return (
                <li key={d.id} style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }} className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
                  <Link
                    href={`/app/rh/${d.id}`}
                    className="survol-elevation group/carte flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]"
                  >
                    <span className="relative block h-16 overflow-hidden bg-linear-to-br from-marque-bleu-800 via-marque-bleu-700 to-marque-bleu-500">
                      <span aria-hidden className="absolute -top-8 -right-6 size-28 rounded-full bg-marque-orange/40 blur-2xl" />
                      <span aria-hidden className="absolute inset-0 opacity-60 [background-image:radial-gradient(color-mix(in_oklab,white_18%,transparent)_1px,transparent_1px)] [background-size:14px_14px]" />
                      {anniv && anniv.jours <= 7 ? (
                        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/30 backdrop-blur-md">
                          <Cake className="size-3" aria-hidden />
                          {anniv.jours === 0 ? t("Aujourd'hui") : libelleDelai(anniv.jours, t)}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-1 flex-col items-center gap-1 px-4 pt-0 pb-4 text-center">
                      <span className="relative z-10 -mt-8">
                        <AvatarCollaborateur nom={d.nomComplet} adresse={adressePhoto("utilisateur", d.utilisateurId, d.photoCle)} taille="carte" version={d.photoCle ?? ""} />
                      </span>
                      <span className="mt-1 text-sm font-semibold transition-colors group-hover/carte:text-primary">{d.nomComplet}</span>
                      <span className="text-xs text-muted-foreground">{d.poste}</span>
                      <span className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                        <Badge variant="brand">{t(LIBELLE_ROLE[d.role] ?? d.role)}</Badge>
                        <Badge variant="neutral">{t(LIBELLE_CONTRAT[d.typeContrat] ?? d.typeContrat)}</Badge>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
