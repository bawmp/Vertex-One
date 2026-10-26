import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { estProprietairePlateforme } from "@/lib/plateforme/acces";
import { listerMembresEquipe } from "@/lib/plateforme/equipe";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GestionEquipePlateforme } from "./gestion-equipe";

export const dynamic = "force-dynamic";

const dateFr = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(d);

/** Équipe de la console interne : réservée au propriétaire (liste blanche), jamais aux collaborateurs qu'il a ajoutés. */
export default async function PageEquipePlateforme() {
  if (!(await estProprietairePlateforme())) redirect("/plateforme");
  const membres = await listerMembresEquipe();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Users className="size-5" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Équipe plateforme</h1>
          <p className="text-sm text-muted-foreground">
            Les collaborateurs ajoutés ici ont accès à la console interne : ils voient les entreprises et peuvent prolonger un essai, suspendre ou réactiver (chaque action est journalisée à leur nom). Ils ne peuvent ni ajouter ni retirer personne :
            vous gardez seul le contrôle.
          </p>
        </div>
      </div>

      <GestionEquipePlateforme />

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {membres.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.email}</p>
                <p className="text-xs text-muted-foreground">
                  Ajouté le {dateFr(m.ajouteLe)} par {m.ajouteParEmail}
                  {m.revoqueLe ? ` — retiré le ${dateFr(m.revoqueLe)} par ${m.revoqueParEmail ?? "?"}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.revoqueLe ? "neutral" : "success"}>{m.revoqueLe ? "Retiré" : "Actif"}</Badge>
                {!m.revoqueLe ? <GestionEquipePlateforme retirerId={m.id} /> : null}
              </div>
            </div>
          ))}
          {membres.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun collaborateur pour le moment : vous êtes seul à accéder à la console.</p> : null}
        </div>
      </Card>
    </div>
  );
}
