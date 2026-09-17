"use client";

import { useActionState, useState, useTransition } from "react";
import { Dices, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { modifierSecret, supprimerSecret, revelerSecret } from "@/lib/actions/one-vault";
import { genererMotDePasse } from "../generer-mot-de-passe";

type Secret = { id: string; titre: string; identifiant: string | null; url: string | null; partage: boolean };

export function FormulaireSecret({ secret, peutModifier, peutSupprimer }: { secret: Secret; peutModifier: boolean; peutSupprimer: boolean }) {
  const [etat, action, enCours] = useActionState(modifierSecret, null);
  const [revele, setRevele] = useState(false);
  const [motDePasse, setMotDePasse] = useState("");
  const [notes, setNotes] = useState("");
  const [erreurRevelation, setErreurRevelation] = useState<string | null>(null);
  const [revelationEnCours, demarrerRevelation] = useTransition();
  const [suppressionEnCours, demarrerSuppression] = useTransition();

  function reveler() {
    setErreurRevelation(null);
    demarrerRevelation(async () => {
      const resultat = await revelerSecret(secret.id);
      if (!resultat.ok) setErreurRevelation(resultat.erreur);
      else {
        setMotDePasse(resultat.motDePasse);
        setNotes(resultat.notes);
        setRevele(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="secretId" value={secret.id} />
        <input type="hidden" name="champsSensiblesModifies" value={revele ? "on" : ""} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="titre">Titre</Label>
          <Input id="titre" name="titre" defaultValue={secret.titre} required disabled={!peutModifier} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="identifiant">Identifiant</Label>
          <Input id="identifiant" name="identifiant" defaultValue={secret.identifiant ?? ""} disabled={!peutModifier} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="url">URL</Label>
          <Input id="url" name="url" type="url" defaultValue={secret.url ?? ""} disabled={!peutModifier} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="partage" defaultChecked={secret.partage} className="size-4" disabled={!peutModifier} />
          Partager avec toute l&apos;équipe
        </label>

        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
          {!revele ? (
            <>
              <p className="text-sm text-muted-foreground">Le mot de passe et les notes restent masqués tant qu&apos;ils ne sont pas révélés.</p>
              <Button type="button" variant="outline" size="sm" disabled={revelationEnCours} onClick={reveler} className="self-start">
                {revelationEnCours ? <Spinner /> : null}
                Révéler pour modifier
              </Button>
              {erreurRevelation ? <p className="text-sm text-destructive">{erreurRevelation}</p> : null}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="motDePasse">Mot de passe</Label>
                <div className="flex gap-2">
                  <Input id="motDePasse" name="motDePasse" type="text" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} disabled={!peutModifier} />
                  <Button type="button" variant="outline" size="icon-sm" aria-label="Générer un mot de passe" onClick={() => setMotDePasse(genererMotDePasse())} disabled={!peutModifier}>
                    <Dices className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!peutModifier} />
              </div>
            </>
          )}
        </div>

        {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

        {peutModifier ? (
          <Button type="submit" size="sm" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            Enregistrer
          </Button>
        ) : null}
      </form>

      {peutSupprimer ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-destructive hover:text-destructive"
          disabled={suppressionEnCours}
          onClick={() => {
            if (window.confirm("Supprimer définitivement ce secret ?")) {
              demarrerSuppression(() => supprimerSecret(secret.id));
            }
          }}
        >
          {suppressionEnCours ? <Spinner /> : <Trash2 data-icon="inline-start" aria-hidden />}
          Supprimer le secret
        </Button>
      ) : null}
    </div>
  );
}
