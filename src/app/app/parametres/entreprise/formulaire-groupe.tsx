"use client";

import { useActionState, useState, useTransition } from "react";
import { Users2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { creerGroupe, rattacherFilialeAuGroupe, genererInvitationGroupe, quitterGroupe } from "@/lib/actions/groupe";
import { useT } from "@/lib/i18n/contexte";


const LIBELLE_STATUT: Record<string, { texte: string; variant: "success" | "danger" | "brand" }> = {
  essai: { texte: "Essai", variant: "brand" },
  actif: { texte: "Actif", variant: "success" },
  suspendu: { texte: "Suspendu", variant: "danger" },
};

type Filiale = { id: string; nom: string; secteurProfil: string; statutAbonnement: string };

export function FormulaireGroupe({ groupe, filiales }: { groupe: { id: string; nom: string } | null; filiales: Filiale[] }) {
  if (!groupe) return <FormulairesSansGroupe />;
  return <VueGroupe nomGroupe={groupe.nom} filiales={filiales} />;
}

function FormulairesSansGroupe() {
  const t = useT();
  const [etatCreation, actionCreation, creationEnCours] = useActionState(creerGroupe, null);
  const [etatRattachement, actionRattachement, rattachementEnCours] = useActionState(rattacherFilialeAuGroupe, null);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {t("Un groupe relie plusieurs entreprises Vertex One appartenant au même propriétaire (filiales) — chacune garde sa propre connexion, ses propres données et son propre abonnement. Le groupe n'est qu'une vue d'ensemble.")}
      </p>

      <form action={actionCreation} className="flex flex-col gap-2">
        <Label htmlFor="nom">{t("Créer un nouveau groupe")}</Label>
        <div className="flex gap-2">
          <Input id="nom" name="nom" placeholder={t("ex : Groupe Mbarga & Fils")} required className="max-w-xs" />
          <Button type="submit" disabled={creationEnCours}>
            {creationEnCours ? <Spinner /> : t("Créer")}
          </Button>
        </div>
        {etatCreation?.erreur ? <p className="text-sm text-destructive">{etatCreation.erreur}</p> : null}
      </form>

      <form action={actionRattachement} className="flex flex-col gap-2 border-t border-border pt-4">
        <Label htmlFor="jeton">{t("Rattacher cette entreprise à un groupe existant")}</Label>
        <div className="flex gap-2">
          <Input id="jeton" name="jeton" placeholder={t("Code reçu de l'autre entreprise")} required className="max-w-xs" />
          <Button type="submit" variant="outline" disabled={rattachementEnCours}>
            {rattachementEnCours ? <Spinner /> : t("Rattacher")}
          </Button>
        </div>
        {etatRattachement?.erreur ? <p className="text-sm text-destructive">{etatRattachement.erreur}</p> : null}
      </form>
    </div>
  );
}

function VueGroupe({ nomGroupe, filiales }: { nomGroupe: string; filiales: Filiale[] }) {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [genereEnCours, demarrerGeneration] = useTransition();
  const [quitteEnCours, demarrerDepart] = useTransition();

  function genererCode() {
    setErreur(null);
    demarrerGeneration(async () => {
      const resultat = await genererInvitationGroupe();
      if (resultat?.erreur) setErreur(resultat.erreur);
      else setCode(resultat?.succes ?? null);
      setCopie(false);
    });
  }

  function copierCode() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => setCopie(true));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Users2 className="size-4 text-muted-foreground" aria-hidden />
        <p className="font-medium">{nomGroupe}</p>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {filiales.map((f) => {
          const libelle = LIBELLE_STATUT[f.statutAbonnement] ?? { texte: f.statutAbonnement, variant: "brand" as const };
          return (
            <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <p className="font-medium">{f.nom}</p>
              <Badge variant={libelle.variant}>{libelle.texte}</Badge>
            </div>
          );
        })}
        {filiales.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucune autre filiale rattachée pour le moment.")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" onClick={genererCode} disabled={genereEnCours} className="self-start">
          {genereEnCours ? <Spinner /> : null}
          {t("Générer un code pour rattacher une nouvelle filiale")}
        </Button>
        {code ? (
          <div className="flex items-center gap-2">
            <code className="rounded-md bg-muted px-2 py-1 text-sm">{code}</code>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("Copier")} onClick={copierCode}>
              {copie ? <Check className="text-emerald-600" aria-hidden /> : <Copy aria-hidden />}
            </Button>
            <p className="text-xs text-muted-foreground">{t("Valable 72h, à usage unique — à coller depuis l'autre entreprise.")}</p>
          </div>
        ) : null}
        {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start text-destructive hover:text-destructive"
        disabled={quitteEnCours}
        onClick={() => {
          if (window.confirm(t("Quitter ce groupe ? Cette entreprise redeviendra indépendante — aucune donnée n'est affectée."))) {
            demarrerDepart(() => quitterGroupe());
          }
        }}
      >
        {quitteEnCours ? <Spinner /> : null}
        {t("Quitter le groupe")}
      </Button>
    </div>
  );
}
