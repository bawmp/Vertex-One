import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ShieldCheck, Smartphone, ExternalLink } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { lireEtatCompte } from "@/lib/paiement/compte-elyonpay";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BoutonDeconnecter, FormulaireCompte } from "./formulaire-compte";
import { getT } from "@/lib/i18n/langue";

export default async function PagePaiementMobileMoney() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) redirect("/app");

  const { compte, nomEntreprise } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [ent] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return { compte: await lireEtatCompte(tx, utilisateurConnecte.entrepriseId), nomEntreprise: ent?.nom ?? "" };
  });

  const formatDate = new Intl.DateTimeFormat(t.locale, { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Douala" });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          <Smartphone className="size-6" aria-hidden />
          {t("Paiement Mobile Money")}
          {compte ? <Badge variant={compte.statut === "ACTIF" ? "success" : "danger"}>{compte.statut === "ACTIF" ? t("Compte branché") : t("À reconnecter")}</Badge> : <Badge variant="neutral">{t("Non branché")}</Badge>}
        </h1>
        <p className="text-muted-foreground">
          {t("Vos clients paient leurs factures par Orange Money ou MTN MoMo, et l'argent arrive directement sur VOTRE compte ElyonPay.")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden />
            {t("Comment ça marche")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <p>{t("• L'argent va directement sur votre compte ElyonPay : Vertex One ne le reçoit jamais et ne le détient jamais.")}</p>
          <p>{t("• Les frais d'ElyonPay et les délais de reversement vers votre téléphone ou votre banque dépendent de votre contrat avec ElyonPay, pas de Vertex One.")}</p>
          <p>{t("• Votre client paie exactement le montant de sa facture, sans frais ajoutés.")}</p>
          <p>{t("• Vertex One enregistre le paiement dans votre comptabilité dès qu'ElyonPay le confirme, et prévient votre client et vous par e-mail.")}</p>
          <p>{t("• Sans compte branché, vos clients ne voient pas « Payer maintenant » : vous pointez les règlements à la main (espèces, virement, Mobile Money reçu directement).")}</p>
        </CardContent>
      </Card>

      {compte ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("Compte branché")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {compte.statut === "ERREUR" ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                {t("Le paiement en ligne est suspendu : ElyonPay a refusé la clé de ce compte (clé régénérée ou révoquée ?). Entrez la nouvelle clé ci-dessous pour le rétablir.")}
              </p>
            ) : null}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">{t("Identifiant marchand")}</dt>
              <dd className="font-medium">{compte.marchandId}</dd>
              <dt className="text-muted-foreground">{t("Nom affiché au payeur")}</dt>
              <dd className="font-medium">{compte.nomMarchand}</dd>
              <dt className="text-muted-foreground">{t("Clé d'API")}</dt>
              <dd className="font-mono">{`••••••••${compte.cleFin}`}</dd>
              {compte.verifieLe ? (
                <>
                  <dt className="text-muted-foreground">{t("Dernière vérification")}</dt>
                  <dd>{formatDate.format(compte.verifieLe)}</dd>
                </>
              ) : null}
            </dl>
            <BoutonDeconnecter />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{compte ? t("Remplacer la clé ou le compte") : t("Brancher mon compte ElyonPay")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormulaireCompte nomParDefaut={compte?.nomMarchand ?? nomEntreprise} marchandInitial={compte?.marchandId ?? null} dejaBranche={Boolean(compte)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Où trouver mes identifiants ?")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{t("1. Créez (ou ouvrez) votre compte marchand sur ElyonPay et connectez-vous à votre tableau de bord.")}</p>
          <p>{t("2. Notez votre identifiant marchand, et copiez votre clé d'API de PRODUCTION (vous pouvez la régénérer depuis le tableau de bord ; elle n'est pas la même que celle du bac à sable).")}</p>
          <p>{t("3. Collez-les ci-dessus. Faites ensuite un petit paiement de test depuis une de vos factures pour vérifier que tout est bien relié.")}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <a href="https://elyonpay.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
              {t("Site d'ElyonPay")}
              <ExternalLink className="size-3" aria-hidden />
            </a>
            <a href="https://docs.elyonpay.com/fr/documentation/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
              {t("Documentation ElyonPay")}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
          <p className="text-xs">{t("L'identifiant marchand ne peut pas être vérifié sans effectuer un paiement : s'il est faux, le premier paiement d'un client échouera avec un message d'erreur et vous pourrez le corriger ici.")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
