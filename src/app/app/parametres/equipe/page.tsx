import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { invitation } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
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
    <div className="flex flex-col gap-8 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold">Équipe</h1>
        <p className="text-muted-foreground">Inviter un nouveau collaborateur (Manager ou Employé).</p>
      </div>

      <FormulaireInvitation />

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Invitations</h2>
        <ul className="flex flex-col gap-2">
          {invitations.map((inv) => (
            <li key={inv.id} className="rounded-md border p-3 text-sm">
              <p>
                <strong>{inv.email}</strong> — {inv.roleProposee}
              </p>
              <p className="text-muted-foreground">
                {inv.utiliseeLe
                  ? "Compte activé"
                  : inv.expireLe < new Date()
                    ? "Expirée"
                    : `Lien : /invitation/${inv.jeton}`}
              </p>
            </li>
          ))}
          {invitations.length === 0 ? (
            <li className="text-sm text-muted-foreground">Aucune invitation pour le moment.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
