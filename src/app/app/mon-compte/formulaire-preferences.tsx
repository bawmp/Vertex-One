"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { authClient } from "@/lib/auth-client";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useTraduction } from "@/lib/i18n/contexte";
import type { Langue, Theme } from "@/lib/session";

const THEME_VERS_NEXT_THEMES: Record<Theme, string> = { clair: "light", sombre: "dark", systeme: "system" };
const NEXT_THEMES_VERS_THEME: Record<string, Theme> = { light: "clair", dark: "sombre", system: "systeme" };

export function FormulairePreferences({ langue }: { langue: Langue }) {
  const router = useRouter();
  const t = useTraduction();
  const { theme: themeActifNextThemes, setTheme } = useTheme();

  async function changerLangue(nouvelle: Langue) {
    await authClient.updateUser({ langue: nouvelle });
    router.refresh();
  }

  async function changerTheme(nouveau: Theme) {
    setTheme(THEME_VERS_NEXT_THEMES[nouveau]);
    await authClient.updateUser({ theme: nouveau });
  }

  const themeActuel = NEXT_THEMES_VERS_THEME[themeActifNextThemes ?? "system"] ?? "systeme";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="langue">{t.monCompte.langue}</Label>
        <Select id="langue" value={langue} onChange={(e) => changerLangue(e.target.value as Langue)} className="max-w-48">
          <option value="fr">{t.monCompte.francais}</option>
          <option value="en">{t.monCompte.anglais}</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme">{t.monCompte.theme}</Label>
        <Select id="theme" value={themeActuel} onChange={(e) => changerTheme(e.target.value as Theme)} className="max-w-48">
          <option value="clair">{t.monCompte.clair}</option>
          <option value="sombre">{t.monCompte.sombre}</option>
          <option value="systeme">{t.monCompte.systeme}</option>
        </Select>
      </div>
    </div>
  );
}
