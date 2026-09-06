import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Phone, Mail, Building2, ArrowRightCircle } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { lead } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { STATUT_LEAD } from "@/lib/libelles";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditeurNotes } from "@/components/editeur-notes";
import { ChangeurStatutLead } from "./changeur-statut-lead";
import { convertirLeadAction, modifierNotesLead } from "@/lib/actions/lead";

export default async function PageFicheLead({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const fiche = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    const [ligne] = await tx.select().from(lead).where(eq(lead.id, id));
    if (!ligne) return null;
    if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return null;
    return ligne;
  });

  if (!fiche) notFound();
  const info = STATUT_LEAD[fiche.statut];
  const peutModifier = peut(utilisateurConnecte.role, "CRM", "MODIFIER");
  const modifierNotesAction = modifierNotesLead.bind(null, fiche.id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{fiche.nom}</h1>
            <Badge variant={fiche.convertiLe ? "success" : info?.variante ?? "neutral"}>{fiche.convertiLe ? "Converti" : info?.libelle ?? fiche.statut}</Badge>
          </div>
          {fiche.societeCliente ? (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="size-3.5" aria-hidden />
              {fiche.societeCliente}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5" aria-hidden />
              {fiche.telephone}
            </span>
            {fiche.email ? (
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5" aria-hidden />
                {fiche.email}
              </span>
            ) : null}
          </div>
        </div>

        {peutModifier && !fiche.convertiLe ? (
          <form action={convertirLeadAction.bind(null, fiche.id)}>
            <Button type="submit" size="sm">
              <ArrowRightCircle data-icon="inline-start" aria-hidden />
              Convertir en Contact/Deal
            </Button>
          </form>
        ) : fiche.convertiLe && fiche.dealConvertiId ? (
          <Button size="sm" variant="outline" render={<Link href={`/app/deals/${fiche.dealConvertiId}`} />} nativeButton={false}>
            Voir le Deal
          </Button>
        ) : null}
      </div>

      {peutModifier && !fiche.convertiLe ? <ChangeurStatutLead leadId={fiche.id} statutActuel={fiche.statut} /> : null}

      <Card>
        <CardContent>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Notes</h2>
          {peutModifier ? (
            <EditeurNotes notesInitiales={fiche.notes} onEnregistrer={modifierNotesAction} />
          ) : (
            <p className="text-sm text-muted-foreground">{fiche.notes || "Aucune note."}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
