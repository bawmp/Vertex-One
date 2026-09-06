import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { invitation } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireInvitation } from "./formulaire-invitation";

export default async function PageEquipe() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "PARAMETRES", "CREER")) {
    return (
      <p className="text-muted-foreground">
        Vous n&apos;avez pas le droit d&apos;inviter de nouveaux collaborateurs.
      </p>
    );
  }

  const invitations = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .select()
      .from(invitation)
      .where(eq(invitation.entrepriseId, utilisateurConnecte.entrepriseId))
      .orderBy(desc(invitation.expireLe))
  );

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
        <p className="text-muted-foreground">Inviter un nouveau collaborateur (Manager ou Employé).</p>
      </div>

      <FormulaireInvitation />

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Invitations</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {invitations.map((inv) => {
              const estUtilisee = Boolean(inv.utiliseeLe);
              const estExpiree = !estUtilisee && inv.expireLe < new Date();
              return (
                <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{inv.email}</p>
                    <p className="text-muted-foreground">
                      {inv.roleProposee}
                      {!estUtilisee && !estExpiree ? (
                        <>
                          {" — "}
                          <span className="font-mono text-xs">/invitation/{inv.jeton}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {estUtilisee ? (
                    <Badge variant="success">Compte activé</Badge>
                  ) : estExpiree ? (
                    <Badge variant="danger">Expirée</Badge>
                  ) : (
                    <Badge variant="info">En attente</Badge>
                  )}
                </div>
              );
            })}
            {invitations.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune invitation pour le moment.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
