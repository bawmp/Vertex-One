import { recupererUtilisateurConnecte } from "@/lib/session";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PageTableauDeBord() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-muted-foreground">
          Bienvenue — vous êtes connecté en tant que{" "}
          <span className="font-medium text-foreground">{utilisateurConnecte?.role}</span>.
        </p>
      </div>

      <Card className="max-w-xl border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Le socle est prêt</CardTitle>
          <CardDescription>
            Le menu à gauche reflète exactement ce que votre rôle a le droit de voir — les widgets des
            paliers suivants (CRM, Facturation, Projets...) viendront s&apos;ajouter ici au fil de leur
            construction.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
