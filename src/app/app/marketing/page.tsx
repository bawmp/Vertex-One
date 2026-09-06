import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { Megaphone, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, campagne, pageAtterrissage } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponibleAddon } from "@/lib/plans";
import { FormulaireCampagne } from "./formulaire-campagne";
import { ListeCampagnes } from "./liste-campagnes";
import { FormulairePageAtterrissage } from "./formulaire-page-atterrissage";
import { ListePagesAtterrissage } from "./liste-pages-atterrissage";
import { BoutonActiverAddon } from "./bouton-activer-addon";

export default async function PageMarketing() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "MARKETING", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès au Marketing.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    const actif = await disponibleAddon(tx, monEntreprise, "MARKETING");
    if (!actif) return { actif: false as const };

    const [campagnes, pages] = await Promise.all([
      tx.select().from(campagne).where(eq(campagne.entrepriseId, utilisateurConnecte.entrepriseId)).orderBy(desc(campagne.creeLe)),
      tx.select().from(pageAtterrissage).where(eq(pageAtterrissage.entrepriseId, utilisateurConnecte.entrepriseId)).orderBy(desc(pageAtterrissage.creeLe)),
    ]);

    return { actif: true as const, campagnes, pages };
  });

  const peutCreer = peut(utilisateurConnecte.role, "MARKETING", "CREER");
  const peutModifier = peut(utilisateurConnecte.role, "MARKETING", "MODIFIER");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Megaphone className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
      </div>

      {!donnees.actif ? (
        utilisateurConnecte.role === "ADMIN" ? (
          <BoutonActiverAddon />
        ) : (
          <p className="text-sm text-muted-foreground">
            Le module Marketing n&apos;est pas activé — demandez à un Administrateur de l&apos;activer.
          </p>
        )
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Campagnes</h2>
              {peutCreer ? <FormulaireCampagne /> : null}
            </div>
            <ListeCampagnes campagnes={donnees.campagnes} peutEnvoyer={peutModifier} />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Pages d&apos;atterrissage</h2>
              {peutCreer ? <FormulairePageAtterrissage /> : null}
            </div>
            <ListePagesAtterrissage pages={donnees.pages} peutModifier={peutModifier} />
          </div>
        </>
      )}
    </div>
  );
}
