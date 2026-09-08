import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { ArrowLeft, LogOut } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { dossierRH, utilisateur, demandeDepart, clearanceDepart } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { FormulaireDemandeDepart } from "./formulaire-demande-depart";
import { ListeDemandesDepart } from "./liste-demandes-depart";
import { FormulaireClearance } from "./formulaire-clearance";
import { ListeClearances } from "./liste-clearances";
import { FormulaireCloture } from "./formulaire-cloture";

export default async function PageDepartRH({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "VOIR")) notFound();

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [ligne] = await tx
      .select({ id: dossierRH.id, utilisateurId: dossierRH.utilisateurId, nomComplet: utilisateur.nomComplet })
      .from(dossierRH)
      .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
      .where(eq(dossierRH.id, id));
    if (!ligne) return null;

    const estProprietaire = ligne.utilisateurId === utilisateurConnecte.utilisateurId;
    if (!estProprietaire) {
      const ids = await idsVisibles(tx, utilisateurConnecte, "RH");
      if (ids !== "TOUT" && !ids.includes(ligne.utilisateurId)) return null;
    }

    const demandes = await tx.select().from(demandeDepart).where(eq(demandeDepart.dossierRHId, id)).orderBy(desc(demandeDepart.creeLe));
    const demandeActive = demandes.find((d) => d.statut === "APPROUVEE");
    const aUneDemandeEnCours = demandes.some((d) => d.statut === "EN_ATTENTE" || d.statut === "APPROUVEE");

    const clearances = demandeActive
      ? await tx
          .select({
            id: clearanceDepart.id,
            libelle: clearanceDepart.libelle,
            responsableId: clearanceDepart.responsableId,
            responsableNom: utilisateur.nomComplet,
            complete: clearanceDepart.complete,
            completeLe: clearanceDepart.completeLe,
          })
          .from(clearanceDepart)
          .innerJoin(utilisateur, eq(clearanceDepart.responsableId, utilisateur.id))
          .where(eq(clearanceDepart.demandeDepartId, demandeActive.id))
      : [];

    const collegues = await tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId));

    return { ligne, estProprietaire, demandes, demandeActive, aUneDemandeEnCours, clearances, collegues };
  });

  if (!donnees) notFound();
  const { ligne, estProprietaire, demandes, demandeActive, aUneDemandeEnCours, clearances, collegues } = donnees;

  const peutTraiter = !estProprietaire && peut(utilisateurConnecte.role, "RH", "MODIFIER");
  const peutGererClearances = peut(utilisateurConnecte.role, "RH", "MODIFIER");
  const toutesLesClearancesCompletes = clearances.every((c) => c.complete);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href={`/app/rh/${ligne.id}`} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour au dossier
      </Link>

      <div className="flex items-center gap-2.5">
        <LogOut className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Départ — {ligne.nomComplet}</h1>
      </div>

      {estProprietaire && !aUneDemandeEnCours ? <FormulaireDemandeDepart /> : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Demandes</h2>
        <ListeDemandesDepart demandes={demandes} peutTraiter={peutTraiter} />
      </div>

      {demandeActive ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Clôtures</h2>
            {peutGererClearances ? <FormulaireClearance demandeDepartId={demandeActive.id} collegues={collegues} /> : null}
          </div>
          <ListeClearances clearances={clearances} utilisateurId={utilisateurConnecte.utilisateurId} peutSupprimer={peutGererClearances} />
          {utilisateurConnecte.role === "ADMIN" ? (
            <div className="flex flex-col gap-2">
              {!toutesLesClearancesCompletes ? (
                <p className="text-xs text-muted-foreground">Toutes les clôtures doivent être validées avant de pouvoir clôturer le départ.</p>
              ) : null}
              <FormulaireCloture demandeDepartId={demandeActive.id} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
