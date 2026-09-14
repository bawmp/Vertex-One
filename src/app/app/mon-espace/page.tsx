import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, ne, desc } from "drizzle-orm";
import { Lock, ListChecks, FileText, BarChart3, Megaphone, MessageSquare } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, tache, document as documentTable, annonce } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { rapportEntreprise } from "@/lib/rh/rapports";
import { recupererTableauDeBordFaco } from "@/lib/facturation/tableau-de-bord";
import { recupererMaNote } from "@/lib/actions/note-personnelle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { LigneTache } from "../projets/[id]/ligne-tache";
import { BlocNotes } from "./bloc-notes";

/**
 * Espace personnel Admin (Tranche 4, 2026-09-14) — agrège des données déjà
 * réelles (tâches, documents, tableau de bord sensible, annonces épinglées),
 * plus un bloc-notes vraiment neuf mais minuscule. Mail/Calendrier/centre de
 * notifications restent explicitement hors scope (accord explicite de
 * l'utilisateur) — jamais improvisés ici en façade.
 *
 * Garde par rôle directe (comme /app/parametres) : rapportEntreprise() n'a
 * aucune vérification interne de permission (confirmé en lisant
 * src/lib/rh/rapports.ts), donc cette page doit vérifier role === "ADMIN"
 * elle-même avant de l'appeler — exactement comme le fait /app/rh/rapports.
 */
export default async function PageMonEspace() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") redirect("/app");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    const mesTaches = await tx
      .select()
      .from(tache)
      .where(and(eq(tache.assigneAId, utilisateurConnecte.utilisateurId), ne(tache.statut, "TERMINEE")))
      .orderBy(tache.echeance)
      .limit(5);

    // Sous-ensemble strict de ce qu'un Admin verrait de toute façon
    // (idsVisibles() renverrait "TOUT") — filtre direct sur ses propres
    // documents, pas un contrôle d'accès supplémentaire.
    const mesDocuments = await tx
      .select()
      .from(documentTable)
      .where(eq(documentTable.televerseParId, utilisateurConnecte.utilisateurId))
      .orderBy(desc(documentTable.creeLe))
      .limit(5);

    const annoncesEpinglees = await tx.select().from(annonce).where(eq(annonce.epinglee, true)).orderBy(desc(annonce.creeLe));

    const rhDisponible = monEntreprise ? disponible(monEntreprise, "RH") : false;
    const rapport = rhDisponible ? await rapportEntreprise(tx, utilisateurConnecte.entrepriseId) : null;
    const tableauFaco = await recupererTableauDeBordFaco(tx, utilisateurConnecte);

    return { mesTaches, mesDocuments, annoncesEpinglees, rapport, tableauFaco };
  });

  const maNote = await recupererMaNote();
  const { mesTaches, mesDocuments, annoncesEpinglees, rapport, tableauFaco } = donnees;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Lock className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Espace personnel</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4" aria-hidden /> Tableau de bord sensible
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Produits (exercice en cours)</p>
            <p className="text-lg font-semibold">{formaterFCFA(tableauFaco.financier?.totalProduits ?? 0)}</p>
          </div>
          {rapport ? (
            <div>
              <p className="text-xs text-muted-foreground">Masse salariale</p>
              <p className="text-lg font-semibold">{formaterFCFA(rapport.masseSalariale)}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Masse salariale indisponible (RH non inclus dans le forfait actuel).</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <ListChecks className="size-4" aria-hidden /> Mes tâches
              </span>
              <Link href="/app/projets/mes-taches" className="text-xs font-normal text-muted-foreground hover:text-foreground">
                Voir tout
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {mesTaches.length > 0 ? (
              mesTaches.map((t) => <LigneTache key={t.id} id={t.id} titre={t.titre} statut={t.statut} assigneNom="Vous" echeance={t.echeance} peutModifier />)
            ) : (
              <p className="text-sm text-muted-foreground">Aucune tâche en cours.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <FileText className="size-4" aria-hidden /> Mes documents
              </span>
              <Link href="/app/documents" className="text-xs font-normal text-muted-foreground hover:text-foreground">
                Voir tout
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {mesDocuments.length > 0 ? (
              mesDocuments.map((d) => (
                <div key={d.id} className="truncate text-sm">
                  {d.nom}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aucun document téléversé par vous.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {annoncesEpinglees.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="size-4" aria-hidden /> Annonces épinglées
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {annoncesEpinglees.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-sm">
                <Badge variant="brand" className="shrink-0">
                  Épinglée
                </Badge>
                <p className="whitespace-pre-line">{a.contenu}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="size-4" aria-hidden /> Messagerie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/app/messagerie" className="text-sm text-primary hover:underline">
            Ouvrir la messagerie
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes personnelles</CardTitle>
        </CardHeader>
        <CardContent>
          <BlocNotes contenuInitial={maNote} />
        </CardContent>
      </Card>
    </div>
  );
}
