import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Lock, UserPlus } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";
import { Badge } from "@/components/ui/badge";
import { lireDemandes, responsablesDemande } from "@/lib/rh/demande-collaborateur";
import { ressourcesHumainesDisponibles } from "@/lib/rh/missions";
import { LIBELLE_CONTRAT, type ContratCollaborateur } from "@/lib/rh/nouveau-collaborateur";
import { BoutonAnnulerDemande, ListeDemandesAdmin } from "./carte-demande";

export const dynamic = "force-dynamic";

const STATUT: Record<string, { libelle: string; variante: "info" | "success" | "danger" | "neutral" }> = {
  EN_ATTENTE: { libelle: m("En attente de confirmation"), variante: "info" },
  CONFIRMEE: { libelle: m("Confirmée"), variante: "success" },
  REFUSEE: { libelle: m("Refusée"), variante: "danger" },
  ANNULEE: { libelle: m("Retirée"), variante: "neutral" },
};

/**
 * Fiches demandées par les Managers : l'Administrateur les confirme (ou refuse) ; un Manager suit l'état de SES demandes. Aucun salaire ici :
 * il se saisit sur la fiche, par l'Administrateur seul, une fois le compte activé.
 */
export default async function PageFichesAConfirmer() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if ((u.role !== "ADMIN" && u.role !== "MANAGER") || !peut(u, "RH", "CREER")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Cette page est réservée à l'Administrateur et aux Managers.")}</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => {
    if (!(await ressourcesHumainesDisponibles(tx, u.entrepriseId))) return null;
    const [demandes, responsables] = await Promise.all([lireDemandes(tx, u), responsablesDemande(tx, u)]);
    return { demandes, responsables };
  });
  if (!donnees) redirect("/app/rh");

  const { demandes, responsables } = donnees;
  const estAdmin = u.role === "ADMIN";
  const enAttente = demandes.filter((d) => d.statut === "EN_ATTENTE");
  const historique = demandes.filter((d) => d.statut !== "EN_ATTENTE");
  const jour = (d: Date) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(d);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <ClipboardCheck className="size-6" aria-hidden />
          {estAdmin ? t("Fiches à confirmer") : t("Mes demandes de fiche")}
        </h1>
        <p className="text-muted-foreground">
          {estAdmin
            ? t("Un Manager a demandé l'ajout d'un collaborateur : rien n'est envoyé avant que vous ayez confirmé la fiche.")
            : t("Vos demandes d'ajout de collaborateur, en attente de la confirmation de l'Administrateur.")}
        </p>
      </div>

      {!estAdmin ? (
        <Link href="/app/rh/nouveau" className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <UserPlus className="size-4" aria-hidden />
          {t("Nouvelle fiche")}
        </Link>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="demandes-attente">
        <h2 id="demandes-attente" className="flex items-center gap-2 text-lg font-semibold">
          {t("En attente")}
          {enAttente.length > 0 ? <Badge variant="info">{enAttente.length}</Badge> : null}
        </h2>
        {enAttente.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Aucune demande en attente.")}</p>
        ) : estAdmin ? (
          <ListeDemandesAdmin
            demandes={enAttente.map((d) => ({ id: d.id, nomDemandeur: d.nomDemandeur, email: d.email, poste: d.poste, typeContrat: d.typeContrat, dateEmbauche: d.dateEmbauche, dateFin: d.dateFin, dateNaissance: d.dateNaissance, responsableId: d.responsableId, creeLe: jour(d.creeLe) }))}
            responsables={responsables}
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {enAttente.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.poste} · {t(LIBELLE_CONTRAT[d.typeContrat as ContratCollaborateur] ?? d.typeContrat)} · {jour(d.creeLe)}
                  </p>
                </div>
                <BoutonAnnulerDemande demandeId={d.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="demandes-historique">
        <h2 id="demandes-historique" className="text-lg font-semibold">
          {t("Historique")}
        </h2>
        {historique.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Aucune demande traitée pour l'instant.")}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {historique.map((d) => {
              const s = STATUT[d.statut];
              return (
                <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.poste} · {estAdmin ? `${d.nomDemandeur} · ` : ""}
                      {jour(d.decideLe ?? d.creeLe)}
                      {d.motifRefus ? ` · « ${d.motifRefus} »` : ""}
                    </p>
                  </div>
                  <Badge variant={s?.variante ?? "neutral"}>{t(s?.libelle ?? d.statut)}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
