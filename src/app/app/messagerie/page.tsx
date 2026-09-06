import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { MessageSquare, Lock, Hash } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { canal, projet, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { projetsVisibles } from "@/lib/portee";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PageMessagerie() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    if (!disponible(monEntreprise, "CHAT_INTERNE")) return null;

    // Palier 3, section 7 — un canal PROJET suit la portée des Projets
    // (Palier 2) ; un canal EQUIPE/LIBRE reste visible à toute l'entreprise.
    const idsProjets = await projetsVisibles(tx, utilisateurConnecte);

    const tousLesCanaux = await tx.select().from(canal).where(eq(canal.entrepriseId, utilisateurConnecte.entrepriseId));
    const canauxVisibles = tousLesCanaux.filter((c) => {
      if (c.type !== "PROJET") return true;
      return idsProjets === "TOUT" || (c.projetId ? idsProjets.includes(c.projetId) : false);
    });

    const idsProjetsDesCanaux = [...new Set(canauxVisibles.map((c) => c.projetId).filter((id): id is string => !!id))];
    const projetsConcernes = idsProjetsDesCanaux.length > 0 ? await tx.select().from(projet).where(inArray(projet.id, idsProjetsDesCanaux)) : [];
    const projetsParId = Object.fromEntries(projetsConcernes.map((p) => [p.id, p]));

    return { canaux: canauxVisibles, projetsParId };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La Messagerie est disponible à partir du forfait Pro.</p>
      </div>
    );
  }

  const { canaux, projetsParId } = donnees;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <MessageSquare className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Messagerie</h1>
      </div>

      {!process.env.STREAM_CHAT_API_KEY ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Le prestataire de messagerie n&apos;est pas encore configuré — les canaux ci-dessous existent déjà (créés
          automatiquement à chaque nouveau projet), mais l&apos;envoi de messages nécessite l&apos;activation du
          service de chat externe.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {canaux.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 font-medium">
                <Hash className="size-4 text-muted-foreground" aria-hidden />
                {c.nom}
              </p>
              <Badge variant="neutral">{c.projetId ? projetsParId[c.projetId]?.titre ?? c.type : c.type}</Badge>
            </CardContent>
          </Card>
        ))}
        {canaux.length === 0 ? <p className="text-sm text-muted-foreground">Aucun canal pour le moment.</p> : null}
      </div>
    </div>
  );
}
