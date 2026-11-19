import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Phone, Mail, Building2, BellRing, MessageCircle, PhoneCall, StickyNote } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, lead } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { STATUT_LEAD } from "@/lib/libelles";
import { historiqueRelances } from "@/lib/crm/prospects-donnees";
import { ETAT_RELANCE, LIBELLES_CANAL_RELANCE, etatRelance, type CanalRelance } from "@/lib/crm/prospects";
import { infoAuto } from "@/lib/crm/sequence-prospects";
import { lireConfiguration } from "@/lib/crm/sequence-prospects-executer";
import { ResumeAuto } from "../../prospects/resume-auto";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditeurNotes } from "@/components/editeur-notes";
import { ChangeurStatutLead } from "./changeur-statut-lead";
import { BoutonSupprimerCrm } from "../../bouton-supprimer-crm";
import { BoutonDevenirClient } from "../../prospects/bouton-devenir-client";
import { PanneauRelance } from "../../prospects/panneau-relance";
import { modifierNotesLead } from "@/lib/actions/lead";
import { getT } from "@/lib/i18n/langue";

const ICONE_CANAL: Record<string, typeof Mail> = { email: Mail, whatsapp: MessageCircle, appel: PhoneCall, note: StickyNote };

export default async function PageFicheLead({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
    const [ligne] = await tx.select().from(lead).where(eq(lead.id, id));
    if (!ligne) return null;
    if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return null;
    // Un prospect qualifié (pas encore client) a un historique de relances et se relance depuis cette fiche.
    const estProspect = ligne.statut === "QUALIFIE" && !ligne.convertiLe;
    const historique = estProspect || ligne.convertiLe ? await historiqueRelances(tx, ligne.id) : [];
    const [ent] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return { ligne, historique, nomEntreprise: ent?.nom ?? "", config: await lireConfiguration(tx, utilisateurConnecte.entrepriseId) };
  });

  if (!donnees) notFound();
  const { ligne: fiche, historique, nomEntreprise, config } = donnees;
  const info = STATUT_LEAD[fiche.statut];
  const peutModifier = peut(utilisateurConnecte, "CRM", "MODIFIER");
  const modifierNotesAction = modifierNotesLead.bind(null, fiche.id);
  const estProspect = fiche.statut === "QUALIFIE" && !fiche.convertiLe;
  // Une remarque (canal « note ») n'est pas une relance.
  const derniere = historique.find((h) => h.canal !== "note")?.creeLe ?? null;
  const etat = estProspect ? etatRelance({ rappelLe: fiche.rappelLe, derniereRelanceLe: derniere }) : null;
  // Relance automatique : seulement si l'entreprise l'a activée, et pour un prospect qualifié.
  const auto =
    estProspect && config?.active
      ? infoAuto({ ...fiche, derniereRelanceLe: derniere }, config.delais)
      : null;
  const formatDate = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Douala" });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{fiche.nom}</h1>
            <Badge variant={fiche.convertiLe ? "success" : info?.variante ?? "neutral"}>{fiche.convertiLe ? t("Devenu client") : t(info?.libelle ?? fiche.statut)}</Badge>
            {etat ? <Badge variant={ETAT_RELANCE[etat].variante}>{t(ETAT_RELANCE[etat].libelle)}</Badge> : null}
          </div>
          {fiche.societeCliente ? (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="size-3.5" aria-hidden />
              {fiche.societeCliente}
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
            {auto ? <ResumeAuto auto={auto} /> : null}
            {estProspect && fiche.rappelLe ? (
              <span className="flex items-center gap-1.5">
                <BellRing className="size-3.5" aria-hidden />
                {t("Rappel le {date}", { date: new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${fiche.rappelLe}T12:00:00Z`)) })}
              </span>
            ) : null}
          </div>
        </div>

        {peutModifier && estProspect ? (
          <BoutonDevenirClient leadId={fiche.id} />
        ) : fiche.convertiLe && fiche.contactConvertiId ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" render={<Link href={`/app/contacts/${fiche.contactConvertiId}`} />} nativeButton={false}>
              {t("Voir le contact")}
            </Button>
            {fiche.dealConvertiId ? (
              <Button size="sm" variant="outline" render={<Link href={`/app/deals/${fiche.dealConvertiId}`} />} nativeButton={false}>
                {t("Voir le Deal")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {peutModifier && !fiche.convertiLe ? <ChangeurStatutLead leadId={fiche.id} statutActuel={fiche.statut} /> : null}

      {!fiche.convertiLe && fiche.statut !== "QUALIFIE" ? (
        <p className="text-sm text-muted-foreground">
          {t("Passez ce lead au statut « Qualifié » pour qu'il rejoigne les prospects qualifiés, où vous pourrez le relancer jusqu'à ce qu'il devienne client.")}
        </p>
      ) : null}

      {estProspect && peutModifier ? (
        <PanneauRelance
          prospect={{ id: fiche.id, nom: fiche.nom, telephone: fiche.telephone, email: fiche.email, rappelLe: fiche.rappelLe, auto }}
          nomEntreprise={nomEntreprise}
        />
      ) : null}

      {peut(utilisateurConnecte, "CRM", "SUPPRIMER") ? <BoutonSupprimerCrm type="lead" id={fiche.id} nom={fiche.nom} /> : null}

      {historique.length > 0 ? (
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("Historique des relances")}</h2>
            <ol className="flex flex-col gap-3">
              {historique.map((h) => {
                const Icone = ICONE_CANAL[h.canal] ?? StickyNote;
                return (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{t(LIBELLES_CANAL_RELANCE[h.canal as CanalRelance] ?? h.canal)}</span>
                        <span>{formatDate.format(h.creeLe)}</span>
                        {h.automatique ? <span>{t("Automatique")}</span> : h.auteurNom ? <span>{h.auteurNom}</span> : null}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words">{h.contenu}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}

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
    </div>
  );
}
