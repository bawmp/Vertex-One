import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, ne, inArray } from "drizzle-orm";
import { Briefcase, Lock, ListChecks, Settings, Download } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, candidature, posteOuvert, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponibleAddon } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonActiverRecrutement } from "./bouton-activer-recrutement";
import { ControlesCandidature } from "./controles-candidature";
import { FormulaireConversion } from "./formulaire-conversion";

const LIBELLE_STATUT: Record<string, { libelle: string; variant: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  RECUE: { libelle: "Reçue", variant: "neutral" },
  EN_EXAMEN: { libelle: "En examen", variant: "info" },
  ENTRETIEN: { libelle: "Entretien", variant: "info" },
  OFFRE: { libelle: "Offre", variant: "warning" },
  EMBAUCHE: { libelle: "Embauché(e)", variant: "success" },
  REJETEE: { libelle: "Rejetée", variant: "danger" },
};

export default async function PageRecrutement() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "RECRUTEMENT", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès au Recrutement.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    const actif = await disponibleAddon(tx, monEntreprise, "RECRUTEMENT");
    if (!actif) return { actif: false as const };

    const idsPortee = await idsVisibles(tx, utilisateurConnecte, "RECRUTEMENT");

    const candidatures = await tx
      .select({
        id: candidature.id,
        nom: candidature.nom,
        telephone: candidature.telephone,
        email: candidature.email,
        statut: candidature.statut,
        assigneAId: candidature.assigneAId,
        posteTitre: posteOuvert.titre,
        creeLe: candidature.creeLe,
      })
      .from(candidature)
      .innerJoin(posteOuvert, eq(candidature.posteId, posteOuvert.id))
      .where(
        and(
          eq(candidature.entrepriseId, utilisateurConnecte.entrepriseId),
          idsPortee === "TOUT" ? undefined : inArray(candidature.assigneAId, idsPortee)
        )
      )
      .orderBy(candidature.creeLe);

    const agents = await tx
      .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet })
      .from(utilisateur)
      .where(and(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), ne(utilisateur.role, "CLIENT")))
      .orderBy(utilisateur.nomComplet);

    return { actif: true as const, candidatures, agents };
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Briefcase className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Recrutement</h1>
        </div>
        {donnees.actif && utilisateurConnecte.role === "ADMIN" ? (
          <div className="flex items-center gap-3">
            <Link href="/app/recrutement/postes" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ListChecks className="size-3.5" aria-hidden />
              Postes
            </Link>
            <Link href="/app/recrutement/parametres" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <Settings className="size-3.5" aria-hidden />
              Paramètres
            </Link>
          </div>
        ) : null}
      </div>

      {!donnees.actif ? (
        utilisateurConnecte.role === "ADMIN" ? (
          <BoutonActiverRecrutement />
        ) : (
          <p className="text-sm text-muted-foreground">Le module Recrutement n&apos;est pas activé — demandez à un Administrateur de l&apos;activer.</p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {donnees.candidatures.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{c.nom}</p>
                      <Badge variant={LIBELLE_STATUT[c.statut]?.variant ?? "neutral"}>{LIBELLE_STATUT[c.statut]?.libelle ?? c.statut}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.posteTitre} — {c.telephone}
                      {c.email ? ` — ${c.email}` : ""}
                    </p>
                  </div>
                  <a
                    href={`/app/recrutement/candidatures/${c.id}/cv`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Download className="size-3.5" aria-hidden />
                    CV
                  </a>
                </div>
                <ControlesCandidature candidatureId={c.id} statut={c.statut} peutReassigner={utilisateurConnecte.role === "ADMIN"} agents={donnees.agents} agentActuelId={c.assigneAId} />
                {(c.statut === "OFFRE" || c.statut === "EMBAUCHE") && utilisateurConnecte.role === "ADMIN" ? (
                  <FormulaireConversion candidatureId={c.id} statut={c.statut} />
                ) : null}
              </CardContent>
            </Card>
          ))}
          {donnees.candidatures.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucune candidature pour le moment.</p> : null}
        </div>
      )}
    </div>
  );
}
