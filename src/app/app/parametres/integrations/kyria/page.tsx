import { redirect } from "next/navigation";
import Link from "next/link";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { autoriserKyria } from "@/lib/actions/kyria";
import { FORME_ETAT, kyriaConfigure, retourAutorise } from "@/lib/kyria/connexion";

export const dynamic = "force-dynamic";

function versRetour(retour: string, statut: string): string {
  const url = new URL(retour);
  url.searchParams.set("statut", statut);
  return url.toString();
}

/** Écran d'autorisation : l'Administrateur arrive depuis son portail Kyria et décide de connecter (ou non) l'assistant à son CRM. */
export default async function PageConnecterKyria({ searchParams }: { searchParams: Promise<{ etat?: string; retour?: string; erreur?: string }> }) {
  const { etat, retour: retourBrut } = await searchParams;
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return <p className="text-muted-foreground">{t("Seul l'administrateur peut connecter Kyria.")}</p>;
  }

  const retour = retourAutorise(retourBrut ?? "");
  if (!etat || !FORME_ETAT.test(etat) || !retour) {
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Connecter Kyria WhatsApp")}</h1>
        <p className="text-muted-foreground">{t("Ce lien de connexion n'est pas valide. Recommencez depuis votre portail Kyria.")}</p>
      </div>
    );
  }
  if (!kyriaConfigure()) {
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Connecter Kyria WhatsApp")}</h1>
        <p className="text-muted-foreground">{t("La connexion avec Kyria n'est pas disponible pour le moment.")}</p>
        <Link href={versRetour(retour, "indisponible")} className="w-fit text-sm font-medium underline underline-offset-2">
          {t("Retour au portail Kyria")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Connecter Kyria WhatsApp")}</h1>
        <p className="mt-1 text-muted-foreground">{t("Kyria, votre assistant WhatsApp, demande à se connecter à votre Vertex One.")}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-5">
        <p className="text-sm font-semibold">{t("Ce que vous autorisez")}</p>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>{t("Kyria crée un prospect dans votre CRM pour chaque conversation WhatsApp, et rattrape vos conversations passées.")}</li>
          <li>{t("Rien d'autre : Kyria ne peut ni lire vos données ni créer de factures.")}</li>
          <li>{t("Une clé dédiée « Kyria WhatsApp » est créée. Vous pouvez la révoquer à tout moment dans Paramètres → Intégrations.")}</li>
        </ul>
      </div>

      <form action={autoriserKyria} className="flex flex-wrap items-center gap-4">
        <input type="hidden" name="etat" value={etat} />
        <input type="hidden" name="retour" value={retour} />
        <button type="submit" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          {t("Autoriser Kyria")}
        </button>
        <Link href={versRetour(retour, "annule")} className="text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {t("Annuler")}
        </Link>
      </form>
    </div>
  );
}
