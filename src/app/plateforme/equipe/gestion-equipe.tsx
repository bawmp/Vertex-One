"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ajouterMembrePlateforme, revoquerMembrePlateforme } from "@/lib/actions/plateforme";

/** Sans `retirerId` : formulaire d'ajout par email. Avec `retirerId` : bouton « Retirer » d'une ligne (avec confirmation). */
export function GestionEquipePlateforme({ retirerId }: { retirerId?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  if (retirerId) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-destructive"
          disabled={enCours}
          onClick={() => {
            if (!window.confirm("Retirer l'accès de cette personne à la console interne ?")) return;
            demarrer(async () => {
              const r = await revoquerMembrePlateforme(retirerId);
              if (r.erreur) setErreur(r.erreur);
              else router.refresh();
            });
          }}
        >
          {enCours ? <Spinner /> : <UserMinus data-icon="inline-start" aria-hidden />}
          Retirer
        </Button>
        {erreur ? <p className="text-xs text-destructive">{erreur}</p> : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setErreur(null);
        demarrer(async () => {
          const r = await ajouterMembrePlateforme(email);
          if (r.erreur) setErreur(r.erreur);
          else {
            setEmail("");
            router.refresh();
          }
        });
      }}
    >
      <div className="flex gap-2">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email du collaborateur (compte Vertex One existant)" className="max-w-sm" />
        <Button type="submit" disabled={enCours}>
          {enCours ? <Spinner /> : <UserPlus data-icon="inline-start" aria-hidden />}
          Ajouter
        </Button>
      </div>
      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
    </form>
  );
}
