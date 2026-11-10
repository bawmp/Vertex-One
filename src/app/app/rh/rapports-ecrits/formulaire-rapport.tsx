"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { envoyerRapportHierarchique } from "@/lib/actions/rapport-hierarchique";
import { LONGUEUR_MAX_CONTENU, LONGUEUR_MAX_OBJET } from "@/lib/rh/rapport-hierarchique-regles";
import { useT } from "@/lib/i18n/contexte";

type Destinataire = { id: string; nom: string; role: "ADMIN" | "MANAGER" };

export function FormulaireRapport({ destinataires, parDefaut }: { destinataires: Destinataire[]; parDefaut: string | null }) {
  const t = useT();
  const [etat, action, enCours] = useActionState(envoyerRapportHierarchique, null);
  const [ouvert, setOuvert] = useState(false);
  const [rouvert, setRouvert] = useState(false);
  // Champs contrôlés : après une erreur, React 19 vide les champs non contrôlés d'un formulaire à action.
  const [destinataireId, setDestinataireId] = useState(parDefaut ?? destinataires[0]?.id ?? "");
  const [objet, setObjet] = useState("");
  const [contenu, setContenu] = useState("");

  if (destinataires.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("Personne ne peut encore recevoir votre rapport : aucun responsable n'est disponible.")}</p>;
  }

  if (etat?.envoye && !rouvert) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("Rapport envoyé.")}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setObjet("");
            setContenu("");
            setRouvert(true);
          }}
        >
          {t("Écrire un autre rapport")}
        </Button>
      </div>
    );
  }

  if (!ouvert) {
    return (
      <Button size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        {t("Nouveau rapport")}
      </Button>
    );
  }

  return (
    <form
      action={(formData) => {
        setRouvert(false);
        action(formData);
      }}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="destinataireId">{t("Destinataire")}</Label>
        <Select id="destinataireId" name="destinataireId" required value={destinataireId} onChange={(e) => setDestinataireId(e.target.value)}>
          {destinataires.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nom} — {d.role === "ADMIN" ? t("Administrateur") : t("Manager")}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="objet">{t("Objet")}</Label>
        <Input id="objet" name="objet" required maxLength={LONGUEUR_MAX_OBJET} value={objet} onChange={(e) => setObjet(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="contenu">{t("Rapport")}</Label>
        <Textarea id="contenu" name="contenu" rows={8} required maxLength={LONGUEUR_MAX_CONTENU} value={contenu} onChange={(e) => setContenu(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">{t("Seuls vous et le destinataire pouvez lire ce rapport.")}</p>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? t("Envoi…") : t("Envoyer le rapport")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          {t("Annuler")}
        </Button>
      </div>
    </form>
  );
}
