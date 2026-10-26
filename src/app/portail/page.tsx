import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { FileText, LifeBuoy, Receipt } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { categorieTicketSupport, ticketSupport } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { resoudreMonContact } from "@/lib/portail/acces";
import { lireDocumentsDuContact } from "@/lib/portail/documents";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormulaireNouveauTicketPortail } from "./formulaire-nouveau-ticket-portail";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  OUVERT: { libelle: "Ouvert", variante: "warning" },
  EN_COURS: { libelle: "En cours", variante: "warning" },
  RESOLU: { libelle: "Résolu", variante: "success" },
  FERME: { libelle: "Fermé", variante: "neutral" },
};

type Variante = "success" | "warning" | "neutral" | "danger";

const STATUT_FACTURE: Record<string, { libelle: string; variante: Variante }> = {
  EMISE: { libelle: m("À payer"), variante: "warning" },
  PARTIELLEMENT_PAYEE: { libelle: m("Partiellement payée"), variante: "warning" },
  PAYEE: { libelle: m("Payée"), variante: "success" },
  EN_RETARD: { libelle: m("En retard"), variante: "danger" },
  ANNULEE: { libelle: m("Annulée"), variante: "neutral" },
};
const STATUT_DEVIS: Record<string, { libelle: string; variante: Variante }> = {
  ENVOYE: { libelle: m("En attente de votre réponse"), variante: "warning" },
  ACCEPTE: { libelle: m("Accepté"), variante: "success" },
  REFUSE: { libelle: m("Refusé"), variante: "neutral" },
  EXPIRE: { libelle: m("Expiré"), variante: "neutral" },
};

export default async function PagePortail() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "CLIENT") redirect("/app");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const monContact = await resoudreMonContact(tx, utilisateurConnecte);
    if (!monContact) return null;

    const categories = await tx.select({ id: categorieTicketSupport.id, nom: categorieTicketSupport.nom }).from(categorieTicketSupport).where(eq(categorieTicketSupport.entrepriseId, utilisateurConnecte.entrepriseId));

    const tickets = await tx
      .select({ id: ticketSupport.id, titre: ticketSupport.titre, statut: ticketSupport.statut, categorieNom: categorieTicketSupport.nom, creeLe: ticketSupport.creeLe })
      .from(ticketSupport)
      .innerJoin(categorieTicketSupport, eq(ticketSupport.categorieId, categorieTicketSupport.id))
      .where(eq(ticketSupport.contactId, monContact.id))
      .orderBy(desc(ticketSupport.creeLe));

    const documents = await lireDocumentsDuContact(tx, monContact.id);
    return { categories, tickets, factures: documents.factures, devis: documents.devis };
  });

  // Le layout portail (src/app/portail/layout.tsx) affiche déjà le message
  // "compte non lié" si monContact est absent — ne jamais dupliquer cet
  // écran ici, seulement se retirer proprement si jamais atteint.
  if (!donnees) return null;
  const DATE = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <Receipt className="size-5" aria-hidden />
          <h2 className="text-lg font-semibold tracking-tight">{t("Mes factures")}</h2>
        </div>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.factures.map((f) => {
              const info = STATUT_FACTURE[f.statut] ?? { libelle: f.statut, variante: "neutral" as const };
              return (
                <Link key={f.id} href={`/portail/facture/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.numero}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Émise le {date}", { date: DATE.format(f.dateEmission) })} · {formaterFCFA(f.montantTTC)}
                      {f.solde > 0 && f.solde < f.montantTTC ? ` · ${t("Reste à payer")} : ${formaterFCFA(f.solde)}` : ""}
                    </p>
                  </div>
                  <Badge variant={info.variante}>{t(info.libelle)}</Badge>
                </Link>
              );
            })}
            {donnees.factures.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucune facture pour le moment.")}</p> : null}
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <FileText className="size-5" aria-hidden />
          <h2 className="text-lg font-semibold tracking-tight">{t("Mes devis")}</h2>
        </div>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.devis.map((d) => {
              const info = STATUT_DEVIS[d.statut] ?? { libelle: d.statut, variante: "neutral" as const };
              return (
                <Link key={d.id} href={`/portail/devis/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.numero}</p>
                    <p className="text-xs text-muted-foreground">
                      {formaterFCFA(d.montantTTC)} · {t("Valable jusqu'au {date}", { date: DATE.format(d.dateValidite) })}
                    </p>
                  </div>
                  <Badge variant={info.variante}>{t(info.libelle)}</Badge>
                </Link>
              );
            })}
            {donnees.devis.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucun devis pour le moment.")}</p> : null}
          </div>
        </Card>
      </section>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <LifeBuoy className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Mes tickets d&apos;assistance</h1>
        </div>
        <FormulaireNouveauTicketPortail categories={donnees.categories} />
      </div>

      {donnees.categories.length === 0 ? <p className="text-sm text-muted-foreground">Aucune catégorie d&apos;assistance n&apos;est encore configurée.</p> : null}

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {donnees.tickets.map((tk) => {
            const info = LIBELLE_STATUT[tk.statut] ?? { libelle: tk.statut, variante: "neutral" as const };
            return (
              <Link key={tk.id} href={`/portail/tickets/${tk.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{tk.titre}</p>
                  <p className="text-xs text-muted-foreground">{tk.categorieNom}</p>
                </div>
                <Badge variant={info.variante}>{info.libelle}</Badge>
              </Link>
            );
          })}
          {donnees.tickets.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun ticket pour le moment.</p> : null}
        </div>
      </Card>
    </div>
  );
}
