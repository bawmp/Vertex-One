import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Coins, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { EtatVide } from "@/components/etat-vide";
import { listerTaux } from "@/lib/devises/taux";
import { formaterTaux, tauxEnVigueur } from "@/lib/devises/regles";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";
import { getT } from "@/lib/i18n/langue";
import { BoutonSupprimerTaux, Convertisseur, FormulaireTaux } from "./formulaires";

/**
 * Devises : les taux de change que l'entreprise enregistre pour afficher l'équivalent d'une facture dans une autre monnaie. La
 * comptabilité reste en FCFA. Lecture pour tous ceux qui voient les paramètres, écriture pour qui peut les modifier.
 */
export default async function PageDevises() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PARAMETRES", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès aux paramètres.")}</p>
      </div>
    );
  }
  const taux = await avecEntreprise(u.entrepriseId, (tx) => listerTaux(tx, u.entrepriseId));
  const aujourdhui = aujourdhuiDouala();
  const devises = [...new Set(taux.map((x) => x.devise))];
  const enVigueur = devises.map((d) => tauxEnVigueur(taux, d, aujourdhui)).filter((x): x is NonNullable<typeof x> => x !== null);
  const peutModifier = peut(u, "PARAMETRES", "MODIFIER");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/parametres" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div className="flex items-center gap-2.5">
        <Coins className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Devises et taux de change")}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{t("Enregistrez le taux d'une devise : chaque facture affiche alors son équivalent à la date d'émission. La comptabilité reste en FCFA. Pour l'euro, la parité fixe est de 655,957 FCFA.")}</p>

      {peutModifier ? <FormulaireTaux aujourdhui={aujourdhui} /> : null}

      {taux.length === 0 ? (
        <EtatVide icone={Coins} titre={t("Aucun taux enregistré.")} description={t("Ajoutez par exemple l'euro à 655,957 pour voir l'équivalent de vos factures.")} />
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {taux.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="tabular-nums">
                  <span className="font-medium">{x.devise}</span> · {formaterTaux(x.tauxMilliemes)} FCFA · {t("depuis le {date}", { date: x.dateEffet.split("-").reverse().join("/") })}
                </span>
                {peutModifier ? <BoutonSupprimerTaux id={x.id} devise={x.devise} /> : null}
              </div>
            ))}
          </div>
        </Card>
      )}

      {enVigueur.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("Convertisseur")}</h2>
          <Convertisseur taux={enVigueur.map((x) => ({ devise: x.devise, tauxMilliemes: x.tauxMilliemes }))} />
        </section>
      ) : null}
    </div>
  );
}
