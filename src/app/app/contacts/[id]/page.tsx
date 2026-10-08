import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc, inArray } from "drizzle-orm";
import { Phone, Mail, Building2, FolderOpen, Video, Briefcase, StickyNote, MessageCircle, Calendar, FileText, ClipboardList, Repeat, Receipt, Wallet } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { contact, compteClient, interaction, dossier, deal, dealContact, entreprise, contactChampValeur, document, devis, facture, bonCommandeVente, recuVente, factureAcompte, factureRecurrente } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { idsVisibles } from "@/lib/portee";
import { libelleDossier } from "@/lib/vocabulaire";
import { STATUT_DEAL, STATUT_DEVIS, STATUT_FACTURE, STATUT_BON_COMMANDE_VENTE, STATUT_RECU_VENTE, STATUT_FACTURE_ACOMPTE, STATUT_FACTURE_RECURRENTE } from "@/lib/libelles";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditeurNotes } from "@/components/editeur-notes";
import { FormulaireInteraction } from "./formulaire-interaction";
import { BoutonInviterPortail } from "./bouton-inviter-portail";
import { EditeurChampsPersonnalises } from "./editeur-champs-personnalises";
import { ListeDocuments } from "../../projets/liste-documents";
import { FormulaireDocument } from "../../projets/formulaire-document";
import { creerDossier } from "@/lib/actions/dossier";
import { genererEtEnregistrerLienVisio, modifierNotesContact } from "@/lib/actions/contact";
import { listerChampsPersonnalisesContact } from "@/lib/actions/champ-personnalise-contact";
import { estCategorieSensible, peutVoirDocumentSensible } from "@/lib/documents/acces";
import { demandesSuppressionEnAttente } from "@/lib/documents/demandes";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const ICONE_INTERACTION: Record<string, typeof Phone> = {
  appel: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  "rendez-vous": Calendar,
  note: StickyNote,
};

