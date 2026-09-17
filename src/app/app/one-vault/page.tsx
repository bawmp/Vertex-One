import { redirect } from "next/navigation";
import Link from "next/link";
import { KeyRound, Lock, ScrollText, Trash2 } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponibleAddon } from "@/lib/plans";
import { recupererSecrets } from "@/lib/actions/one-vault";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BoutonActiverOneVault } from "./bouton-activer-one-vault";
import { FormulaireNouveauSecret } from "./formulaire-nouveau-secret";
import { LigneSecret } from "./ligne-secret";

export default async function PageOneVault() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "ONE_VAULT", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès à One Vault.</p>
      </div>
    );
  }

  const actif = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return disponibleAddon(tx, monEntreprise, "ONE_VAULT");
  });

  const secrets = actif ? await recupererSecrets() : [];
  const peutGerer = peut(utilisateurConnecte.role, "ONE_VAULT", "CREER");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <KeyRound className="size-5" aria-hidden />
          One Vault
        </h1>
        <p className="text-muted-foreground">Identifiants et notes sensibles, chiffrés, privés ou partagés avec l&apos;équipe.</p>
      </div>

      {!actif ? (
        utilisateurConnecte.role === "ADMIN" ? (
          <BoutonActiverOneVault />
        ) : (
          <p className="text-sm text-muted-foreground">Le module One Vault n&apos;est pas activé — demandez à un Administrateur de l&apos;activer.</p>
        )
      ) : (
        <>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" render={<Link href="/app/one-vault/journal" />} nativeButton={false}>
              <ScrollText data-icon="inline-start" aria-hidden />
              Journal
            </Button>
            <Button variant="outline" size="sm" render={<Link href="/app/one-vault/corbeille" />} nativeButton={false}>
              <Trash2 data-icon="inline-start" aria-hidden />
              Corbeille
            </Button>
          </div>

          {peutGerer ? <FormulaireNouveauSecret /> : null}

          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {secrets.map((s) => (
                <LigneSecret key={s.id} secret={s} peutModifier={peutGerer} />
              ))}
              {secrets.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun secret pour le moment.</p> : null}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
