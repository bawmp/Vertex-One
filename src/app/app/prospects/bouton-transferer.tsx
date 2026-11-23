"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { transfererProspectAction } from "@/lib/actions/prospect";
import { useT } from "@/lib/i18n/contexte";

export type Collaborateur = { id: string; nom: string };

/**
 * « Transférer » : confier un prospect à un collègue de l'entreprise (Administrateur et Managers seulement : la page ne l'affiche qu'à eux, et le serveur
 * revérifie le droit, la portée et le destinataire). Un message facultatif accompagne le transfert (historique + email au destinataire).
 */
export function BoutonTransferer({ leadId, assigneAId, collaborateurs }: { leadId: string; assigneAId: string; collaborateurs: Collaborateur[] }) {
  const t = useT();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [destinataire, setDestinataire] = useState("");
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const possibles = collaborateurs.filter((c) => c.id !== assigneAId);
  if (possibles.length === 0 && !fait) return null;

  function valider() {
    setErreur(null);
    demarrer(async () => {
      const r = await transfererProspectAction(leadId, destinataire, motif);
      if (r.erreur) {
        setErreur(r.erreur);
        return;
      }
      setFait(r.destinataire ?? "");
      setOuvert(false);
      router.refresh();
    });
  }

  if (fait) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="size-3.5" aria-hidden />
        {t("Prospect confié à {nom}.", { nom: fait })}
      </p>
    );
  }

  if (!ouvert) {
    return (
      <Button size="xs" variant="outline" onClick={() => setOuvert(true)}>
        <ArrowRightLeft data-icon="inline-start" aria-hidden />
        {t("Transférer")}
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:max-w-sm">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`transfert-${leadId}`}>{t("Confier ce prospect à")}</Label>
        <Select id={`transfert-${leadId}`} value={destinataire} onChange={(e) => setDestinataire(e.target.value)}>
          <option value="">{t("Choisir un collègue…")}</option>
          {possibles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`transfert-motif-${leadId}`}>{t("Message pour cette personne (facultatif)")}</Label>
        <Textarea id={`transfert-motif-${leadId}`} rows={2} maxLength={300} value={motif} onChange={(e) => setMotif(e.target.value)} />
      </div>
      {erreur ? (
        <p role="alert" className="text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={valider} disabled={enCours || !destinataire}>
          {enCours ? <Spinner /> : <ArrowRightLeft data-icon="inline-start" aria-hidden />}
          {t("Confirmer le transfert")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOuvert(false)} disabled={enCours}>
          {t("Annuler")}
        </Button>
      </div>
    </div>
  );
}
