"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { definirGerantAction, definirPartageAction, joindrePartenaireAction } from "@/lib/actions/presences";

type Candidat = { id: string; nom: string; role: string };
type Partenaire = { id: string; nom: string; partageActif: boolean; joint: boolean };

/** Réglages de la fiche (Administrateur) : changer le gérant, et joindre des entreprises du groupe pour gérer tous les employés au même endroit. */
export function ReglagesFiche({ gerantId, candidats, groupe, partageActif, partenaires }: { gerantId: string | null; candidats: Candidat[]; groupe: boolean; partageActif: boolean; partenaires: Partenaire[] }) {
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
        Réglages de la fiche
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Gérant · entreprises du groupe</span>
      </summary>
      <div className="flex flex-col gap-5 border-t p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gerant" className="text-sm font-medium">
            Gérant de la fiche
          </label>
          <select id="gerant" value={gerantId ?? ""} disabled={attente} onChange={(e) => lancer(() => definirGerantAction(e.target.value || null))} className="h-9 max-w-sm rounded-lg border bg-background px-2 text-sm">
            <option value="">Aucun (l&apos;Administrateur seul)</option>
            {candidats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} — {c.role === "ADMIN" ? "Administrateur" : "Manager"}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Le gérant fait l&apos;appel chaque jour et valide la fiche. Vous pouvez en changer à tout moment : l&apos;ancien gérant perd aussitôt l&apos;accès.</p>
        </div>

        {groupe ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Entreprises du groupe</p>
            <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" checked={partageActif} disabled={attente} onChange={(e) => lancer(() => definirPartageAction(e.target.checked))} className="size-4 accent-primary" />
              Partager les présences avec le groupe
            </label>
            <p className="text-xs text-muted-foreground">Deux entreprises ne sont jointes que si les deux ont activé ce partage. Les employés d&apos;une entreprise jointe apparaissent sur cette fiche ; chaque présence reste enregistrée dans leur propre entreprise.</p>
            {partenaires.length === 0 ? <p className="text-xs text-muted-foreground">Aucune autre entreprise dans votre groupe.</p> : null}
            <ul className="flex flex-col gap-1.5">
              {partenaires.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" id={`joint-${p.id}`} checked={p.joint} disabled={attente || !partageActif || (!p.partageActif && !p.joint)} onChange={(e) => lancer(() => joindrePartenaireAction(p.id, e.target.checked))} className="size-4 accent-primary" />
                  <label htmlFor={`joint-${p.id}`}>
                    Joindre <strong>{p.nom}</strong>
                  </label>
                  {!p.partageActif ? <span className="text-xs text-amber-700">n&apos;a pas activé le partage</span> : null}
                  {p.joint && !p.partageActif ? <span className="text-xs text-amber-700">(inactive tant que le partage est coupé)</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Votre entreprise n&apos;appartient à aucun groupe : rien à joindre (Paramètres → Entreprise → Groupe d&apos;entreprises).</p>
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
