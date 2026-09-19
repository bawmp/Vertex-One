import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc, desc } from "drizzle-orm";
import { ArrowLeft, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { formulaire, champFormulaire, reponseFormulaire, valeurChampReponse } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";
import { ListeChamps } from "../liste-champs";
import { FormulaireAjoutChamp } from "../formulaire-ajout-champ";
import { FormulaireParametres } from "../formulaire-parametres";
import { ListeReponses } from "../liste-reponses";
import { decoderValeurFichier } from "@/lib/one-form/fichiers";

export default async function PageDetailOneForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "ONE_FORM", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès à One Form.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leFormulaire] = await tx.select().from(formulaire).where(eq(formulaire.id, id));
    if (!leFormulaire) return null;

    const champs = await tx.select().from(champFormulaire).where(eq(champFormulaire.formulaireId, id)).orderBy(asc(champFormulaire.ordre));
    const reponses = await tx.select().from(reponseFormulaire).where(eq(reponseFormulaire.formulaireId, id)).orderBy(desc(reponseFormulaire.creeLe));

    const champsFichier = new Set(champs.filter((c) => c.type === "FICHIER").map((c) => c.id));
    const valeursParReponse = new Map<string, Record<string, string>>();
    const fichiersParReponse = new Map<string, Record<string, { valeurId: string; nom: string; taille: number }>>();
    for (const r of reponses) {
      const lignes = await tx.select().from(valeurChampReponse).where(eq(valeurChampReponse.reponseFormulaireId, r.id));
      valeursParReponse.set(
        r.id,
        Object.fromEntries(lignes.filter((l) => !champsFichier.has(l.champFormulaireId)).map((l) => [l.champFormulaireId, l.valeur]))
      );
      const fichiers: Record<string, { valeurId: string; nom: string; taille: number }> = {};
      for (const l of lignes) {
        if (!champsFichier.has(l.champFormulaireId)) continue;
        const decode = decoderValeurFichier(l.valeur);
        if (decode) fichiers[l.champFormulaireId] = { valeurId: l.id, nom: decode.nom, taille: decode.taille };
      }
      fichiersParReponse.set(r.id, fichiers);
    }

    return { leFormulaire, champs, reponses, valeursParReponse, fichiersParReponse };
  });

  if (!donnees) notFound();
  const { leFormulaire, champs, reponses, valeursParReponse, fichiersParReponse } = donnees;

  const peutModifier = peut(utilisateurConnecte.role, "ONE_FORM", "MODIFIER");
  const peutSupprimer = peut(utilisateurConnecte.role, "ONE_FORM", "SUPPRIMER");

  const urlPublique = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/formulaire/${leFormulaire.slug}`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/one-form" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">{leFormulaire.titre}</h1>

      <Tabs defaultValue="champs">
        <TabsList>
          <TabsTrigger value="champs">Champs</TabsTrigger>
          <TabsTrigger value="parametres">Paramètres</TabsTrigger>
          <TabsTrigger value="reponses">Réponses ({reponses.length})</TabsTrigger>
        </TabsList>

        <TabsPanel value="champs" className="flex flex-col gap-4">
          <ListeChamps formulaireId={leFormulaire.id} champsInitiaux={champs} peutModifier={peutModifier} />
          {peutModifier ? <FormulaireAjoutChamp formulaireId={leFormulaire.id} /> : null}
        </TabsPanel>

        <TabsPanel value="parametres">
          <FormulaireParametres formulaire={leFormulaire} urlPublique={urlPublique} peutModifier={peutModifier} peutSupprimer={peutSupprimer} />
        </TabsPanel>

        <TabsPanel value="reponses">
          <ListeReponses
            champs={champs.map((c) => ({ id: c.id, libelle: c.libelle }))}
            reponses={reponses.map((r) => ({ id: r.id, creeLe: r.creeLe, leadCree: !!r.leadId, valeurs: valeursParReponse.get(r.id) ?? {}, fichiers: fichiersParReponse.get(r.id) ?? {} }))}
          />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
