import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { UserPlus } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { listerProspectsQualifies } from "@/lib/crm/prospects-donnees";
import { etatRelance } from "@/lib/crm/prospects";
import { Button } from "@/components/ui/button";
import { ListeProspects } from "./liste-prospects";
import { getT } from "@/lib/i18n/langue";

export default async function PageProspectsQualifies() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const { prospects, nomEntreprise } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [ent] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return { prospects: await listerProspectsQualifies(tx, utilisateurConnecte), nomEntreprise: ent?.nom ?? "" };
  });

  // Dates en texte (aucune valeur Date ne traverse vers le navigateur) et état de relance calculé ICI, à l'heure du serveur : l'écran et un rechargement disent la même chose.
  const maintenant = new Date();
  const lignes = prospects.map((p) => ({
    id: p.id,
    nom: p.nom,
    societeCliente: p.societeCliente,
    telephone: p.telephone,
    email: p.email,
    rappelLe: p.rappelLe,
    qualifieLe: (p.qualifieLe ?? p.creeLe).toISOString(),
    derniereRelanceLe: p.derniereRelanceLe ? p.derniereRelanceLe.toISOString() : null,
    nbRelances: p.nbRelances,
    assigneANom: p.assigneANom,
    sourceExterne: p.sourceExterne,
    etat: etatRelance({ rappelLe: p.rappelLe, derniereRelanceLe: p.derniereRelanceLe }, maintenant),
  }));

  // Les plus urgents d'abord : à relancer (rappel échu ou plus de 7 jours), puis jamais relancés, puis rappels prévus, puis relancés récemment ; à égalité, le plus ancien
  // qualifié passe devant (c'est celui qu'on a laissé attendre le plus longtemps).
  const RANG = { A_RELANCER: 0, JAMAIS_RELANCE: 1, RAPPEL_PREVU: 2, RELANCE_RECENTE: 3 } as const;
  lignes.sort((a, b) => RANG[a.etat] - RANG[b.etat] || a.qualifieLe.localeCompare(b.qualifieLe));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Prospects qualifiés")}</h1>
          <p className="max-w-2xl text-muted-foreground">
            {t("Les personnes intéressées que vous avez qualifiées. Relancez-les par e-mail ou WhatsApp ; elles ne deviennent des contacts que lorsqu'elles sont clientes.")}
          </p>
        </div>
        <Button variant="outline" render={<Link href="/app/leads" />} nativeButton={false}>
          <UserPlus data-icon="inline-start" aria-hidden />
          {t("Voir les leads")}
        </Button>
      </div>

      <ListeProspects prospects={lignes} nomEntreprise={nomEntreprise} peutModifier={peut(utilisateurConnecte, "CRM", "MODIFIER")} />
    </div>
  );
}
