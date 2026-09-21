import { redirect } from "next/navigation";
import { CreditCard, Lock } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { recupererStatutAbonnement } from "@/lib/actions/abonnement";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonPaiementAbonnement } from "./bouton-paiement-abonnement";
import { getT } from "@/lib/i18n/langue";

const LIBELLE_STATUT: Record<string, { texte: string; variant: "success" | "danger" | "brand" }> = {
  essai: { texte: "Essai gratuit", variant: "brand" },
  actif: { texte: "Actif", variant: "success" },
  suspendu: { texte: "Suspendu", variant: "danger" },
};

const LIBELLE_STATUT_PAIEMENT: Record<string, string> = { EN_ATTENTE: "En attente", CONFIRME: "Confirmé", ECHEC: "Échoué" };

function joursRestants(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default async function PageAbonnement() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PARAMETRES", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès à cette page.")}</p>
      </div>
    );
  }

  const statut = await recupererStatutAbonnement();
  if (!statut) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-muted-foreground">{t("Impossible de récupérer le statut de l'abonnement.")}</p>
      </div>
    );
  }

  const peutPayer = peut(utilisateurConnecte, "PARAMETRES", "MODIFIER");
  const dateReference = statut.statutAbonnement === "essai" ? statut.essaiFinLe : statut.abonnementEcheanceLe;
  const libelleStatut = LIBELLE_STATUT[statut.statutAbonnement] ?? { texte: statut.statutAbonnement, variant: "brand" as const };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <CreditCard className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Abonnement")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("Vertex One — 50 000 FCFA/mois")}
            <Badge variant={libelleStatut.variant}>{libelleStatut.texte}</Badge>
          </CardTitle>
          <CardDescription>
            {statut.statutAbonnement === "essai"
              ? `Essai gratuit — ${joursRestants(dateReference)} jour(s) restant(s) avant le premier paiement.`
              : statut.statutAbonnement === "actif"
                ? `Prochaine échéance dans ${joursRestants(dateReference)} jour(s).`
                : t("Réglez votre abonnement pour réactiver immédiatement l'accès.")}
          </CardDescription>
        </CardHeader>
        {peutPayer ? (
          <CardContent>
            <BoutonPaiementAbonnement />
          </CardContent>
        ) : null}
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("Historique des paiements")}</h2>
        {statut.paiements.length > 0 ? (
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {statut.paiements.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{formaterFCFA(p.montant)}</p>
                    <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(t.locale, { dateStyle: "long" }).format(p.creeLe)}</p>
                  </div>
                  <Badge variant={p.statut === "CONFIRME" ? "success" : p.statut === "ECHEC" ? "danger" : "neutral"}>
                    {LIBELLE_STATUT_PAIEMENT[p.statut] ?? p.statut}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Aucune tentative de paiement pour le moment.")}</p>
        )}
      </div>
    </div>
  );
}
