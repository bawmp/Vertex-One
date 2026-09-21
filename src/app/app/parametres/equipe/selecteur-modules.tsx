"use client";

import { LIBELLES_MODULES, modulesRestreignables } from "@/lib/modules-libelles";
import type { RoleSysteme } from "@/lib/permissions";
import { useT } from "@/lib/i18n/contexte";

/**
 * Cases à cocher des modules qu'un collaborateur peut utiliser. Contrôlé par le
 * parent. `name` fait aussi de chaque case un champ de formulaire (invitation) ;
 * la validation réelle est toujours refaite côté serveur.
 */
export function SelecteurModules({ role, valeurs, onChange, name }: { role: RoleSysteme; valeurs: string[]; onChange: (valeurs: string[]) => void; name?: string }) {
  const t = useT();
  const modules = modulesRestreignables(role);
  const tousCoches = modules.every((m) => valeurs.includes(m));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {valeurs.length > 1 ? t("{n} modules sur {total}", { n: valeurs.length, total: modules.length }) : t("{n} module sur {total}", { n: valeurs.length, total: modules.length })}
        </p>
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange(tousCoches ? [] : [...modules])}>
          {tousCoches ? t("Tout décocher") : t("Tout cocher")}
        </button>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {modules.map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm has-checked:border-primary/40 has-checked:bg-primary/5">
            <input
              type="checkbox"
              name={name}
              value={m}
              checked={valeurs.includes(m)}
              onChange={(e) => onChange(e.target.checked ? [...valeurs, m] : valeurs.filter((v) => v !== m))}
              className="size-4 accent-primary"
            />
            {LIBELLES_MODULES[m]}
          </label>
        ))}
      </div>
    </div>
  );
}
