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
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-emerald-500/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 bottom-0 size-72 rounded-full bg-amber-400/10 blur-3xl"
      />

      <Wordmark sombre className="relative text-lg" />

      {!invitationValide ? (
        <p className="relative text-emerald-100/80">Ce lien d&apos;invitation est invalide ou a expiré.</p>
      ) : (
        <Card className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-300">
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