export default async function PageFicheContact({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");

    const [ligne] = await tx.select().from(contact).where(eq(contact.id, id));
    if (!ligne) return null;
    if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return null;

    const [compte, interactions, dossierExistant, dealsPrincipal, dealsSecondaires, [monEntreprise], champsPersonnalises, valeursPersonnalisees, documents, devisListe, facturesListe, visiblesFacturation] =
      await Promise.all([
        ligne.compteId ? tx.select().from(compteClient).where(eq(compteClient.id, ligne.compteId)) : Promise.resolve([null]),
        tx.select().from(interaction).where(eq(interaction.contactId, id)).orderBy(desc(interaction.creeLe)),
        tx.select({ id: dossier.id }).from(dossier).where(eq(dossier.contactId, id)),
        tx.select().from(deal).where(eq(deal.contactId, id)),
        // Un contact « secondaire » d'un deal (voir dealContact, ex. un couple sur un même dossier d'immigration)
        // doit aussi retrouver ce deal sur sa propre fiche, pas seulement le contact principal.
        tx.select({ deal }).from(dealContact).innerJoin(deal, eq(dealContact.dealId, deal.id)).where(eq(dealContact.contactId, id)),
        tx.select({ secteurProfil: entreprise.secteurProfil, planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
        listerChampsPersonnalisesContact(utilisateurConnecte.entrepriseId, tx),
        tx.select().from(contactChampValeur).where(eq(contactChampValeur.contactId, id)),
        tx.select().from(document).where(eq(document.contactId, id)).orderBy(desc(document.creeLe)),
        tx.select().from(devis).where(eq(devis.contactId, id)).orderBy(desc(devis.creeLe)),
        tx.select().from(facture).where(eq(facture.contactId, id)).orderBy(desc(facture.dateEmission)),
        idsVisibles(tx, utilisateurConnecte, "FACTURATION"),
      ]);

    const dealsParId = new Map(dealsPrincipal.map((d) => [d.id, d]));
    for (const { deal: d } of dealsSecondaires) dealsParId.set(d.id, d);
    const deals = [...dealsParId.values()].sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime());

    // Pièces sensibles (identité, santé…) : réservées à l'Administrateur et au responsable — du Dossier si la pièce en
    // a un, sinon du contact. Un document sensible ne s'affiche donc jamais à quelqu'un qui voit seulement la fiche.
    const idsDossiersDocuments = [...new Set(documents.map((d) => d.dossierId).filter((id): id is string => !!id))];
    const dossiersDocuments = idsDossiersDocuments.length > 0 ? await tx.select({ id: dossier.id, responsableId: dossier.responsableId }).from(dossier).where(inArray(dossier.id, idsDossiersDocuments)) : [];
    const responsableParDossier = Object.fromEntries(dossiersDocuments.map((d) => [d.id, d.responsableId]));
    const documentsVisibles = documents.filter(
      (d) => !estCategorieSensible(d.categorie) || peutVoirDocumentSensible(utilisateurConnecte, d.categorie, d.dossierId ? (responsableParDossier[d.dossierId] ?? null) : ligne.assigneAId)
    );
    const demandesSuppression = await demandesSuppressionEnAttente(tx, utilisateurConnecte.entrepriseId, documentsVisibles.map((d) => d.id), peut(utilisateurConnecte, "DOCUMENTS", "SUPPRIMER"));

    const filtreFacturation = <T extends { assigneAId: string }>(lignes: T[]) =>
      visiblesFacturation === "TOUT" ? lignes : lignes.filter((l) => visiblesFacturation.includes(l.assigneAId));

    // Tout ce qui est enregistré dans One Books pour ce client apparaît ici : devis et factures ci-dessus, et les
    // autres documents de vente ci-dessous. Même portée Facturation que les devis/factures (jamais celle du CRM).
    const [bonsCommande, recus, acomptes, recurrentes] = await Promise.all([
      tx.select().from(bonCommandeVente).where(eq(bonCommandeVente.contactId, id)).orderBy(desc(bonCommandeVente.creeLe)),
      tx.select().from(recuVente).where(eq(recuVente.contactId, id)).orderBy(desc(recuVente.creeLe)),
      tx.select().from(factureAcompte).where(eq(factureAcompte.contactId, id)).orderBy(desc(factureAcompte.creeLe)),
      tx.select().from(factureRecurrente).where(eq(factureRecurrente.contactId, id)).orderBy(desc(factureRecurrente.creeLe)),
    ]);
    const autresVentes = [
      ...filtreFacturation(bonsCommande).map((x) => ({ cle: `bc-${x.id}`, type: m("Bon de commande"), titre: x.numero, lien: `/app/facturation/bons-commande/${x.id}/pdf`, montant: x.montantTTC, statut: STATUT_BON_COMMANDE_VENTE[x.statut], statutBrut: x.statut })),
      ...filtreFacturation(recus).map((x) => ({ cle: `rv-${x.id}`, type: m("Reçu de vente"), titre: x.numero, lien: `/app/facturation/recus-vente/${x.id}/pdf`, montant: x.montantTTC, statut: STATUT_RECU_VENTE[x.statut], statutBrut: x.statut })),
      ...filtreFacturation(acomptes).map((x) => ({ cle: `fa-${x.id}`, type: m("Facture d'acompte"), titre: x.numero, lien: `/app/facturation/acomptes/${x.id}/pdf`, montant: x.montant, statut: STATUT_FACTURE_ACOMPTE[x.statut], statutBrut: x.statut })),
      ...filtreFacturation(recurrentes).map((x) => ({ cle: `fr-${x.id}`, type: m("Facture récurrente"), titre: x.libelle, lien: null as string | null, montant: x.montantTTC, statut: STATUT_FACTURE_RECURRENTE[x.statut], statutBrut: x.statut })),
    ];

    return {
      fiche: ligne,
      compte: Array.isArray(compte) ? compte[0] : compte,
      interactions,
      dossierExistant: dossierExistant[0] ?? null,
      deals,
      dossiersDisponibles: disponible(monEntreprise, "DOSSIERS"),
      signatureDisponible: disponible(monEntreprise, "SIGNATURE_ELECTRONIQUE"),
      secteurProfil: monEntreprise?.secteurProfil ?? "generique",
      champsPersonnalises,
      valeursPersonnalisees,
      documents: documentsVisibles,
      demandesSuppression,
      autresVentes,
      devisListe: filtreFacturation(devisListe),
      facturesListe: filtreFacturation(facturesListe),
    };
  });

  if (!donnees) notFound();
  const {
    fiche,
    compte,
    interactions,
    dossierExistant,
    deals,
    dossiersDisponibles,
    signatureDisponible,
    secteurProfil,
    champsPersonnalises,
    valeursPersonnalisees,
    documents,
    demandesSuppression,
    autresVentes,
    devisListe,
    facturesListe,
  } = donnees;
  const mapValeurs = Object.fromEntries(valeursPersonnalisees.map((v) => [v.champId, v.valeur]));
  const vocabDossier = libelleDossier(secteurProfil);
  const peutModifier = peut(utilisateurConnecte, "CRM", "MODIFIER");
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
          {peut(utilisateurConnecte, "CRM", "CREER") ? (
            <Button size="sm" render={<Link href={`/app/deals/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
              <Briefcase data-icon="inline-start" aria-hidden />
              {t("Nouveau deal")}
            </Button>
          ) : null}
          {peutModifier ? (
            <form action={genererEtEnregistrerLienVisio.bind(null, fiche.id)}>
              <Button type="submit" variant="outline" size="sm">
                <Video data-icon="inline-start" aria-hidden />
                {t("Lien de visio")}
              </Button>
            </form>
          ) : null}
          {dossiersDisponibles && peut(utilisateurConnecte, "DOSSIERS", "VOIR") ? (
            dossierExistant ? (
              <Button variant="outline" size="sm" render={<Link href={`/app/projets/dossiers/${dossierExistant.id}`} />} nativeButton={false}>
                <FolderOpen data-icon="inline-start" aria-hidden />
                {t("Voir le {objet}", { objet: t(vocabDossier.singulier).toLowerCase() })}
              </Button>
            ) : peut(utilisateurConnecte, "DOSSIERS", "CREER") ? (
              <form action={creerDossier.bind(null, fiche.id)}>
                <Button type="submit" variant="outline" size="sm">
                  <FolderOpen data-icon="inline-start" aria-hidden />
                  {t("Ouvrir un {objet}", { objet: t(vocabDossier.singulier).toLowerCase() })}
                </Button>
              </form>
            ) : null
          ) : null}
        </div>
      </div>

      {utilisateurConnecte.role === "ADMIN" ? (
        <div className="flex flex-wrap gap-2">
          {fiche.utilisateurId ? (
            <p className="text-sm text-muted-foreground">{t("Déjà invité(e) au portail.")}</p>
          ) : (
            <BoutonInviterPortail contactId={fiche.id} emailActuel={fiche.email} />
          )}
        </div>
      ) : null}

      {peut(utilisateurConnecte, "FACTURATION", "CREER") ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/devis/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <FileText data-icon="inline-start" aria-hidden />
            {t("Créer un devis")}
          </Button>
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/bons-commande/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <ClipboardList data-icon="inline-start" aria-hidden />
            {t("Créer un bon de commande")}
          </Button>
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/recurrentes/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <Repeat data-icon="inline-start" aria-hidden />
            {t("Créer une facture récurrente")}
          </Button>
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/recus-vente/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <Receipt data-icon="inline-start" aria-hidden />
            {t("Créer un reçu de vente")}
          </Button>
          <Button size="sm" variant="outline" render={<Link href={`/app/facturation/acomptes/nouveau?contactId=${fiche.id}`} />} nativeButton={false}>
            <Wallet data-icon="inline-start" aria-hidden />
            {t("Créer une facture d'acompte")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t("Notes")}</h2>
              {peutModifier ? (
                <EditeurNotes notesInitiales={fiche.notes} onEnregistrer={modifierNotesAction} />
              ) : (
                <p className="text-sm text-muted-foreground">{fiche.notes || t("Aucune note.")}</p>
              )}
            </CardContent>
          </Card>

          {champsPersonnalises.length > 0 ? (
            <Card>
              <CardContent>
                <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t("Informations complémentaires")}</h2>
                {peutModifier ? (
                  <EditeurChampsPersonnalises
                    contactId={fiche.id}
                    champs={champsPersonnalises.map((c) => ({ id: c.id, libelle: c.libelle, type: c.type, obligatoire: c.obligatoire, options: c.options }))}
                    valeurs={mapValeurs}
                  />
                ) : (
                  <dl className="flex flex-col gap-2 text-sm">
                    {champsPersonnalises.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">{c.libelle}</dt>
                        <dd className="font-medium">{mapValeurs[c.id] === "oui" && c.type === "CASE_A_COCHER" ? t("Oui") : mapValeurs[c.id] || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </CardContent>
            </Card>
          ) : null}

          {peut(utilisateurConnecte, "DOCUMENTS", "VOIR") ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">{t("Documents")}</h2>
              <ListeDocuments
                documents={documents}
                peutSupprimer={peut(utilisateurConnecte, "DOCUMENTS", "SUPPRIMER")}
                peutDemanderSignature={peut(utilisateurConnecte, "SIGNATURE", "CREER") && signatureDisponible}
                utilisateurId={utilisateurConnecte.utilisateurId}
                peutDemander
                peutTraiter={peut(utilisateurConnecte, "DOCUMENTS", "SUPPRIMER")}
                demandes={demandesSuppression}
              />
              {peut(utilisateurConnecte, "DOCUMENTS", "CREER") ? (
                // Pièces privées du client (identité, santé…) : propres à One CRM, jamais visibles dans One Books ni dans le
                // module Documents ; déposables seulement par l'Administrateur et le responsable du contact.
                <FormulaireDocument
                  contactId={fiche.id}
                  consentementManquant={false}
                  autoriserSensible={peutVoirDocumentSensible(utilisateurConnecte, "PIECE_IDENTITE", fiche.assigneAId)}
                  attesterConsentement
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">{t("Deals")}</h2>
            {deals.length > 0 ? (
              <Card className="p-0">
                <div className="flex flex-col divide-y divide-border">
                  {deals.map((d, index) => {
                    const info = STATUT_DEAL[d.statut];
                    return (
                      <Link
                        key={d.id}
                        href={`/app/deals/${d.id}`}
                        style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                        className="group/ligne relative flex animate-in fade-in items-center justify-between gap-3 overflow-hidden px-4 py-2.5 text-sm fill-mode-both duration-300 hover:bg-muted/50"
                      >
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100"
                        />
                        <span className="truncate font-medium transition-transform duration-150 group-hover/ligne:translate-x-1">{d.titre}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">{new Intl.NumberFormat(t.locale).format(d.montant)} FCFA</span>
                          <Badge variant={info?.variante ?? "neutral"}>{t(info?.libelle ?? d.statut)}</Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">{t("Aucun deal pour le moment.")}</p>
            )}
          </div>

          {peut(utilisateurConnecte, "FACTURATION", "VOIR") ? (
            <>
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-muted-foreground">{t("Devis")}</h2>
                {devisListe.length > 0 ? (
                  <Card className="p-0">
                    <div className="flex flex-col divide-y divide-border">
                      {devisListe.map((d) => {
                        const infoDevis = STATUT_DEVIS[d.statut];
                        return (
                          <Link key={d.id} href={`/app/facturation/devis/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                            <span className="font-medium">{d.numero}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{formaterFCFA(d.montantTTC)}</span>
                              <Badge variant={infoDevis?.variante ?? "neutral"}>{t(infoDevis?.libelle ?? d.statut)}</Badge>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("Aucun devis.")}</p>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-muted-foreground">{t("Factures")}</h2>
                {facturesListe.length > 0 ? (
                  <Card className="p-0">
                    <div className="flex flex-col divide-y divide-border">
                      {facturesListe.map((f) => {
                        const infoFacture = STATUT_FACTURE[f.statut];
                        return (
                          <Link key={f.id} href={`/app/facturation/factures/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                            <span className="font-medium">{f.numero}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{formaterFCFA(f.montantTTC)}</span>
                              <Badge variant={infoFacture?.variante ?? "neutral"}>{t(infoFacture?.libelle ?? f.statut)}</Badge>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("Aucune facture.")}</p>
                )}
              </div>

              {autresVentes.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <h2 className="text-sm font-medium text-muted-foreground">{t("Autres documents de vente")}</h2>
                  <Card className="p-0">
                    <div className="flex flex-col divide-y divide-border">
                      {autresVentes.map((v) => {
                        const contenu = (
                          <>
                            <span className="flex min-w-0 items-center gap-2">
                              <Badge variant="neutral">{t(v.type)}</Badge>
                              <span className="truncate font-medium">{v.titre}</span>
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="text-xs text-muted-foreground">{formaterFCFA(v.montant)}</span>
                              <Badge variant={v.statut?.variante ?? "neutral"}>{t(v.statut?.libelle ?? v.statutBrut)}</Badge>
                            </div>
                          </>
                        );
                        return v.lien ? (
                          // Ces documents n'ont pas de page de détail, seulement leur PDF : lien ordinaire, nouvel onglet.
                          <a key={v.cle} href={v.lien} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                            {contenu}
                          </a>
                        ) : (
                          <div key={v.cle} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                            {contenu}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              ) : null}
            </>
          ) : null}

          {peutModifier ? <FormulaireInteraction contactId={fiche.id} /> : null}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("Historique")}</h2>
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
                            {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(h.creeLe)}
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
            <p className="text-sm text-muted-foreground">{t("Aucune activité pour le moment.")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
