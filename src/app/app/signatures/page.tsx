import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc, inArray } from "drizzle-orm";
import { FileSignature, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, demandeSignature, document, signataire } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  EN_ATTENTE: { libelle: "En attente", variante: "warning" },
  SIGNE: { libelle: "Signé", variante: "success" },
  REFUSE: { libelle: "Refusé", variante: "neutral" },
  EXPIRE: { libelle: "Expiré", variante: "neutral" },
};

export default async function PageSignatures() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    if (!disponible(monEntreprise, "SIGNATURE_ELECTRONIQUE")) return null;

    // Portée par créateur de la demande (docs/palier-4-*, section 5 ne
    // précise pas ce cas précis — simplification cohérente avec la portée
    // "PROPRE"/"EQUIPE" déjà définie pour SIGNATURE dans permissions.ts).
    const ids = await idsVisibles(tx, utilisateurConnecte, "SIGNATURE");

    const demandes = await tx
      .select({ id: demandeSignature.id, nomDocument: document.nom, statut: demandeSignature.statut, creeLe: demandeSignature.creeLe })
      .from(demandeSignature)
      .innerJoin(document, eq(demandeSignature.documentId, document.id))
      .where(ids === "TOUT" ? eq(demandeSignature.entrepriseId, utilisateurConnecte.entrepriseId) : inArray(demandeSignature.creeParId, ids))
      .orderBy(desc(demandeSignature.creeLe));

    const idsDemandes = demandes.map((d) => d.id);
    const signataires = idsDemandes.length > 0 ? await tx.select().from(signataire).where(inArray(signataire.demandeSignatureId, idsDemandes)) : [];
    const signatairesParDemande = new Map<string, typeof signataires>();
    for (const s of signataires) {
      const liste = signatairesParDemande.get(s.demandeSignatureId) ?? [];
      liste.push(s);
      signatairesParDemande.set(s.demandeSignatureId, liste);
    }

    return { demandes, signatairesParDemande };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La signature électronique est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  const { demandes, signatairesParDemande } = donnees;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <FileSignature className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Signatures</h1>
      </div>

      {demandes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune demande de signature pour le moment — envoyez-en une depuis un document, dans un Dossier ou un Projet.
        </p>
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {demandes.map((d) => {
              const info = LIBELLE_STATUT[d.statut] ?? { libelle: d.statut, variante: "neutral" as const };
              const signatairesDeCetteDemande = signatairesParDemande.get(d.id) ?? [];
              return (
                <Link key={d.id} href={`/app/signatures/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{d.nomDocument}</span>
                    <span className="text-xs text-muted-foreground">{signatairesDeCetteDemande.map((s) => s.nom).join(", ")}</span>
                  </div>
                  <Badge variant={info.variante}>{info.libelle}</Badge>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
