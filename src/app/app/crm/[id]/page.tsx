import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { Phone, Mail, FileText, MessageCircle, Calendar, StickyNote, FolderOpen, Video } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { prospect, interaction, dossier, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { libelleDossier } from "@/lib/vocabulaire";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_PROSPECT } from "@/lib/libelles";
import { FormulaireInteraction } from "./formulaire-interaction";
import { ChangeurStatut } from "./changeur-statut";
import { creerDossier } from "@/lib/actions/dossier";
import { genererEtEnregistrerLienVisio } from "@/lib/actions/prospect";

const ICONE_INTERACTION: Record<string, typeof Phone> = {
  appel: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  "rendez-vous": Calendar,
  note: StickyNote,
};

export default async function PageFicheProspect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const { fiche, historique, dossierExistant, dossiersDisponibles, secteurProfil } = await avecEntreprise(
    utilisateurConnecte.entrepriseId,
    async (tx) => {
      const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");

      const introuvable = {
        fiche: null,
        historique: [] as (typeof interaction.$inferSelect)[],
        dossierExistant: null as { id: string } | null,
        dossiersDisponibles: false,
        secteurProfil: "generique",
      };

      const [ligne] = await tx.select().from(prospect).where(eq(prospect.id, id));
      if (!ligne) return introuvable;
      if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return introuvable;

      const [historiqueLignes, [monEntreprise], [ledossier]] = await Promise.all([
        tx.select().from(interaction).where(eq(interaction.prospectId, id)).orderBy(desc(interaction.creeLe)),
        tx.select({ secteurProfil: entreprise.secteurProfil, planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
        tx.select({ id: dossier.id }).from(dossier).where(eq(dossier.prospectId, id)),
      ]);

      return {
        fiche: ligne,
        historique: historiqueLignes,
        dossierExistant: ledossier ?? null,
        dossiersDisponibles: disponible(monEntreprise, "DOSSIERS"),
        secteurProfil: monEntreprise?.secteurProfil ?? "generique",
      };
    }
  );

  if (!fiche) notFound();
  const info = STATUT_PROSPECT[fiche.statut];
  const vocabDossier = libelleDossier(secteurProfil);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{fiche.nom}</h1>
            <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? fiche.statut}</Badge>
          </div>
          {fiche.societeCliente ? <p className="text-muted-foreground">{fiche.societeCliente}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5" aria-hidden />
              {fiche.telephone}
            </span>
            {fiche.email ? (
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5" aria-hidden />
                {fiche.email}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {peut(utilisateurConnecte.role, "FACTURATION", "CREER") ? (
            <Button render={<Link href={`/app/facturation/devis/nouveau?prospectId=${fiche.id}`} />} nativeButton={false}>
              <FileText data-icon="inline-start" aria-hidden />
              Créer un devis
            </Button>
          ) : null}
          {peut(utilisateurConnecte.role, "CRM", "MODIFIER") ? (
            <form action={genererEtEnregistrerLienVisio.bind(null, fiche.id)}>
              <Button type="submit" variant="outline" size="sm">
                <Video data-icon="inline-start" aria-hidden />
                Générer un lien de visio
              </Button>
            </form>
          ) : null}
          {dossiersDisponibles && peut(utilisateurConnecte.role, "DOSSIERS", "VOIR") ? (
            dossierExistant ? (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/app/projets/dossiers/${dossierExistant.id}`} />}
                nativeButton={false}
              >
                <FolderOpen data-icon="inline-start" aria-hidden />
                Voir le {vocabDossier.singulier.toLowerCase()}
              </Button>
            ) : peut(utilisateurConnecte.role, "DOSSIERS", "CREER") ? (
              <form action={creerDossier.bind(null, fiche.id)}>
                <Button type="submit" variant="outline" size="sm">
                  <FolderOpen data-icon="inline-start" aria-hidden />
                  Ouvrir un {vocabDossier.singulier.toLowerCase()}
                </Button>
              </form>
            ) : null
          ) : null}
        </div>
      </div>

      {peut(utilisateurConnecte.role, "CRM", "MODIFIER") ? <ChangeurStatut prospectId={fiche.id} statutActuel={fiche.statut} /> : null}

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Historique</h2>
        {historique.length > 0 ? (
          <Card>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {historique.map((h) => {
                const Icone = ICONE_INTERACTION[h.type] ?? StickyNote;
                return (
                  <div key={h.id} className="flex gap-3 px-4 py-3 first:pt-4 last:pb-4">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Icone className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{h.type}</p>
                        <p className="shrink-0 text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(h.creeLe)}
                        </p>
                      </div>
                      {h.contenu.startsWith("https://meet.jit.si/") ? (
                        <a href={h.contenu} target="_blank" rel="noopener noreferrer" className="mt-0.5 block text-sm text-primary underline underline-offset-2">
                          {h.contenu}
                        </a>
                      ) : (
                        <p className="mt-0.5 text-sm">{h.contenu}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune interaction pour le moment.</p>
        )}
      </div>

      {peut(utilisateurConnecte.role, "CRM", "MODIFIER") ? <FormulaireInteraction prospectId={fiche.id} /> : null}
    </div>
  );
}
