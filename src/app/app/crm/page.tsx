import { redirect } from "next/navigation";
import { and, eq, ne, gte, lt, isNull, asc, sql } from "drizzle-orm";
import { Briefcase, Target, Phone, UserPlus, ListChecks, Video, TrendingUp } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { lead, contact, deal, historiqueStatutDeal, interaction, tacheCrm, reunionCrm, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { STATUT_DEAL } from "@/lib/libelles";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireTacheCrm } from "./formulaire-tache-crm";
import { FormulaireReunionCrm } from "./formulaire-reunion-crm";
import { LigneTacheCrm } from "./ligne-tache-crm";

export default async function PageAccueilCrm() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "CRM", "VOIR")) redirect("/app");

  const moi = utilisateurConnecte.utilisateurId;

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const maintenant = new Date();
    const debutAujourdhui = new Date(maintenant);
    debutAujourdhui.setHours(0, 0, 0, 0);
    const finAujourdhui = new Date(debutAujourdhui);
    finAujourdhui.setDate(finAujourdhui.getDate() + 1);
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const debutMoisSuivant = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
    const seuilNonTouche = new Date(maintenant);
    seuilNonTouche.setDate(seuilNonTouche.getDate() - 7);

    const [monNom, mesDeals, mesLeads, [{ appelsAujourdhui }], tachesBrutes, reunionsBrutes, dernieresActivitesParDeal] = await Promise.all([
      tx
        .select({ nomComplet: utilisateur.nomComplet })
        .from(utilisateur)
        .where(eq(utilisateur.id, moi))
        .then((lignes) => lignes[0]?.nomComplet ?? ""),
      tx
        .select({ id: deal.id, statut: deal.statut, montant: deal.montant, dateClotureEstimee: deal.dateClotureEstimee, creeLe: deal.creeLe })
        .from(deal)
        .where(eq(deal.assigneAId, moi)),
      tx.select({ id: lead.id, creeLe: lead.creeLe, convertiLe: lead.convertiLe }).from(lead).where(eq(lead.assigneAId, moi)),
      tx
        .select({ appelsAujourdhui: sql<string>`count(*)` })
        .from(interaction)
        .where(and(eq(interaction.auteurId, moi), eq(interaction.type, "appel"), gte(interaction.creeLe, debutAujourdhui), lt(interaction.creeLe, finAujourdhui))),
      tx
        .select({
          id: tacheCrm.id,
          objet: tacheCrm.objet,
          statut: tacheCrm.statut,
          priorite: tacheCrm.priorite,
          dateEcheance: tacheCrm.dateEcheance,
          leadNom: lead.nom,
          dealTitre: deal.titre,
          contactNom: contact.nom,
        })
        .from(tacheCrm)
        .leftJoin(lead, eq(tacheCrm.leadId, lead.id))
        .leftJoin(deal, eq(tacheCrm.dealId, deal.id))
        .leftJoin(contact, eq(tacheCrm.contactId, contact.id))
        .where(and(eq(tacheCrm.assigneAId, moi), ne(tacheCrm.statut, "TERMINEE")))
        .orderBy(asc(tacheCrm.dateEcheance))
        .limit(25),
      tx
        .select({
          id: reunionCrm.id,
          titre: reunionCrm.titre,
          dateDebut: reunionCrm.dateDebut,
          dateFin: reunionCrm.dateFin,
          leadNom: lead.nom,
          dealTitre: deal.titre,
          contactNom: contact.nom,
        })
        .from(reunionCrm)
        .leftJoin(lead, eq(reunionCrm.leadId, lead.id))
        .leftJoin(deal, eq(reunionCrm.dealId, deal.id))
        .leftJoin(contact, eq(reunionCrm.contactId, contact.id))
        .where(and(eq(reunionCrm.assigneAId, moi), gte(reunionCrm.dateFin, maintenant)))
        .orderBy(asc(reunionCrm.dateDebut))
        .limit(25),
      tx
        .select({ dealId: historiqueStatutDeal.dealId, derniereActivite: sql<Date>`max(${historiqueStatutDeal.modifieLe})` })
        .from(historiqueStatutDeal)
        .groupBy(historiqueStatutDeal.dealId),
    ]);

    const dealsOuverts = mesDeals.filter((d) => d.statut !== "GAGNE" && d.statut !== "PERDU");
    const derniereActiviteParId = new Map(dernieresActivitesParDeal.map((d) => [d.dealId, new Date(d.derniereActivite)]));
    const dealsNonTouches = dealsOuverts.filter((d) => {
      const derniere = derniereActiviteParId.get(d.id) ?? d.creeLe;
      return derniere < seuilNonTouche;
    });
    const dealsClotureCeMois = dealsOuverts.filter(
      (d) => d.dateClotureEstimee && d.dateClotureEstimee >= debutMois && d.dateClotureEstimee < debutMoisSuivant
    );
    const pipelineParEtape = (Object.keys(STATUT_DEAL) as (keyof typeof STATUT_DEAL)[]).map((statut) => ({
      statut,
      total: mesDeals.filter((d) => d.statut === statut).length,
      montant: mesDeals.filter((d) => d.statut === statut).reduce((somme, d) => somme + d.montant, 0),
    }));

    const leadsNonConvertis = mesLeads.filter((l) => !l.convertiLe);
    const prospectsAujourdhui = mesLeads.filter((l) => l.creeLe >= debutAujourdhui && l.creeLe < finAujourdhui);

    // Listes pour les selects "Relatif à" des formulaires — mes leads non
    // convertis, mes contacts, mes deals ouverts (comme les listes que Zoho
    // propose à la création d'une tâche/réunion).
    const [leadsPourFormulaire, contactsPourFormulaire, dealsPourFormulaire] = await Promise.all([
      tx.select({ id: lead.id, nom: lead.nom }).from(lead).where(and(eq(lead.assigneAId, moi), isNull(lead.convertiLe))),
      tx.select({ id: contact.id, nom: contact.nom }).from(contact).where(eq(contact.assigneAId, moi)),
      tx.select({ id: deal.id, titre: deal.titre }).from(deal).where(eq(deal.assigneAId, moi)),
    ]);

    return {
      monNom,
      totalDealsOuverts: dealsOuverts.length,
      totalDealsNonTouches: dealsNonTouches.length,
      appelsAujourdhui: Number(appelsAujourdhui),
      totalProspects: leadsNonConvertis.length,
      tachesBrutes,
      reunionsBrutes,
      prospectsAujourdhui,
      dealsClotureCeMois,
      pipelineParEtape,
      leadsPourFormulaire: leadsPourFormulaire.map((l) => ({ id: l.id, libelle: l.nom })),
      contactsPourFormulaire: contactsPourFormulaire.map((c) => ({ id: c.id, libelle: c.nom })),
      dealsPourFormulaire: dealsPourFormulaire.map((d) => ({ id: d.id, libelle: d.titre })),
    };
  });

  const totalPipeline = donnees.pipelineParEtape.reduce((somme, p) => somme + p.montant, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bienvenue, {donnees.monNom}</h1>
        <p className="mt-1 text-muted-foreground">Accueil de votre activité commerciale.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Briefcase className="size-4.5" aria-hidden />
              </span>
              <CardDescription>Mes Deals ouverts</CardDescription>
            </div>
            <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{donnees.totalDealsOuverts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <Target className="size-4.5" aria-hidden />
              </span>
              <CardDescription>Mes Deals non touchés</CardDescription>
            </div>
            <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{donnees.totalDealsNonTouches}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                <Phone className="size-4.5" aria-hidden />
              </span>
              <CardDescription>Mes appels aujourd&apos;hui</CardDescription>
            </div>
            <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{donnees.appelsAujourdhui}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                <UserPlus className="size-4.5" aria-hidden />
              </span>
              <CardDescription>Mes prospects</CardDescription>
            </div>
            <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{donnees.totalProspects}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ListChecks className="size-4" aria-hidden />
            Mes tâches ouvertes
          </h2>
          <FormulaireTacheCrm
            leads={donnees.leadsPourFormulaire}
            contacts={donnees.contactsPourFormulaire}
            deals={donnees.dealsPourFormulaire}
          />
        </div>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Objet</th>
                  <th className="px-4 py-2.5 font-medium">Date d&apos;échéance</th>
                  <th className="px-4 py-2.5 font-medium">État</th>
                  <th className="px-4 py-2.5 font-medium">Priorité</th>
                  <th className="px-4 py-2.5 font-medium">Relatif à</th>
                  <th className="px-4 py-2.5 font-medium">Nom du contact</th>
                </tr>
              </thead>
              <tbody>
                {donnees.tachesBrutes.map((t) => (
                  <LigneTacheCrm
                    key={t.id}
                    id={t.id}
                    objet={t.objet}
                    statut={t.statut}
                    priorite={t.priorite}
                    dateEcheance={t.dateEcheance}
                    relatifA={t.leadNom ?? t.dealTitre}
                    nomContact={t.contactNom}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {donnees.tachesBrutes.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune tâche ouverte.</p>
          ) : (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">Total enregistrements {donnees.tachesBrutes.length}</p>
          )}
        </Card>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Video className="size-4" aria-hidden />
            Mes réunions
          </h2>
          <FormulaireReunionCrm
            leads={donnees.leadsPourFormulaire}
            contacts={donnees.contactsPourFormulaire}
            deals={donnees.dealsPourFormulaire}
          />
        </div>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Titre</th>
                  <th className="px-4 py-2.5 font-medium">De</th>
                  <th className="px-4 py-2.5 font-medium">Au</th>
                  <th className="px-4 py-2.5 font-medium">Relatif à</th>
                  <th className="px-4 py-2.5 font-medium">Nom du contact</th>
                </tr>
              </thead>
              <tbody>
                {donnees.reunionsBrutes.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">{r.titre}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(r.dateDebut)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(r.dateFin)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.leadNom ?? r.dealTitre ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.contactNom ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {donnees.reunionsBrutes.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune réunion trouvée.</p>
          ) : (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">Total enregistrements {donnees.reunionsBrutes.length}</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Prospects d&apos;aujourd&apos;hui</h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {donnees.prospectsAujourdhui.map((l) => (
                <div key={l.id} className="px-4 py-2.5 text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(l.creeLe)}
                </div>
              ))}
              {donnees.prospectsAujourdhui.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun prospect aujourd&apos;hui.</p>
              ) : null}
            </div>
          </Card>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Mes Deals en clôture ce mois-ci</h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {donnees.dealsClotureCeMois.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="tabular-nums text-muted-foreground">{formaterFCFA(d.montant)}</span>
                  <Badge variant={STATUT_DEAL[d.statut]?.variante ?? "neutral"}>{STATUT_DEAL[d.statut]?.libelle ?? d.statut}</Badge>
                </div>
              ))}
              {donnees.dealsClotureCeMois.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun deal en clôture ce mois-ci.</p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <TrendingUp className="size-4" aria-hidden />
          Mon pipeline Deals par étape
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-2.5">
            {donnees.pipelineParEtape.map((p) => {
              const info = STATUT_DEAL[p.statut];
              const part = totalPipeline > 0 ? (p.montant / totalPipeline) * 100 : 0;
              return (
                <div key={p.statut} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? p.statut}</Badge>
                    <span className="tabular-nums font-medium text-foreground">
                      {p.total} — {formaterFCFA(p.montant)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${part}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
