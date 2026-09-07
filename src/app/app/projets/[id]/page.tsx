import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc, asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { projet, dossier, entreprise, tache, entreeTemps, commentaire, utilisateur, document } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { projetsVisibles } from "@/lib/portee";
import { recupererMinuteurActif } from "@/lib/projets/minuteur-actif";
import { libelleProjet } from "@/lib/vocabulaire";
import { STATUT_PROJET } from "@/lib/libelles";
import { peutVoirDocumentSensible, estCategorieSensible } from "@/lib/documents/acces";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangeurStatutProjet } from "./changeur-statut-projet";
import { LigneTache } from "./ligne-tache";
import { FormulaireNouvelleTache } from "./formulaire-nouvelle-tache";
import { LigneEntreeTemps } from "./ligne-entree-temps";
import { FormulaireEntreeTemps } from "./formulaire-entree-temps";
import { BoutonGenererFactureHeures } from "./bouton-generer-facture-heures";
import { BoutonDemarrerMinuteur } from "./bouton-demarrer-minuteur";
import { MinuteurEnCours } from "../minuteur-en-cours";
import { FormulaireCommentaire } from "../formulaire-commentaire";
import { ListeCommentaires } from "../liste-commentaires";
import { FormulaireDocument } from "../formulaire-document";
import { ListeDocuments } from "../liste-documents";
import { ajouterCommentaireProjet } from "@/lib/actions/projet";

