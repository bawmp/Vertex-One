"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  creerChampPersonnaliseContact,
  modifierChampPersonnaliseContact,
  supprimerChampPersonnaliseContact,
  reordonnerChampsPersonnalisesContact,
} from "@/lib/actions/champ-personnalise-contact";
import { TYPES_CHAMP_CONTACT, TYPES_AVEC_OPTIONS_CHAMP_CONTACT as TYPES_AVEC_OPTIONS } from "@/lib/contact-champs-personnalises-types";
import { useT } from "@/lib/i18n/contexte";

type ChampContact = {
  id: string;
  libelle: string;
  type: (typeof TYPES_CHAMP_CONTACT)[number];
  obligatoire: boolean;
  options?: string[];
};

function useLibellesType(): Record<(typeof TYPES_CHAMP_CONTACT)[number], string> {
  const t = useT();
  return {
    TEXTE_COURT: t("Texte court"),
    TEXTE_LONG: t("Texte long"),
    NOMBRE: t("Nombre"),
    DATE: t("Date"),
    EMAIL: t("Email"),
    TELEPHONE: t("Téléphone"),
    CASE_A_COCHER: t("Case à cocher"),
    LISTE_DEROULANTE: t("Liste déroulante"),
  };
}

function LigneChamp({
  champ,
  index,
  total,
  onDeplacer,
}: {
  champ: ChampContact;
  index: number;
  total: number;
  onDeplacer: (id: string, direction: "haut" | "bas") => void;
}) {
  const t = useT();
  const libellesType = useLibellesType();
  const [etat, action, enCours] = useActionState(modifierChampPersonnaliseContact, null);
  const [enEdition, setEnEdition] = useState(false);
  const [, demarrerDeplacement] = useTransition();

  if (enEdition) {
    return (
      <form action={action} className="flex flex-col gap-2 px-4 py-3">
        <input type="hidden" name="champId" value={champ.id} />
        <div className="flex items-center gap-2">
          <Input name="libelle" defaultValue={champ.libelle} required className="h-8" autoFocus />
          <Badge variant="info">{libellesType[champ.type]}</Badge>
        </div>
        {TYPES_AVEC_OPTIONS.has(champ.type) ? (
          <Textarea name="options" rows={3} defaultValue={champ.options?.join("\n")} placeholder={t("Une option par ligne")} />
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="obligatoire" defaultChecked={champ.obligatoire} className="size-4" />
          {t("Champ obligatoire")}
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={enCours}>
            {enCours ? <Spinner /> : t("Enregistrer")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEnEdition(false)}>
            {t("Annuler")}
          </Button>
        </div>
        {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      </form>
    );
  }

  return (
    <div className="group/ligne flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50">
      <div className="min-w-0">
        <p className="truncate font-medium">{champ.libelle}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {libellesType[champ.type]}
          {champ.obligatoire ? <Badge variant="warning">{t("Obligatoire")}</Badge> : null}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("Monter")}
          disabled={index === 0}
          onClick={() => demarrerDeplacement(() => onDeplacer(champ.id, "haut"))}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("Descendre")}
          disabled={index === total - 1}
          onClick={() => demarrerDeplacement(() => onDeplacer(champ.id, "bas"))}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Modifier")} onClick={() => setEnEdition(true)}>
          <Pencil aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("Supprimer")}
          onClick={() => {
            if (window.confirm(t('Supprimer le champ "{libelle}" ? Les valeurs déjà saisies sur vos Contacts seront perdues.', { libelle: champ.libelle }))) {
              supprimerChampPersonnaliseContact(champ.id);
            }
          }}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function GestionChampsContact({ champs }: { champs: ChampContact[] }) {
  const t = useT();
  const libellesType = useLibellesType();
  const [etat, action, enCours] = useActionState(creerChampPersonnaliseContact, null);
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<(typeof TYPES_CHAMP_CONTACT)[number]>("TEXTE_COURT");

  function deplacer(id: string, direction: "haut" | "bas") {
    const index = champs.findIndex((c) => c.id === id);
    const cible = direction === "haut" ? index - 1 : index + 1;
    if (cible < 0 || cible >= champs.length) return;
    const ids = champs.map((c) => c.id);
    [ids[index], ids[cible]] = [ids[cible], ids[index]];
    reordonnerChampsPersonnalisesContact(ids);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t("Vos champs")}</h2>
        {!ouvert ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
            <Plus data-icon="inline-start" aria-hidden />
            {t("Nouveau champ")}
          </Button>
        ) : null}
      </div>

      {ouvert ? (
        <form action={action} className="mb-3 flex flex-col gap-3 rounded-lg border border-dashed p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="libelle">{t("Libellé")}</Label>
              <Input id="libelle" name="libelle" placeholder={t("ex : Destination, Passeport/CNI…")} required autoFocus className="h-8" />
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-52">
              <Label htmlFor="type">{t("Type de champ")}</Label>
              <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as (typeof TYPES_CHAMP_CONTACT)[number])} className="h-8">
                {TYPES_CHAMP_CONTACT.map((v) => (
                  <option key={v} value={v}>
                    {libellesType[v]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {TYPES_AVEC_OPTIONS.has(type) ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="options">{t("Options (une par ligne)")}</Label>
              <Textarea id="options" name="options" rows={3} placeholder={"Canada\nFrance\nBelgique"} />
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="obligatoire" className="size-4" />
            {t("Champ obligatoire")}
          </label>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? <Spinner /> : t("Créer")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
              {t("Annuler")}
            </Button>
          </div>
        </form>
      ) : null}

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {champs.map((c, index) => (
            <LigneChamp key={c.id} champ={c} index={index} total={champs.length} onDeplacer={deplacer} />
          ))}
          {champs.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucun champ personnalisé pour le moment.")}</p> : null}
        </div>
      </Card>
    </div>
  );
}
