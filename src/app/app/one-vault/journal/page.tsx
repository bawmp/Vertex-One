import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { recupererJournal } from "@/lib/actions/one-vault";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const LIBELLE_ACTION: Record<string, string> = {
  consultation: "Révélation du mot de passe",
  modification: "Modification",
  suppression: "Suppression",
  restauration: "Restauration",
};

export default async function PageJournalOneVault() {
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

  const journal = await recupererJournal();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/one-vault" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
        <p className="text-muted-foreground">Historique des révélations, modifications, suppressions et restaurations.</p>
      </div>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {journal.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.secretTitre ?? "(secret supprimé définitivement)"}</p>
                <p className="text-xs text-muted-foreground">{l.utilisateurNom ?? "Utilisateur inconnu"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="neutral">{LIBELLE_ACTION[l.action] ?? l.action}</Badge>
                <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(l.creeLe)}</span>
              </div>
            </div>
          ))}
          {journal.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune activité pour le moment.</p> : null}
        </div>
      </Card>
    </div>
  );
}
