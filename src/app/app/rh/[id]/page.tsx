import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc, and } from "drizzle-orm";
import { ArrowLeft, User, Download, LogOut, MessageCircleHeart, Ticket } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, dossierRH, utilisateur, demandeConge, evaluation, pointage, politiqueConge, politiqueCongePalier, revisionSalaire, documentRH, regularisationPointage } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { peutVoirSalaire as calculerPeutVoirSalaire } from "@/lib/rh/acces";
import { debutJournee } from "@/lib/rh/pointage";
import { calculerDroitAnnuelConge } from "@/lib/rh/politique-conge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonPointage } from "./bouton-pointage";
import { FormulaireDemandeConge } from "./formulaire-demande-conge";
import { ListeDemandesConge } from "./liste-demandes-conge";
import { FormulaireDossierRH } from "./formulaire-dossier-rh";
import { FormulaireEvaluation } from "./formulaire-evaluation";
import { ListeEvaluations } from "./liste-evaluations";
import { FormulairePolitiqueConge } from "./formulaire-politique-conge";
import { BoutonCrediterConge } from "./bouton-crediter-conge";
import { FormulaireRevisionSalaire } from "./formulaire-revision-salaire";
import { ListeRevisionsSalaire } from "./liste-revisions-salaire";
import { FormulaireDocumentRH } from "./formulaire-document-rh";
import { ListeDocumentsRH } from "./liste-documents-rh";
import { FormulaireRegularisation } from "./formulaire-regularisation";
import { ListeRegularisations } from "./liste-regularisations";

const LIBELLE_TYPE_CONTRAT: Record<string, string> = { CDI: "CDI", CDD: "CDD", STAGE: "Stage", PRESTATAIRE: "Prestataire" };

export default async function PageDossierRH({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "VOIR")) notFound();

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
        typeContrat: dossierRH.typeContrat,
        dateEmbauche: dossierRH.dateEmbauche,
        dateFinContrat: dossierRH.dateFinContrat,
        salaireBase: dossierRH.salaireBase,
        nombrePersonnesACharge: dossierRH.nombrePersonnesACharge,
        soldeConges: dossierRH.soldeConges,
        politiqueCongeId: dossierRH.politiqueCongeId,
        nomComplet: utilisateur.nomComplet,
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

    return { ligne, demandes, evaluations, pointageDuJour, estProprietaire, politiquesActives, politiqueAssignee, revisionsSalaire, documentsRH, regularisations };
  });

  if (!donnees) notFound();
  const { ligne, demandes, evaluations, pointageDuJour, estProprietaire, politiquesActives, politiqueAssignee, revisionsSalaire, documentsRH, regularisations } = donnees;

  const peutVoirSalaireIci = calculerPeutVoirSalaire(utilisateurConnecte, ligne.utilisateurId);
  const peutModifierDossier = utilisateurConnecte.role === "ADMIN";
  const peutTraiterConges = !estProprietaire && peut(utilisateurConnecte.role, "RH", "MODIFIER");
  const peutEvaluer = !estProprietaire && peut(utilisateurConnecte.role, "RH", "MODIFIER");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <User className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{ligne.nomComplet}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/app/rh/sondages" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <MessageCircleHeart className="size-3.5" aria-hidden />
            Sondages
          </Link>
          <Link href="/app/rh/tickets" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Ticket className="size-3.5" aria-hidden />
            Assistance
          </Link>
          <Link href={`/app/rh/${ligne.id}/depart`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="size-3.5" aria-hidden />
            Départ
          </Link>
          {peutModifierDossier ? (
            <Link href={`/app/rh/${ligne.id}/export`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <Download className="size-3.5" aria-hidden />
              Exporter (CSV)
            </Link>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Poste</p>
              <p className="font-medium">{ligne.poste}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Contrat</p>
              <p className="font-medium">
                {LIBELLE_TYPE_CONTRAT[ligne.typeContrat] ?? ligne.typeContrat} — depuis le{" "}
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(ligne.dateEmbauche)}
                {ligne.dateFinContrat ? ` (jusqu'au ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(ligne.dateFinContrat)})` : ""}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Solde de congés</p>
              <p className="font-medium">{ligne.soldeConges} jour(s)</p>
            </div>
            <div>
              <p className="text-muted-foreground">Personnes à charge</p>
              <p className="font-medium">{ligne.nombrePersonnesACharge}</p>
            </div>
            {peutVoirSalaireIci ? (
              <div>
                <p className="text-muted-foreground">Salaire de base</p>
                <p className="font-medium">
                  {ligne.salaireBase != null ? `${new Intl.NumberFormat("fr-FR").format(ligne.salaireBase)} FCFA` : "Non renseigné"}
                </p>
              </div>
            ) : null}
            <div>
              <p className="text-muted-foreground">Politique de congé</p>
              <p className="font-medium">{politiqueAssignee ? `${politiqueAssignee.nom} — droit annuel : ${politiqueAssignee.droitAnnuel} j.` : "Aucune"}</p>
            </div>
          </div>
          {peutModifierDossier ? (
            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
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
            />
          ) : null}
        </CardContent>
      </Card>

      {peutVoirSalaireIci ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Historique de salaire</h2>
            {peutModifierDossier ? <FormulaireRevisionSalaire dossierRHId={ligne.id} salaireActuel={ligne.salaireBase} /> : null}
          </div>
          <ListeRevisionsSalaire revisions={revisionsSalaire} />
        </div>
      ) : null}

      {peutVoirSalaireIci ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Fichiers</h2>
          <FormulaireDocumentRH dossierRHId={ligne.id} />
          <ListeDocumentsRH documents={documentsRH} dossierRHId={ligne.id} peutSupprimer={peutModifierDossier} />
        </div>
      ) : null}

      {estProprietaire ? (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Pointage</h2>
          <div className="flex items-center gap-2">
            <FormulaireRegularisation />
            <BoutonPointage arrive={Boolean(pointageDuJour?.heureArrivee)} parti={Boolean(pointageDuJour?.heureDepart)} />
          </div>
        </div>
      ) : null}
      {estProprietaire || peutTraiterConges ? <ListeRegularisations regularisations={regularisations} peutTraiter={peutTraiterConges} /> : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Congés</h2>
          {estProprietaire ? <FormulaireDemandeConge /> : null}
        </div>
        <ListeDemandesConge demandes={demandes} peutTraiter={peutTraiterConges} peutVoirMotifSensible={peutVoirSalaireIci} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Évaluations</h2>
          {peutEvaluer ? <FormulaireEvaluation dossierRHId={ligne.id} /> : null}
        </div>
        <ListeEvaluations evaluations={evaluations} />
      </div>
    </div>
  );
}
