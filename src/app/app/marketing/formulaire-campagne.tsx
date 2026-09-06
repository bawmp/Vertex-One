"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerCampagne } from "@/lib/actions/campagne";

export function FormulaireCampagne() {
  const [etat, action, enCours] = useActionState(creerCampagne, null);
  const [ouvert, setOuvert] = useState(false);
  const [segmentType, setSegmentType] = useState("statut");

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouvelle campagne
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle campagne</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nom">Nom de la campagne</Label>
              <Input id="nom" name="nom" required minLength={2} autoFocus />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="canal">Canal</Label>
              <Select id="canal" name="canal" defaultValue="EMAIL">
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contenu">Contenu du message</Label>
            <Textarea id="contenu" name="contenu" rows={4} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="segmentType">Segment</Label>
              <Select id="segmentType" name="segmentType" value={segmentType} onChange={(e) => setSegmentType(e.target.value)}>
                <option value="statut">Prospects avec un statut précis</option>
                <option value="sansProjetDepuisJours">Clients sans projet depuis N jours</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="segmentValeur">{segmentType === "statut" ? "Statut" : "Nombre de jours"}</Label>
              {segmentType === "statut" ? (
                <Select id="segmentValeur" name="segmentValeur" defaultValue="PERDU">
                  <option value="NOUVEAU">Nouveau</option>
                  <option value="QUALIFIE">Qualifié</option>
                  <option value="PROPOSITION">Proposition</option>
                  <option value="GAGNE">Gagné</option>
                  <option value="PERDU">Perdu</option>
                </Select>
              ) : (
                <Input id="segmentValeur" name="segmentValeur" type="number" min={1} defaultValue={90} />
              )}
            </div>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Création…" : "Créer en brouillon"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
