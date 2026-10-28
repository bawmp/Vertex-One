import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { compteClient, contact } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { getT } from "@/lib/i18n/langue";
import { FormulaireModifierContact } from "./formulaire-modifier-contact";

export default async function PageModifierContact({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas le droit de modifier ce contact.")}</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    const [ligne] = await tx.select().from(contact).where(eq(contact.id, id));
    if (!ligne || (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId))) return null;
    const comptes = await tx.select({ id: compteClient.id, nom: compteClient.nom }).from(compteClient);
    return { ligne, comptes };
  });
  if (!donnees) notFound();
  const { ligne, comptes } = donnees;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/app/contacts/${ligne.id}`} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {ligne.nom}
      </Link>
      <FormulaireModifierContact contact={{ id: ligne.id, nom: ligne.nom, compteId: ligne.compteId, fonction: ligne.fonction, telephone: ligne.telephone, email: ligne.email }} comptes={comptes} />
    </div>
  );
}
