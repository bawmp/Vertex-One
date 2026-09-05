import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation } from "@/db/schema";
import { FormulaireAcceptation } from "./formulaire-acceptation";

export default async function PageAcceptationInvitation({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;

  const [invitationValide] = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.jeton, jeton), isNull(invitation.utiliseeLe), gt(invitation.expireLe, new Date())));

  if (!invitationValide) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-muted-foreground">Ce lien d&apos;invitation est invalide ou a expiré.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm rounded-lg border bg-background p-6">
        <h1 className="text-xl font-semibold">Rejoindre l&apos;équipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {invitationValide.email} — rôle {invitationValide.roleProposee}
        </p>
        <FormulaireAcceptation jeton={jeton} />
      </div>
    </div>
  );
}
