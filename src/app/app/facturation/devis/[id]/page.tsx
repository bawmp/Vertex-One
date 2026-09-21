import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Download, ArrowRight } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { devis, ligneDevis, contact, compteClient, facture } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_DEVIS } from "@/lib/libelles";
import { accepterDevis } from "@/lib/actions/devis";
import { FormulaireEnvoiDevis } from "./formulaire-envoi-devis";
import { EncartLienClient } from "@/components/encart-lien-client";
import { obtenirOuCreerLien, urlPubliqueDevis } from "@/lib/client-documents/liens";
import { getT } from "@/lib/i18n/langue";

export default async function PageDetailDevis({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [d] = await tx.select().from(devis).where(eq(devis.id, id));
    if (!d) return null;

    const [l, [f]] = await Promise.all([
      tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, id)),
      tx.select().from(facture).where(eq(facture.devisOrigineId, id)),
    ]);
    const [p] = d.contactId ? await tx.select().from(contact).where(eq(contact.id, d.contactId)) : [null];
    const [compte] = d.compteId ? await tx.select().from(compteClient).where(eq(compteClient.id, d.compteId)) : [null];

    // Lien à partager au client dès que le devis n'est plus un brouillon.
    const jetonClient = d.statut === "BROUILLON" ? null : await obtenirOuCreerLien(tx, utilisateurConnecte.entrepriseId, { devisId: id });

    return { leDevis: d, lignes: l, leProspect: p, leCompte: compte, laFacture: f ?? null, jetonClient };
  });

  if (!donnees) notFound();
  const { leDevis, lignes, leProspect, leCompte, laFacture, jetonClient } = donnees;

  const quand = (d: Date | null) => (d ? ` le ${new Intl.DateTimeFormat(t.locale, { dateStyle: "long", timeStyle: "short" }).format(d)}` : "");
  const resumeReponse =
    leDevis.statut === "ACCEPTE"
      ? { ton: "succes" as const, texte: leDevis.reponseLe ? `Accepté par le client${quand(leDevis.reponseLe)}.` : "Marqué comme accepté par un collaborateur." }
      : leDevis.statut === "REFUSE"
        ? { ton: "alerte" as const, texte: `Refusé par le client${quand(leDevis.reponseLe)}.${leDevis.motifRefus ? ` Motif : « ${leDevis.motifRefus} »` : " Aucun motif indiqué."}` }
        : null;

  const peutModifier = peut(utilisateurConnecte, "FACTURATION", "MODIFIER");
  const info = STATUT_DEVIS[leDevis.statut];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{leDevis.numero}</h1>
            <Badge variant={info?.variante ?? "neutral"}>{t(info?.libelle ?? leDevis.statut)}</Badge>
          </div>
          <p className="text-muted-foreground">
            {leProspect?.nom}
            {leCompte ? ` — ${leCompte.nom}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<a href={`/app/facturation/devis/${leDevis.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
          nativeButton={false}
        >
          <Download data-icon="inline-start" aria-hidden />
          {t("Télécharger le PDF")}
        </Button>
      </div>

      {jetonClient ? <EncartLienClient url={urlPubliqueDevis(jetonClient)} resume={resumeReponse} /> : null}

      <Card className="p-0">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">{t("Désignation")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("Qté")}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t("Prix unit.")}</th>
              <th className="px-4 py-2.5 text-right font-medium">TVA</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-4 py-2.5">{l.designation}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.quantite}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formaterFCFA(l.prixUnitaire)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.tauxTVA}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <CardContent className="flex flex-col items-end gap-1 border-t bg-muted/20 py-3 text-sm">
          <p className="text-muted-foreground">
            {t("HT :")} <span className="tabular-nums text-foreground">{formaterFCFA(leDevis.montantHT)}</span>
          </p>
          <p className="text-muted-foreground">
            {t("TVA :")} <span className="tabular-nums text-foreground">{formaterFCFA(leDevis.montantTVA)}</span>
          </p>
          <p className="text-lg font-medium">{t("TTC :")} <span className="tabular-nums">{formaterFCFA(leDevis.montantTTC)}</span></p>
        </CardContent>
      </Card>

      {laFacture ? (
        <Link
          href={`/app/facturation/factures/${laFacture.id}`}
          className="flex w-fit items-center gap-1.5 text-primary underline-offset-4 hover:underline"
        >
          {t("Voir la facture {numero}", { numero: laFacture.numero })}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : peutModifier ? (
        <div className="flex gap-2">
          {leDevis.statut === "BROUILLON" ? (
            <FormulaireEnvoiDevis
              devisId={leDevis.id}
              peutPersonnaliserModele={peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")}
            />
          ) : null}
          {leDevis.statut === "ENVOYE" ? (
            <form action={accepterDevis.bind(null, leDevis.id)}>
              <Button type="submit">
                {t("Marquer accepté")}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
