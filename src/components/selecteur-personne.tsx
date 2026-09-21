"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { useT } from "@/lib/i18n/contexte";

export type PersonneSelectionnable = { id: string; nomComplet: string };

/**
 * Remplace un `<select>` natif pour choisir une personne parmi les
 * collègues — recherche par nom, pensé pour rester utilisable dans une
 * entreprise de 100 employés (2026-09-15, voir docs/crm-roadmap-post-
 * commercialisation.md). S'utilise dans un `<form action={...}>` classique
 * exactement comme `<Select name="...">` : la valeur soumise est l'id de la
 * personne choisie (base-ui sérialise automatiquement le champ `value` d'un
 * item `{ value, label }` à la soumission du formulaire).
 */
export function SelecteurPersonne({
  id,
  name,
  personnes,
  defaultValue,
  onValueChange,
  placeholder = "Rechercher une personne…",
  required = false,
  className,
}: {
  id?: string;
  /** Omis quand le composant n'est utilisé qu'avec onValueChange (pas dans un <form>). */
  name?: string;
  personnes: PersonneSelectionnable[];
  defaultValue?: string | null;
  /** Réassignation instantanée hors formulaire (ex. changer l'agent d'un ticket) — même patron que les <Select onChange=...> qu'il remplace. */
  onValueChange?: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const t = useT();
  const items = personnes.map((p) => ({ value: p.id, label: p.nomComplet }));
  const valeurParDefaut = items.find((item) => item.value === defaultValue) ?? null;

  return (
    <Combobox
      id={id}
      name={name}
      items={items}
      defaultValue={valeurParDefaut}
      required={required}
      onValueChange={onValueChange ? (item) => item && onValueChange(item.value) : undefined}
    >
      <ComboboxInput placeholder={placeholder} className={className} />
      <ComboboxContent>
        <ComboboxList>
          {(item: { value: string; label: string }) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>{t("Aucune personne trouvée.")}</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
