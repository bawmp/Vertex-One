import { eq } from "drizzle-orm";
import Link from "next/link";
import { Download } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { facture } from "@/db/schema";
import { chargerDevisParJeton } from "@/lib/client-documents/chargement";
import { obtenirOuCreerLien } from "@/lib/client-documents/liens";
import { CadreDocumentClient, LignesDocumentClient } from "@/components/document-client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ReponseDevis } from "./reponse-devis";

const formatDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(d);

/**
 * Page publique du devis envoyé au client — sans compte : le jeton du lien est
 * l'unique autorisation. Le client consulte le devis, l'accepte ou le refuse ;
 * l'acceptation crée la facture et l'amène à la payer maintenant ou plus tard.
 */
export default async function PageDevisClient({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const donnees = await chargerDevisParJeton(jeton);

  if (!donnees) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Ce lien n&apos;est pas valide ou n&apos;est plus disponible.</p>
      </div>
    );
  }

  const { devis, lignes, client, entreprise, entrepriseId } = donnees;
  const expire = devis.statut === "ENVOYE" && devis.dateValidite < new Date();

  // Devis déjà accepté : on renvoie le client vers sa facture (créée à l'acceptation).
  const factureJeton =
    devis.statut === "ACCEPTE"
      ? await avecEntreprise(entrepriseId, async (tx) => {
          const [f] = await tx.select({ id: facture.id }).from(facture).where(eq(facture.devisOrigineId, devis.id));
          return f ? obtenirOuCreerLien(tx, entrepriseId, { factureId: f.id }) : null;
        })
      : null;

  return (
    <CadreDocumentClient entrepriseId={entrepriseId} logoCleStockage={entreprise.logoCleStockage} nomEntreprise={entreprise.nom}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Devis</p>
          <h1 className="text-2xl font-semibold tracking-tight">{devis.numero}</h1>
          <p className="text-sm text-muted-foreground">
            Pour {client.societeCliente ? `${client.societeCliente} — ` : ""}
            {client.nom}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          {devis.statut === "ACCEPTE" ? <Badge variant="success">Accepté</Badge> : devis.statut === "REFUSE" ? <Badge variant="neutral">Refusé</Badge> : expire ? <Badge variant="warning">Expiré</Badge> : null}
          <p className="text-muted-foreground">Valable jusqu&apos;au {formatDate(devis.dateValidite)}</p>
        </div>
      </div>

      <LignesDocumentClient lignes={lignes} montantHT={devis.montantHT} montantTVA={devis.montantTVA} montantTTC={devis.montantTTC} />

      <Link href={`/devis/${jeton}/pdf`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" }) + " self-start"}>
        <Download data-icon="inline-start" aria-hidden />
        Télécharger le PDF
      </Link>

      {devis.statut === "ENVOYE" && !expire ? (
        <ReponseDevis jeton={jeton} />
      ) : devis.statut === "ACCEPTE" ? (
        <div className="flex flex-col gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-medium">Ce devis a été accepté{devis.reponseLe ? ` le ${formatDate(devis.reponseLe)}` : ""}. Merci !</p>
          {factureJeton ? (
            <Link href={`/facture/${factureJeton}`} className="w-fit font-medium underline underline-offset-4">
              Voir et régler la facture
            </Link>
          ) : null}
        </div>
      ) : devis.statut === "REFUSE" ? (
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Ce devis a été refusé{devis.reponseLe ? ` le ${formatDate(devis.reponseLe)}` : ""}.</p>
      ) : expire ? (
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Ce devis a expiré. Contactez {entreprise.nom} pour en obtenir un nouveau.</p>
      ) : (
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Ce devis n&apos;est plus disponible.</p>
      )}
    </CadreDocumentClient>
  );
}
