import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Paperclip, SearchX } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { listerSouche } from "@/lib/email/souche";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EtatVide } from "@/components/etat-vide";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const TYPES = {
  DEVIS: m("Devis"),
  FACTURE: m("Facture"),
  BON_COMMANDE: m("Bon de commande"),
  RECU_VENTE: m("Reçu"),
  FACTURE_ACOMPTE: m("Facture d'acompte"),
  CONTRAT: m("Contrat"),
  RELANCE: m("Relance"),
  CAMPAGNE: m("Campagne"),
} as const;

const PAS = 50;

export default async function PageEmailsEnvoyes({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; limite?: string }> }) {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const { q, type, limite: limiteBrute } = await searchParams;
  const limite = Math.min(Math.max(Number(limiteBrute) || PAS, PAS), 500);
  const typeFiltre = type && type in TYPES ? type : undefined;
  const lignes = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => listerSouche(tx, utilisateurConnecte, { recherche: q, type: typeFiltre, limite: limite + 1 }));
  const aPlus = lignes.length > limite;
  const affichees = lignes.slice(0, limite);
  const filtre = Boolean(q?.trim() || typeFiltre);
  const lienPlus = `/app/parametres/emails-envoyes?${new URLSearchParams({ ...(q ? { q } : {}), ...(typeFiltre ? { type: typeFiltre } : {}), limite: String(limite + PAS) }).toString()}`;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Emails envoyés")}</h1>
        <p className="mt-1 text-muted-foreground">
          {utilisateurConnecte.role === "ADMIN"
            ? t("La copie de chaque email envoyé à vos clients : destinataire, objet, message et pièces jointes.")
            : t("La copie des emails que vous avez envoyés à vos clients.")}
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/app/parametres/emails-envoyes">
        <Input name="q" defaultValue={q ?? ""} placeholder={t("Rechercher un destinataire ou un objet…")} className="max-w-xs" aria-label={t("Rechercher un destinataire ou un objet…")} />
        <select name="type" defaultValue={typeFiltre ?? ""} aria-label={t("Type d'email")} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
          <option value="">{t("Tous les types")}</option>
          {Object.entries(TYPES).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {t(libelle)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          {t("Filtrer")}
        </Button>
        {filtre ? (
          <Link href="/app/parametres/emails-envoyes" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            {t("Effacer")}
          </Link>
        ) : null}
      </form>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {affichees.map((e) => (
            <Link key={e.id} href={`/app/parametres/emails-envoyes/${e.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.sujet}</p>
                <p className="truncate text-muted-foreground">
                  {t("À {destinataire}", { destinataire: e.destinataire })}
                  {e.auteurNom ? ` · ${e.auteurNom}` : ` · ${t("envoi automatique")}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {e.nbPiecesJointes > 0 ? (
                  <span className="flex items-center gap-1">
                    <Paperclip className="size-3" aria-hidden />
                    {e.nbPiecesJointes}
                  </span>
                ) : null}
                <Badge variant="neutral">{t(TYPES[e.type as keyof typeof TYPES] ?? e.type)}</Badge>
                <time dateTime={e.envoyeLe.toISOString()}>{e.envoyeLe.toLocaleString(t.locale, { dateStyle: "medium", timeStyle: "short" })}</time>
              </div>
            </Link>
          ))}
          {affichees.length === 0 ? (
            <EtatVide
              icone={filtre ? SearchX : Mail}
              titre={filtre ? t("Aucun email ne correspond à cette recherche.") : t("Aucun email envoyé pour le moment.")}
              description={filtre ? t("Essayez un autre mot, ou effacez les filtres.") : t("Chaque devis, facture ou message envoyé à un client apparaîtra ici, avec sa copie.")}
            />
          ) : null}
        </div>
      </Card>

      {aPlus ? (
        <Link href={lienPlus} className="w-fit text-sm text-primary underline-offset-4 hover:underline">
          {t("Afficher plus")}
        </Link>
      ) : null}
    </div>
  );
}
