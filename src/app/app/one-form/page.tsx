import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { Lock, ClipboardList } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, formulaire } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponibleAddon } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonActiverOneForm } from "./bouton-activer-one-form";
import { FormulaireNouveauFormulaire } from "./formulaire-nouveau-formulaire";
import { ActionsFormulaire } from "./actions-formulaire";

export default async function PageOneForm() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "ONE_FORM", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès à One Form.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    const actif = await disponibleAddon(tx, monEntreprise, "ONE_FORM");
    if (!actif) return { actif: false as const };

    const formulaires = await tx.select().from(formulaire).where(eq(formulaire.entrepriseId, utilisateurConnecte.entrepriseId)).orderBy(desc(formulaire.creeLe));
    return { actif: true as const, formulaires };
  });

  const peutGerer = peut(utilisateurConnecte, "ONE_FORM", "CREER");
  const peutModifier = peut(utilisateurConnecte, "ONE_FORM", "MODIFIER");
  const peutSupprimer = peut(utilisateurConnecte, "ONE_FORM", "SUPPRIMER");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ClipboardList className="size-5" aria-hidden />
          One Form
        </h1>
        <p className="text-muted-foreground">Créez des formulaires personnalisés et partagez-les via un lien public.</p>
      </div>

      {!donnees.actif ? (
        utilisateurConnecte.role === "ADMIN" ? (
          <BoutonActiverOneForm />
        ) : (
          <p className="text-sm text-muted-foreground">Le module One Form n&apos;est pas activé — demandez à un Administrateur de l&apos;activer.</p>
        )
      ) : (
        <>
          {peutGerer ? <FormulaireNouveauFormulaire /> : null}

          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {donnees.formulaires.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <Link href={`/app/one-form/${f.id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate font-medium">{f.titre}</p>
                    <p className="text-xs text-muted-foreground">Créé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(f.creeLe)}</p>
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={f.publie ? "success" : "neutral"}>{f.publie ? "Publié" : "Brouillon"}</Badge>
                    <ActionsFormulaire formulaireId={f.id} publie={f.publie} peutModifier={peutModifier} peutSupprimer={peutSupprimer} />
                  </div>
                </div>
              ))}
              {donnees.formulaires.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun formulaire pour le moment.</p> : null}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
