import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { Phone, Building2, UserPlus } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { prospect } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_PROSPECT } from "@/lib/libelles";

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
            <UserPlus data-icon="inline-start" aria-hidden />
            Nouveau prospect
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {prospects.map((p, index) => {
          const info = STATUT_PROSPECT[p.statut];
          return (
            <Link
              key={p.id}
              href={`/app/crm/${p.id}`}
              className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_6px_rgba(0,0,0,0.05),0_16px_32px_-16px_rgba(0,0,0,0.14)] hover:ring-primary/30">
                <CardContent className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{p.nom}</p>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? p.statut}</Badge>
                  </div>
                  {p.societeCliente ? (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="size-3.5 shrink-0" aria-hidden />
                      {p.societeCliente}
                    </p>
                  ) : null}
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" aria-hidden />
                    {p.telephone}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {prospects.length === 0 ? (
          <p className="col-span-full py-8 text-center text-muted-foreground">Aucun prospect pour le moment.</p>
        ) : null}
      </div>
    </div>
  );
}
