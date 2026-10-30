import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Lock } from "lucide-react";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { tarifPour } from "@/lib/abonnement/tarif";
import { compterUtilisateursActifs } from "@/lib/abonnement/utilisateurs";
import { BoutonPaiementAbonnement } from "../app/parametres/abonnement/bouton-paiement-abonnement";

/**
 * Verrouillage total de l'abonnement plat (2026-09-14) — volontairement HORS
 * de l'arborescence /app/* : cette page ne doit jamais être elle-même
 * interceptée par la redirection posée dans src/app/app/layout.tsx (sinon
 * boucle infinie).
 */
export default async function PageAbonnementExpire() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const [monEntreprise] = await db
    .select({ nom: entreprise.nom, statutAbonnement: entreprise.statutAbonnement, creeLe: entreprise.creeLe })
    .from(entreprise)
    .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

  // Le paiement a peut-être été confirmé entre-temps (notification de paiement) —
  // ne jamais laisser un tenant à jour bloqué sur cette page par erreur.
  if (monEntreprise?.statutAbonnement !== "suspendu") redirect("/app");

  const estAdmin = peut(utilisateurConnecte, "PARAMETRES", "MODIFIER");
  const tarif = tarifPour(monEntreprise.creeLe, new Date(), await compterUtilisateursActifs(db, utilisateurConnecte.entrepriseId));

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader className="items-center text-center">
          <Lock className="mb-2 size-8 text-muted-foreground" aria-hidden />
          <CardTitle>Accès suspendu</CardTitle>
          <CardDescription>
            L&apos;abonnement de {monEntreprise?.nom} n&apos;a pas été renouvelé dans le délai imparti — l&apos;accès à Vertex One est suspendu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {estAdmin ? (
            <BoutonPaiementAbonnement montantMensuel={tarif.montantMensuel} montantAnnuel={tarif.montantAnnuel} />
          ) : (
            <p className="text-center text-sm text-muted-foreground">Contactez l&apos;administrateur de votre entreprise pour renouveler l&apos;abonnement.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
