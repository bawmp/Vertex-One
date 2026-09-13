import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { utilisateur, contact, categorieTicketSupport, ticketSupport, messageTicketSupport } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peutVoirTicketSupport, resoudreMonContact } from "@/lib/portail/acces";
import { Badge } from "@/components/ui/badge";
import { ListeMessagesTicket } from "@/app/app/rh/tickets/[id]/liste-messages-ticket";
import { FormulaireMessagePortail } from "./formulaire-message-portail";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  OUVERT: { libelle: "Ouvert", variante: "warning" },
  EN_COURS: { libelle: "En cours", variante: "warning" },
  RESOLU: { libelle: "Résolu", variante: "success" },
  FERME: { libelle: "Fermé", variante: "neutral" },
};

export default async function PageTicketPortail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "CLIENT") redirect("/app");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const monContact = await resoudreMonContact(tx, utilisateurConnecte);
    if (!monContact) return null;

    const [leTicket] = await tx
      .select({
        id: ticketSupport.id,
        titre: ticketSupport.titre,
        description: ticketSupport.description,
        statut: ticketSupport.statut,
        contactId: ticketSupport.contactId,
        assigneAId: ticketSupport.assigneAId,
        categorieNom: categorieTicketSupport.nom,
        creeLe: ticketSupport.creeLe,
      })
      .from(ticketSupport)
      .innerJoin(categorieTicketSupport, eq(ticketSupport.categorieId, categorieTicketSupport.id))
      .where(eq(ticketSupport.id, id));
    if (!leTicket) return null;
    if (!peutVoirTicketSupport(utilisateurConnecte, monContact.id, leTicket)) return null;

    const messagesBruts = await tx
      .select({
        id: messageTicketSupport.id,
        contenu: messageTicketSupport.contenu,
        creeLe: messageTicketSupport.creeLe,
        auteurUtilisateurNom: utilisateur.nomComplet,
        auteurContactNom: contact.nom,
      })
      .from(messageTicketSupport)
      .leftJoin(utilisateur, eq(messageTicketSupport.auteurUtilisateurId, utilisateur.id))
      .leftJoin(contact, eq(messageTicketSupport.auteurContactId, contact.id))
      .where(eq(messageTicketSupport.ticketId, id))
      .orderBy(asc(messageTicketSupport.creeLe));

    const messages = messagesBruts.map((m) => ({ id: m.id, contenu: m.contenu, creeLe: m.creeLe, auteurNom: m.auteurUtilisateurNom ?? m.auteurContactNom ?? "Inconnu" }));

    return { leTicket, messages };
  });

  if (!donnees) notFound();
  const { leTicket, messages } = donnees;
  const info = LIBELLE_STATUT[leTicket.statut] ?? { libelle: leTicket.statut, variante: "neutral" as const };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/portail" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Mes tickets
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <LifeBuoy className="size-5" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{leTicket.titre}</h1>
            <p className="text-sm text-muted-foreground">
              {leTicket.categorieNom} — ouvert le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(leTicket.creeLe)}
            </p>
          </div>
        </div>
        <Badge variant={info.variante}>{info.libelle}</Badge>
      </div>

      {leTicket.description ? <p className="whitespace-pre-line text-sm text-muted-foreground">{leTicket.description}</p> : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Messages</h2>
        <ListeMessagesTicket messages={messages} />
        <FormulaireMessagePortail ticketId={leTicket.id} />
      </div>
    </div>
  );
}
