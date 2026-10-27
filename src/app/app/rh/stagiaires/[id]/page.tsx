import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, service, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { modifierStagiaireAcademiqueAction } from "@/lib/actions/stagiaires";
import { etatStage, joursRestants, trouverStagiaireAcademique } from "@/lib/rh/stage";
import { Badge } from "@/components/ui/badge";
import { FormulaireStagiaire } from "../formulaire-stagiaire";
import { ActionsFinStage } from "./actions-fin-stage";

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dateFr = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d);
const LIBELLE_STATUT: Record<string, string> = { EN_COURS: "En cours", TERMINE: "Terminé", INTERROMPU: "Interrompu", EMBAUCHE: "Embauché(e)" };

export default async function PageFicheStagiaire({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN" && utilisateurConnecte.role !== "MANAGER") notFound();

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;
    const fiche = await trouverStagiaireAcademique(tx, utilisateurConnecte, id);
    if (!fiche) return null;
    const personnes = await tx
      .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet })
      .from(utilisateur)
      .where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), ne(utilisateur.role, "CLIENT"), ne(utilisateur.statut, "SUPPRIME")));
    const services = await tx.select({ id: service.id, nom: service.nom }).from(service);
    return { fiche, personnes, services };
  });
  if (!donnees) notFound();
  const { fiche } = donnees;
  const enCours = fiche.statut === "EN_COURS";
  const etat = etatStage(fiche.dateFin, !enCours);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh/stagiaires" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Stagiaires
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <GraduationCap className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{fiche.nom}</h1>
        <Badge variant={enCours ? "info" : fiche.statut === "EMBAUCHE" ? "success" : "neutral"}>{LIBELLE_STATUT[fiche.statut] ?? fiche.statut}</Badge>
        {enCours && etat === "ECHU" ? <Badge variant="danger">Fin dépassée : décision à prendre</Badge> : null}
        {enCours && etat === "BIENTOT_FINI" ? <Badge variant="warning">Fin dans {joursRestants(fiche.dateFin)} j</Badge> : null}
      </div>
      {fiche.decisionLe ? (
        <p className="text-sm text-muted-foreground">
          Clos le {dateFr(fiche.decisionLe)}
          {fiche.motifDecision ? ` — ${fiche.motifDecision}` : ""}
          {fiche.invitationId ? " — une invitation d'embauche a été créée (Paramètres → Équipe)." : ""}
        </p>
      ) : null}

      <FormulaireStagiaire
        action={modifierStagiaireAcademiqueAction.bind(null, fiche.id)}
        valeurs={{ ...fiche, dateDebut: iso(fiche.dateDebut), dateFin: iso(fiche.dateFin) }}
        personnes={donnees.personnes}
        services={donnees.services}
        peutIndemnite={utilisateurConnecte.role === "ADMIN"}
        verrouille={!enCours || !peut(utilisateurConnecte, "RH", "MODIFIER")}
      />

      <ActionsFinStage ficheId={fiche.id} enCours={enCours} estAdmin={utilisateurConnecte.role === "ADMIN"} aEmail={Boolean(fiche.email)} peutSupprimer={utilisateurConnecte.role === "ADMIN" && !fiche.invitationId} />
    </div>
  );
}
