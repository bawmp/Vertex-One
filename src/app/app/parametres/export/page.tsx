import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Download, ShieldAlert, ArrowRight } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { journalExportDonnees, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { compterDonnees, NOM_FICHIER_EXPORT, TYPES_EXPORT, type TypeExport } from "@/lib/export/exporteurs";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const LIBELLES: Record<TypeExport, { titre: string; detail: string }> = {
  CONTACTS: { titre: m("Contacts et sociétés"), detail: m("Nom, société, NIU, email, téléphone, fonction, notes et responsable.") },
  LEADS: { titre: m("Leads (prospects)"), detail: m("Nom, société, email, téléphone, statut, notes et responsable.") },
  DEALS: { titre: m("Deals (opportunités)"), detail: m("Titre, contact, montant, étape, clôture estimée et responsable.") },
  PRODUITS: { titre: m("Produits et services"), detail: m("Nom, description, type, prix de vente et d'achat, stock.") },
  DEVIS: { titre: m("Devis"), detail: m("Une ligne par ligne de devis : numéro, client, dates, détail et statut.") },
  FACTURES: { titre: m("Factures"), detail: m("Une ligne par ligne de facture : numéro, client, dates, détail, statut et montant payé.") },
  CHAMPS_CONTACT: { titre: m("Champs personnalisés du contact"), detail: m("La structure de la fiche contact : nom, type et choix de chaque champ.") },
  MODELES_EMAIL: { titre: m("Modèles d'email"), detail: m("Les textes d'envoi des devis et des factures que vous avez personnalisés.") },
};

export default async function PageExport() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "VOIR")) {
    return <p className="text-muted-foreground">{t("Seul l'administrateur peut exporter les données de l'entreprise.")}</p>;
  }

  const { comptes, historique } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const comptes = await compterDonnees(tx, utilisateurConnecte.entrepriseId);
    const lignes = await tx
      .select()
      .from(journalExportDonnees)
      .where(eq(journalExportDonnees.entrepriseId, utilisateurConnecte.entrepriseId))
      .orderBy(desc(journalExportDonnees.creeLe))
      .limit(10);
    // Pas de jointure avec `utilisateur` (RLS permissive, Better-Auth) : lecture séparée, entreprise filtrée explicitement.
    const equipe = await tx.select({ id: utilisateur.id, nom: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId));
    const nomParId = new Map(equipe.map((u) => [u.id, u.nom]));
    return { comptes, historique: lignes.map((l) => ({ type: l.type, nombreLignes: l.nombreLignes, creeLe: l.creeLe, auteur: nomParId.get(l.utilisateurId) ?? "—" })) };
  });
  const format = (d: Date) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" }).format(d);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Exporter mes données")}</h1>
        <p className="text-muted-foreground">
          {t("Téléchargez les données de votre espace en fichiers CSV (lisibles dans Excel). Pour les transférer vers un autre espace Vertex One, importez ces fichiers dans l'autre espace, via Paramètres → Importer des données : les colonnes sont reconnues d'elles-mêmes.")}
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <p>
          {t("Ces fichiers contiennent les données personnelles de vos clients. Gardez-les en lieu sûr, ne les envoyez pas par un canal non protégé et supprimez-les une fois le transfert terminé. Chaque téléchargement est consigné ci-dessous.")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {TYPES_EXPORT.map((type) => (
          <Card key={type} className="flex flex-row items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">
                {t(LIBELLES[type].titre)} <span className="font-normal text-muted-foreground">· {comptes[type]}</span>
              </p>
              <p className="text-sm text-muted-foreground">{t(LIBELLES[type].detail)}</p>
            </div>
            <Button size="sm" variant="outline" render={<a href={`/app/parametres/export/${NOM_FICHIER_EXPORT[type]}`} download />} nativeButton={false}>
              <Download data-icon="inline-start" aria-hidden />
              {t("Télécharger")}
            </Button>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{t("Ce qui n'est pas exporté")}</p>
        <p>
          {t("Les pièces jointes et les pièces privées des clients (identité, santé), les valeurs saisies dans les champs personnalisés des contacts (seule leur structure l'est), les comptes utilisateurs, mots de passe et clés d'API. Pour reprendre un espace complet : importez d'abord les champs personnalisés et les contacts, puis les leads, les deals, les produits, les devis et les factures.")}
        </p>
        <Link href="/app/parametres/import" className="flex w-fit items-center gap-1 text-primary underline-offset-4 hover:underline">
          {t("Importer des données")}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {historique.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t("Derniers exports")}</h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {historique.map((h, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span>
                    {t(LIBELLES[h.type as TypeExport]?.titre ?? h.type)} · {t("{n} ligne(s)", { n: h.nombreLignes })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {h.auteur} · {format(h.creeLe)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
