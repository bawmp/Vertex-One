"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FileSignature, PenTool, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { resilierContrat } from "@/lib/actions/contrat";
import { creerDemandeSignature } from "@/lib/actions/signature";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  ACTIF: { libelle: "Actif", variante: "success" },
  EXPIRE: { libelle: "Expiré", variante: "warning" },
  RESILIE: { libelle: "Résilié", variante: "neutral" },
};

type Signature = { demandeId: string; statut: string; signeLe: Date | null };

type Contrat = {
  id: string;
  titre: string;
  dateDebut: Date;
  dateFin: Date | null;
  renouvellementAuto: boolean;
  statut: string;
  signature: Signature | null;
};

export type ClientParDefaut = { nom: string; telephone: string; email: string | null };

/** Envoi d'un contrat au client pour signature : le document à faire signer, et le signataire (pré-rempli avec le client du dossier). */
function FormulaireEnvoiContrat({ contratId, documents, client }: { contratId: string; documents: { id: string; nom: string }[]; client: ClientParDefaut | null }) {
  const [etat, action, enCours] = useActionState(creerDemandeSignature, null);

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">Ajoutez d&apos;abord le document du contrat (PDF) dans la section Documents de ce dossier, puis envoyez-le à signer ici.</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="contratId" value={contratId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`doc-${contratId}`}>Document du contrat à faire signer</Label>
        <Select id={`doc-${contratId}`} name="documentId" required>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nom}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`nom-${contratId}`}>Nom du signataire</Label>
          <Input id={`nom-${contratId}`} name="nom" defaultValue={client?.nom ?? ""} required minLength={2} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`tel-${contratId}`}>Téléphone</Label>
          <Input id={`tel-${contratId}`} name="telephone" defaultValue={client?.telephone ?? ""} required minLength={8} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`email-${contratId}`}>Email (le code de vérification y sera envoyé)</Label>
          <Input id={`email-${contratId}`} name="email" type="email" defaultValue={client?.email ?? ""} required />
        </div>
      </div>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.succes ? <p className="text-sm text-emerald-700">{etat.succes}</p> : null}
      <Button type="submit" size="sm" disabled={enCours} className="w-fit">
        {enCours ? <Spinner /> : <PenTool data-icon="inline-start" aria-hidden />}
        {enCours ? "Envoi…" : "Envoyer le contrat au client"}
      </Button>
    </form>
  );
}

function BadgeSignature({ signature }: { signature: Signature }) {
  const dateSignature = signature.signeLe ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Douala" }).format(signature.signeLe) : null;
  if (signature.statut === "SIGNE") return <Badge variant="success">Signé{dateSignature ? ` le ${dateSignature}` : ""}</Badge>;
  if (signature.statut === "REFUSE") return <Badge variant="warning">Signature refusée</Badge>;
  if (signature.statut === "EXPIRE") return <Badge variant="neutral">Signature expirée</Badge>;
  return <Badge variant="info">En attente de signature</Badge>;
}

export function ListeContrats({
  contrats,
  peutModifier,
  peutEnvoyer = false,
  documents = [],
  client = null,
}: {
  contrats: Contrat[];
  peutModifier: boolean;
  peutEnvoyer?: boolean;
  documents?: { id: string; nom: string }[];
  client?: ClientParDefaut | null;
}) {
  const [enEnvoi, setEnEnvoi] = useState<string | null>(null);

  if (contrats.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun contrat pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {contrats.map((c) => {
          const info = LIBELLE_STATUT[c.statut] ?? { libelle: c.statut, variante: "neutral" as const };
          const peutRenvoyer = !c.signature || c.signature.statut === "REFUSE" || c.signature.statut === "EXPIRE";
          return (
            <div key={c.id} className="flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <p className="flex min-w-0 items-center gap-1.5 truncate">
                  <FileSignature className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{c.titre}</span>
                  {c.renouvellementAuto ? <RefreshCw className="size-3 shrink-0 text-muted-foreground" aria-hidden /> : null}
                </p>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {c.dateFin ? (
                    <span className="text-xs text-muted-foreground">
                      jusqu&apos;au {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(c.dateFin)}
                    </span>
                  ) : null}
                  {c.signature ? <BadgeSignature signature={c.signature} /> : null}
                  {c.signature ? (
                    <Link href={`/app/signatures/${c.signature.demandeId}`} className="text-xs text-primary underline-offset-4 hover:underline">
                      Certificat
                    </Link>
                  ) : null}
                  <Badge variant={info.variante}>{info.libelle}</Badge>
                  {peutEnvoyer && c.statut === "ACTIF" && peutRenvoyer ? (
                    <Button variant="ghost" size="xs" onClick={() => setEnEnvoi(enEnvoi === c.id ? null : c.id)}>
                      <PenTool data-icon="inline-start" aria-hidden />
                      {c.signature ? "Renvoyer à signer" : "Envoyer à signer"}
                    </Button>
                  ) : null}
                  {peutModifier && c.statut === "ACTIF" ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => resilierContrat(c.id)}
                      aria-label={`Résilier ${c.titre}`}
                      className="hover:text-destructive"
                    >
                      ✕
                    </Button>
                  ) : null}
                </div>
              </div>
              {enEnvoi === c.id ? (
                <div className="border-t border-border bg-muted/30 px-4 py-3">
                  <FormulaireEnvoiContrat contratId={c.id} documents={documents} client={client} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
