import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { fournisseur, compteComptable } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { FormulaireBonCommande } from "./formulaire-bon-commande";

export default async function PageNouveauBonCommande() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ACHATS", "CREER")) redirect("/app/achats");

  const { fournisseurs, comptesCharge } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [fournisseurs, comptesCharge] = await Promise.all([
      tx.select({ id: fournisseur.id, nom: fournisseur.nom }).from(fournisseur),
      tx.select({ id: compteComptable.id, numero: compteComptable.numero, libelle: compteComptable.libelle }).from(compteComptable).where(eq(compteComptable.classe, 6)),
    ]);
    return { fournisseurs, comptesCharge };
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/app/achats" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Achats
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau bon de commande</h1>
      <FormulaireBonCommande fournisseurs={fournisseurs} comptesCharge={comptesCharge} />
    </div>
  );
}
