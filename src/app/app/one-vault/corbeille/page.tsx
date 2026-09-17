import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { recupererCorbeille } from "@/lib/actions/one-vault";
import { Card } from "@/components/ui/card";
import { LigneCorbeille } from "./ligne-corbeille";

export default async function PageCorbeilleOneVault() {
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

  const secrets = await recupererCorbeille();
  const peutGerer = peut(utilisateurConnecte.role, "ONE_VAULT", "SUPPRIMER");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/one-vault" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Corbeille</h1>
        <p className="text-muted-foreground">Les secrets supprimés restent ici jusqu&apos;à ce que vous les restauriez ou les supprimiez définitivement.</p>
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {secrets.map((s) => (
            <LigneCorbeille key={s.id} secret={s} peutGerer={peutGerer} />
          ))}
          {secrets.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">La corbeille est vide.</p> : null}
        </div>
      </Card>
    </div>
  );
}
