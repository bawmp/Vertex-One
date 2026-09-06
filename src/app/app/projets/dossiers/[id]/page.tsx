import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, and, inArray, desc } from "drizzle-orm";
import { Phone, Mail, Archive, ArchiveRestore, ShieldCheck } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { dossier, projet, prospect, entreprise, commentaire, utilisateur, document, contrat } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { dossiersVisibles } from "@/lib/portee";
import { libelleDossier, libelleProjet } from "@/lib/vocabulaire";
import { STATUT_DOSSIER, STATUT_PROJET } from "@/lib/libelles";
import { peutVoirDocumentSensible, estCategorieSensible } from "@/lib/documents/acces";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { archiverDossier, reactiverDossier, ajouterCommentaireDossier } from "@/lib/actions/dossier";
import { enregistrerConsentement } from "@/lib/actions/document";
import { FormulaireNouveauProjet } from "./formulaire-nouveau-projet";
import { FormulaireNouveauContrat } from "./formulaire-nouveau-contrat";
import { ListeContrats } from "./liste-contrats";
import { FormulaireCommentaire } from "../../formulaire-commentaire";
import { ListeCommentaires } from "../../liste-commentaires";
import { FormulaireDocument } from "../../formulaire-document";
import { ListeDocuments } from "../../liste-documents";

export default async function PageDetailDossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ secteurProfil: entreprise.secteurProfil, planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    if (!disponible(monEntreprise, "DOSSIERS")) return null;

    const [leDossier] = await tx.select().from(dossier).where(eq(dossier.id, id));
    if (!leDossier) return null;

    const visibles = await dossiersVisibles(tx, utilisateurConnecte);
    if (visibles !== "TOUT" && !visibles.includes(leDossier.id)) return null;

    const [[leProspect], projets, commentaires, documentsDuDossier, contrats] = await Promise.all([
      tx.select().from(prospect).where(eq(prospect.id, leDossier.prospectId)),
      tx.select().from(projet).where(eq(projet.dossierId, id)).orderBy(desc(projet.creeLe)),
      tx.select().from(commentaire).where(and(eq(commentaire.dossierId, id))).orderBy(desc(commentaire.creeLe)),
      tx.select().from(document).where(eq(document.dossierId, id)),
      tx.select().from(contrat).where(eq(contrat.dossierId, id)).orderBy(desc(contrat.creeLe)),
    ]);

    const idsAuteurs = [...new Set(commentaires.map((c) => c.auteurId))];
    const auteurs = idsAuteurs.length > 0 ? await tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(inArray(utilisateur.id, idsAuteurs)) : [];

    // Section 9 — un document sensible reste restreint au responsable du
    // Dossier et à l'Administrateur, même si l'utilisateur voit le Dossier.
    const documentsVisibles = documentsDuDossier.filter(
      (d) => !estCategorieSensible(d.categorie) || peutVoirDocumentSensible(utilisateurConnecte, d.categorie, leDossier.responsableId)
    );

    return {
      monEntreprise,
      leDossier,
      leProspect,
      projets,
      commentaires,
      documents: documentsVisibles,
      contrats,
      auteursParId: Object.fromEntries(auteurs.map((a) => [a.id, a.nomComplet])),
    };
  });

  if (!donnees) notFound();
  const { monEntreprise, leDossier, leProspect, projets, commentaires, documents, contrats, auteursParId } = donnees;

  const vocabDossier = libelleDossier(monEntreprise.secteurProfil);
  const vocabProjet = libelleProjet(monEntreprise.secteurProfil);
  const infoStatut = STATUT_DOSSIER[leDossier.statut];
  const peutModifier = peut(utilisateurConnecte.role, "DOSSIERS", "MODIFIER");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{leDossier.titre}</h1>
            <Badge variant={infoStatut?.variante ?? "neutral"}>{infoStatut?.libelle ?? leDossier.statut}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {leProspect ? (
              <>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden />
                  {leProspect.telephone}
                </span>
                {leProspect.email ? (
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5" aria-hidden />
                    {leProspect.email}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {peutModifier ? (
          leDossier.statut === "ACTIF" ? (
            <form action={archiverDossier.bind(null, leDossier.id)}>
              <Button type="submit" variant="outline" size="sm">
                <Archive data-icon="inline-start" aria-hidden />
                Archiver
              </Button>
            </form>
          ) : (
            <form action={reactiverDossier.bind(null, leDossier.id)}>
              <Button type="submit" variant="outline" size="sm">
                <ArchiveRestore data-icon="inline-start" aria-hidden />
                Réactiver
              </Button>
            </form>
          )
        ) : null}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">{vocabProjet.pluriel}</h2>
          {peut(utilisateurConnecte.role, "PROJETS", "CREER") ? (
            <FormulaireNouveauProjet dossierId={leDossier.id} vocab={vocabProjet} />
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {projets.map((p) => {
            const info = STATUT_PROJET[p.statut];
            return (
              <Link key={p.id} href={`/app/projets/${p.id}`}>
                <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_6px_rgba(0,0,0,0.05),0_16px_32px_-16px_rgba(0,0,0,0.14)]">
                  <CardContent className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{p.titre}</p>
                      <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? p.statut}</Badge>
                    </div>
                    {p.dateEcheance ? (
                      <p className="text-sm text-muted-foreground">
                        Échéance : {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(p.dateEcheance)}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          {projets.length === 0 ? (
            <p className="col-span-full text-sm text-muted-foreground">
              Aucun {vocabProjet.singulier.toLowerCase()} pour le moment dans ce {vocabDossier.singulier.toLowerCase()}.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Documents</h2>
          {leDossier.consentementDonneesLe ? (
            <Badge variant="success">
              <ShieldCheck className="size-3" aria-hidden />
              Consentement recueilli
            </Badge>
          ) : peutModifier ? (
            <form action={enregistrerConsentement.bind(null, leDossier.id)}>
              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
                Enregistrer le consentement du client
              </Button>
            </form>
          ) : null}
        </div>
        <ListeDocuments
          documents={documents}
          peutSupprimer={peut(utilisateurConnecte.role, "DOCUMENTS", "SUPPRIMER")}
          peutDemanderSignature={peut(utilisateurConnecte.role, "SIGNATURE", "CREER") && disponible(monEntreprise, "SIGNATURE_ELECTRONIQUE")}
        />
        {peut(utilisateurConnecte.role, "DOCUMENTS", "CREER") ? (
          <FormulaireDocument dossierId={leDossier.id} consentementManquant={!leDossier.consentementDonneesLe} />
        ) : null}
      </div>

      {disponible(monEntreprise, "CONTRATS") ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Contrats</h2>
            {peut(utilisateurConnecte.role, "CONTRATS", "CREER") ? <FormulaireNouveauContrat dossierId={leDossier.id} /> : null}
          </div>
          <ListeContrats contrats={contrats} peutModifier={peut(utilisateurConnecte.role, "CONTRATS", "MODIFIER")} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Historique de la relation</h2>
        <ListeCommentaires commentaires={commentaires} auteursParId={auteursParId} />
        {peutModifier ? (
          <FormulaireCommentaire action={ajouterCommentaireDossier} champCache="dossierId" idCache={leDossier.id} />
        ) : null}
      </div>
    </div>
  );
}
