import Link from "next/link";
import { Download, CheckCircle2 } from "lucide-react";
import { chargerFactureParJeton } from "@/lib/client-documents/chargement";
import { CadreDocumentClient, LignesDocumentClient } from "@/components/document-client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ReponseFacture } from "./reponse-facture";

const formatDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(d);

/**
 * Page publique de la facture envoyée au client — sans compte, le jeton du lien est
 * l'unique autorisation. Le client accepte (ou conteste) la facture, puis la règle
 * maintenant par Mobile Money ou plus tard depuis ce même lien.
 */
export default async function PageFactureClient({ params, searchParams }: { params: Promise<{ jeton: string }>; searchParams: Promise<{ apres?: string }> }) {
  const { jeton } = await params;
  const { apres } = await searchParams;
  const donnees = await chargerFactureParJeton(jeton);

  if (!donnees) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Ce lien n&apos;est pas valide ou n&apos;est plus disponible.</p>
      </div>
    );
  }

  const { facture, lignes, client, entreprise, entrepriseId } = donnees;
  const payee = facture.statut === "PAYEE";
  const annulee = facture.statut === "ANNULEE";

  return (
    <CadreDocumentClient entrepriseId={entrepriseId} logoCleStockage={entreprise.logoCleStockage} nomEntreprise={entreprise.nom}>
      {apres === "devis" && !payee ? (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Devis accepté, merci ! Voici votre facture : vous pouvez la régler maintenant ou plus tard depuis ce lien (nous vous l&apos;avons aussi envoyé par email).</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Facture</p>
          <h1 className="text-2xl font-semibold tracking-tight">{facture.numero}</h1>
          <p className="text-sm text-muted-foreground">
            Pour {client.societeCliente ? `${client.societeCliente} — ` : ""}
            {client.nom}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          {payee ? <Badge variant="success">Payée</Badge> : annulee ? <Badge variant="neutral">Annulée</Badge> : facture.reponseClient === "CONTESTEE" ? <Badge variant="warning">Contestée</Badge> : facture.reponseClient === "ACCEPTEE" ? <Badge variant="info">Acceptée</Badge> : null}
          <p className="text-muted-foreground">Émise le {formatDate(facture.dateEmission)}</p>
          <p className="text-muted-foreground">Échéance : {formatDate(facture.dateEcheance)}</p>
        </div>
      </div>

      <LignesDocumentClient lignes={lignes} montantHT={facture.montantHT} montantTVA={facture.montantTVA} montantTTC={facture.montantTTC} />

      <Link href={`/facture/${jeton}/pdf`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" }) + " self-start"}>
        <Download data-icon="inline-start" aria-hidden />
        Télécharger le PDF
      </Link>

      {payee ? (
        <p className="rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">Cette facture est réglée. Merci !</p>
      ) : annulee ? (
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Cette facture a été annulée : il n&apos;y a rien à régler.</p>
      ) : (
        <ReponseFacture jeton={jeton} reponse={facture.reponseClient as "ACCEPTEE" | "CONTESTEE" | null} nomEntreprise={entreprise.nom} />
      )}
    </CadreDocumentClient>
  );
}
