"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase, Building2, Globe2, Hammer, Layers, Mail, Scale, ShieldCheck, Store, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ChoixCartes } from "@/components/formulaire/choix-cartes";
import { ForceMotDePasse } from "@/components/formulaire/force-mot-de-passe";
import { creerEntreprise } from "@/lib/actions/entreprise";
import { useT } from "@/lib/i18n/contexte";

export default function PageInscription() {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerEntreprise, null);
  const [secteur, setSecteur] = useState("generique");

  // Un lien de campagne peut présélectionner le secteur (?secteur=immigration) : le visiteur n'a plus à le choisir, mais peut le changer.
  useEffect(() => {
    const demande = new URLSearchParams(window.location.search).get("secteur");
    if (demande && ["agence", "artisan", "cabinet", "immigration", "commerce", "generique"].includes(demande)) setSecteur(demande);
  }, []);
  // Champs contrôlés : après une erreur (ex. email déjà utilisé), React 19 vide les champs non contrôlés d'un formulaire à action —
  // la personne perdrait tout ce qu'elle a saisi. Gardés en état, ils restent à l'écran, et la barre de progression les suit.
  const [nomEntreprise, setNomEntreprise] = useState("");
  const [nomComplet, setNomComplet] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");

  /** Nombre de champs obligatoires déjà remplis (la barre de progression se remplit pendant la saisie). */
  const renseignes = [nomEntreprise.trim().length >= 2, nomComplet.trim().length >= 2, /.+@.+\..+/.test(email.trim()), motDePasse.length >= 8].filter(Boolean).length;

  return (
    <div data-carte-large className="flex flex-col gap-7 xl:gap-4">
      <div className="flex animate-in flex-col items-center gap-1.5 text-center duration-500 fade-in slide-in-from-bottom-2">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-marque-orange-100 px-3 py-1 text-xs font-semibold tracking-wide text-marque-orange-700 uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-marque-orange" />
          {t("Bienvenue")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl xl:text-2xl">{t("Créer votre entreprise sur Vertex One")}</h1>
        <p className="text-muted-foreground">{t("Le premier compte créé devient Administrateur.")}</p>
        <div className="mt-3 flex w-full items-center gap-3" aria-live="polite">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-marque-bleu-100" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={renseignes} aria-label={t("Progression du formulaire")}>
            <div className="h-full rounded-full bg-gradient-to-r from-marque-bleu to-marque-orange transition-all duration-500 ease-out" style={{ width: `${(renseignes / 4) * 100}%` }} />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{renseignes} / 4</span>
        </div>
      </div>

      <form action={action} className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-8 xl:gap-y-3">
        <fieldset className="flex animate-in flex-col gap-4 duration-500 fade-in slide-in-from-bottom-2">
          <legend className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>
            {t("Votre entreprise")}
          </legend>
          <Champ label={t("Nom de l'entreprise")} id="nomEntreprise" name="nomEntreprise" icone={Building2} required minLength={2} autoComplete="organization" value={nomEntreprise} onChange={(e) => setNomEntreprise(e.target.value)} />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("Secteur")}</span>
            <ChoixCartes
              nom="secteurProfil"
              etiquette={t("Secteur")}
              valeur={secteur}
              onChange={setSecteur}
              colonnes={3}
              disposition="tuile"
              className="xl:grid-cols-2 xl:gap-2"
              options={[
                { valeur: "agence", libelle: t("Agence"), icone: Briefcase },
                { valeur: "artisan", libelle: t("Artisan"), icone: Hammer },
                { valeur: "cabinet", libelle: t("Cabinet"), icone: Scale },
                { valeur: "immigration", libelle: t("Immigration et mobilité internationale"), icone: Globe2 },
                { valeur: "commerce", libelle: t("Commerce : vente de produits"), icone: Store },
                { valeur: "generique", libelle: t("Autre"), icone: Layers },
              ]}
            />
          </div>
        </fieldset>

        <fieldset className="flex animate-in flex-col gap-4 delay-150 duration-500 fade-in slide-in-from-bottom-2 fill-mode-both">
          <legend className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>
            {t("Votre compte administrateur")}
          </legend>
          <Champ label={t("Votre nom complet")} id="nomComplet" name="nomComplet" icone={UserRound} required minLength={2} autoComplete="name" value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} />
          <Champ label={t("Email")} id="email" name="email" type="email" icone={Mail} required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex flex-col gap-2.5">
            <Champ label={t("Mot de passe")} id="motDePasse" name="motDePasse" type="password" required minLength={8} autoComplete="new-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
            <ForceMotDePasse valeur={motDePasse} />
          </div>
        </fieldset>

        {etat?.erreur ? (
          <p role="alert" className="animate-in rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive fade-in slide-in-from-top-1 xl:col-span-2">
            {etat.erreur}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={enCours} className="group h-12 w-full text-base xl:col-span-2">
          {enCours ? <Spinner data-icon="inline-start" /> : null}
          {enCours ? t("Création en cours…") : t("Créer mon entreprise")}
          {!enCours ? <ArrowRight data-icon="inline-end" aria-hidden className="transition-transform duration-200 group-hover:translate-x-1" /> : null}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground xl:col-span-2">
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
          {t("Les données de votre entreprise restent isolées de celles des autres.")}
        </p>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t("Déjà inscrit ?")}{" "}
        <Link href="/connexion" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("Se connecter")}
        </Link>
      </p>
    </div>
  );
}
