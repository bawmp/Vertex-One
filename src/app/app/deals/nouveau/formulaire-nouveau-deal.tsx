"use client";

import { useActionState, useState } from "react";
import { Banknote, CalendarClock, Handshake, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ, ChampSelect } from "@/components/formulaire/champ";
import { CadreFormulaire, SectionFormulaire } from "@/components/formulaire/cadre-formulaire";
import { creerDeal } from "@/lib/actions/deal";
import { useT } from "@/lib/i18n/contexte";

type Contact = { id: string; nom: string; compteNom: string | null };

export function FormulaireNouveauDeal({ contacts, contactIdPreselectionne }: { contacts: Contact[]; contactIdPreselectionne?: string }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(creerDeal, null);
  const [montant, setMontant] = useState("0");

  const montantNombre = Number(montant);
  const montantLisible = Number.isFinite(montantNombre) && montantNombre > 0 ? `${new Intl.NumberFormat(t.locale).format(montantNombre)} FCFA` : undefined;

  return (
    <CadreFormulaire icone={Handshake} titre={t("Nouveau deal")}>
      <form action={action} className="flex flex-col gap-6">
        <SectionFormulaire titre={t("Opportunité")}>
          <Champ label={t("Titre")} id="titre" name="titre" required minLength={2} autoFocus autoComplete="off" />
          <ChampSelect label={t("Contact")} id="contactId" name="contactId" defaultValue={contactIdPreselectionne ?? ""} required icone={UserRound}>
            <option value="" disabled>
              {t("Choisir un contact")}
            </option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
                {c.compteNom ? ` (${c.compteNom})` : ""}
              </option>
            ))}
          </ChampSelect>
        </SectionFormulaire>

        <SectionFormulaire titre={t("Valeur et échéance")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label={t("Montant (FCFA)")} id="montant" name="montant" type="number" min={0} inputMode="numeric" icone={Banknote} value={montant} onChange={(e) => setMontant(e.target.value)} aide={montantLisible} />
            <Champ label={t("Clôture estimée")} id="dateClotureEstimee" name="dateClotureEstimee" type="date" icone={CalendarClock} />
          </div>
        </SectionFormulaire>

        {etat?.erreur ? (
          <p role="alert" className="animate-in rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive fade-in slide-in-from-top-1">
            {etat.erreur}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={enCours} className="h-12 text-base">
          {enCours ? <Spinner data-icon="inline-start" /> : null}
          {enCours ? t("Création…") : t("Créer le deal")}
        </Button>
      </form>
    </CadreFormulaire>
  );
}
