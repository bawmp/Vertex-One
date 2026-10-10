"use client";

import { useActionState } from "react";
import { Building2, Mail, Phone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampZone } from "@/components/formulaire/champ";
import { CadreFormulaire, SectionFormulaire } from "@/components/formulaire/cadre-formulaire";
import { creerLead } from "@/lib/actions/lead";
import { useT } from "@/lib/i18n/contexte";

export default function PageNouveauLead() {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerLead, null);

  return (
    <CadreFormulaire icone={Sparkles} titre={t("Nouveau lead")} description={t("Assigné à vous par défaut. À qualifier puis convertir en Contact/Deal.")}>
      <form action={action} className="flex flex-col gap-6">
        <SectionFormulaire titre={t("Identité")}>
          <Champ label={t("Nom")} id="nom" name="nom" required minLength={2} autoComplete="off" />
          <Champ label={t("Société (si B2B)")} id="societeCliente" name="societeCliente" icone={Building2} />
        </SectionFormulaire>

        <SectionFormulaire titre={t("Coordonnées")}>
          <Champ label={t("Téléphone (WhatsApp de préférence)")} id="telephone" name="telephone" type="tel" inputMode="tel" icone={Phone} required />
          <Champ label={t("Email")} id="email" name="email" type="email" inputMode="email" icone={Mail} />
        </SectionFormulaire>

        <SectionFormulaire titre={t("Précisions")}>
          <ChampZone label={t("Notes")} id="notes" name="notes" rows={3} />
        </SectionFormulaire>

        {etat?.erreur ? (
          <p role="alert" className="animate-in rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive fade-in slide-in-from-top-1">
            {etat.erreur}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={enCours} className="h-12 text-base">
          {enCours ? <Spinner data-icon="inline-start" /> : null}
          {enCours ? t("Création…") : t("Créer le lead")}
        </Button>
      </form>
    </CadreFormulaire>
  );
}
