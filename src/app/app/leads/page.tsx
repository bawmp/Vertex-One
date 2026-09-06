import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { UserPlus } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { lead } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { Button } from "@/components/ui/button";
import { LeadsVues } from "./leads-vues";

export default async function PageLeads() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const leads = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    const base = tx.select().from(lead);
    return visibles === "TOUT" ? base : base.where(inArray(lead.assigneAId, visibles));
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">
            {leads.length} lead{leads.length > 1 ? "s" : ""} visible{leads.length > 1 ? "s" : ""}.
          </p>
        </div>
        {peut(utilisateurConnecte.role, "CRM", "CREER") ? (
          <Button render={<Link href="/app/leads/nouveau" />} nativeButton={false}>
            <UserPlus data-icon="inline-start" aria-hidden />
            Nouveau lead
          </Button>
        ) : null}
      </div>

      <LeadsVues leads={leads.map((l) => ({ ...l, convertiLe: Boolean(l.convertiLe) }))} peutModifier={peut(utilisateurConnecte.role, "CRM", "MODIFIER")} />
    </div>
  );
}
