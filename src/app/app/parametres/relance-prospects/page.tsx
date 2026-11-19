import { redirect } from "next/navigation";
import Link from "next/link";
import { Repeat, ShieldCheck } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { apercuSequence, lireConfiguration } from "@/lib/crm/sequence-prospects-executer";
import { MODELES_RELANCE } from "@/lib/crm/prospects";
import { MODELES_SEQUENCE, ecrireDelais } from "@/lib/crm/sequence-prospects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormulaireSequence } from "./formulaire-sequence";
import { getT } from "@/lib/i18n/langue";

export default async function PageRelanceProspects() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) redirect("/app");

  const { config, apercu } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => ({
    config: await lireConfiguration(tx, utilisateurConnecte.entrepriseId),
    apercu: await apercuSequence(tx, utilisateurConnecte.entrepriseId),
  }));
  if (!config) redirect("/app");

  const format = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "UTC" });
  const dus = apercu?.dus ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          <Repeat className="size-6" aria-hidden />
          {t("Relance automatique des prospects")}
          <Badge variant={config.active ? "success" : "neutral"}>{config.active ? t("Activée") : t("Désactivée")}</Badge>
        </h1>
        <p className="text-muted-foreground">
          {t("Des e-mails modèles partent tout seuls à vos prospects qualifiés, aux dates choisies, jusqu'à ce qu'ils répondent ou deviennent clients.")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Réglages")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FormulaireSequence actifInitial={config.active} delaisInitiaux={ecrireDelais(config.delais)} plafondInitial={config.plafond} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden />
            {t("Les garde-fous")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <p>{t("• Désactivée tant que vous ne l'activez pas : rien ne part sans votre accord.")}</p>
          <p>{t("• Passage chaque matin, du lundi au samedi, vers 8 h 15 (heure de Douala).")}</p>
          <p>{t("• La séquence s'arrête toute seule quand le prospect devient client ou n'est plus qualifié, et dès que vous cliquez sur « Il a répondu » ou « Arrêter ».")}</p>
          <p>{t("• Une relance faite à la main (e-mail, WhatsApp, appel) retarde le prochain e-mail automatique de 2 jours.")}</p>
          <p>{t("• Chaque e-mail automatique est écrit au nom de votre entreprise, la réponse arrive à la personne qui suit le prospect, et un rappel « répondez stop » figure au bas du message.")}</p>
          <p>{t("• Chaque envoi est noté dans l'historique du prospect (marqué « automatique ») et dans Emails envoyés. Un e-mail qui échoue est réessayé au passage suivant.")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{config.active ? t("Au prochain passage") : t("Ce qui partirait si vous l'activiez")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {dus.length === 0 ? (
            <p className="text-muted-foreground">{t("Aucun e-mail dû aujourd'hui.")}</p>
          ) : (
            <>
              <p>
                {dus.length > config.plafond
                  ? t("{n} e-mails sont dus ; {max} partiront au prochain passage (plafond du jour), les autres le lendemain.", { n: dus.length, max: config.plafond })
                  : dus.length > 1
                    ? t("{n} e-mails partiraient au prochain passage :", { n: dus.length })
                    : t("{n} e-mail partirait au prochain passage :", { n: dus.length })}
              </p>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {dus.slice(0, 12).map((d) => (
                  <li key={d.id}>
                    <Link href={`/app/leads/${d.id}`} className="font-medium text-foreground hover:underline">
                      {d.nom}
                    </Link>{" "}
                    — {t("étape {etape} sur {n}", { etape: d.etape, n: config.delais.length })} ({t("prévu le {date}", { date: format.format(new Date(`${d.jour}T12:00:00Z`)) })})
                  </li>
                ))}
                {dus.length > 12 ? <li>{t("… et {n} autres", { n: dus.length - 12 })}</li> : null}
              </ul>
            </>
          )}
          {(apercu?.aVenir ?? 0) > 0 ? <p className="text-xs text-muted-foreground">{t("{n} autres prospects ont un envoi prévu plus tard.", { n: apercu?.aVenir ?? 0 })}</p> : null}
          {!config.active && dus.length > 0 ? (
            <p className="rounded-md border border-amber-600/30 bg-amber-50 p-3 text-xs dark:bg-amber-500/10">
              {t("À l'activation, les prospects qualifiés depuis plusieurs jours reçoivent leur premier e-mail dès le prochain passage, puis les suivants aux écarts prévus.")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Les messages envoyés")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {config.delais.map((jours, i) => {
            const mo = MODELES_RELANCE.find((x) => x.cle === MODELES_SEQUENCE[Math.min(i, MODELES_SEQUENCE.length - 1)]) ?? MODELES_RELANCE[0];
            const reperes = { nom: "{nom}", entreprise: "{entreprise}" };
            return (
              <details key={i} className="rounded-lg border px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium">
                  {t("Étape {etape} — {libelle}", { etape: i + 1, libelle: t(mo.libelle) })} <span className="font-normal text-muted-foreground">({t("J+{jours}", { jours })})</span>
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">{t("Objet : {objet}", { objet: t(mo.objet, reperes) })}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs">{t(mo.message, reperes)}</p>
              </details>
            );
          })}
          <p className="text-xs text-muted-foreground">{t("« {nom} » devient le nom du prospect et « {entreprise} » le nom de votre entreprise, dans la langue de la personne qui suit le prospect.")}</p>
          <div>
            <Button variant="outline" size="sm" render={<Link href="/app/prospects" />} nativeButton={false}>
              {t("Voir les prospects qualifiés")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
