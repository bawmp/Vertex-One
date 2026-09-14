import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Settings, Lock } from "lucide-react";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, addonActif } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { traduire } from "@/lib/i18n/traduire";
import { peut } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonToggleAddon } from "./bouton-toggle-addon";
import { FormulaireLogo } from "./formulaire-logo";
import { FormulaireCouleur } from "./formulaire-couleur";
import type { Addon } from "@/lib/plans";

const LIBELLE_PLAN: Record<string, string> = { starter: "Starter", pro: "Pro", business: "Business", essai: "Essai" };

// Seuls les modules complémentaires réellement fonctionnels sont affichés
// ici — FACTURATION_ABONNEMENTS existe dans le modèle de données (addonActif)
// mais aucune fonctionnalité de facturation d'abonnements récurrents n'est
// construite derrière pour l'instant (voir src/lib/actions/addon.ts) :
// l'afficher activable donnerait l'illusion d'une fonctionnalité qui ne fait
// rien, jamais fait dans ce projet.
const ADDONS_AFFICHABLES: { addon: Addon; nom: string; description: string }[] = [
  { addon: "MARKETING", nom: "Marketing", description: "Campagnes email/WhatsApp, relances automatiques, pages d'atterrissage." },
  { addon: "RESERVATIONS", nom: "Réservations", description: "Page publique où vos clients réservent un créneau seuls, sans compte." },
  { addon: "RECRUTEMENT", nom: "Recrutement", description: "Page publique de candidature, CV inclus, jusqu'à la conversion en employé." },
  { addon: "SUPPORT", nom: "Assistance client", description: "Portail où vos clients ouvrent et suivent leurs propres tickets." },
];

export default async function PageParametres() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "PARAMETRES", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas accès aux Paramètres.</p>
      </div>
    );
  }

  const [monEntreprise] = await db
    .select({
      nom: entreprise.nom,
      planAbonnement: entreprise.planAbonnement,
      statutAbonnement: entreprise.statutAbonnement,
      logoCleStockage: entreprise.logoCleStockage,
      couleurMarque: entreprise.couleurMarque,
    })
    .from(entreprise)
    .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

  // addonActif porte une policy RLS stricte (pas de lecture anonyme comme
  // parametreReservation/parametreRecrutement) — toujours via avecEntreprise(),
  // jamais db direct (qui renverrait silencieusement zéro ligne, current_setting
  // n'étant positionné que dans une transaction ouverte par avecEntreprise()).
  const addonsActifs = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select({ addon: addonActif.addon }).from(addonActif).where(eq(addonActif.entrepriseId, utilisateurConnecte.entrepriseId))
  );
  const nomsActifs = new Set(addonsActifs.map((a) => a.addon));
  const t = traduire(utilisateurConnecte.langue);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Settings className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t.pages.parametres.titre}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{monEntreprise?.nom}</CardTitle>
          <CardDescription>Forfait actuel de votre entreprise.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Badge variant="brand">{LIBELLE_PLAN[monEntreprise?.planAbonnement ?? "starter"] ?? monEntreprise?.planAbonnement}</Badge>
          {monEntreprise?.statutAbonnement === "suspendu" ? <Badge variant="danger">Suspendu</Badge> : null}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Personnalisation</h2>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm font-medium">Logo</p>
              <FormulaireLogo entrepriseId={utilisateurConnecte.entrepriseId} logoCleStockage={monEntreprise?.logoCleStockage ?? null} nomEntreprise={monEntreprise?.nom ?? ""} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Couleur de marque</p>
              <FormulaireCouleur couleurMarque={monEntreprise?.couleurMarque ?? null} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Modules complémentaires</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {ADDONS_AFFICHABLES.map((a) => {
              const actif = nomsActifs.has(a.addon);
              return (
                <div key={a.addon} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{a.nom}</p>
                      <Badge variant={actif ? "success" : "neutral"}>{actif ? "Actif" : "Inactif"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                  </div>
                  <BoutonToggleAddon addon={a.addon} actif={actif} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
