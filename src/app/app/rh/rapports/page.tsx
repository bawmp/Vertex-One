import { m } from "@/lib/i18n/catalogue";
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
import { NombreAnime } from "@/components/nombre-anime";
import { getT } from "@/lib/i18n/langue";

const LIBELLE_TYPE_CONTRAT: Record<string, string> = { CDI: "CDI", CDD: "CDD", STAGE: m("Stage"), PRESTATAIRE: m("Prestataire") };
const LIBELLE_STATUT_TICKET: Record<string, string> = { OUVERT: m("Ouvert"), EN_COURS: m("En cours"), RESOLU: m("Résolu"), FERME: m("Fermé") };

export default async function PageRapportsRH() {
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
    if (portee(utilisateurConnecte, "RH") !== "PROPRE") {
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
        <p className="text-muted-foreground">{t("Les Ressources Humaines sont disponibles à partir du forfait Business.")}</p>
      </div>
    );
  }

  const { personnel, equipe, entrepriseRapport } = donnees;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Ressources Humaines")}
      </Link>

      <div className="flex items-center gap-2.5">
        <ChartBar className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Rapports RH")}</h1>
      </div>

      {personnel ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("Mes données")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{t("Solde de congés")}</p>
                <p className="text-xl font-semibold">
                  <NombreAnime valeur={personnel.soldeConges} suffixe=" j." />
                </p>
              </CardContent>
            </Card>
            <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-both">
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{t("Congé payé pris ({annee})", { annee: new Date().getFullYear() })}</p>
                <p className="text-xl font-semibold">
                  <NombreAnime valeur={personnel.congesPrisAnnee} suffixe=" j." />
                </p>
              </CardContent>
            </Card>
            <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-both">
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{t("Régularisations en attente")}</p>
                <p className="text-xl font-semibold">
                  <NombreAnime valeur={personnel.regularisationsEnAttente} />
                </p>
              </CardContent>
            </Card>
            <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both">
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{t("Mes tickets ouverts")}</p>
                <p className="text-xl font-semibold">
                  <NombreAnime valeur={personnel.ticketsOuverts} />
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {equipe.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("Équipe")}</h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {equipe.map((e, index) => (
                <Link
                  key={e.dossierRHId}
                  href={`/app/rh/${e.dossierRHId}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  className="group/ligne relative flex animate-in fade-in items-center justify-between gap-3 overflow-hidden px-4 py-2.5 text-sm fill-mode-both duration-300 hover:bg-muted/50"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100"
                  />
                  <span className="font-medium transition-transform duration-150 group-hover/ligne:translate-x-1">{e.nomComplet}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground transition-transform duration-150 group-hover/ligne:translate-x-1">
                    <span>{t("{n} j. de solde", { n: e.soldeConges })}</span>
                    {e.demandesCongeEnAttente > 0 ? <span className="text-amber-600 dark:text-amber-400">{t("{n} demande(s) en attente", { n: e.demandesCongeEnAttente })}</span> : null}
                    <span>{e.presentAujourdhui ? t("Présent aujourd'hui") : t("Pas encore pointé")}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {entrepriseRapport ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("Entreprise")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{t("Dossiers actifs")}</p>
                <p className="text-xl font-semibold">
                  <NombreAnime valeur={entrepriseRapport.dossiersActifs} />
                </p>
                {entrepriseRapport.dossiersPartis > 0 ? <p className="text-xs text-muted-foreground">{t("{n} parti(s)", { n: entrepriseRapport.dossiersPartis })}</p> : null}
              </CardContent>
            </Card>
            <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-both">
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{t("Répartition des contrats")}</p>
                <div className="flex flex-wrap gap-x-3 text-sm">
                  {Object.entries(entrepriseRapport.repartitionContrats).map(([type, n]) => (
                    <span key={type}>
                      {t(LIBELLE_TYPE_CONTRAT[type] ?? type)} : {n}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-both">
              <CardContent className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{t("Masse salariale (base, mensuelle)")}</p>
                <p className="text-xl font-semibold">{new Intl.NumberFormat("fr-FR").format(entrepriseRapport.masseSalariale)} FCFA</p>
              </CardContent>
            </Card>
          </div>

          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both">
            <CardContent className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">{t("Tickets d'assistance RH")}</p>
              <div className="flex flex-wrap gap-x-3 text-sm">
                {Object.entries(entrepriseRapport.ticketsParStatut).map(([statut, n]) => (
                  <span key={statut}>
                    {t(LIBELLE_STATUT_TICKET[statut] ?? statut)} : {n}
                  </span>
                ))}
                {Object.keys(entrepriseRapport.ticketsParStatut).length === 0 ? <span className="text-muted-foreground">{t("Aucun ticket.")}</span> : null}
              </div>
            </CardContent>
          </Card>

          {entrepriseRapport.dernierSondage ? (
            <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both">
              <CardContent className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">{t("Dernier sondage fermé — {titre}", { titre: entrepriseRapport.dernierSondage.titre })}</p>
                <p className="text-sm">{t("Taux de participation : {taux}%", { taux: entrepriseRapport.dernierSondage.tauxParticipation })}</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  {entrepriseRapport.dernierSondage.resultats.map((r, i) =>
                    r.type === "NPS" ? (
                      <span key={i}>
                        {t("eNPS :")} {r.scoreENPS > 0 ? "+" : ""}
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
