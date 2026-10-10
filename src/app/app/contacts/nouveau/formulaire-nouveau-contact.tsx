"use client";

import { useActionState } from "react";
import { Briefcase, Building2, Mail, Phone, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect, ChampZone } from "@/components/formulaire/champ";
import { CadreFormulaire, SectionFormulaire } from "@/components/formulaire/cadre-formulaire";
import { creerContact } from "@/lib/actions/contact";
import { useT } from "@/lib/i18n/contexte";
import { ChampPersonnaliseInput, type ChampContactDef } from "../champ-personnalise-input";

export function FormulaireNouveauContact({ comptes, champsPersonnalises = [] }: { comptes: { id: string; nom: string }[]; champsPersonnalises?: ChampContactDef[] }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerContact, null);

  return (
    <CadreFormulaire icone={UserRoundPlus} titre={t("Nouveau contact")} description={t("Pour un client déjà connu, sans passer par un lead.")}>
      <form action={action} className="flex flex-col gap-6">
        <SectionFormulaire titre={t("Identité")}>
          <Champ label={t("Nom")} id="nom" name="nom" required minLength={2} autoComplete="off" />
          <ChampSelect label={t("Compte (société, si B2B)")} id="compteId" name="compteId" defaultValue="" icone={Building2}>
            <option value="">{t("Aucun")}</option>
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </ChampSelect>
          <Champ label={t("Fonction")} id="fonction" name="fonction" icone={Briefcase} placeholder={t("ex : Directeur achats")} />
        </SectionFormulaire>

        <SectionFormulaire titre={t("Coordonnées")}>
          <Champ label={t("Téléphone (WhatsApp de préférence)")} id="telephone" name="telephone" type="tel" inputMode="tel" icone={Phone} required />
          <Champ label={t("Email")} id="email" name="email" type="email" inputMode="email" icone={Mail} />
        </SectionFormulaire>

        <SectionFormulaire titre={t("Précisions")}>
          <ChampZone label={t("Notes")} id="notes" name="notes" rows={3} />
        </SectionFormulaire>

        {champsPersonnalises.length > 0 ? (
          <SectionFormulaire titre={t("Informations complémentaires")}>
            {champsPersonnalises.map((champ) => (
              <ChampPersonnaliseInput key={champ.id} champ={champ} />
            ))}
          </SectionFormulaire>
        ) : null}

        {etat?.erreur ? (
          <p role="alert" className="animate-in rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive fade-in slide-in-from-top-1">
            {etat.erreur}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={enCours} className="h-12 text-base">
          {enCours ? <Spinner data-icon="inline-start" /> : null}
          {enCours ? t("Création…") : t("Créer le contact")}
        </Button>
      </form>
    </CadreFormulaire>
  );
}
