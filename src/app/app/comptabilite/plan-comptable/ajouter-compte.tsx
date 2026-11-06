"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ajouterComptePersonnalise, type EtatCompte } from "@/lib/actions/compte-personnalise";
import { classeDuNumero } from "@/lib/comptabilite/classe-compte";
import { useT } from "@/lib/i18n/contexte";
import { m } from "@/lib/i18n/catalogue";

const NOM_CLASSE: Record<number, string> = {
  1: m("ressources durables (capital, emprunts)"),
  2: m("actif immobilisé (matériel, véhicules)"),
  3: m("stocks"),
  4: m("tiers (clients, fournisseurs, État)"),
  5: m("trésorerie (banque, caisse, Mobile Money)"),
  6: m("charges (ce que vous dépensez)"),
  7: m("produits (ce que vous vendez)"),
  8: m("autres charges et produits"),
};

/**
 * Ajout d'un compte personnalisé : un bouton ouvre un petit formulaire à deux champs. Pendant qu'on tape le numéro, la classe
 * correspondante s'affiche en clair (« 6 = charges »). Les contrôles sont refaits côté serveur.
 */
export function AjouterCompte() {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const [numero, setNumero] = useState("");
  const [etat, setEtat] = useState<EtatCompte>(null);
  const [enCours, startTransition] = useTransition();
  const classe = classeDuNumero(numero) ?? (/^[1-8]/.test(numero) ? Number(numero[0]) : null);

  function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setEtat(null);
    startTransition(async () => {
      const resultat = await ajouterComptePersonnalise(null, donnees);
      setEtat(resultat);
      if (resultat?.message) {
        setNumero("");
        setOuvert(false);
      }
    });
  }

  if (!ouvert) {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOuvert(true)}>
          <Plus data-icon="inline-start" aria-hidden />
          {t("Ajouter un compte")}
        </Button>
        {etat?.message ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-4" aria-hidden />
            {etat.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={envoyer} className="flex flex-col gap-4" aria-label={t("Ajouter un compte")}>
          <div>
            <h2 className="text-sm font-medium">{t("Ajouter un compte à votre plan comptable")}</h2>
            <p className="text-sm text-muted-foreground">{t("Le premier chiffre du numéro donne la classe : 6 pour une charge, 7 pour un produit, 5 pour la trésorerie… Ce compte n'est visible que de votre entreprise.")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
            <Champ label={t("Numéro (6 chiffres)")} name="numero" inputMode="numeric" maxLength={6} pattern="[1-8][0-9]{5}" required value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))} aide={classe ? t("Classe {classe} — {nom}", { classe, nom: t(NOM_CLASSE[classe]) }) : t("Exemple : 605100")} />
            <Champ label={t("Intitulé")} name="libelle" minLength={2} maxLength={80} required />
          </div>
          {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {t("Ajouter le compte")}
            </Button>
            <Button type="button" variant="ghost" disabled={enCours} onClick={() => { setOuvert(false); setEtat(null); }}>
              {t("Annuler")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
