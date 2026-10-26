import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Lock, ListChecks } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, posteOuvert } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponibleAddon } from "@/lib/plans";
import { postesDesPartenaires } from "@/lib/recrutement/partage";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouveauPoste } from "./formulaire-nouveau-poste";
import { CartePoste } from "./carte-poste";

export default async function PagePostesOuverts() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les postes sont réservés à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!(await disponibleAddon(tx, monEntreprise, "RECRUTEMENT"))) return null;

    const postes = await tx.select().from(posteOuvert).where(eq(posteOuvert.entrepriseId, utilisateurConnecte.entrepriseId));
    return { postes };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Le module Recrutement n&apos;est pas activé.</p>
      </div>
    );
  }

  const postesGroupe = await postesDesPartenaires(utilisateurConnecte);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/recrutement" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Recrutement
      </Link>
      <div className="flex items-center gap-2.5">
        <ListChecks className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Postes ouverts</h1>
      </div>

      <FormulaireNouveauPoste />

      <div className="flex flex-col gap-3">
        {donnees.postes.map((p, index) => (
          <CartePoste key={p.id} poste={{ id: p.id, titre: p.titre, description: p.description, lieu: p.lieu, typeContrat: p.typeContrat, actif: p.actif }} index={index} />
        ))}
        {donnees.postes.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucun poste pour le moment.</p> : null}
      </div>

      {postesGroupe.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Postes des autres entreprises du groupe (lecture seule)</h2>
          <div className="flex flex-col divide-y divide-border rounded-lg border">
            {postesGroupe.map((p) => (
              <div key={`${p.entrepriseNom}-${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.titre}</p>
                  <p className="text-xs text-muted-foreground">
                    {[p.lieu, p.typeContrat].filter(Boolean).join(" — ") || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">{p.entrepriseNom}</Badge>
                  <Badge variant={p.actif ? "success" : "neutral"}>{p.actif ? "Actif" : "Désactivé"}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
