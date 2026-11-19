import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { UserPlus, UserCheck, ArrowRight } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { lead } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { Button } from "@/components/ui/button";
import { LeadsVues } from "./leads-vues";
import { getT } from "@/lib/i18n/langue";

export default async function PageLeads() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const tous = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    const base = tx.select().from(lead);
    return visibles === "TOUT" ? base : base.where(inArray(lead.assigneAId, visibles));
  });

  // Un lead qualifié pas encore client vit dans « Prospects qualifiés » (jamais dans les Contacts tant qu'il n'est pas client) : il quitte cette liste.
  const estProspect = (l: (typeof tous)[number]) => l.statut === "QUALIFIE" && !l.convertiLe;
  const leads = tous.filter((l) => !estProspect(l));
  const nbProspects = tous.filter(estProspect).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Leads")}</h1>
          <p className="text-muted-foreground">
            {leads.length > 1 ? t("{n} leads visibles.", { n: leads.length }) : t("{n} lead visible.", { n: leads.length })}
          </p>
        </div>
        {peut(utilisateurConnecte, "CRM", "CREER") ? (
          <Button render={<Link href="/app/leads/nouveau" />} nativeButton={false}>
            <UserPlus data-icon="inline-start" aria-hidden />
            {t("Nouveau lead")}
          </Button>
        ) : null}
      </div>

      {nbProspects > 0 ? (
        <Link
          href="/app/prospects"
          className="flex items-center justify-between gap-3 rounded-lg border border-emerald-600/25 bg-emerald-50 px-4 py-3 text-sm transition-colors hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15"
        >
          <span className="flex items-center gap-2">
            <UserCheck className="size-4 text-emerald-700 dark:text-emerald-300" aria-hidden />
            {nbProspects > 1
              ? t("{n} prospects qualifiés à relancer par e-mail ou WhatsApp.", { n: nbProspects })
              : t("{n} prospect qualifié à relancer par e-mail ou WhatsApp.", { n: nbProspects })}
          </span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}

      <LeadsVues leads={leads.map((l) => ({ ...l, convertiLe: Boolean(l.convertiLe) }))} />
    </div>
  );
}
