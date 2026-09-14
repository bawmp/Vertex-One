import { recupererListeEntreprises } from "@/lib/plateforme/donnees";
import { ListeEntreprises } from "./liste-entreprises";

export default async function PagePlateformeEntreprises() {
  const entreprises = await recupererListeEntreprises();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entreprises</h1>
        <p className="mt-1 text-muted-foreground">{entreprises.length} entreprise(s) inscrite(s) au total.</p>
      </div>
      <ListeEntreprises entreprises={entreprises} />
    </div>
  );
}
