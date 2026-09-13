import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { LifeBuoy } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { categorieTicketSupport, ticketSupport } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { resoudreMonContact } from "@/lib/portail/acces";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouveauTicketPortail } from "./formulaire-nouveau-ticket-portail";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  OUVERT: { libelle: "Ouvert", variante: "warning" },
  EN_COURS: { libelle: "En cours", variante: "warning" },
  RESOLU: { libelle: "Résolu", variante: "success" },
  FERME: { libelle: "Fermé", variante: "neutral" },
};

export default async function PagePortail() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "CLIENT") redirect("/app");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const monContact = await resoudreMonContact(tx, utilisateurConnecte);
    if (!monContact) return null;

    const categories = await tx.select({ id: categorieTicketSupport.id, nom: categorieTicketSupport.nom }).from(categorieTicketSupport).where(eq(categorieTicketSupport.entrepriseId, utilisateurConnecte.entrepriseId));

    const tickets = await tx
      .select({ id: ticketSupport.id, titre: ticketSupport.titre, statut: ticketSupport.statut, categorieNom: categorieTicketSupport.nom, creeLe: ticketSupport.creeLe })
      .from(ticketSupport)
      .innerJoin(categorieTicketSupport, eq(ticketSupport.categorieId, categorieTicketSupport.id))
      .where(eq(ticketSupport.contactId, monContact.id))
      .orderBy(desc(ticketSupport.creeLe));

    return { categories, tickets };
  });

  // Le layout portail (src/app/portail/layout.tsx) affiche déjà le message
  // "compte non lié" si monContact est absent — ne jamais dupliquer cet
  // écran ici, seulement se retirer proprement si jamais atteint.
  if (!donnees) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <LifeBuoy className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Mes tickets d&apos;assistance</h1>
        </div>
        <FormulaireNouveauTicketPortail categories={donnees.categories} />
      </div>

      {donnees.categories.length === 0 ? <p className="text-sm text-muted-foreground">Aucune catégorie d&apos;assistance n&apos;est encore configurée.</p> : null}

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {donnees.tickets.map((t) => {
            const info = LIBELLE_STATUT[t.statut] ?? { libelle: t.statut, variante: "neutral" as const };
            return (
              <Link key={t.id} href={`/portail/tickets/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.titre}</p>
                  <p className="text-xs text-muted-foreground">{t.categorieNom}</p>
                </div>
                <Badge variant={info.variante}>{info.libelle}</Badge>
              </Link>
            );
          })}
          {donnees.tickets.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun ticket pour le moment.</p> : null}
        </div>
      </Card>
    </div>
  );
}
