import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Building2 } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { compteClient } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getT } from "@/lib/i18n/langue";

export default async function PageComptes() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "VOIR")) redirect("/app");

  const comptes = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select().from(compteClient).where(eq(compteClient.entrepriseId, utilisateurConnecte.entrepriseId))
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Comptes")}</h1>
          <p className="text-muted-foreground">
            {comptes.length > 1 ? t("{n} comptes.", { n: comptes.length }) : t("{n} compte.", { n: comptes.length })}
          </p>
        </div>
        {peut(utilisateurConnecte, "CRM", "CREER") ? (
          <Button render={<Link href="/app/comptes/nouveau" />} nativeButton={false}>
            <Building2 data-icon="inline-start" aria-hidden />
            {t("Nouveau compte")}
          </Button>
        ) : null}
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {comptes.map((c) => (
            <Link key={c.id} href={`/app/comptes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
              <span className="font-medium">{c.nom}</span>
              {c.niu ? <span className="text-xs text-muted-foreground">{t("NIU : {niu}", { niu: c.niu })}</span> : null}
            </Link>
          ))}
          {comptes.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">{t("Aucun compte pour le moment.")}</p> : null}
        </div>
      </Card>
    </div>
  );
}
