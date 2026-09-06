import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { UserPlus } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { contact, compteClient } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { Button } from "@/components/ui/button";
import { RechercheContacts } from "./recherche-contacts";

export default async function PageContacts() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const contacts = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    const lignes = await tx
      .select({ id: contact.id, nom: contact.nom, telephone: contact.telephone, email: contact.email, compteNom: compteClient.nom, assigneAId: contact.assigneAId })
      .from(contact)
      .leftJoin(compteClient, eq(contact.compteId, compteClient.id));
    return visibles === "TOUT" ? lignes : lignes.filter((c) => visibles.includes(c.assigneAId));
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">
            {contacts.length} contact{contacts.length > 1 ? "s" : ""} visible{contacts.length > 1 ? "s" : ""}.
          </p>
        </div>
        {peut(utilisateurConnecte.role, "CRM", "CREER") ? (
          <Button render={<Link href="/app/contacts/nouveau" />} nativeButton={false}>
            <UserPlus data-icon="inline-start" aria-hidden />
            Nouveau contact
          </Button>
        ) : null}
      </div>

      <RechercheContacts contacts={contacts} />
    </div>
  );
}
