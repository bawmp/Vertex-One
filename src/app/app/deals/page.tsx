import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray, eq } from "drizzle-orm";
import { Briefcase } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { deal, contact, compteClient } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { Button } from "@/components/ui/button";
import { DealsVues } from "./deals-vues";
import { getT } from "@/lib/i18n/langue";

export default async function PageDeals() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const deals = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    const base = tx
      .select({
        id: deal.id,
        titre: deal.titre,
        montant: deal.montant,
        statut: deal.statut,
        contactNom: contact.nom,
        compteNom: compteClient.nom,
        assigneAId: deal.assigneAId,
      })
      .from(deal)
      .innerJoin(contact, eq(deal.contactId, contact.id))
      .leftJoin(compteClient, eq(deal.compteId, compteClient.id));
    return visibles === "TOUT" ? base : base.where(inArray(deal.assigneAId, visibles));
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Deals")}</h1>
          <p className="text-muted-foreground">
            {deals.length > 1 ? t("{n} deals visibles.", { n: deals.length }) : t("{n} deal visible.", { n: deals.length })}
          </p>
        </div>
        {peut(utilisateurConnecte, "CRM", "CREER") ? (
          <Button render={<Link href="/app/deals/nouveau" />} nativeButton={false}>
            <Briefcase data-icon="inline-start" aria-hidden />
            {t("Nouveau deal")}
          </Button>
        ) : null}
      </div>

      <DealsVues deals={deals} peutModifier={peut(utilisateurConnecte, "CRM", "MODIFIER")} />
    </div>
  );
}
