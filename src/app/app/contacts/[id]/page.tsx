import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { Phone, Mail, Building2, FolderOpen, Video, Briefcase, StickyNote, MessageCircle, Calendar, FileText, ClipboardList, Repeat, Receipt, Wallet } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { contact, compteClient, interaction, dossier, deal, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { libelleDossier } from "@/lib/vocabulaire";
import { STATUT_DEAL } from "@/lib/libelles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditeurNotes } from "@/components/editeur-notes";
import { FormulaireInteraction } from "./formulaire-interaction";
import { BoutonInviterPortail } from "./bouton-inviter-portail";
import { creerDossier } from "@/lib/actions/dossier";
import { genererEtEnregistrerLienVisio, modifierNotesContact } from "@/lib/actions/contact";

const ICONE_INTERACTION: Record<string, typeof Phone> = {
  appel: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  "rendez-vous": Calendar,
  note: StickyNote,
};

export default async function PageFicheContact({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");

    const [ligne] = await tx.select().from(contact).where(eq(contact.id, id));
    if (!ligne) return null;
    if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return null;

    const [compte, interactions, dossierExistant, deals, [monEntreprise]] = await Promise.all([
      ligne.compteId ? tx.select().from(compteClient).where(eq(compteClient.id, ligne.compteId)) : Promise.resolve([null]),
      tx.select().from(interaction).where(eq(interaction.contactId, id)).orderBy(desc(interaction.creeLe)),
      tx.select({ id: dossier.id }).from(dossier).where(eq(dossier.contactId, id)),
      tx.select().from(deal).where(eq(deal.contactId, id)).orderBy(desc(deal.creeLe)),
      tx.select({ secteurProfil: entreprise.secteurProfil, planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
    ]);

    return {
      fiche: ligne,
      compte: Array.isArray(compte) ? compte[0] : compte,
      interactions,
      dossierExistant: dossierExistant[0] ?? null,
      deals,
      dossiersDisponibles: disponible(monEntreprise, "DOSSIERS"),
      secteurProfil: monEntreprise?.secteurProfil ?? "generique",
    };
  });

  if (!donnees) notFound();
  const { fiche, compte, interactions, dossierExistant, deals, dossiersDisponibles, secteurProfil } = donnees;
  const vocabDossier = libelleDossier(secteurProfil);
  const peutModifier = peut(utilisateurConnecte.role, "CRM", "MODIFIER");
  const modifierNotesAction = modifierNotesContact.bind(null, fiche.id);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{fiche.nom}</h1>
          {compte ? (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="size-3.5" aria-hidden />
              <Link href={`/app/comptes/${compte.id}`} className="hover:underline">
                {compte.nom}
              </Link>
              {fiche.fonction ? ` — ${fiche.fonction}` : ""}
            </p>
          ) : null}
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

        <div className="flex flex-wrap gap-2">
          {peut(utilisateurConnecte.role, "CRM", "CREER") ? (
            <Button size="sm" render={<Link href={`/app/deals/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
              <Briefcase data-icon="inline-start" aria-hidden />
              Nouveau deal
            </Button>
          ) : null}
          {peutModifier ? (
            <form action={genererEtEnregistrerLienVisio.bind(null, fiche.id)}>
              <Button type="submit" variant="outline" size="sm">
                <Video data-icon="inline-start" aria-hidden />
                Lien de visio
              </Button>
            </form>
          ) : null}
          {dossiersDisponibles && peut(utilisateurConnecte.role, "DOSSIERS", "VOIR") ? (
            dossierExistant ? (
              <Button variant="outline" size="sm" render={<Link href={`/app/projets/dossiers/${dossierExistant.id}`} />} nativeButton={false}>
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

      {utilisateurConnecte.role === "ADMIN" ? (
        <div className="flex flex-wrap gap-2">
          {fiche.utilisateurId ? (
            <p className="text-sm text-muted-foreground">Déjà invité(e) au portail.</p>
          ) : (
            <BoutonInviterPortail contactId={fiche.id} emailActuel={fiche.email} />
          )}
        </div>
      ) : null}

      {peut(utilisateurConnecte.role, "FACTURATION", "CREER") ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/devis/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <FileText data-icon="inline-start" aria-hidden />
            Créer un devis
          </Button>
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/bons-commande/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <ClipboardList data-icon="inline-start" aria-hidden />
            Créer un bon de commande
          </Button>
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/recurrentes/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <Repeat data-icon="inline-start" aria-hidden />
            Créer une facture récurrente
          </Button>
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/recus-vente/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <Receipt data-icon="inline-start" aria-hidden />
            Créer un reçu de vente
          </Button>
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/acomptes/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <Wallet data-icon="inline-start" aria-hidden />
            Créer une facture d&apos;acompte
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Notes</h2>
              {peutModifier ? (
                <EditeurNotes notesInitiales={fiche.notes} onEnregistrer={modifierNotesAction} />
              ) : (
                <p className="text-sm text-muted-foreground">{fiche.notes || "Aucune note."}</p>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Deals</h2>
            {deals.length > 0 ? (
              <Card className="p-0">
                <div className="flex flex-col divide-y divide-border">
                  {deals.map((d) => {
                    const info = STATUT_DEAL[d.statut];
                    return (
                      <Link key={d.id} href={`/app/deals/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                        <span className="truncate font-medium">{d.titre}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(d.montant)} FCFA</span>
                          <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? d.statut}</Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun deal pour le moment.</p>
            )}
          </div>

          {peutModifier ? <FormulaireInteraction contactId={fiche.id} /> : null}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Historique</h2>
          {interactions.length > 0 ? (
            <Card className="lg:sticky lg:top-6">
              <CardContent className="flex max-h-[70vh] flex-col divide-y divide-border overflow-y-auto p-0">
                {interactions.map((h) => {
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
            <p className="text-sm text-muted-foreground">Aucune activité pour le moment.</p>
          )}
        </div>
      </div>
    </div>
  );
}
