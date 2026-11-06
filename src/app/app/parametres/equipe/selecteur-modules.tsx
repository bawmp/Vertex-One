"use client";

import { LIBELLES_MODULES, modulesDeBase, modulesRestreignables } from "@/lib/modules-libelles";
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
  const socle = modulesDeBase(role);
  const tousCoches = modules.every((m) => valeurs.includes(m) || socle.includes(m));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {socle.length > 0 ? t("Fiche, tâches et chat toujours accessibles. ") : ""}
          {valeurs.length > 1 ? t("{n} modules sur {total}", { n: valeurs.length, total: modules.length }) : t("{n} module sur {total}", { n: valeurs.length, total: modules.length })}
        </p>
        <button type="button" className="shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10" onClick={() => onChange(tousCoches ? [...socle] : [...modules])}>
          {tousCoches ? t("Tout décocher") : t("Tout cocher")}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {modules.map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/50 has-checked:border-primary/40 has-checked:bg-primary/5">
            <input
              type="checkbox"
              name={name}
              value={m}
              checked={valeurs.includes(m) || socle.includes(m)}
              disabled={socle.includes(m)}
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
