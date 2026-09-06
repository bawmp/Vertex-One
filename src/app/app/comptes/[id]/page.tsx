import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Building2, Phone } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { compteClient, contact } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Card } from "@/components/ui/card";

export default async function PageFicheCompte({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "VOIR")) redirect("/app");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [ligne] = await tx.select().from(compteClient).where(eq(compteClient.id, id));
    if (!ligne) return null;

    const contacts = await tx.select().from(contact).where(eq(contact.compteId, id));
    return { fiche: ligne, contacts };
  });

  if (!donnees) notFound();
  const { fiche, contacts } = donnees;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Building2 className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{fiche.nom}</h1>
      </div>
      {fiche.niu ? <p className="text-sm text-muted-foreground">NIU : {fiche.niu}</p> : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Contacts</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {contacts.map((c) => (
              <Link key={c.id} href={`/app/contacts/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                <span className="font-medium">
                  {c.nom}
                  {c.fonction ? <span className="ml-1.5 text-xs text-muted-foreground">— {c.fonction}</span> : null}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="size-3" aria-hidden />
                  {c.telephone}
                </span>
              </Link>
            ))}
            {contacts.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">Aucun contact rattaché à ce compte.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
