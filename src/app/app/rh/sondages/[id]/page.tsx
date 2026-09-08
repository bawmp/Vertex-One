import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, and, asc, count } from "drizzle-orm";
import { ArrowLeft, MessageCircleHeart } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { sondage, sondageQuestion, sondageReponse, sondageParticipation } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ouvrirSondage, fermerSondage, supprimerSondage } from "@/lib/actions/sondage";
import { FormulaireReponseSondage } from "./formulaire-reponse-sondage";
import { ResultatsSondage } from "./resultats-sondage";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  BROUILLON: { libelle: "Brouillon", variante: "neutral" },
  OUVERT: { libelle: "Ouvert", variante: "success" },
  FERME: { libelle: "Fermé", variante: "warning" },
};

export default async function PageSondage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "VOIR")) notFound();

  const estAdmin = utilisateurConnecte.role === "ADMIN";

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leSondage] = await tx.select().from(sondage).where(eq(sondage.id, id));
    if (!leSondage) return null;
    if (leSondage.statut === "BROUILLON" && !estAdmin) return null;

    const questions = await tx.select().from(sondageQuestion).where(eq(sondageQuestion.sondageId, id)).orderBy(asc(sondageQuestion.ordre));

    const [{ total: nombreParticipants }] = await tx.select({ total: count() }).from(sondageParticipation).where(eq(sondageParticipation.sondageId, id));

    const [maParticipation] = await tx
      .select({ id: sondageParticipation.id })
      .from(sondageParticipation)
      .where(and(eq(sondageParticipation.sondageId, id), eq(sondageParticipation.utilisateurId, utilisateurConnecte.utilisateurId)));

    let questionsAvecResultats: { id: string; libelle: string; type: "NPS" | "ETOILES" | "TEXTE"; valeurs: string[] }[] = [];
    if (estAdmin) {
      const toutesLesReponses = await tx.select().from(sondageReponse).where(eq(sondageReponse.sondageId, id));
      questionsAvecResultats = questions.map((q) => ({
        id: q.id,
        libelle: q.libelle,
        type: q.type,
        valeurs: toutesLesReponses.filter((r) => r.questionId === q.id).map((r) => r.valeur),
      }));
    }

    return { leSondage, questions, nombreParticipants, questionsAvecResultats, aDejaRepondu: Boolean(maParticipation) };
  });

  if (!donnees) notFound();
  const { leSondage, questions, nombreParticipants, questionsAvecResultats, aDejaRepondu } = donnees;

  const info = LIBELLE_STATUT[leSondage.statut] ?? { libelle: leSondage.statut, variante: "neutral" as const };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh/sondages" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Sondages
      </Link>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MessageCircleHeart className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{leSondage.titre}</h1>
        </div>
        <Badge variant={info.variante}>{info.libelle}</Badge>
      </div>

      {estAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{nombreParticipants} participation(s)</p>
          {leSondage.statut === "BROUILLON" ? (
            <>
              <form action={ouvrirSondage.bind(null, leSondage.id)}>
                <Button type="submit" size="xs" variant="outline">
                  Ouvrir aux réponses
                </Button>
              </form>
              <form action={supprimerSondage.bind(null, leSondage.id)}>
                <Button type="submit" size="xs" variant="ghost" className="hover:text-destructive">
                  Supprimer
                </Button>
              </form>
            </>
          ) : null}
          {leSondage.statut === "OUVERT" ? (
            <form action={fermerSondage.bind(null, leSondage.id)}>
              <Button type="submit" size="xs" variant="outline">
                Fermer le sondage
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {estAdmin ? (
        <ResultatsSondage questions={questionsAvecResultats} />
      ) : leSondage.statut === "OUVERT" && !aDejaRepondu ? (
        <FormulaireReponseSondage sondageId={leSondage.id} questions={questions} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {aDejaRepondu ? "Merci, vous avez déjà répondu à ce sondage." : "Ce sondage n'est plus ouvert aux réponses."}
        </p>
      )}
    </div>
  );
}
