import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { signataire, demandeSignature, document } from "@/db/schema";
import { FormulaireSignature } from "./formulaire-signature";
import { LogoEntreprise } from "@/components/logo-entreprise";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Route publique, accessible sans session — comme /invitation/[jeton] (Palier
// 0) : la connexion utilise le client `db` direct, pas avecEntreprise(), et
// c'est la politique RLS permissive de `signataire` (quand app.entreprise_id
// n'est pas positionné) qui autorise cette lecture par jeton.
export default async function PageSignature({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;

  const [ligne] = await db
    .select({
      signataire,
      nomDocument: document.nom,
    })
    .from(signataire)
    .innerJoin(demandeSignature, eq(signataire.demandeSignatureId, demandeSignature.id))
    .innerJoin(document, eq(demandeSignature.documentId, document.id))
    .where(eq(signataire.jetonAcces, jeton));

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-gradient-to-br from-marque-bleu-800 via-marque-bleu to-marque-bleu-900 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-marque-orange/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 bottom-0 size-72 rounded-full bg-marque-bleu-300/20 blur-3xl"
      />

      <LogoEntreprise taille="hero" className="relative" />

      {!ligne ? (
        <p className="relative text-marque-bleu-100/90">Ce lien de signature est invalide.</p>
      ) : ligne.signataire.statut === "SIGNE" ? (
        <Card className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-300">
          <CardHeader>
            <CardTitle>Document déjà signé</CardTitle>
            <CardDescription>
              Vous avez signé « {ligne.nomDocument} »
              {ligne.signataire.signeLe ? ` le ${ligne.signataire.signeLe.toLocaleDateString("fr-FR")}` : ""}.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : ligne.signataire.statut !== "EN_ATTENTE" ? (
        <p className="relative text-marque-bleu-100/90">Cette demande de signature n&apos;est plus active.</p>
      ) : (
        <Card className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-300">
          <CardHeader>
            <CardTitle>Signer le document</CardTitle>
            <CardDescription>
              « {ligne.nomDocument} » — {ligne.signataire.nom}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireSignature jeton={jeton} emailConnu={Boolean(ligne.signataire.email)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
