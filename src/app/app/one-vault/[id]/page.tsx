import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { recupererSecretPourEdition } from "@/lib/actions/one-vault";
import { FormulaireSecret } from "./formulaire-secret";

export default async function PageDetailOneVault({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const secret = await recupererSecretPourEdition(id);
  if (!secret) notFound();

  const peutModifier = peut(utilisateurConnecte.role, "ONE_VAULT", "MODIFIER");
  const peutSupprimer = peut(utilisateurConnecte.role, "ONE_VAULT", "SUPPRIMER");

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Link href="/app/one-vault" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">{secret.titre}</h1>

      <FormulaireSecret
        secret={{ id: secret.id, titre: secret.titre, identifiant: secret.identifiant, url: secret.url, partage: secret.partage }}
        peutModifier={peutModifier}
        peutSupprimer={peutSupprimer}
      />
    </div>
  );
}
