import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { produit } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { svgEan13 } from "@/lib/produits/codes-barres-regles";
import { getT } from "@/lib/i18n/langue";
import { BoutonImprimer } from "./bouton-imprimer";

export default async function PageEtiquette({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ copies?: string }> }) {
  const { id } = await params;
  const { copies } = await searchParams;
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PRODUITS", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès au catalogue Produits.")}</p>
      </div>
    );
  }
  const [p] = await avecEntreprise(u.entrepriseId, (tx) => tx.select({ nom: produit.nom, prixVente: produit.prixVente, codeBarres: produit.codeBarres }).from(produit).where(and(eq(produit.id, id), eq(produit.entrepriseId, u.entrepriseId))));
  if (!p) notFound();
  const dessin = p.codeBarres ? svgEan13(p.codeBarres, 2, 60) : null;
  const nombre = Math.min(Math.max(Math.floor(Number(copies) || 1), 1), 60);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href={`/app/produits/${id}`} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      {!dessin ? (
        <p className="text-sm text-muted-foreground">{t("Ce produit n'a pas de code EAN-13 : générez-en un depuis sa fiche pour imprimer une étiquette.")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <BoutonImprimer libelle={t("Imprimer")} />
            <form className="flex items-center gap-2 text-sm" method="get">
              <label htmlFor="copies">{t("Nombre d'étiquettes")}</label>
              <input id="copies" name="copies" type="number" min={1} max={60} defaultValue={nombre} className="h-9 w-20 rounded-lg border border-input bg-background px-2" />
              <button type="submit" className="h-9 rounded-lg border px-3 hover:bg-muted">{t("Afficher")}</button>
            </form>
          </div>
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: nombre }, (_, i) => (
              <div key={i} className="flex w-60 break-inside-avoid flex-col items-center gap-1 rounded border border-dashed border-neutral-400 bg-white p-2 text-black print:border-neutral-300">
                <p className="w-full truncate text-center text-xs font-semibold">{p.nom}</p>
                <div dangerouslySetInnerHTML={{ __html: dessin }} />
                <p className="text-sm font-semibold">{formaterFCFA(p.prixVente)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
