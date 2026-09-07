import { redirect } from "next/navigation";
import Link from "next/link";
import { inArray, desc } from "drizzle-orm";
import { FileText, Receipt, Repeat, Wallet, PiggyBank } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { devis, facture, factureRecurrente, recuVente, factureAcompte, contact, compteClient } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  STATUT_DEVIS,
  STATUT_FACTURE,
  STATUT_FACTURE_RECURRENTE,
  FREQUENCE_FACTURE_RECURRENTE,
  STATUT_RECU_VENTE,
  STATUT_FACTURE_ACOMPTE,
} from "@/lib/libelles";
import { DeclencheurRelances } from "./declencheur-relances";

export default async function PageFacturation() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const { devisVisibles, facturesVisibles, facturesRecurrentesVisibles, recusVenteVisibles, facturesAcompteVisibles, nomParClientId } = await avecEntreprise(
    utilisateurConnecte.entrepriseId,
    async (tx) => {
      // Découplage Books/CRM (échange du 2026-09-07) — chaque document porte
      // désormais son propre assigneAId, la portée se filtre directement
      // dessus (module "FACTURATION"), sans plus jamais passer par un Deal
      // intermédiaire — même patron que src/app/app/achats/page.tsx.
      const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");

      const filtrer = <T extends { assigneAId: string | null }>(lignes: T[]) =>
        visibles === "TOUT" ? lignes : lignes.filter((l) => l.assigneAId && visibles.includes(l.assigneAId));

      const [dBrut, fBrut, frBrut, rvBrut, faBrut] = await Promise.all([
        tx.select().from(devis).orderBy(desc(devis.creeLe)),
        tx.select().from(facture).orderBy(desc(facture.dateEmission)),
        tx.select().from(factureRecurrente).orderBy(desc(factureRecurrente.creeLe)),
        tx.select().from(recuVente).orderBy(desc(recuVente.dateEmission)),
        tx.select().from(factureAcompte).orderBy(desc(factureAcompte.creeLe)),
      ]);

      const d = filtrer(dBrut);
      const f = filtrer(fBrut);
      const fr = filtrer(frBrut);
      const rv = filtrer(rvBrut);
      const fa = filtrer(faBrut);

      const idsContacts = [...new Set([...d, ...f, ...fr, ...rv, ...fa].map((doc) => doc.contactId).filter((id): id is string => id !== null))];
      const [contacts, comptes] = await Promise.all([
        idsContacts.length > 0 ? tx.select({ id: contact.id, nom: contact.nom }).from(contact).where(inArray(contact.id, idsContacts)) : [],
        tx.select({ id: compteClient.id, nom: compteClient.nom }).from(compteClient),
      ]);
      const nomContactParId = new Map(contacts.map((c) => [c.id, c.nom]));
      const nomCompteParId = new Map(comptes.map((c) => [c.id, c.nom]));
      const nomClient = (doc: { contactId: string | null; compteId: string | null }) =>
        (doc.compteId && nomCompteParId.get(doc.compteId)) || (doc.contactId && nomContactParId.get(doc.contactId)) || "Client";

      return {
        devisVisibles: d,
        facturesVisibles: f,
        facturesRecurrentesVisibles: fr,
        recusVenteVisibles: rv,
        facturesAcompteVisibles: fa,
        nomParClientId: Object.fromEntries([...d, ...f, ...fr, ...rv, ...fa].map((doc) => [doc.id, nomClient(doc)])),
      };
    }
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facturation</h1>
      </div>

      {peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER") ? <DeclencheurRelances /> : null}

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" aria-hidden />
          Devis
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {devisVisibles.map((d) => {
              const info = STATUT_DEVIS[d.statut];
              return (
                <Link
                  key={d.id}
                  href={`/app/facturation/devis/${d.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{d.numero}</span>
                    <span className="text-muted-foreground"> — {nomParClientId[d.id]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{formaterFCFA(d.montantTTC)}</span>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? d.statut}</Badge>
                  </span>
                </Link>
              );
            })}
            {devisVisibles.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun devis.</p> : null}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Receipt className="size-4" aria-hidden />
          Factures
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {facturesVisibles.map((f) => {
              const info = STATUT_FACTURE[f.statut];
              return (
                <Link
                  key={f.id}
                  href={`/app/facturation/factures/${f.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{f.numero}</span>
                    <span className="text-muted-foreground"> — {nomParClientId[f.id]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{formaterFCFA(f.montantTTC)}</span>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? f.statut}</Badge>
                  </span>
                </Link>
              );
            })}
            {facturesVisibles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune facture.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Repeat className="size-4" aria-hidden />
          Factures récurrentes
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {facturesRecurrentesVisibles.map((fr) => {
              const infoStatut = STATUT_FACTURE_RECURRENTE[fr.statut];
              const infoFrequence = FREQUENCE_FACTURE_RECURRENTE[fr.frequence];
              const contenu = (
                <>
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{fr.libelle}</span>
                    <span className="text-muted-foreground"> — {nomParClientId[fr.id]} · {infoFrequence?.libelle ?? fr.frequence}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{formaterFCFA(fr.montantTTC)}</span>
                    <Badge variant={infoStatut?.variante ?? "neutral"}>{infoStatut?.libelle ?? fr.statut}</Badge>
                  </span>
                </>
              );
              return fr.dealId ? (
                <Link key={fr.id} href={`/app/deals/${fr.dealId}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60">
                  {contenu}
                </Link>
              ) : (
                <div key={fr.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  {contenu}
                </div>
              );
            })}
            {facturesRecurrentesVisibles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune facture récurrente.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Wallet className="size-4" aria-hidden />
          Reçus de vente
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {recusVenteVisibles.map((rv) => {
              const info = STATUT_RECU_VENTE[rv.statut];
              const contenu = (
                <>
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{rv.numero}</span>
                    <span className="text-muted-foreground"> — {nomParClientId[rv.id]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{formaterFCFA(rv.montantTTC)}</span>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? rv.statut}</Badge>
                  </span>
                </>
              );
              return rv.dealId ? (
                <Link key={rv.id} href={`/app/deals/${rv.dealId}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60">
                  {contenu}
                </Link>
              ) : (
                <div key={rv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  {contenu}
                </div>
              );
            })}
            {recusVenteVisibles.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun reçu de vente.</p> : null}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <PiggyBank className="size-4" aria-hidden />
          Factures d&apos;acompte
        </h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {facturesAcompteVisibles.map((fa) => {
              const info = STATUT_FACTURE_ACOMPTE[fa.statut];
              const contenu = (
                <>
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{fa.numero}</span>
                    <span className="text-muted-foreground"> — {nomParClientId[fa.id]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-muted-foreground">{formaterFCFA(fa.statut === "EMISE" ? fa.montant : fa.montantRestant)}</span>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? fa.statut}</Badge>
                  </span>
                </>
              );
              return fa.dealId ? (
                <Link key={fa.id} href={`/app/deals/${fa.dealId}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60">
                  {contenu}
                </Link>
              ) : (
                <div key={fa.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  {contenu}
                </div>
              );
            })}
            {facturesAcompteVisibles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune facture d&apos;acompte.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
