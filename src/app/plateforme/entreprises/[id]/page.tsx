import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Users2, Puzzle } from "lucide-react";
import { recupererDetailEntreprise } from "@/lib/plateforme/donnees";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionsEntreprise } from "./actions-entreprise";

const LIBELLE_STATUT: Record<string, { texte: string; variant: "success" | "danger" | "brand" }> = {
  essai: { texte: "Essai", variant: "brand" },
  actif: { texte: "Actif", variant: "success" },
  suspendu: { texte: "Suspendu", variant: "danger" },
};

const LIBELLE_STATUT_PAIEMENT: Record<string, string> = { EN_ATTENTE: "En attente", CONFIRME: "Confirmé", ECHEC: "Échoué" };

const LIBELLE_ACTION: Record<string, string> = {
  ESSAI_ETENDU: "Essai prolongé",
  REACTIVE_MANUELLEMENT: "Réactivé manuellement",
  SUSPENDU_MANUELLEMENT: "Suspendu manuellement",
};

const LIBELLE_ADDON: Record<string, string> = {
  MARKETING: "Marketing",
  FACTURATION_ABONNEMENTS: "Facturation par abonnements",
  RESERVATIONS: "Réservations",
  RECRUTEMENT: "Recrutement",
  SUPPORT: "Assistance client",
  ONE_FORM: "One Form",
};

const formatDate = (date: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);

export default async function PagePlateformeEntrepriseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await recupererDetailEntreprise(id);
  if (!detail) notFound();

  const { entreprise, paiements, journal, nomGroupe, filiales, modulesUtilises } = detail;
  const libelle = LIBELLE_STATUT[entreprise.statutAbonnement] ?? { texte: entreprise.statutAbonnement, variant: "brand" as const };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/plateforme/entreprises" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à la liste
      </Link>

      <div className="flex items-center gap-2.5">
        <Building2 className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{entreprise.nom}</h1>
        <Badge variant={libelle.variant}>{libelle.texte}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Abonnement</CardTitle>
          <CardDescription>Secteur : {entreprise.secteurProfil} — inscrite le {formatDate(entreprise.creeLe)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Fin d&apos;essai</p>
            <p className="font-medium">{formatDate(entreprise.essaiFinLe)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Échéance de l&apos;abonnement</p>
            <p className="font-medium">{formatDate(entreprise.abonnementEcheanceLe)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Puzzle className="size-4" aria-hidden />
            Modules à la carte utilisés
          </CardTitle>
          <CardDescription>
            Marketing, Réservations, Recrutement, Assistance client et One Form restent tous inclus dans l&apos;abonnement — ceci reflète
            l&apos;usage réel (au moins une donnée créée), pas une activation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modulesUtilises.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {modulesUtilises.map((addon) => (
                <Badge key={addon} variant="brand">
                  {LIBELLE_ADDON[addon] ?? addon}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun module à la carte utilisé pour le moment.</p>
          )}
        </CardContent>
      </Card>

      {nomGroupe ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users2 className="size-4" aria-hidden />
              Groupe : {nomGroupe}
            </CardTitle>
            <CardDescription>Lien organisationnel uniquement — chaque filiale garde ses propres données et son propre abonnement.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {filiales.map((f) => {
                const l = LIBELLE_STATUT[f.statutAbonnement] ?? { texte: f.statutAbonnement, variant: "brand" as const };
                return (
                  <Link key={f.id} href={`/plateforme/entreprises/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                    <p className="font-medium">{f.nom}</p>
                    <Badge variant={l.variant}>{l.texte}</Badge>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
          <CardDescription>Chaque action est journalisée ci-dessous.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionsEntreprise entrepriseId={entreprise.id} peutEtendreEssai={entreprise.abonnementEcheanceLe.getTime() === entreprise.essaiFinLe.getTime()} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Historique des paiements</h2>
        {paiements.length > 0 ? (
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {paiements.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{formaterFCFA(p.montant)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(p.creeLe)}</p>
                  </div>
                  <Badge variant={p.statut === "CONFIRME" ? "success" : p.statut === "ECHEC" ? "danger" : "neutral"}>{LIBELLE_STATUT_PAIEMENT[p.statut] ?? p.statut}</Badge>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune tentative de paiement pour le moment.</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Historique des actions staff</h2>
        {journal.length > 0 ? (
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {journal.map((j) => (
                <div key={j.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{LIBELLE_ACTION[j.action] ?? j.action}{j.details ? ` — ${j.details}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{j.staffEmail}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(j.creeLe)}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune action manuelle pour le moment.</p>
        )}
      </div>
    </div>
  );
}
