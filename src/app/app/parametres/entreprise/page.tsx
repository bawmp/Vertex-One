import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormulaireInfosLegales } from "./formulaire-infos-legales";

export default async function PageInfosLegales() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")) {
    return <p className="text-muted-foreground">Seul un Administrateur peut modifier ces informations.</p>;
  }

  const [monEntreprise] = await db.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">Informations légales</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Le NIU est obligatoire avant d&apos;émettre le moindre devis — c&apos;est la mention la plus
        surveillée par la DGI.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Identification de l&apos;entreprise</CardTitle>
          <CardDescription>Utilisée sur tous les devis et factures émis.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireInfosLegales entreprise={monEntreprise} />
        </CardContent>
      </Card>
    </div>
  );
}
