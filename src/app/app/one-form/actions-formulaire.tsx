"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Pencil, Power, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { publierFormulaire, supprimerFormulaire } from "@/lib/actions/one-form";

/**
 * Actions rapides d'un formulaire dans la liste : modifier, désactiver/publier,
 * supprimer. Les droits sont revérifiés côté serveur par chaque action.
 */
export function ActionsFormulaire({ formulaireId, publie, peutModifier, peutSupprimer }: { formulaireId: string; publie: boolean; peutModifier: boolean; peutSupprimer: boolean }) {
  const [enCours, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1">
      {enCours ? <Spinner className="size-3.5" /> : null}
      {peutModifier ? (
        <Link href={`/app/one-form/${formulaireId}`} className={buttonVariants({ variant: "ghost", size: "xs" })}>
          <Pencil data-icon="inline-start" aria-hidden />
          Modifier
        </Link>
      ) : null}
      {peutModifier ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={enCours}
          className="text-muted-foreground"
          onClick={() => {
            if (publie && !window.confirm("Désactiver ce formulaire ? Son lien public cessera de fonctionner (vous pourrez le réactiver).")) return;
            startTransition(() => publierFormulaire(formulaireId, !publie));
          }}
        >
          <Power data-icon="inline-start" aria-hidden />
          {publie ? "Désactiver" : "Publier"}
        </Button>
      ) : null}
      {peutSupprimer ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={enCours}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (window.confirm("Supprimer définitivement ce formulaire et toutes ses réponses ?")) startTransition(() => supprimerFormulaire(formulaireId));
          }}
        >
          <Trash2 data-icon="inline-start" aria-hidden />
          Supprimer
        </Button>
      ) : null}
    </div>
  );
}
