import { redirect } from "next/navigation";
import { eq, desc, inArray } from "drizzle-orm";
import { Megaphone, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { annonce, utilisateur, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { FormulaireAnnonce } from "./formulaire-annonce";
import { LigneAnnonce } from "./ligne-annonce";

export default async function PageAnnonces() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    // Palier 3, section 8 — Messagerie/Documents/Annonces verrouillés
    // ensemble au forfait Pro, comme les Dossiers/Projets.
    if (!disponible(monEntreprise, "CHAT_INTERNE")) return null;

    // Portée toujours TOUT en lecture (docs/palier-3-*, section 7) —
    // épinglées d'abord, puis les plus récentes.
    const lignes = await tx
      .select()
      .from(annonce)
      .where(eq(annonce.entrepriseId, utilisateurConnecte.entrepriseId))
      .orderBy(desc(annonce.epinglee), desc(annonce.creeLe));

    const idsAuteurs = [...new Set(lignes.map((a) => a.auteurId))];
    const auteurs =
      idsAuteurs.length > 0
        ? await tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(inArray(utilisateur.id, idsAuteurs))
        : [];

    return { annonces: lignes, auteursParId: Object.fromEntries(auteurs.map((u) => [u.id, u.nomComplet])) };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les Annonces sont disponibles à partir du forfait Pro.</p>
      </div>
    );
  }

  const { annonces, auteursParId } = donnees;
  const peutCreer = peut(utilisateurConnecte.role, "ANNONCES", "CREER");
  const peutGerer = peut(utilisateurConnecte.role, "ANNONCES", "MODIFIER");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Megaphone className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Annonces</h1>
      </div>

      {peutCreer ? <FormulaireAnnonce /> : null}

      <div className="flex flex-col gap-3">
        {annonces.map((a) => (
          <LigneAnnonce
            key={a.id}
            id={a.id}
            contenu={a.contenu}
            auteurNom={auteursParId[a.auteurId] ?? "Utilisateur"}
            creeLe={a.creeLe}
            epinglee={a.epinglee}
            peutGerer={peutGerer}
          />
        ))}
        {annonces.length === 0 ? <p className="text-sm text-muted-foreground">Aucune annonce pour le moment.</p> : null}
      </div>
    </div>
  );
}
