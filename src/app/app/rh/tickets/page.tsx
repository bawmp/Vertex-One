import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, or, desc } from "drizzle-orm";
import { ArrowLeft, Lock, Ticket } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, categorieTicketRH, ticketRH } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouvelleCategorie } from "./formulaire-nouvelle-categorie";
import { FormulaireNouveauTicket } from "./formulaire-nouveau-ticket";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  OUVERT: { libelle: "Ouvert", variante: "warning" },
  EN_COURS: { libelle: "En cours", variante: "warning" },
  RESOLU: { libelle: "Résolu", variante: "success" },
  FERME: { libelle: "Fermé", variante: "neutral" },
};

export default async function PageTicketsRH() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès aux Ressources Humaines.</p>
      </div>
    );
  }

  const estAdmin = utilisateurConnecte.role === "ADMIN";

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    const categories = await tx.select({ id: categorieTicketRH.id, nom: categorieTicketRH.nom }).from(categorieTicketRH).where(eq(categorieTicketRH.entrepriseId, utilisateurConnecte.entrepriseId));

    // Visibilité : le demandeur, l'agent assigné, ou l'Administrateur —
    // même garde que peutVoirTicket() (src/lib/rh/ticket.ts).
    const tickets = await tx
      .select({
        id: ticketRH.id,
        titre: ticketRH.titre,
        statut: ticketRH.statut,
        categorieNom: categorieTicketRH.nom,
        demandeurNom: utilisateur.nomComplet,
        creeLe: ticketRH.creeLe,
      })
      .from(ticketRH)
      .innerJoin(categorieTicketRH, eq(ticketRH.categorieId, categorieTicketRH.id))
      .innerJoin(utilisateur, eq(ticketRH.demandeurId, utilisateur.id))
      .where(estAdmin ? eq(ticketRH.entrepriseId, utilisateurConnecte.entrepriseId) : or(eq(ticketRH.demandeurId, utilisateurConnecte.utilisateurId), eq(ticketRH.assigneAId, utilisateurConnecte.utilisateurId)))
      .orderBy(desc(ticketRH.creeLe));

    const tousLesUtilisateurs = estAdmin ? await tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)) : [];

    return { categories, tickets, tousLesUtilisateurs };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les Ressources Humaines sont disponibles à partir du forfait Business.</p>
      </div>
    );
  }

  const { categories, tickets, tousLesUtilisateurs } = donnees;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Ressources Humaines
      </Link>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Ticket className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Assistance RH</h1>
        </div>
        <FormulaireNouveauTicket categories={categories} />
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">{estAdmin ? "Créez une première catégorie pour permettre l'ouverture de tickets." : "Aucune catégorie n'a encore été configurée."}</p>
      ) : null}

      {estAdmin ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Catégories</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Badge key={c.id} variant="neutral">
                {c.nom}
              </Badge>
            ))}
          </div>
          <FormulaireNouvelleCategorie utilisateurs={tousLesUtilisateurs} />
        </div>
      ) : null}

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {tickets.map((t) => {
            const info = LIBELLE_STATUT[t.statut] ?? { libelle: t.statut, variante: "neutral" as const };
            return (
              <Link key={t.id} href={`/app/rh/tickets/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.titre}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.categorieNom} — {t.demandeurNom}
                  </p>
                </div>
                <Badge variant={info.variante}>{info.libelle}</Badge>
              </Link>
            );
          })}
          {tickets.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun ticket pour le moment.</p> : null}
        </div>
      </Card>
    </div>
  );
}
