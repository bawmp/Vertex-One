import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { signataire, demandeSignature, document } from "@/db/schema";
import { FormulaireSignature } from "./formulaire-signature";
import { LogoEntreprise } from "@/components/logo-entreprise";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// Route publique, accessible sans session — comme /invitation/[jeton] (Palier
// 0) : la connexion utilise le client `db` direct, pas avecEntreprise(), et
// c'est la politique RLS permissive de `signataire` (quand app.entreprise_id
// n'est pas positionné) qui autorise cette lecture par jeton.
export default async function PageSignature({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;

  // Le signataire se retrouve par son jeton (lecture anonyme autorisée par la RLS de `signataire`).
  // Le document, lui, vit dans des tables strictement cloisonnées (demande_signature, document) :
  // il se lit avec l'entrepriseId de la ligne du signataire, jamais dans une jointure anonyme.
  const [leSignataire] = /^[A-Za-z0-9]{20,64}$/.test(jeton) ? await db.select().from(signataire).where(eq(signataire.jetonAcces, jeton)) : [];
  const nomDocument = leSignataire
    ? await avecEntreprise(leSignataire.entrepriseId, async (tx) => {
        const [r] = await tx
          .select({ nom: document.nom })
          .from(demandeSignature)
          .innerJoin(document, eq(demandeSignature.documentId, document.id))
          .where(eq(demandeSignature.id, leSignataire.demandeSignatureId));
        return r?.nom ?? null;
      })
    : null;
  const ligne = leSignataire && nomDocument ? { signataire: leSignataire, nomDocument } : null;

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
              {ligne.signataire.signeLe ? ` le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Douala" }).format(ligne.signataire.signeLe)} (heure de Yaoundé)` : ""}.
              {" "}Une copie signée vous est envoyée par email.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : ligne.signataire.statut === "REFUSE" ? (
        <p className="relative text-marque-bleu-100/90">Vous avez refusé de signer ce document. Merci de votre réponse.</p>
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
          <CardContent className="flex flex-col gap-4">
            <a href={`/signature/${jeton}/document`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" }) + " w-fit"}>
              Lire le document avant de signer
            </a>
            <FormulaireSignature jeton={jeton} emailConnu={Boolean(ligne.signataire.email)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
