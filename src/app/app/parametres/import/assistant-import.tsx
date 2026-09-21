"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { analyserFichierImport, lancerImport, type ApercuFichier } from "@/lib/actions/import-donnees";
import type { Rapport } from "@/lib/import/moteur";

export type TypeAffiche = {
  type: string;
  libelle: string;
  description: string;
  conseils: { source: string; texte: string }[];
  champs: { cle: string; libelle: string; obligatoire: boolean }[];
};

type Apercu = Extract<ApercuFichier, { ok: true }>;
type Etape = "choix" | "colonnes" | "simulation" | "termine";

const LIENS_APRES_IMPORT: Record<string, { href: string; libelle: string }> = {
  CONTACTS: { href: "/app/contacts", libelle: "Voir les contacts" },
  PRODUITS: { href: "/app/produits", libelle: "Voir les produits" },
  PROJETS_TACHES: { href: "/app/projets", libelle: "Voir les projets" },
  DEVIS: { href: "/app/facturation", libelle: "Voir la facturation" },
  FACTURES: { href: "/app/facturation", libelle: "Voir la facturation" },
  NOTES: { href: "/app/mon-espace", libelle: "Voir mon espace personnel" },
};

export function AssistantImport({ types, clients }: { types: TypeAffiche[]; clients: { id: string; nom: string }[] }) {
  const [etape, setEtape] = useState<Etape>("choix");
  const [typeChoisi, setTypeChoisi] = useState<string>(types[0].type);
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [correspondance, setCorrespondance] = useState<Record<string, string>>({});
  const [contactProjetsId, setContactProjetsId] = useState("NOUVEAU");
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const champFichier = useRef<HTMLInputElement>(null);

  const def = types.find((t) => t.type === typeChoisi) ?? types[0];

  function formData(simulation: boolean): FormData {
    const f = new FormData();
    f.set("type", typeChoisi);
    if (fichier) f.set("fichier", fichier);
    f.set("correspondance", JSON.stringify(correspondance));
    f.set("simulation", simulation ? "1" : "0");
    if (typeChoisi === "PROJETS_TACHES") f.set("contactProjetsId", contactProjetsId);
    return f;
  }

  function analyser() {
    setErreur(null);
    if (!fichier) {
      setErreur("Choisissez d'abord un fichier CSV ou Excel.");
      return;
    }
    const f = new FormData();
    f.set("type", typeChoisi);
    f.set("fichier", fichier);
    demarrer(async () => {
      const resultat = await analyserFichierImport(f);
      if (!resultat.ok) {
        setErreur(resultat.erreur);
        return;
      }
      setApercu(resultat);
      setCorrespondance(resultat.correspondance);
      setEtape("colonnes");
    });
  }

  function lancer(simulation: boolean) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await lancerImport(formData(simulation));
      if (!resultat.ok) {
        setErreur(resultat.erreur);
        return;
      }
      setRapport(resultat.rapport);
      setEtape(resultat.simulation ? "simulation" : "termine");
    });
  }

  function recommencer() {
    setEtape("choix");
    setFichier(null);
    setApercu(null);
    setCorrespondance({});
    setRapport(null);
    setErreur(null);
    if (champFichier.current) champFichier.current.value = "";
  }

  const manquants = def.champs.filter((c) => c.obligatoire && !correspondance[c.cle]);

  return (
    <div className="flex flex-col gap-4">
      {etape === "choix" ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">1. Que voulez-vous importer ?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {types.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    aria-pressed={t.type === typeChoisi}
                    onClick={() => setTypeChoisi(t.type)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${t.type === typeChoisi ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                  >
                    <span className="font-medium">{t.libelle}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
              <p>{def.description}</p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {def.conseils.map((c) => (
                  <li key={c.source}>
                    <span className="font-medium text-foreground">{c.source} :</span> {c.texte}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="fichier-import" className="text-sm font-medium">
                2. Fichier à importer (CSV ou Excel .xlsx)
              </label>
              <input
                id="fichier-import"
                ref={champFichier}
                type="file"
                accept=".csv,.txt,.xlsx,text/csv"
                onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
                className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              />
            </div>

            {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
            <div>
              <Button type="button" onClick={analyser} disabled={enCours || !fichier}>
                {enCours ? <Spinner /> : <FileSpreadsheet data-icon="inline-start" aria-hidden />}
                {enCours ? "Lecture du fichier…" : "Analyser le fichier"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {etape === "colonnes" && apercu ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-medium">3. Associer les colonnes — {def.libelle}</h2>
              <p className="text-sm text-muted-foreground">
                {apercu.nbLignes} ligne(s) lues dans « {fichier?.name} ». Les colonnes reconnues sont déjà associées ; vérifiez-les et complétez au besoin. Un champ marqué * est obligatoire.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {def.champs.map((champ) => {
                const entete = correspondance[champ.cle];
                const valeur = entete ? apercu.exemple[0]?.[entete] : "";
                return (
                  <div key={champ.cle} className="grid items-center gap-2 sm:grid-cols-[14rem_minmax(0,1fr)_10rem]">
                    <label htmlFor={`champ-${champ.cle}`} className="text-sm">
                      {champ.libelle}
                      {champ.obligatoire ? <span className="text-destructive"> *</span> : null}
                    </label>
                    <Select
                      id={`champ-${champ.cle}`}
                      aria-label={champ.libelle}
                      value={entete ?? ""}
                      onChange={(e) => setCorrespondance((c) => {
                        const suivant = { ...c };
                        if (e.target.value) suivant[champ.cle] = e.target.value;
                        else delete suivant[champ.cle];
                        return suivant;
                      })}
                    >
                      <option value="">— ne pas importer —</option>
                      {apercu.entetes.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </Select>
                    <span className="truncate text-xs text-muted-foreground" title={valeur}>
                      {valeur ? `ex. ${valeur}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            {typeChoisi === "PROJETS_TACHES" ? (
              <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3">
                <label htmlFor="client-projets" className="text-sm font-medium">
                  Rattacher les nouveaux projets à quel client ?
                </label>
                <Select id="client-projets" value={contactProjetsId} onChange={(e) => setContactProjetsId(e.target.value)}>
                  <option value="NOUVEAU">Un client interne « Projets importés » (recommandé)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">Dans Vertex One, chaque projet appartient au dossier d&apos;un client.</p>
              </div>
            ) : null}

            {manquants.length > 0 ? <p className="text-sm text-destructive">À associer : {manquants.map((m) => m.libelle).join(", ")}.</p> : null}
            {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => lancer(true)} disabled={enCours || manquants.length > 0}>
                {enCours ? <Spinner /> : null}
                {enCours ? "Simulation…" : "Simuler l'import"}
              </Button>
              <Button type="button" variant="ghost" onClick={recommencer} disabled={enCours}>
                Changer de fichier
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">La simulation ne modifie rien : elle montre exactement ce qui serait créé, ignoré ou refusé.</p>
          </CardContent>
        </Card>
      ) : null}

      {etape === "simulation" && rapport ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="text-sm font-medium">4. Résultat de la simulation — rien n&apos;a encore été enregistré</h2>
            <ResumeRapport rapport={rapport} conditionnel />
            {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => lancer(false)} disabled={enCours || rapport.crees === 0}>
                {enCours ? <Spinner /> : <CheckCircle2 data-icon="inline-start" aria-hidden />}
                {enCours ? "Import en cours…" : `Importer pour de bon (${rapport.crees})`}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEtape("colonnes")} disabled={enCours}>
                Modifier l&apos;association
              </Button>
              <Button type="button" variant="ghost" onClick={recommencer} disabled={enCours}>
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {etape === "termine" && rapport ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              Import terminé
            </h2>
            <ResumeRapport rapport={rapport} />
            <div className="flex flex-wrap gap-2">
              <Link href={LIENS_APRES_IMPORT[typeChoisi]?.href ?? "/app"} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground">
                {LIENS_APRES_IMPORT[typeChoisi]?.libelle ?? "Retour"}
              </Link>
              <Button type="button" variant="outline" onClick={recommencer}>
                Importer un autre fichier
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ResumeRapport({ rapport, conditionnel = false }: { rapport: Rapport; conditionnel?: boolean }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="grid gap-2 sm:grid-cols-3">
        <li className="rounded-lg border border-border p-3">
          <p className="text-2xl font-semibold">{rapport.crees}</p>
          <p className="text-muted-foreground">{conditionnel ? "seront créés" : "créés"}</p>
        </li>
        <li className="rounded-lg border border-border p-3">
          <p className="text-2xl font-semibold">{rapport.ignores}</p>
          <p className="text-muted-foreground">ignorés (déjà présents)</p>
        </li>
        <li className="rounded-lg border border-border p-3">
          <p className="text-2xl font-semibold">{rapport.nbErreurs}</p>
          <p className="text-muted-foreground">refusés</p>
        </li>
      </ul>

      {rapport.resume.length > 0 ? (
        <ul className="text-muted-foreground">
          {rapport.resume.map((r) => (
            <li key={r.libelle}>
              {r.libelle} : <span className="font-medium text-foreground">{r.nombre}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {rapport.avertissements.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-marque-orange-600/30 bg-marque-orange-600/5 p-3">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4 text-marque-orange-600" aria-hidden />À noter
          </p>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {rapport.avertissements.map((a, i) => (
              <li key={i}>{a.ligne > 0 ? `Ligne ${a.ligne} : ${a.message}` : a.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {rapport.nbErreurs > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 font-medium">
            <XCircle className="size-4 text-destructive" aria-hidden />
            Lignes refusées (ligne 1 = en-têtes du fichier)
          </p>
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto text-muted-foreground">
            {rapport.erreurs.map((e, i) => (
              <li key={i}>{e.ligne > 0 ? `Ligne ${e.ligne} : ${e.message}` : e.message}</li>
            ))}
          </ul>
          {rapport.nbErreurs > rapport.erreurs.length ? <p className="text-xs text-muted-foreground">… et {rapport.nbErreurs - rapport.erreurs.length} autre(s).</p> : null}
        </div>
      ) : null}
    </div>
  );
}
