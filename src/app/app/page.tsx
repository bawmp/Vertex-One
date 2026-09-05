import { recupererUtilisateurConnecte } from "@/lib/session";

export default async function PageTableauDeBord() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Tableau de bord</h1>
      <p className="mt-2 text-muted-foreground">
        Connecté en tant que <strong>{utilisateurConnecte?.role}</strong>. Le menu à gauche reflète
        exactement ce que ce rôle a le droit de voir (voir <code>peut()</code>/<code>portee()</code>,
        src/lib/permissions.ts).
      </p>
    </div>
  );
}
