import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Lock, ListChecks } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, posteOuvert } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponibleAddon } from "@/lib/plans";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouveauPoste } from "./formulaire-nouveau-poste";
import { BoutonDesactiverPoste } from "./bouton-desactiver-poste";

export default async function PagePostesOuverts() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les postes sont réservés à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RECRUTEMENT"))) return null;

    const postes = await tx.select().from(posteOuvert).where(eq(posteOuvert.entrepriseId, utilisateurConnecte.entrepriseId));
    return { postes };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Le module Recrutement n&apos;est pas activé.</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/recrutement" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Recrutement
      </Link>
      <div className="flex items-center gap-2.5">
        <ListChecks className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Postes ouverts</h1>
      </div>

      <FormulaireNouveauPoste />

      <div className="flex flex-col gap-3">
        {donnees.postes.map((p) => (
          <Card key={p.id} className={p.actif ? undefined : "opacity-60"}>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <p className="font-medium">{p.titre}</p>
                {p.lieu ? <Badge variant="neutral">{p.lieu}</Badge> : null}
                {!p.actif ? <Badge variant="warning">Désactivé</Badge> : null}
              </div>
              {p.actif ? <BoutonDesactiverPoste posteId={p.id} /> : null}
            </CardContent>
          </Card>
        ))}
        {donnees.postes.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucun poste pour le moment.</p> : null}
      </div>
    </div>
  );
}
