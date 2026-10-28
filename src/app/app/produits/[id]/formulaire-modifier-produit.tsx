"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { modifierProduit } from "@/lib/actions/produit";
import { useT } from "@/lib/i18n/contexte";

export type ProduitAModifier = { id: string; nom: string; description: string | null; prixVente: number; prixAchat: number };

/**
 * Modification d'un produit ou service de la fiche détail : un bouton « Modifier » ouvre le formulaire prérempli. Le type
 * (bien ou service) et le stock ne se changent pas ici. Les contrôles sont refaits côté serveur par `modifierProduit`.
 */
export function FormulaireModifierProduit({ produit, ouvertParDefaut = false }: { produit: ProduitAModifier; ouvertParDefaut?: boolean }) {
  const t = useT();
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();

  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setErreur(null);
    startTransition(async () => {
      const resultat = await modifierProduit(produit.id, null, donnees);
      if (resultat?.erreur) setErreur(resultat.erreur);
      else setOuvert(false);
    });
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOuvert(true)}>
        <Pencil data-icon="inline-start" aria-hidden />
        {t("Modifier")}
      </Button>
    );
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={enregistrer} className="flex flex-col gap-4" aria-label={t("Modifier le produit")}>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Pencil className="size-4" aria-hidden />
            {t("Modifier le produit")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="nom-produit">{t("Nom")}</Label>
              <Input id="nom-produit" name="nom" required minLength={2} defaultValue={produit.nom} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="prixVente-produit">{t("Prix de vente (FCFA)")}</Label>
              <Input id="prixVente-produit" name="prixVente" type="number" min={0} step={1} defaultValue={produit.prixVente} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="prixAchat-produit">{t("Prix d'achat (FCFA)")}</Label>
              <Input id="prixAchat-produit" name="prixAchat" type="number" min={0} step={1} defaultValue={produit.prixAchat} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description-produit">{t("Description")}</Label>
            <Textarea id="description-produit" name="description" rows={3} defaultValue={produit.description ?? ""} />
          </div>
          <p className="text-xs text-muted-foreground">{t("Les devis et factures déjà établis gardent leur prix ; la modification s'applique aux prochains documents.")}</p>

          {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? t("Enregistrement…") : t("Enregistrer")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={enCours}
              onClick={() => {
                setOuvert(false);
                setErreur(null);
              }}
            >
              {t("Annuler")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
