import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { prospect } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const LIBELLE_STATUT: Record<string, string> = {
  NOUVEAU: "Nouveau",
  QUALIFIE: "Qualifié",
  PROPOSITION: "Proposition",
  GAGNE: "Gagné",
  PERDU: "Perdu",
};

export default async function PageCRM() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const prospects = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    const base = tx.select().from(prospect);
    return visibles === "TOUT" ? base : base.where(inArray(prospect.assigneAId, visibles));
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
          <p className="text-muted-foreground">
            {prospects.length} prospect{prospects.length > 1 ? "s" : ""} visible
            {prospects.length > 1 ? "s" : ""}.
          </p>
        </div>
        {peut(utilisateurConnecte.role, "CRM", "CREER") ? (
          <Button render={<Link href="/app/crm/nouveau" />} nativeButton={false}>
            Nouveau prospect
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {prospects.map((p) => (
          <Link key={p.id} href={`/app/crm/${p.id}`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex flex-col gap-1">
                <p className="font-medium">{p.nom}</p>
                {p.societeCliente ? <p className="text-sm text-muted-foreground">{p.societeCliente}</p> : null}
                <p className="text-sm text-muted-foreground">{p.telephone}</p>
                <span className="mt-2 w-fit rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                  {LIBELLE_STATUT[p.statut]}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {prospects.length === 0 ? <p className="text-muted-foreground">Aucun prospect pour le moment.</p> : null}
      </div>
    </div>
  );
}
