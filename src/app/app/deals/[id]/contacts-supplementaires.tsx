"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Phone, X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ajouterContactSupplementaireDeal, retirerContactSupplementaireDeal } from "@/lib/actions/deal";
import { useT } from "@/lib/i18n/contexte";

type ContactSecondaire = { id: string; nom: string };

export function ContactsSupplementaires({
  dealId,
  contactsSecondaires,
  contactsDisponibles,
  peutModifier,
}: {
  dealId: string;
  contactsSecondaires: ContactSecondaire[];
  contactsDisponibles: ContactSecondaire[];
  peutModifier: boolean;
}) {
  const t = useT();
  const action = ajouterContactSupplementaireDeal.bind(null, dealId);
  const [etat, formAction, enCours] = useActionState(action, null);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{t("Contacts additionnels")}</h2>
      {contactsSecondaires.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {contactsSecondaires.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/app/contacts/${c.id}`} className="flex items-center gap-1.5 hover:underline">
                <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                {c.nom}
              </Link>
              {peutModifier ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("Retirer {nom}", { nom: c.nom })}
                  onClick={() => retirerContactSupplementaireDeal(dealId, c.id)}
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("Aucun contact additionnel.")}</p>
      )}

      {peutModifier && contactsDisponibles.length > 0 ? (
        <form action={formAction} className="flex items-center gap-2">
          <Select name="contactId" defaultValue="" required className="h-8">
            <option value="" disabled>
              {t("Choisir un contact")}
            </option>
            {contactsDisponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="outline" disabled={enCours}>
            {enCours ? <Spinner /> : <UserPlus data-icon="inline-start" aria-hidden />}
            {t("Ajouter")}
          </Button>
        </form>
      ) : null}
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
    </div>
  );
}
