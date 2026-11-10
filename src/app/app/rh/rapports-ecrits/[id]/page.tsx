import { redirect } from "next/navigation";
import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ArrowLeft, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { rapportHierarchique, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { peutLireRapport } from "@/lib/rh/rapport-hierarchique-regles";
import { Card } from "@/components/ui/card";
import { getT } from "@/lib/i18n/langue";

export default async function PageRapportEcrit({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  const { id } = await params;

  const auteur = alias(utilisateur, "auteur");
  const destinataire = alias(utilisateur, "destinataire");

  const rapport = peut(utilisateurConnecte, "RH", "VOIR")
    ? await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
        const [r] = await tx
          .select({
            objet: rapportHierarchique.objet,
            contenu: rapportHierarchique.contenu,
            creeLe: rapportHierarchique.creeLe,
            luLe: rapportHierarchique.luLe,
            auteurId: rapportHierarchique.auteurId,
            destinataireId: rapportHierarchique.destinataireId,
            auteurNom: auteur.nomComplet,
            destinataireNom: destinataire.nomComplet,
          })
          .from(rapportHierarchique)
          .innerJoin(auteur, eq(rapportHierarchique.auteurId, auteur.id))
          .innerJoin(destinataire, eq(rapportHierarchique.destinataireId, destinataire.id))
          .where(and(eq(rapportHierarchique.id, id), eq(rapportHierarchique.entrepriseId, utilisateurConnecte.entrepriseId)));
        // Ni l'auteur ni le destinataire : même réponse que pour un rapport qui n'existe pas (on ne révèle rien), l'Administrateur compris.
        if (!r || !peutLireRapport(utilisateurConnecte.utilisateurId, r)) return null;

        // Le destinataire qui ouvre le rapport le marque comme lu (horloge de la base).
        if (r.destinataireId === utilisateurConnecte.utilisateurId && !r.luLe) {
          await tx
            .update(rapportHierarchique)
            .set({ luLe: sql`now()` })
            .where(and(eq(rapportHierarchique.id, id), isNull(rapportHierarchique.luLe)));
        }
        return r;
      })
    : null;

  if (!rapport) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Ce rapport n'existe pas ou vous n'y avez pas accès.")}</p>
        <Link href="/app/rh/rapports-ecrits" className="text-sm underline">
          {t("Retour aux rapports")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/rh/rapports-ecrits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Rapports écrits")}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{rapport.objet}</h1>
        <p className="text-sm text-muted-foreground">
          {t("De")} {rapport.auteurNom} — {t("À")} {rapport.destinataireNom} — {new Intl.DateTimeFormat(t.locale, { dateStyle: "long", timeStyle: "short" }).format(rapport.creeLe)}
        </p>
      </div>
      <Card className="p-4">
        <p className="whitespace-pre-wrap text-sm">{rapport.contenu}</p>
      </Card>
    </div>
  );
}
