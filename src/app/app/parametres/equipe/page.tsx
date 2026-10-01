import { redirect } from "next/navigation";
import { and, eq, desc, ne, inArray } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { invitation, utilisateur, service } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireInvitation } from "./formulaire-invitation";
import { GestionServices } from "./gestion-services";
import { MembresEquipe } from "./membres-equipe";
import { getT } from "@/lib/i18n/langue";

export default async function PageEquipe() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PARAMETRES", "CREER")) {
    return (
      <p className="text-muted-foreground">
        {t("Vous n'avez pas le droit d'inviter de nouveaux collaborateurs.")}
      </p>
    );
  }

  const [invitations, collegues, services, membres] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    Promise.all([
      tx
        .select()
        .from(invitation)
        .where(eq(invitation.entrepriseId, utilisateurConnecte.entrepriseId))
        .orderBy(desc(invitation.expireLe)),
      // Pour le sélecteur de manager — quiconque peut être désigné comme
      // manager d'un nouvel invité, pas seulement les comptes déjà rôle
      // MANAGER (une vraie hiérarchie n'a pas besoin de correspondre au
      // rôle système à 4 niveaux).
      tx.select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet }).from(utilisateur).where(ne(utilisateur.role, "CLIENT")),
      tx.select({ id: service.id, nom: service.nom }).from(service),
      // Manager/Employé de l'entreprise — filtre entrepriseId explicite (utilisateur reste en RLS permissive).
      // Inclut les comptes désactivés (départ, voir src/lib/actions/depart.ts) : sinon un Administrateur ne peut
      // jamais retrouver un compte désactivé par erreur pour le réactiver (voir renvoyerAccesCollegue).
      tx
        .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet, email: utilisateur.email, role: utilisateur.role, modulesAutorises: utilisateur.modulesAutorises, statut: utilisateur.statut })
        .from(utilisateur)
        .where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), inArray(utilisateur.role, ["MANAGER", "EMPLOYE"]), inArray(utilisateur.statut, ["ACTIF", "DESACTIVE"])))
        .orderBy(utilisateur.nomComplet),
    ])
  );

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Équipe")}</h1>
        <p className="text-muted-foreground">{t("Inviter un nouveau collaborateur (Manager ou Employé).")}</p>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
        <FormulaireInvitation collegues={collegues} />
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-both">
        <MembresEquipe membres={membres.map((m) => ({ ...m, role: m.role as "MANAGER" | "EMPLOYE", statut: m.statut as "ACTIF" | "DESACTIVE" }))} />
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-both">
        <GestionServices services={services} />
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t("Invitations")}</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {invitations.map((inv, index) => {
              const estUtilisee = Boolean(inv.utiliseeLe);
              const estExpiree = !estUtilisee && inv.expireLe < new Date();
              return (
                <div
                  key={inv.id}
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  className="group/ligne relative flex animate-in fade-in items-center justify-between gap-3 overflow-hidden px-4 py-3 text-sm fill-mode-both duration-300 transition-colors hover:bg-muted/50"
                >
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100" />
                  <div className="min-w-0 transition-transform duration-150 group-hover/ligne:translate-x-1">
                    <p className="truncate font-medium">{inv.email}</p>
                    <p className="text-muted-foreground">
                      {inv.roleProposee}
                      {!estUtilisee && !estExpiree ? (
                        <>
                          {" — "}
                          <span className="font-mono text-xs">/invitation/{inv.jeton}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {estUtilisee ? (
                    <Badge variant="success">{t("Compte activé")}</Badge>
                  ) : estExpiree ? (
                    <Badge variant="danger">{t("Expirée")}</Badge>
                  ) : (
                    <Badge variant="info">{t("En attente")}</Badge>
                  )}
                </div>
              );
            })}
            {invitations.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucune invitation pour le moment.")}</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
