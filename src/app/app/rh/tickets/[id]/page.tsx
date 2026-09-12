import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { ArrowLeft, Ticket } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { utilisateur, categorieTicketRH, ticketRH, messageTicketRH } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { peutVoirTicket } from "@/lib/rh/ticket";
import { Badge } from "@/components/ui/badge";
import { ControlesTicket } from "./controles-ticket";
import { ListeMessagesTicket } from "./liste-messages-ticket";
import { FormulaireMessageTicket } from "./formulaire-message-ticket";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  OUVERT: { libelle: "Ouvert", variante: "warning" },
  EN_COURS: { libelle: "En cours", variante: "warning" },
  RESOLU: { libelle: "Résolu", variante: "success" },
  FERME: { libelle: "Fermé", variante: "neutral" },
};

export default async function PageTicketRH({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "VOIR")) notFound();

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leTicket] = await tx
      .select({
        id: ticketRH.id,
        titre: ticketRH.titre,
        description: ticketRH.description,
        statut: ticketRH.statut,
        demandeurId: ticketRH.demandeurId,
        demandeurNom: utilisateur.nomComplet,
        assigneAId: ticketRH.assigneAId,
        categorieNom: categorieTicketRH.nom,
        creeLe: ticketRH.creeLe,
      })
      .from(ticketRH)
      .innerJoin(categorieTicketRH, eq(ticketRH.categorieId, categorieTicketRH.id))
      .innerJoin(utilisateur, eq(ticketRH.demandeurId, utilisateur.id))
      .where(eq(ticketRH.id, id));
    if (!leTicket) return null;
    if (!peutVoirTicket(utilisateurConnecte, leTicket)) return null;

    const messages = await tx
      .select({ id: messageTicketRH.id, contenu: messageTicketRH.contenu, auteurNom: utilisateur.nomComplet, creeLe: messageTicketRH.creeLe })
      .from(messageTicketRH)
      .innerJoin(utilisateur, eq(messageTicketRH.auteurId, utilisateur.id))
      .where(eq(messageTicketRH.ticketId, id))
      .orderBy(asc(messageTicketRH.creeLe));

    const agents = utilisateurConnecte.role === "ADMIN" ? await tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)) : [];

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
      <Link href="/app/rh/tickets" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Assistance RH
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Ticket className="size-5" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{leTicket.titre}</h1>
            <p className="text-sm text-muted-foreground">
              {leTicket.categorieNom} — ouvert par {leTicket.demandeurNom} le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(leTicket.creeLe)}
            </p>
          </div>
        </div>
        <Badge variant={info.variante}>{info.libelle}</Badge>
      </div>

      {leTicket.description ? <p className="whitespace-pre-line text-sm text-muted-foreground">{leTicket.description}</p> : null}

      {peutChangerStatut || peutReassigner ? (
        <ControlesTicket
          ticketId={leTicket.id}
          statut={leTicket.statut}
          peutChangerStatut={peutChangerStatut}
          peutReassigner={peutReassigner}
          agents={agents}
          agentActuelId={leTicket.assigneAId}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Messages</h2>
        <ListeMessagesTicket messages={messages} />
        <FormulaireMessageTicket ticketId={leTicket.id} />
      </div>
    </div>
  );
}
