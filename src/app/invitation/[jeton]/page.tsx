import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation } from "@/db/schema";
import { FormulaireAcceptation } from "./formulaire-acceptation";
import { Wordmark } from "@/components/wordmark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PageAcceptationInvitation({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;

  const [invitationValide] = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.jeton, jeton), isNull(invitation.utiliseeLe), gt(invitation.expireLe, new Date())));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-muted p-4">
      <Wordmark />

      {!invitationValide ? (
        <p className="text-muted-foreground">Ce lien d&apos;invitation est invalide ou a expiré.</p>
      ) : (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Rejoindre l&apos;équipe</CardTitle>
            <CardDescription>
              {invitationValide.email} — rôle {invitationValide.roleProposee}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireAcceptation jeton={jeton} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