export default async function PageDetailProjet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ secteurProfil: entreprise.secteurProfil, planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    if (!disponible(monEntreprise, "PROJETS")) return null;

    const [leProjet] = await tx.select().from(projet).where(eq(projet.id, id));
    if (!leProjet) return null;

    const visibles = await projetsVisibles(tx, utilisateurConnecte);
    if (visibles !== "TOUT" && !visibles.includes(leProjet.id)) return null;

    const [[leDossier], taches, entreesTemps, commentaires, tousLesUtilisateurs, documentsDuProjet, minuteurActif] = await Promise.all([
      tx.select().from(dossier).where(eq(dossier.id, leProjet.dossierId)),
      tx.select().from(tache).where(eq(tache.projetId, id)).orderBy(asc(tache.ordre), asc(tache.creeLe)),
      tx.select().from(entreeTemps).where(eq(entreeTemps.projetId, id)).orderBy(desc(entreeTemps.date)),
      tx.select().from(commentaire).where(eq(commentaire.projetId, id)).orderBy(desc(commentaire.creeLe)),
      tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)),
      tx.select().from(document).where(eq(document.projetId, id)),
      recupererMinuteurActif(tx, utilisateurConnecte),
    ]);

    const idsAuteurs = [...new Set(commentaires.map((c) => c.auteurId))];
    const utilisateursParId = Object.fromEntries(tousLesUtilisateurs.map((u) => [u.id, u.nomComplet]));

    const responsableDossierId = leDossier?.responsableId ?? null;
    const documentsVisibles = documentsDuProjet.filter(
      (d) => !estCategorieSensible(d.categorie) || peutVoirDocumentSensible(utilisateurConnecte, d.categorie, responsableDossierId)
    );

    return {
      monEntreprise,
      leProjet,
      leDossier,
      taches,
      entreesTemps,
      commentaires,
      documents: documentsVisibles,
      auteursParId: Object.fromEntries(idsAuteurs.map((idAuteur) => [idAuteur, utilisateursParId[idAuteur]])),
      utilisateursParId,
      collegues: tousLesUtilisateurs,
      minuteurActif,
    };
  });

  if (!donnees) notFound();
  const { monEntreprise, leProjet, leDossier, taches, entreesTemps, commentaires, documents, auteursParId, utilisateursParId, collegues, minuteurActif } = donnees;

  const vocab = libelleProjet(monEntreprise.secteurProfil);
  const info = STATUT_PROJET[leProjet.statut];
  const peutModifier = peut(utilisateurConnecte.role, "PROJETS", "MODIFIER");
  const peutFacturer = peut(utilisateurConnecte.role, "FACTURATION", "CREER");
  const aDesHeuresAFacturer = entreesTemps.some((e) => e.facturable && !e.factureId);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {leDossier ? (
        <Link
          href={`/app/projets/dossiers/${leDossier.id}`}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {leDossier.titre}
        </Link>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{leProjet.titre}</h1>
            <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? leProjet.statut}</Badge>
          </div>
          {leProjet.description ? <p className="mt-1 text-muted-foreground">{leProjet.description}</p> : null}
          {leProjet.dateEcheance ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Échéance : {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(leProjet.dateEcheance)}
            </p>
          ) : null}
        </div>
      </div>

      {peutModifier ? <ChangeurStatutProjet projetId={leProjet.id} statutActuel={leProjet.statut} /> : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Tâches</h2>
          {peutModifier ? (
            <FormulaireNouvelleTache projetId={leProjet.id} collegues={collegues} utilisateurId={utilisateurConnecte.utilisateurId} />
          ) : null}
        </div>

        {taches.length > 0 ? (
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {taches.map((t) => (
                <LigneTache
                  key={t.id}
                  id={t.id}
                  titre={t.titre}
                  statut={t.statut}
                  assigneNom={utilisateursParId[t.assigneAId] ?? "—"}
                  echeance={t.echeance}
                  peutModifier={peutModifier}
                />
              ))}
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune tâche pour le moment dans ce {vocab.singulier.toLowerCase()}.</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Feuille de temps</h2>
          <div className="flex items-center gap-2">
            {peutFacturer && aDesHeuresAFacturer ? <BoutonGenererFactureHeures projetId={leProjet.id} /> : null}
            {peutModifier ? (
              <FormulaireEntreeTemps
                projetId={leProjet.id}
                taches={taches.map((t) => ({ id: t.id, titre: t.titre }))}
                tauxHoraireParDefaut={leProjet.tauxHoraireParDefaut}
              />
            ) : null}
            {peutModifier && !minuteurActif ? (
              <BoutonDemarrerMinuteur projetId={leProjet.id} taches={taches.map((t) => ({ id: t.id, titre: t.titre }))} />
            ) : null}
          </div>
        </div>

        {minuteurActif ? (
          minuteurActif.projetId === leProjet.id ? (
            <MinuteurEnCours demarreLe={minuteurActif.demarreLe.toISOString()} libelle={minuteurActif.tacheTitre ?? "Minuteur en cours"} projetId={leProjet.id} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Un minuteur est en cours sur{" "}
              <Link href={`/app/projets/${minuteurActif.projetId}`} className="underline">
                {minuteurActif.projetTitre}
              </Link>
              .
            </p>
          )
        ) : null}

        {entreesTemps.length > 0 ? (
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {entreesTemps.map((e) => (
                <LigneEntreeTemps
                  key={e.id}
                  id={e.id}
                  date={e.date}
                  dureeHeures={e.dureeHeures}
                  tauxHoraire={e.tauxHoraire}
                  facturable={e.facturable}
                  facturee={e.factureId !== null}
                  note={e.note}
                  tacheTitre={e.tacheId ? (taches.find((t) => t.id === e.tacheId)?.titre ?? null) : null}
                  peutModifier={peutModifier}
                />
              ))}
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune heure enregistrée pour le moment sur ce {vocab.singulier.toLowerCase()}.</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Documents</h2>
        <ListeDocuments
          documents={documents}
          peutSupprimer={peut(utilisateurConnecte.role, "DOCUMENTS", "SUPPRIMER")}
          peutDemanderSignature={peut(utilisateurConnecte.role, "SIGNATURE", "CREER") && disponible(monEntreprise, "SIGNATURE_ELECTRONIQUE")}
        />
        {peut(utilisateurConnecte.role, "DOCUMENTS", "CREER") ? (
          <FormulaireDocument projetId={leProjet.id} consentementManquant={!leDossier?.consentementDonneesLe} />
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Commentaires</h2>
        <ListeCommentaires commentaires={commentaires} auteursParId={auteursParId} />
        {peutModifier ? (
          <FormulaireCommentaire action={ajouterCommentaireProjet} champCache="projetId" idCache={leProjet.id} />
        ) : null}
      </div>
    </div>
  );
}
