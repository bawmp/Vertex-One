import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { ArrowLeft, Clock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreeTemps, projet, tache, dossier, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { idsVisibles, projetsVisibles } from "@/lib/portee";
import { recupererMinuteurActif } from "@/lib/projets/minuteur-actif";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MinuteurEnCours } from "../minuteur-en-cours";
import { FormulaireDemarrerMinuteur } from "./formulaire-demarrer-minuteur";
import { VueFeuilleTemps } from "./vue-feuille-temps";

export default async function PageFeuilleTemps() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    if (!disponible(monEntreprise, "PROJETS")) return null;

    // Même patron que src/app/app/achats/page.tsx : portée filtrée
    // directement sur la colonne "propriétaire" de la table elle-même
    // (utilisateurId, qui a enregistré l'entrée), jamais via un détour.
    const visibles = await idsVisibles(tx, utilisateurConnecte, "PROJETS");
    const base = tx.select().from(entreeTemps);
    const entrees =
      visibles === "TOUT"
        ? await base.orderBy(entreeTemps.date)
        : await base.where(inArray(entreeTemps.utilisateurId, visibles)).orderBy(entreeTemps.date);
    entrees.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Minuteur (échange du 2026-09-07) : démarrer un minuteur doit rester
    // possible sur n'importe quel Projet visible, pas seulement ceux qui ont
    // déjà des entrées — portée par projetsVisibles() (plus riche que
    // idsVisibles ci-dessus, voir src/lib/portee.ts), distincte du filtre
    // "propriétaire des entrées" utilisé pour la liste elle-même.
    const idsProjetsVisibles = await projetsVisibles(tx, utilisateurConnecte);
    const baseProjets = tx.select().from(projet);
    const projetsPourMinuteur = idsProjetsVisibles === "TOUT" ? await baseProjets : await baseProjets.where(inArray(projet.id, idsProjetsVisibles));

    const idsProjets = [...new Set([...entrees.map((e) => e.projetId), ...projetsPourMinuteur.map((p) => p.id)])];
    const projets = idsProjets.length > 0 ? await tx.select().from(projet).where(inArray(projet.id, idsProjets)) : [];
    const idsDossiers = [...new Set(projets.map((p) => p.dossierId))];
    const dossiers = idsDossiers.length > 0 ? await tx.select().from(dossier).where(inArray(dossier.id, idsDossiers)) : [];
    const taches = projetsPourMinuteur.length > 0 ? await tx.select().from(tache).where(inArray(tache.projetId, projetsPourMinuteur.map((p) => p.id))) : [];

    const projetsParId = Object.fromEntries(projets.map((p) => [p.id, p]));
    const dossiersParId = Object.fromEntries(dossiers.map((d) => [d.id, d]));

    const minuteurActif = await recupererMinuteurActif(tx, utilisateurConnecte);

    return { entrees, projetsParId, dossiersParId, projetsPourMinuteur, dossiers, taches, minuteurActif };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-muted-foreground">Les Projets sont disponibles à partir du forfait Pro.</p>
      </div>
    );
  }

  const { entrees, projetsParId, dossiersParId, projetsPourMinuteur, dossiers, taches, minuteurActif } = donnees;
  const totalHeures = entrees.reduce((s, e) => s + e.dureeHeures, 0);
  const nombreAFacturer = entrees.filter((e) => e.facturable && !e.factureId).length;

  const libelleProjet = (projetId: string) => {
    const p = projetsParId[projetId];
    const d = p ? dossiersParId[p.dossierId] : undefined;
    return p ? `${d?.titre ?? ""} → ${p.titre}` : "";
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/projets" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div className="flex items-center gap-2.5">
        <Clock className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Feuille de temps</h1>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        {totalHeures}h enregistrées au total{nombreAFacturer > 0 ? ` · ${nombreAFacturer} entrée${nombreAFacturer > 1 ? "s" : ""} à facturer` : ""}
      </p>

      {minuteurActif ? (
        <MinuteurEnCours
          demarreLe={minuteurActif.demarreLe.toISOString()}
          libelle={`${libelleProjet(minuteurActif.projetId)}${minuteurActif.tacheTitre ? ` — ${minuteurActif.tacheTitre}` : ""}`}
          projetId={minuteurActif.projetId}
          afficherLienProjet
        />
      ) : (
        <FormulaireDemarrerMinuteur
          projets={projetsPourMinuteur.map((p) => ({ id: p.id, libelle: `${dossiers.find((d) => d.id === p.dossierId)?.titre ?? ""} → ${p.titre}` }))}
          taches={taches.map((t) => ({ id: t.id, titre: t.titre, projetId: t.projetId }))}
        />
      )}

      <VueFeuilleTemps
        entrees={entrees.map((e) => ({ id: e.id, date: e.date.toISOString(), dureeHeures: e.dureeHeures, ligne: libelleProjet(e.projetId) }))}
      >
        {entrees.length > 0 ? (
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {entrees.map((e) => {
                const leProjet = projetsParId[e.projetId];
                const leDossier = leProjet ? dossiersParId[leProjet.dossierId] : undefined;
                return (
                  <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      {leProjet ? (
                        <Link href={`/app/projets/${leProjet.id}`} className="block truncate font-medium hover:underline">
                          {leDossier?.titre} → {leProjet.titre}
                        </Link>
                      ) : null}
                      <p className="truncate text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(e.date)}
                        {e.note ? ` — ${e.note}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{e.dureeHeures}h</span>
                      {e.factureId ? (
                        <Badge variant="success">Facturée</Badge>
                      ) : e.facturable ? (
                        <Badge variant="warning">À facturer</Badge>
                      ) : (
                        <Badge variant="neutral">Non facturable</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune heure enregistrée pour le moment.</p>
        )}
      </VueFeuilleTemps>
    </div>
  );
}
