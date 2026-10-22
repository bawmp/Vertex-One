import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Lock, PenLine } from "lucide-react";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { listerDocumentsRediges } from "@/lib/actions/redaction";
import { Card } from "@/components/ui/card";
import { FormulaireNouveauDocument, BoutonSupprimerDocument } from "./formulaires";

export default async function PageDocumentsRediges() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const documents = await listerDocumentsRediges();
  if (!documents) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La rédaction de documents n&apos;est pas disponible avec votre abonnement ou vos droits.</p>
      </div>
    );
  }
  const peutCreer = peut(utilisateurConnecte, "DOCUMENTS", "CREER");
  const peutSupprimer = peut(utilisateurConnecte, "DOCUMENTS", "SUPPRIMER");
  const formateur = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/documents" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> One Docs
      </Link>
      <div className="flex items-center gap-2.5">
        <PenLine className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Rédiger un document</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Écrivez une lettre, un contrat, un compte rendu... avec en-tête de votre entreprise, pied de page et numéros de page, puis téléchargez-le en PDF ou en Word, ou ajoutez-le à vos documents.
      </p>
      {peutCreer ? <FormulaireNouveauDocument /> : null}

      <Card className="p-0">
        {documents.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Aucun document rédigé pour le moment.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50">
                <Link href={`/app/documents/rediger/${d.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.titre}</span>
                    <span className="block text-xs text-muted-foreground">Modifié le {formateur.format(d.modifieLe)}</span>
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  <a href={`/app/documents/rediger/${d.id}/export?format=pdf`} className="text-xs text-primary hover:underline">PDF</a>
                  <a href={`/app/documents/rediger/${d.id}/export?format=docx`} className="text-xs text-primary hover:underline">Word</a>
                  {peutSupprimer || d.assigneAId === utilisateurConnecte.utilisateurId ? <BoutonSupprimerDocument id={d.id} titre={d.titre} /> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
