"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { supprimerFicheCollaborateurAction } from "@/lib/actions/suppression-fiche";
import { MESSAGE_SALAIRE_DEJA_PAYE } from "@/lib/rh/suppression-fiche-libelles";
import { useT } from "@/lib/i18n/contexte";

/**
 * « Supprimer la fiche » : réservé à l'Administrateur (la page ne l'affiche qu'à lui, et le serveur revérifie tout). Irréversible : il faut taper le
 * nom de la personne pour confirmer. Quand un salaire a déjà été payé, la suppression est refusée et on explique pourquoi (et quoi faire à la place).
 */
export function BoutonSupprimerFiche({ utilisateurId, nom, salaireDejaPaye }: { utilisateurId: string; nom: string; salaireDejaPaye: boolean }) {
  const t = useT();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const nomSaisi = saisie.trim().toLowerCase() === nom.trim().toLowerCase() && saisie.trim().length > 0;

  function supprimer() {
    setErreur(null);
    demarrer(async () => {
      const r = await supprimerFicheCollaborateurAction(utilisateurId);
      if (r.erreur) {
        setErreur(r.erreur);
        return;
      }
      router.push("/app/rh");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="zone-sensible" className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <h2 id="zone-sensible" className="flex items-center gap-1.5 font-medium text-destructive">
        <TriangleAlert className="size-4" aria-hidden />
        {t("Zone sensible")}
      </h2>

      {salaireDejaPaye ? (
        <p className="text-muted-foreground">{t(MESSAGE_SALAIRE_DEJA_PAYE)}</p>
      ) : !ouvert ? (
        <div>
          <Button type="button" size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setOuvert(true)}>
            <Trash2 data-icon="inline-start" aria-hidden />
            {t("Supprimer la fiche")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p>
            {t(
              "Efface définitivement la fiche de {nom} : informations personnelles, salaire, primes, congés, présences, évaluations, documents RH, tâches du poste et missions. Son accès est retiré. Ses tâches, documents et messages passés restent attribués à son nom. Cette action est irréversible.",
              { nom }
            )}
          </p>
          <div className="flex max-w-sm flex-col gap-1">
            <Label htmlFor="confirmer-nom-fiche">{t("Pour confirmer, tapez son nom complet : {nom}", { nom })}</Label>
            <Input id="confirmer-nom-fiche" value={saisie} onChange={(e) => setSaisie(e.target.value)} autoComplete="off" />
          </div>
          {erreur ? (
            <p role="alert" className="text-destructive">
              {erreur}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={!nomSaisi || enCours} onClick={supprimer}>
              {enCours ? <Spinner /> : <Trash2 data-icon="inline-start" aria-hidden />}
              {t("Supprimer définitivement")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={enCours} onClick={() => { setOuvert(false); setSaisie(""); setErreur(null); }}>
              {t("Annuler")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
