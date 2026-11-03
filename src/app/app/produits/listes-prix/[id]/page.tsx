import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Tags } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { lireListe, listerListes } from "@/lib/produits/listes-prix";
import { getT } from "@/lib/i18n/langue";
import { FormulaireListe } from "../formulaire-liste";
import { BoutonSupprimerListe, EditeurPrix } from "./editeur-prix";

export default async function PageListePrix({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => {
    const lue = await lireListe(tx, u.entrepriseId, id);
    if (!lue) return null;
    const resume = (await listerListes(tx, u.entrepriseId)).find((l) => l.id === id);
    return { ...lue, clients: resume?.clients ?? 0 };
  });
  if (!donnees) notFound();
  const peutModifier = peut(u, "PRODUITS", "MODIFIER");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits/listes-prix" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <Tags className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{donnees.liste.nom}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("{n} client(s) utilisent cette liste.", { n: donnees.clients })}</p>
      </div>

      {peutModifier ? (
        <Card>
          <CardContent>
            <FormulaireListe listeId={donnees.liste.id} nom={donnees.liste.nom} remisePourcent={donnees.liste.remisePourcent} />
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t("Prix des produits")}</h2>
        <p className="text-sm text-muted-foreground">{t("Laissez un prix fixe vide pour appliquer la remise de la liste ; saisissez-en un pour qu'il l'emporte.")}</p>
        <EditeurPrix key={`${donnees.liste.id}-${donnees.liste.remisePourcent}`} listeId={donnees.liste.id} remisePourcent={donnees.liste.remisePourcent} lignes={donnees.produits.map((p) => ({ id: p.id, nom: p.nom, prixVente: p.prixVente, prixFixe: p.prixFixe }))} peutModifier={peutModifier} />
      </div>

      {peutModifier ? <BoutonSupprimerListe listeId={donnees.liste.id} clients={donnees.clients} /> : null}
    </div>
  );
}
