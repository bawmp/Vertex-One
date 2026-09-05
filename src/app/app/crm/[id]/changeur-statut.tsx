import { Button } from "@/components/ui/button";
import { changerStatutProspect } from "@/lib/actions/prospect";

const STATUTS = [
  { valeur: "NOUVEAU", libelle: "Nouveau" },
  { valeur: "QUALIFIE", libelle: "Qualifié" },
  { valeur: "PROPOSITION", libelle: "Proposition" },
  { valeur: "GAGNE", libelle: "Gagné" },
  { valeur: "PERDU", libelle: "Perdu" },
] as const;

export function ChangeurStatut({ prospectId, statutActuel }: { prospectId: string; statutActuel: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {STATUTS.map(({ valeur, libelle }) => (
        <form key={valeur} action={changerStatutProspect.bind(null, prospectId, valeur)}>
          <Button type="submit" variant={statutActuel === valeur ? "default" : "outline"} size="sm">
            {libelle}
          </Button>
        </form>
      ))}
    </div>
  );
}
