import { redirect } from "next/navigation";
import { ArrowRightLeft, Building2, Inbox, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { getT } from "@/lib/i18n/langue";
import { Badge } from "@/components/ui/badge";
import { ressourcesHumainesDisponibles } from "@/lib/rh/missions";
import { entreprisesDuGroupe, listerTransferts, personnesTransferables, responsablesPossibles } from "@/lib/rh/transfert";
import { STATUT_TRANSFERT, type StatutTransfert } from "@/lib/rh/transfert-regles";
import { BoutonAnnulerTransfert, FormulaireTransfert, ReponseTransfert } from "./transferts-ui";

export const dynamic = "force-dynamic";

/** Transferts d'employés entre les entreprises d'un même groupe : Administrateur seul (proposer, répondre, suivre). */
export default async function PageTransferts({ searchParams }: { searchParams: Promise<{ personne?: string }> }) {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (u.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Cette page est réservée à l'Administrateur.")}</p>
      </div>
    );
  }
  const { personne } = await searchParams;

  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => {
    if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return null;
    const [personnes, lignes, responsables] = await Promise.all([personnesTransferables(tx, u), listerTransferts(tx, u), responsablesPossibles(tx, u)]);
    return { personnes, lignes, responsables };
  });
  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.")}</p>
      </div>
    );
  }
  const entreprises = await entreprisesDuGroupe(u.entrepriseId);
  const { personnes, lignes, responsables } = donnees;
  const recues = lignes.filter((l) => l.sens === "ENTRANT" && l.statut === "EN_ATTENTE");
  const historique = lignes.filter((l) => !(l.sens === "ENTRANT" && l.statut === "EN_ATTENTE"));
  const jour = (d: Date | null) => (d ? new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(d) : "");

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Transferts d'employés")}</h1>
        <p className="text-muted-foreground">{t("Faites passer un collaborateur d'une entreprise du groupe à une autre, avec l'accord des deux Administrateurs.")}</p>
      </div>

      {entreprises.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
          <Building2 className="size-6 text-muted-foreground" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">{t("Votre entreprise ne fait pas partie d'un groupe : il n'y a pas d'autre entreprise vers laquelle transférer un collaborateur.")}</p>
        </div>
      ) : null}

      {recues.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="transferts-recus">
          <h2 id="transferts-recus" className="flex items-center gap-2 text-lg font-semibold">
            <Inbox className="size-5 text-marque-orange-600" aria-hidden />
            {t("Demandes reçues")}
            <Badge variant="info">{recues.length}</Badge>
          </h2>
          <ul className="flex flex-col gap-3">
            {recues.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 rounded-2xl border border-marque-orange/40 bg-card p-4 shadow-xs">
                <div>
                  <p className="font-medium">{t("{personne} voudrait rejoindre votre entreprise", { personne: l.nomPersonne })}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("Depuis {entreprise}", { entreprise: l.nomEntrepriseSource })}
                    {l.poste ? ` · ${l.poste}` : ""} · {t("proposé par {nom} le {date}", { nom: l.nomProposePar, date: jour(l.creeLe) })}
                  </p>
                  {l.message ? <p className="mt-1.5 rounded-xl bg-muted/50 px-3 py-2 text-sm whitespace-pre-line">« {l.message} »</p> : null}
                </div>
                <ReponseTransfert ligneId={l.id} responsables={responsables} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {entreprises.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="transferts-proposer">
          <h2 id="transferts-proposer" className="flex items-center gap-2 text-lg font-semibold">
            <ArrowRightLeft className="size-5 text-muted-foreground" aria-hidden />
            {t("Transférer un collaborateur")}
          </h2>
          <FormulaireTransfert personnes={personnes} entreprises={entreprises} personneInitiale={personne} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="transferts-historique">
        <h2 id="transferts-historique" className="text-lg font-semibold">
          {t("Historique des transferts")}
        </h2>
        {historique.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Aucun transfert pour l'instant.")}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {historique.map((l) => {
              const statut = STATUT_TRANSFERT[l.statut as StatutTransfert];
              return (
                <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {l.nomPersonne}
                      <span className="font-normal text-muted-foreground"> · {l.sens === "SORTANT" ? t("vers {entreprise}", { entreprise: l.nomEntrepriseCible }) : t("depuis {entreprise}", { entreprise: l.nomEntrepriseSource })}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {jour(l.decideLe ?? l.creeLe)}
                      {l.motifDecision ? ` · « ${l.motifDecision} »` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={statut?.variante ?? "neutral"}>{t(statut?.libelle ?? l.statut)}</Badge>
                    {l.sens === "SORTANT" && l.statut === "EN_ATTENTE" ? <BoutonAnnulerTransfert ligneId={l.id} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
