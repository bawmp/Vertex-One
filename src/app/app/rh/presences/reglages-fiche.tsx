"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { definirGerantAction, definirPartageAction, joindrePartenaireAction } from "@/lib/actions/presences";
import { useT } from "@/lib/i18n/contexte";

type Candidat = { id: string; nom: string; role: string };
type Partenaire = { id: string; nom: string; partageActif: boolean; joint: boolean };

/** Réglages de la fiche (Administrateur) : changer le gérant, et joindre des entreprises du groupe pour gérer tous les employés au même endroit. */
export function ReglagesFiche({ gerantId, candidats, groupe, partageActif, partenaires }: { gerantId: string | null; candidats: Candidat[]; groupe: boolean; partageActif: boolean; partenaires: Partenaire[] }) {
  const t = useT();
  const router = useRouter();
  const [attente, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function lancer(f: () => Promise<{ erreur?: string }>) {
    setErreur(null);
    demarrer(async () => {
      const r = await f();
      if (r.erreur) setErreur(r.erreur);
      else router.refresh();
    });
  }

  return (
    <details className="group rounded-2xl border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
        <Settings2 className="size-4" aria-hidden />
        {t("Réglages de la fiche")}
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">{t("Gérant · entreprises du groupe")}</span>
      </summary>
      <div className="flex flex-col gap-5 border-t p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gerant" className="text-sm font-medium">
            {t("Gérant de la fiche")}
          </label>
          <select id="gerant" value={gerantId ?? ""} disabled={attente} onChange={(e) => lancer(() => definirGerantAction(e.target.value || null))} className="h-9 max-w-sm rounded-lg border bg-background px-2 text-sm">
            <option value="">{t("Aucun (l'Administrateur seul)")}</option>
            {candidats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} — {c.role === "ADMIN" ? t("Administrateur") : t("Manager")}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t("Le gérant fait l'appel chaque jour et valide la fiche. Vous pouvez en changer à tout moment : l'ancien gérant perd aussitôt l'accès.")}</p>
        </div>

        {groupe ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("Entreprises du groupe")}</p>
            <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" checked={partageActif} disabled={attente} onChange={(e) => lancer(() => definirPartageAction(e.target.checked))} className="size-4 accent-primary" />
              {t("Partager les présences avec le groupe")}
            </label>
            <p className="text-xs text-muted-foreground">{t("Deux entreprises ne sont jointes que si les deux ont activé ce partage. Les employés d'une entreprise jointe apparaissent sur cette fiche ; chaque présence reste enregistrée dans leur propre entreprise.")}</p>
            {partenaires.length === 0 ? <p className="text-xs text-muted-foreground">{t("Aucune autre entreprise dans votre groupe.")}</p> : null}
            <ul className="flex flex-col gap-1.5">
              {partenaires.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" id={`joint-${p.id}`} checked={p.joint} disabled={attente || !partageActif || (!p.partageActif && !p.joint)} onChange={(e) => lancer(() => joindrePartenaireAction(p.id, e.target.checked))} className="size-4 accent-primary" />
                  <label htmlFor={`joint-${p.id}`}>
                    {t("Joindre")} <strong>{p.nom}</strong>
                  </label>
                  {!p.partageActif ? <span className="text-xs text-amber-700">{t("n'a pas activé le partage")}</span> : null}
                  {p.joint && !p.partageActif ? <span className="text-xs text-amber-700">{t("(inactive tant que le partage est coupé)")}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("Votre entreprise n'appartient à aucun groupe : rien à joindre (Paramètres → Entreprise → Groupe d'entreprises).")}</p>
        )}
        {erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
      </div>
    </details>
  );
}
