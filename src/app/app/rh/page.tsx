import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, inArray, and } from "drizzle-orm";
import { Users, Lock, CalendarClock, LogOut, Briefcase, Wallet, Ticket, Smile } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, dossierRH, demandeConge, demandeDepart, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, portee } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { tableauEquipe } from "@/lib/rh/equipe";
import { rapportEntreprise, type RapportEntreprise } from "@/lib/rh/rapports";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { traiterDemandeConge } from "@/lib/actions/rh";
import { traiterDemandeDepart } from "@/lib/actions/depart";

const LIBELLE_TYPE_CONGE: Record<string, string> = { CONGE_PAYE: "Congé payé", MALADIE: "Maladie", SANS_SOLDE: "Sans solde", AUTRE: "Autre" };
const LIBELLE_TYPE_DEPART: Record<string, string> = { DEMISSION: "Démission", LICENCIEMENT: "Licenciement", FIN_CONTRAT: "Fin de contrat", AUTRE: "Autre" };
const LIBELLE_TYPE_CONTRAT: Record<string, string> = { CDI: "CDI", CDD: "CDD", STAGE: "Stage", PRESTATAIRE: "Prestataire" };

export default async function PageRH() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès aux Ressources Humaines.</p>
      </div>
    );
  }

  // Portée PROPRE (Employé) : redirection directe vers son propre dossier,
  // pas de tableau de bord d'équipe à afficher. Résolu dans une transaction
  // séparée, avant le tableau de bord Manager/Admin, pour ne jamais mélanger
  // les deux formes de résultat possibles dans un seul type de retour.
  if (portee(utilisateurConnecte.role, "RH") === "PROPRE") {
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
          <p className="text-muted-foreground">Les Ressources Humaines sont disponibles à partir du forfait Business.</p>
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
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
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
      .select({ id: dossierRH.id, utilisateurId: dossierRH.utilisateurId, poste: dossierRH.poste, nomComplet: utilisateur.nomComplet })
      .from(dossierRH)
      .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
      .where(ids === "TOUT" ? eq(dossierRH.entrepriseId, utilisateurConnecte.entrepriseId) : inArray(dossierRH.utilisateurId, ids));

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

    return { activite, projetsDisponible, rhDisponible, dossiers, demandesEnAttente, departsEnAttente, nomParDossierRHId, rapport };
  });

  const { activite, projetsDisponible, rhDisponible, dossiers, demandesEnAttente, departsEnAttente, nomParDossierRHId, rapport } = donnees;
  const ticketsOuverts = rapport ? (rapport.ticketsParStatut["OUVERT"] ?? 0) + (rapport.ticketsParStatut["EN_COURS"] ?? 0) : 0;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Users className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Ressources Humaines</h1>
      </div>

      {demandesEnAttente.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarClock className="size-4" aria-hidden />
            Demandes de congé en attente
          </h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {demandesEnAttente.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{nomParDossierRHId[d.dossierRHId] ?? "Employé"}</p>
                    <p className="text-xs text-muted-foreground">
                      {LIBELLE_TYPE_CONGE[d.type] ?? d.type} — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d.dateDebut)} au{" "}
                      {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d.dateFin)} ({d.nombreJours} j.)
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={traiterDemandeConge.bind(null, d.id, "approuver")}>
                      <Button type="submit" size="xs" variant="outline">
                        Approuver
                      </Button>
                    </form>
                    <form action={traiterDemandeConge.bind(null, d.id, "refuser")}>
                      <Button type="submit" size="xs" variant="ghost" className="hover:text-destructive">
                        Refuser
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
            Demandes de départ en attente
          </h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {departsEnAttente.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{nomParDossierRHId[d.dossierRHId] ?? "Employé"}</p>
                    <p className="text-xs text-muted-foreground">
                      {LIBELLE_TYPE_DEPART[d.type] ?? d.type} — souhaitée le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d.dateDepartSouhaitee)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={traiterDemandeDepart.bind(null, d.id, "approuver", undefined)}>
                      <Button type="submit" size="xs" variant="outline">
                        Approuver
                      </Button>
                    </form>
                    <form action={traiterDemandeDepart.bind(null, d.id, "refuser", undefined)}>
                      <Button type="submit" size="xs" variant="ghost" className="hover:text-destructive">
                        Refuser
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
          <h2 className="text-sm font-medium text-muted-foreground">Activité de l&apos;équipe (tâches terminées ce mois-ci)</h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {activite.map((a) => (
                <div key={a.utilisateurId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>{a.nomComplet}</span>
                  <Badge variant="neutral">{a.tachesTerminees} tâche(s)</Badge>
                </div>
              ))}
              {activite.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Aucune donnée pour le moment.</p> : null}
            </div>
          </Card>
        </div>
      ) : null}

      {rapport ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Aperçu</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col gap-1">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Briefcase className="size-3.5" aria-hidden />
                  Dossiers actifs
                </p>
                <p className="text-xl font-semibold">{rapport.dossiersActifs}</p>
                {Object.keys(rapport.repartitionContrats).length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {Object.entries(rapport.repartitionContrats)
                      .map(([type, n]) => `${LIBELLE_TYPE_CONTRAT[type] ?? type} : ${n}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
            <Link href="/app/rh/tickets">
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardContent className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Ticket className="size-3.5" aria-hidden />
                    Tickets ouverts
                  </p>
                  <p className="text-xl font-semibold">{ticketsOuverts}</p>
                </CardContent>
              </Card>
            </Link>
            {utilisateurConnecte.role === "ADMIN" ? (
              <Card>
                <CardContent className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wallet className="size-3.5" aria-hidden />
                    Masse salariale (base, mensuelle)
                  </p>
                  <p className="text-xl font-semibold">{new Intl.NumberFormat("fr-FR").format(rapport.masseSalariale)} FCFA</p>
                </CardContent>
              </Card>
            ) : null}
            {rapport.dernierSondage ? (
              <Link href="/app/rh/sondages">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="flex flex-col gap-1">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Smile className="size-3.5" aria-hidden />
                      Dernier sondage — {rapport.dernierSondage.titre}
                    </p>
                    <p className="text-xl font-semibold">{rapport.dernierSondage.tauxParticipation}% de participation</p>
                  </CardContent>
                </Card>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Dossiers RH</h2>
        {!rhDisponible ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
            <Lock className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Dossiers RH, congés, pointage et salaires sont disponibles à partir du forfait Business.
            </p>
          </div>
        ) : (
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {dossiers.map((d) => (
                <Link key={d.id} href={`/app/rh/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <span className="font-medium">{d.nomComplet}</span>
                  <span className="text-xs text-muted-foreground">{d.poste}</span>
                </Link>
              ))}
              {dossiers.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Aucun dossier RH pour le moment.</p> : null}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
