import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, ne, and, asc } from "drizzle-orm";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { utilisateur, contact, categorieTicketSupport, ticketSupport, messageTicketSupport } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { peutVoirTicketSupport, resoudreMonContact } from "@/lib/portail/acces";
import { Badge } from "@/components/ui/badge";
import { ControlesTicketSupport } from "./controles-ticket-support";
import { ListeMessagesTicket } from "@/app/app/rh/tickets/[id]/liste-messages-ticket";
import { FormulaireMessageSupport } from "./formulaire-message-support";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  OUVERT: { libelle: "Ouvert", variante: "warning" },
  EN_COURS: { libelle: "En cours", variante: "warning" },
  RESOLU: { libelle: "Résolu", variante: "success" },
  FERME: { libelle: "Fermé", variante: "neutral" },
};

export default async function PageTicketSupport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "SUPPORT", "VOIR")) notFound();

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leTicket] = await tx
      .select({
        id: ticketSupport.id,
        titre: ticketSupport.titre,
        description: ticketSupport.description,
        statut: ticketSupport.statut,
        contactId: ticketSupport.contactId,
        contactNom: contact.nom,
        assigneAId: ticketSupport.assigneAId,
        categorieNom: categorieTicketSupport.nom,
        creeLe: ticketSupport.creeLe,
      })
      .from(ticketSupport)
      .innerJoin(categorieTicketSupport, eq(ticketSupport.categorieId, categorieTicketSupport.id))
      .innerJoin(contact, eq(ticketSupport.contactId, contact.id))
      .where(eq(ticketSupport.id, id));
    if (!leTicket) return null;

    const monContact = await resoudreMonContact(tx, utilisateurConnecte);
    if (!peutVoirTicketSupport(utilisateurConnecte, monContact?.id ?? null, leTicket)) return null;

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

    const agents =
      utilisateurConnecte.role === "ADMIN"
        ? await tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), ne(utilisateur.role, "CLIENT")))
        : [];

    return { leTicket, messages, agents };
  });

  if (!donnees) notFound();
  const { leTicket, messages, agents } = donnees;

  const info = LIBELLE_STATUT[leTicket.statut] ?? { libelle: leTicket.statut, variante: "neutral" as const };
  const estAgent = utilisateurConnecte.utilisateurId === leTicket.assigneAId;
  const peutChangerStatut = estAgent || utilisateurConnecte.role === "ADMIN";
  const peutReassigner = utilisateurConnecte.role === "ADMIN";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/support" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Assistance client
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <LifeBuoy className="size-5" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{leTicket.titre}</h1>
            <p className="text-sm text-muted-foreground">
              {leTicket.categorieNom} — ouvert par {leTicket.contactNom} le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(leTicket.creeLe)}
            </p>
          </div>
        </div>
        <Badge variant={info.variante}>{info.libelle}</Badge>
      </div>

      {leTicket.description ? <p className="whitespace-pre-line text-sm text-muted-foreground">{leTicket.description}</p> : null}

      {peutChangerStatut || peutReassigner ? (
        <ControlesTicketSupport ticketId={leTicket.id} statut={leTicket.statut} peutChangerStatut={peutChangerStatut} peutReassigner={peutReassigner} agents={agents} agentActuelId={leTicket.assigneAId} />
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Messages</h2>
        <ListeMessagesTicket messages={messages} />
        <FormulaireMessageSupport ticketId={leTicket.id} />
      </div>
    </div>
  );
}
