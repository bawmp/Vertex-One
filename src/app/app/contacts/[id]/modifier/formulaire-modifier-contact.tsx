"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Briefcase, Building2, Mail, Pencil, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { CadreFormulaire, SectionFormulaire } from "@/components/formulaire/cadre-formulaire";
import { modifierContact } from "@/lib/actions/contact";
import { useT } from "@/lib/i18n/contexte";

export type ContactAModifier = { id: string; nom: string; compteId: string | null; fonction: string | null; telephone: string; email: string | null };

/** Formulaire de modification d'un contact enregistré : mêmes champs et même présentation que la création, préremplis. */
export function FormulaireModifierContact({ contact, comptes }: { contact: ContactAModifier; comptes: { id: string; nom: string }[] }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(modifierContact.bind(null, contact.id), null);

  return (
    <CadreFormulaire icone={Pencil} titre={t("Modifier le contact")} description={t("Mettez à jour les informations de ce client.")}>
      <form action={action} className="flex flex-col gap-6">
        <SectionFormulaire titre={t("Identité")}>
          <Champ label={t("Nom")} id="nom" name="nom" required minLength={2} autoComplete="off" defaultValue={contact.nom} />
          <ChampSelect label={t("Compte (société, si B2B)")} id="compteId" name="compteId" defaultValue={contact.compteId ?? ""} icone={Building2}>
            <option value="">{t("Aucun")}</option>
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </ChampSelect>
          <Champ label={t("Fonction")} id="fonction" name="fonction" icone={Briefcase} placeholder={t("ex : Directeur achats")} defaultValue={contact.fonction ?? ""} />
        </SectionFormulaire>

        <SectionFormulaire titre={t("Coordonnées")}>
          <Champ label={t("Téléphone (WhatsApp de préférence)")} id="telephone" name="telephone" type="tel" inputMode="tel" icone={Phone} required defaultValue={contact.telephone} />
          <Champ label={t("Email")} id="email" name="email" type="email" inputMode="email" icone={Mail} defaultValue={contact.email ?? ""} />
        </SectionFormulaire>

        {etat?.erreur ? (
          <p role="alert" className="animate-in rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive fade-in slide-in-from-top-1">
            {etat.erreur}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" size="lg" disabled={enCours} className="h-12 flex-1 text-base">
            {enCours ? <Spinner data-icon="inline-start" /> : null}
            {enCours ? t("Enregistrement…") : t("Enregistrer")}
          </Button>
          <Button size="lg" variant="outline" className="h-12 text-base" render={<Link href={`/app/contacts/${contact.id}`} />} nativeButton={false}>
            {t("Annuler")}
          </Button>
        </div>
      </form>
    </CadreFormulaire>
  );
}
