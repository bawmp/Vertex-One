import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, ChartBar, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, dossierRH } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut, portee } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { rapportPersonnel, rapportEquipe, rapportEntreprise } from "@/lib/rh/rapports";
import { Card, CardContent } from "@/components/ui/card";

const LIBELLE_TYPE_CONTRAT: Record<string, string> = { CDI: "CDI", CDD: "CDD", STAGE: "Stage", PRESTATAIRE: "Prestataire" };
const LIBELLE_STATUT_TICKET: Record<string, string> = { OUVERT: "Ouvert", EN_COURS: "En cours", RESOLU: "Résolu", FERME: "Fermé" };

export default async function PageRapportsRH() {
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

  const estAdmin = utilisateurConnecte.role === "ADMIN";

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    const [monDossier] = await tx.select({ id: dossierRH.id }).from(dossierRH).where(eq(dossierRH.utilisateurId, utilisateurConnecte.utilisateurId));
    const personnel = monDossier ? await rapportPersonnel(tx, monDossier.id) : null;

    let equipe: Awaited<ReturnType<typeof rapportEquipe>> = [];
    if (portee(utilisateurConnecte.role, "RH") !== "PROPRE") {
      const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
      const tousLesDossiers = await tx.select({ id: dossierRH.id, utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.entrepriseId, utilisateurConnecte.entrepriseId));
      // ids === "TOUT" (Admin) : tous les dossiers de l'entreprise. Pour un
      // Manager (portée EQUIPE), idsVisibles renvoie les utilisateurId
      // visibles — il faut les dossiers RH correspondants, pas tous ceux de
      // l'entreprise.
      const dossiersVisiblesIds = ids === "TOUT" ? tousLesDossiers.map((d) => d.id) : tousLesDossiers.filter((d) => ids.includes(d.utilisateurId)).map((d) => d.id);
      equipe = await rapportEquipe(tx, dossiersVisiblesIds);
    }

    const entrepriseRapport = estAdmin ? await rapportEntreprise(tx, utilisateurConnecte.entrepriseId) : null;

    return { personnel, equipe, entrepriseRapport };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les Ressources Humaines sont disponibles à partir du forfait Business.</p>
      </div>
    );
  }

  const { personnel, equipe, entrepriseRapport } = donnees;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Ressources Humaines
      </Link>

      <div className="flex items-center gap-2.5">
        <ChartBar className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Rapports RH</h1>
      </div>

      {personnel ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Mes données</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Solde de congés</p>
                <p className="text-xl font-semibold">{personnel.soldeConges} j.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Congé payé pris ({new Date().getFullYear()})</p>
                <p className="text-xl font-semibold">{personnel.congesPrisAnnee} j.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Régularisations en attente</p>
                <p className="text-xl font-semibold">{personnel.regularisationsEnAttente}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Mes tickets ouverts</p>
                <p className="text-xl font-semibold">{personnel.ticketsOuverts}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {equipe.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Équipe</h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {equipe.map((e) => (
                <Link key={e.dossierRHId} href={`/app/rh/${e.dossierRHId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <span className="font-medium">{e.nomComplet}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{e.soldeConges} j. de solde</span>
                    {e.demandesCongeEnAttente > 0 ? <span className="text-amber-600 dark:text-amber-400">{e.demandesCongeEnAttente} demande(s) en attente</span> : null}
                    <span>{e.presentAujourdhui ? "Présent aujourd'hui" : "Pas encore pointé"}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {entrepriseRapport ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Entreprise</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Dossiers actifs</p>
                <p className="text-xl font-semibold">{entrepriseRapport.dossiersActifs}</p>
                {entrepriseRapport.dossiersPartis > 0 ? <p className="text-xs text-muted-foreground">{entrepriseRapport.dossiersPartis} parti(s)</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Répartition des contrats</p>
                <div className="flex flex-wrap gap-x-3 text-sm">
                  {Object.entries(entrepriseRapport.repartitionContrats).map(([type, n]) => (
                    <span key={type}>
                      {LIBELLE_TYPE_CONTRAT[type] ?? type} : {n}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Masse salariale (base, mensuelle)</p>
                <p className="text-xl font-semibold">{new Intl.NumberFormat("fr-FR").format(entrepriseRapport.masseSalariale)} FCFA</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Tickets d&apos;assistance RH</p>
              <div className="flex flex-wrap gap-x-3 text-sm">
                {Object.entries(entrepriseRapport.ticketsParStatut).map(([statut, n]) => (
                  <span key={statut}>
                    {LIBELLE_STATUT_TICKET[statut] ?? statut} : {n}
                  </span>
                ))}
                {Object.keys(entrepriseRapport.ticketsParStatut).length === 0 ? <span className="text-muted-foreground">Aucun ticket.</span> : null}
              </div>
            </CardContent>
          </Card>

          {entrepriseRapport.dernierSondage ? (
            <Card>
              <CardContent className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">Dernier sondage fermé — {entrepriseRapport.dernierSondage.titre}</p>
                <p className="text-sm">Taux de participation : {entrepriseRapport.dernierSondage.tauxParticipation}%</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  {entrepriseRapport.dernierSondage.resultats.map((r, i) =>
                    r.type === "NPS" ? (
                      <span key={i}>
                        eNPS : {r.scoreENPS > 0 ? "+" : ""}
                        {r.scoreENPS}
                      </span>
                    ) : r.type === "ETOILES" ? (
                      <span key={i}>{r.moyenne} / 5</span>
                    ) : null
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
