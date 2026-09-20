import { eq, ne, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { entreprise, groupe } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormulaireInfosLegales } from "./formulaire-infos-legales";
import { FormulaireGroupe } from "./formulaire-groupe";

export default async function PageInfosLegales() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return <p className="text-muted-foreground">Seul un Administrateur peut modifier ces informations.</p>;
  }

  const [monEntreprise] = await db.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

  // Groupe (2026-09-15) — lecture directe, sans avecEntreprise() : `entreprise`
  // et `groupe` n'ont pas de RLS (voir src/db/schema.ts), le filtre explicite
  // par groupeId est la seule protection nécessaire, comme pour toute autre
  // lecture de `entreprise` déjà présente sur cette page.
  let monGroupe: { id: string; nom: string } | null = null;
  let filiales: { id: string; nom: string; secteurProfil: string; statutAbonnement: string }[] = [];
  if (monEntreprise.groupeId) {
    const [g] = await db.select({ id: groupe.id, nom: groupe.nom }).from(groupe).where(eq(groupe.id, monEntreprise.groupeId));
    monGroupe = g ?? null;
    filiales = await db
      .select({ id: entreprise.id, nom: entreprise.nom, secteurProfil: entreprise.secteurProfil, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(and(eq(entreprise.groupeId, monEntreprise.groupeId), ne(entreprise.id, utilisateurConnecte.entrepriseId)));
  }

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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Groupe d&apos;entreprises</CardTitle>
          <CardDescription>Relie cette entreprise à d&apos;autres filiales du même propriétaire — vue d&apos;ensemble uniquement, aucune donnée partagée.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireGroupe groupe={monGroupe} filiales={filiales} />
        </CardContent>
      </Card>
    </div>
  );
}
