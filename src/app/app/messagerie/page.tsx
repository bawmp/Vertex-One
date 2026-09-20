import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { MessageSquare, Lock, Hash, FolderKanban, Users } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { projet, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import {
  assurerCanalGeneral,
  candidatsMentions,
  canauxAccessibles,
  chargerAutour,
  chargerMessages,
  compterNonLus,
  enregistrerActivite,
  estCanalPrive,
  interlocuteursDirects,
  listerCollegues,
  marquerCanalLu,
  membresDuCanal,
  messagerieDisponible,
  ouvrirConversationDirecte,
} from "@/lib/messagerie/acces";
import { Conversation } from "./conversation";
import { FormulaireNouveauCanal } from "./formulaire-nouveau-canal";
import { FormulaireNouveauGroupe } from "./formulaire-nouveau-groupe";
import { GestionGroupe } from "./gestion-groupe";
import { PanneauPersonnes, type DmParCollegue } from "./panneau-personnes";
import { RechercheMessages } from "./recherche-messages";
import { ActiverNotifications } from "./activer-notifications";

const Pastille = ({ nombre }: { nombre: number }) =>
  nombre > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-marque-orange px-1.5 text-xs font-semibold text-white">{nombre > 99 ? "99+" : nombre}</span> : null;

/**
 * One Chat : messagerie intégrée. Les canaux de projet suivent la portée des Projets ; « Général » et les canaux
 * libres sont ouverts à toute l'entreprise ; un message direct ou un groupe privé n'est visible que de ses membres.
 * Les messages vivent dans notre base, cloisonnés par entreprise (RLS) ; la conversation se met à jour toute seule
 * (voir conversation.tsx).
 */
export default async function PageMessagerie({ searchParams }: { searchParams: Promise<{ canal?: string; dm?: string; message?: string }> }) {
  const { canal: canalDemande, dm, message: messageDemande } = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  // Clic sur un collègue : on ouvre (ou crée) la conversation directe, puis on s'y rend.
  if (dm) {
    const idDirect = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => ouvrirConversationDirecte(tx, utilisateurConnecte, dm));
    redirect(idDirect ? `/app/messagerie?canal=${idDirect}` : "/app/messagerie");
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await messagerieDisponible(tx, utilisateurConnecte))) return null;

    await assurerCanalGeneral(tx, utilisateurConnecte.entrepriseId);
    await enregistrerActivite(tx, utilisateurConnecte);
    const tous = await canauxAccessibles(tx, utilisateurConnecte);
    const nonLus = await compterNonLus(tx, utilisateurConnecte, tous.map((c) => c.id));

    const canaux = tous.filter((c) => !estCanalPrive(c.type));
    const groupes = tous.filter((c) => c.type === "PRIVE");
    const directs = tous.filter((c) => c.type === "DIRECT");
    const [collegues, interlocuteurs, [moi]] = await Promise.all([
      listerCollegues(tx, utilisateurConnecte),
      interlocuteursDirects(tx, utilisateurConnecte, directs.map((c) => c.id)),
      tx.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.id, utilisateurConnecte.utilisateurId)),
    ]);
    const dmParCollegue: DmParCollegue = {};
    for (const d of directs) {
      const autreId = interlocuteurs[d.id];
      if (autreId) dmParCollegue[autreId] = { canalId: d.id, nonLus: nonLus[d.id] ?? 0 };
    }

    // Nom lisible de chaque canal, pour les résultats de recherche.
    const nomsCanaux: Record<string, string> = {};
    for (const c of tous) {
      nomsCanaux[c.id] = c.type === "DIRECT" ? (collegues.find((x) => x.id === interlocuteurs[c.id])?.nom ?? "Message direct") : c.type === "PRIVE" ? `🔒 ${c.nom}` : `#${c.nom}`;
    }

    const idsProjets = [...new Set(canaux.map((c) => c.projetId).filter((id): id is string => !!id))];
    const projets = idsProjets.length ? await tx.select({ id: projet.id, titre: projet.titre }).from(projet).where(inArray(projet.id, idsProjets)) : [];

    const choisi = tous.find((c) => c.id === canalDemande) ?? canaux.find((c) => c.type === "EQUIPE") ?? canaux[0] ?? null;
    let messages: Awaited<ReturnType<typeof chargerMessages>> = [];
    let messageCibleId: string | undefined;
    let candidats: { id: string; nom: string }[] = [];
    let membres: { id: string; nom: string }[] = [];
    if (choisi) {
      candidats = await candidatsMentions(tx, utilisateurConnecte, choisi);
      const autour = messageDemande ? await chargerAutour(tx, choisi.id, messageDemande, utilisateurConnecte.utilisateurId) : null;
      if (autour) {
        messages = autour.messages;
        messageCibleId = autour.racineId;
      } else {
        messages = await chargerMessages(tx, choisi.id, utilisateurConnecte.utilisateurId);
      }
      await marquerCanalLu(tx, utilisateurConnecte.entrepriseId, choisi.id, utilisateurConnecte.utilisateurId);
      if (choisi.type === "PRIVE") membres = await membresDuCanal(tx, choisi.id);
    }
    const interlocuteurChoisi = choisi?.type === "DIRECT" ? (collegues.find((c) => c.id === interlocuteurs[choisi.id]) ?? null) : null;
    return {
      canaux,
      groupes,
      nonLus,
      collegues,
      dmParCollegue,
      nomsCanaux,
      projetsParId: Object.fromEntries(projets.map((p) => [p.id, p.titre])),
      choisi,
      messages,
      messageCibleId,
      candidats,
      membres,
      interlocuteurChoisi,
      moiNom: moi?.nom ?? "",
    };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La messagerie n&apos;est pas disponible pour votre compte ou votre forfait.</p>
      </div>
    );
  }

  const { canaux, groupes, nonLus, collegues, dmParCollegue, nomsCanaux, projetsParId, choisi, messages, messageCibleId, candidats, membres, interlocuteurChoisi, moiNom } = donnees;
  const peutEcrire = peut(utilisateurConnecte, "MESSAGERIE", "CREER");
  const idsMembres = new Set(membres.map((m) => m.id));

  const lienCanal = (c: { id: string; nom: string; type: string }, Icone: typeof Hash) => {
    const actif = choisi?.id === c.id;
    return (
      <Link
        key={c.id}
        href={`/app/messagerie?canal=${c.id}`}
        aria-current={actif ? "page" : undefined}
        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${actif ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{c.nom}</span>
        </span>
        <Pastille nombre={actif ? 0 : (nonLus[c.id] ?? 0)} />
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <MessageSquare className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">One Chat</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <RechercheMessages nomsCanaux={nomsCanaux} />

          <div className="flex flex-col gap-1">
            <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Canaux</p>
            <nav aria-label="Canaux" className="flex flex-col gap-0.5">
              {canaux.map((c) => lienCanal(c, c.type === "PROJET" ? FolderKanban : c.type === "EQUIPE" ? Users : Hash))}
            </nav>
            {peutEcrire ? <FormulaireNouveauCanal /> : null}
          </div>

          <div className="flex flex-col gap-1">
            <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Groupes privés</p>
            <nav aria-label="Groupes privés" className="flex flex-col gap-0.5">
              {groupes.map((c) => lienCanal(c, Lock))}
            </nav>
            {peutEcrire ? <FormulaireNouveauGroupe collegues={collegues.map((c) => ({ id: c.id, nom: c.nom }))} /> : null}
          </div>

          <div className="flex flex-col gap-1">
            <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Messages directs</p>
            <PanneauPersonnes collegues={collegues} dmParCollegue={dmParCollegue} canalActifId={choisi?.id ?? null} />
          </div>

          <ActiverNotifications />
        </aside>

        <section className="flex min-w-0 flex-col gap-2">
          {choisi ? (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {choisi.type === "DIRECT" ? (
                    <>
                      <span className={`size-2.5 rounded-full ${interlocuteurChoisi?.enLigne ? "bg-emerald-500" : "bg-muted-foreground/30"}`} aria-hidden />
                      <span className="font-medium text-foreground">{interlocuteurChoisi?.nom ?? "Conversation directe"}</span>
                      <span>· {interlocuteurChoisi?.enLigne ? "en ligne" : "hors ligne"}</span>
                    </>
                  ) : choisi.type === "PRIVE" ? (
                    <>
                      <Lock className="size-3.5" aria-hidden />
                      <span className="font-medium text-foreground">{choisi.nom}</span>
                      <span>· groupe privé</span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">{choisi.nom}</span>
                      {choisi.projetId && projetsParId[choisi.projetId] ? <span>· projet {projetsParId[choisi.projetId]}</span> : null}
                    </>
                  )}
                </p>
                {choisi.type === "PRIVE" ? (
                  <GestionGroupe
                    canalId={choisi.id}
                    membres={membres}
                    aAjouter={collegues.filter((c) => !idsMembres.has(c.id)).map((c) => ({ id: c.id, nom: c.nom }))}
                    moiId={utilisateurConnecte.utilisateurId}
                    createurId={choisi.creeParId}
                  />
                ) : null}
              </div>
              {/* key : changer de canal (ou de message ciblé) remet la conversation à zéro (curseur, messages, défilement). */}
              <Conversation
                key={`${choisi.id}:${messageCibleId ?? ""}`}
                canalId={choisi.id}
                messagesInitiaux={messages}
                moiId={utilisateurConnecte.utilisateurId}
                moiNom={moiNom}
                estAdmin={utilisateurConnecte.role === "ADMIN"}
                peutEcrire={peutEcrire}
                candidats={candidats}
                messageCibleId={messageCibleId}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun canal pour le moment.</p>
          )}
        </section>
      </div>
    </div>
  );
}
