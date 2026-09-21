import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Settings, Lock, CreditCard, ChevronRight } from "lucide-react";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { traduire } from "@/lib/i18n/traduire";
import { peut } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormulaireLogo } from "./formulaire-logo";
import { FormulaireCouleur } from "./formulaire-couleur";
import { getT } from "@/lib/i18n/langue";

export default async function PageParametres() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PARAMETRES", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès aux Paramètres.")}</p>
      </div>
    );
  }

  const [monEntreprise] = await db
    .select({
      nom: entreprise.nom,
      logoCleStockage: entreprise.logoCleStockage,
      couleurMarque: entreprise.couleurMarque,
    })
    .from(entreprise)
    .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

  const dico = traduire(utilisateurConnecte.langue);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Settings className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{dico.pages.parametres.titre}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{monEntreprise?.nom}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/app/parametres/abonnement" className="flex items-center justify-between gap-2 text-sm text-primary hover:underline">
            <span className="flex items-center gap-2">
              <CreditCard className="size-4" aria-hidden />
              {t("Gérer mon abonnement")}
            </span>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("Personnalisation")}</h2>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm font-medium">{t("Logo")}</p>
              <FormulaireLogo entrepriseId={utilisateurConnecte.entrepriseId} logoCleStockage={monEntreprise?.logoCleStockage ?? null} nomEntreprise={monEntreprise?.nom ?? ""} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t("Couleur de marque")}</p>
              <FormulaireCouleur couleurMarque={monEntreprise?.couleurMarque ?? null} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
