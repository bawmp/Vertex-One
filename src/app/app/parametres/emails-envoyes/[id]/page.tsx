import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { lireSouche } from "@/lib/email/souche";
import { Card } from "@/components/ui/card";
import { getT } from "@/lib/i18n/langue";

function formaterTaille(octets: number): string {
  return octets < 1024 * 1024 ? `${Math.max(1, Math.round(octets / 1024))} Ko` : `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export default async function PageEmailEnvoye({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const e = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => lireSouche(tx, utilisateurConnecte, id));
  if (!e) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/app/parametres/emails-envoyes" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {t("Emails envoyés")}
      </Link>

      <Card className="gap-3 px-4">
        <h1 className="text-lg font-semibold tracking-tight">{e.sujet}</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("À")}</dt>
          <dd>{e.destinataire}</dd>
          <dt className="text-muted-foreground">{t("Envoyé le")}</dt>
          <dd>{e.envoyeLe.toLocaleString(t.locale, { dateStyle: "long", timeStyle: "short" })}</dd>
          <dt className="text-muted-foreground">{t("Par")}</dt>
          <dd>{e.auteurNom ?? t("Envoi automatique")}</dd>
        </dl>
        {e.piecesJointes.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {e.piecesJointes.map((p) => (
              <li key={p.nom} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                <Paperclip className="size-3" aria-hidden />
                {p.nom} <span className="text-muted-foreground">({formaterTaille(p.taille)})</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* Le corps est du HTML déjà envoyé : affiché dans un cadre isolé, sans script ni accès à l'application. */}
      <iframe title={t("Contenu de l'email")} sandbox="" srcDoc={e.corpsHtml} className="min-h-96 w-full rounded-xl border border-border bg-white" />
      <p className="text-xs text-muted-foreground">{t("Le PDF joint n'est pas conservé : il se régénère depuis le document.")}</p>
    </div>
  );
}
