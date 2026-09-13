import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, ne, inArray, desc } from "drizzle-orm";
import { LifeBuoy, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, categorieTicketSupport, ticketSupport } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponibleAddon } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonActiverSupport } from "./bouton-activer-support";
import { FormulaireNouvelleCategorie } from "./formulaire-nouvelle-categorie";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  OUVERT: { libelle: "Ouvert", variante: "warning" },
  EN_COURS: { libelle: "En cours", variante: "warning" },
  RESOLU: { libelle: "Résolu", variante: "success" },
  FERME: { libelle: "Fermé", variante: "neutral" },
};

export default async function PageSupport() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "SUPPORT", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès à l&apos;Assistance client.</p>
      </div>
    );
  }

  const estAdmin = utilisateurConnecte.role === "ADMIN";

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    const actif = await disponibleAddon(tx, monEntreprise, "SUPPORT");
    if (!actif) return { actif: false as const };

    const categories = await tx.select({ id: categorieTicketSupport.id, nom: categorieTicketSupport.nom }).from(categorieTicketSupport).where(eq(categorieTicketSupport.entrepriseId, utilisateurConnecte.entrepriseId));

    const idsPortee = await idsVisibles(tx, utilisateurConnecte, "SUPPORT");

    const tickets = await tx
      .select({
        id: ticketSupport.id,
        titre: ticketSupport.titre,
        statut: ticketSupport.statut,
        categorieNom: categorieTicketSupport.nom,
        contactNom: contact.nom,
        creeLe: ticketSupport.creeLe,
      })
      .from(ticketSupport)
      .innerJoin(categorieTicketSupport, eq(ticketSupport.categorieId, categorieTicketSupport.id))
      .innerJoin(contact, eq(ticketSupport.contactId, contact.id))
      .where(
        and(
          eq(ticketSupport.entrepriseId, utilisateurConnecte.entrepriseId),
          idsPortee === "TOUT" ? undefined : inArray(ticketSupport.assigneAId, idsPortee)
        )
      )
      .orderBy(desc(ticketSupport.creeLe));

    const tousLesUtilisateurs = estAdmin
      ? await tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), ne(utilisateur.role, "CLIENT")))
      : [];

    return { actif: true as const, categories, tickets, tousLesUtilisateurs };
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <LifeBuoy className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Assistance client</h1>
      </div>

      {!donnees.actif ? (
        estAdmin ? (
          <BoutonActiverSupport />
        ) : (
          <p className="text-sm text-muted-foreground">Le module Assistance client n&apos;est pas activé — demandez à un Administrateur de l&apos;activer.</p>
        )
      ) : (
        <>
          {donnees.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">{estAdmin ? "Créez une première catégorie pour permettre l'ouverture de tickets." : "Aucune catégorie n'a encore été configurée."}</p>
          ) : null}

          {estAdmin ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">Catégories</h2>
              <div className="flex flex-wrap gap-2">
                {donnees.categories.map((c) => (
                  <Badge key={c.id} variant="neutral">
                    {c.nom}
                  </Badge>
                ))}
              </div>
              <FormulaireNouvelleCategorie utilisateurs={donnees.tousLesUtilisateurs} />
            </div>
          ) : null}

          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {donnees.tickets.map((t) => {
                const info = LIBELLE_STATUT[t.statut] ?? { libelle: t.statut, variante: "neutral" as const };
                return (
                  <Link key={t.id} href={`/app/support/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.titre}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.categorieNom} — {t.contactNom}
                      </p>
                    </div>
                    <Badge variant={info.variante}>{info.libelle}</Badge>
                  </Link>
                );
              })}
              {donnees.tickets.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun ticket pour le moment.</p> : null}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
