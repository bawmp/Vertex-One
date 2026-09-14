import { redirect } from "next/navigation";
import { UserCog } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { traduire } from "@/lib/i18n/traduire";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { libellesMenuVisibles } from "@/app/app/layout";
import { ordonnerParPreference } from "@/lib/i18n/nav";
import { FormulairePreferences } from "./formulaire-preferences";
import { FormulaireOrdreModules } from "./formulaire-ordre-modules";

/**
 * Accessible à tout utilisateur connecté, pas seulement l'Admin
 * (contrairement à /app/parametres) — langue/thème/ordre de sidebar sont des
 * réglages personnels, jamais imposés à un collègue (Tranche 2/3,
 * 2026-09-13).
 */
export default async function PageMonCompte() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const t = traduire(utilisateurConnecte.langue);
  const libellesVisibles = libellesMenuVisibles(utilisateurConnecte.role);
  const ordreInitial = ordonnerParPreference(libellesVisibles, utilisateurConnecte.ordreModules);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <UserCog className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t.monCompte.titre}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.monCompte.preferences}</CardTitle>
        </CardHeader>
        <CardContent>
          <FormulairePreferences langue={utilisateurConnecte.langue ?? "fr"} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <FormulaireOrdreModules libellesInitiaux={ordreInitial} />
        </CardContent>
      </Card>
    </div>
  );
}
