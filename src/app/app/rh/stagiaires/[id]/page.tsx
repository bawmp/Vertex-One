import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { ROLES_NON_COLLEGUES } from "@/lib/equipe/collegues";
import { ArrowLeft, CalendarDays, Cake, GraduationCap, Phone, School, UserRound } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, service, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { modifierStagiaireAcademiqueAction } from "@/lib/actions/stagiaires";
import { etatStage, joursRestants, trouverStagiaireAcademique } from "@/lib/rh/stage";
import { Badge } from "@/components/ui/badge";
import { CarteFiche, FicheHero, RubanHero } from "@/components/fiche/fiche-ui";
import { libelleDelai, prochainAnniversaire } from "@/lib/rh/anniversaires-regles";
import { FormulaireStagiaire } from "../formulaire-stagiaire";
import { ActionsFinStage } from "./actions-fin-stage";
import { PhotoStagiaire } from "./photo-stagiaire";
import { adressePhoto } from "@/lib/rh/photo-affichage";

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
      .where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), notInArray(utilisateur.role, [...ROLES_NON_COLLEGUES]), ne(utilisateur.statut, "SUPPRIME")));
    const services = await tx.select({ id: service.id, nom: service.nom }).from(service);
    return { fiche, personnes, services };
  });
  if (!donnees) notFound();
  const { fiche } = donnees;
  const enCours = fiche.statut === "EN_COURS";
  const etat = etatStage(fiche.dateFin, !enCours);
  const aujourdhuiJour = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());
  const anniversaire = fiche.dateNaissance ? prochainAnniversaire(fiche.dateNaissance, aujourdhuiJour) : null;
  const maitre = donnees.personnes.find((p) => p.id === fiche.maitreStageId)?.nomComplet ?? null;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/rh/stagiaires" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Stagiaires
      </Link>

      <FicheHero
        avatar={<PhotoStagiaire stagiaireId={fiche.id} nom={fiche.nom} adresse={adressePhoto("stagiaire", fiche.id, fiche.photoCleStockage)} version={fiche.photoCleStockage ?? ""} modifiable={enCours && peut(utilisateurConnecte, "RH", "MODIFIER")} />}
        nom={fiche.nom}
        sousTitre={`${fiche.etablissement}${fiche.filiere ? ` · ${fiche.filiere}` : ""}${fiche.niveau ? ` · ${fiche.niveau}` : ""}`}
        badges={
          <>
            <Badge variant="brand">Stagiaire académique</Badge>
            <Badge variant={enCours ? "info" : fiche.statut === "EMBAUCHE" ? "success" : "neutral"}>{LIBELLE_STATUT[fiche.statut] ?? fiche.statut}</Badge>
            {enCours && etat === "ECHU" ? <Badge variant="danger">Fin dépassée : décision à prendre</Badge> : null}
            {enCours && etat === "BIENTOT_FINI" ? <Badge variant="warning">Fin dans {joursRestants(fiche.dateFin)} j</Badge> : null}
          </>
        }
        ruban={
          anniversaire && anniversaire.jours <= 7 ? <RubanHero icone={Cake}>{anniversaire.jours === 0 ? "Joyeux anniversaire !" : `Anniversaire ${libelleDelai(anniversaire.jours).toLowerCase()}`}</RubanHero> : null
        }
        puces={[
          { icone: CalendarDays, texte: `Du ${dateFr(fiche.dateDebut)} au ${dateFr(fiche.dateFin)}` },
          { icone: School, texte: fiche.etablissement },
          ...(maitre ? [{ icone: UserRound, texte: `Maître de stage : ${maitre}` }] : []),
          ...(fiche.telephone ? [{ icone: Phone, texte: fiche.telephone }] : []),
        ]}
      />

      {fiche.decisionLe ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          Clos le {dateFr(fiche.decisionLe)}
          {fiche.motifDecision ? ` — ${fiche.motifDecision}` : ""}
          {fiche.invitationId ? " — une invitation d'embauche a été créée (Paramètres → Équipe)." : ""}
        </p>
      ) : null}

      <CarteFiche icone={GraduationCap} titre="Fiche du stagiaire" aide="École, convention, stage et évaluation">
      <FormulaireStagiaire
        action={modifierStagiaireAcademiqueAction.bind(null, fiche.id)}
        valeurs={{ ...fiche, dateDebut: iso(fiche.dateDebut), dateFin: iso(fiche.dateFin) }}
        personnes={donnees.personnes}
        services={donnees.services}
        peutIndemnite={utilisateurConnecte.role === "ADMIN"}
        verrouille={!enCours || !peut(utilisateurConnecte, "RH", "MODIFIER")}
      />
      </CarteFiche>

      <ActionsFinStage ficheId={fiche.id} enCours={enCours} estAdmin={utilisateurConnecte.role === "ADMIN"} aEmail={Boolean(fiche.email)} peutSupprimer={utilisateurConnecte.role === "ADMIN" && !fiche.invitationId} />
    </div>
  );
}
