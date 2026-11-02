"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Printer, ScanBarcode, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { ChampScan } from "@/components/produits/champ-scan";
import { definirCodeBarresProduit, genererCodeBarresProduit, type EtatCode } from "@/lib/actions/codes-barres";
import { ean13Valide, svgEan13 } from "@/lib/produits/codes-barres-regles";
import { useT } from "@/lib/i18n/contexte";

/**
 * Code-barres d'un produit : on le tape, on le scanne (douchette ou caméra) avec le code collé sur l'emballage, ou on en fait générer un
 * (EAN-13 interne) à imprimer en étiquette. Contrôles refaits côté serveur : un code est unique dans l'entreprise.
 */
export function CodeBarresProduit({ produitId, codeActuel }: { produitId: string; codeActuel: string | null }) {
  const t = useT();
  const [code, setCode] = useState(codeActuel ?? "");
  const [enregistre, setEnregistre] = useState(codeActuel);
  const [etat, setEtat] = useState<EtatCode>(null);
  const [enCours, startTransition] = useTransition();

  function appliquer(r: EtatCode) {
    setEtat(r);
    if (r && !r.erreur) {
      setEnregistre(r.code ?? null);
      setCode(r.code ?? "");
    }
  }
  const dessin = enregistre && ean13Valide(enregistre) ? svgEan13(enregistre, 2, 50) : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <ScanBarcode className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="text-sm font-medium">{t("Code-barres")}</h2>
            <p className="text-sm text-muted-foreground">{t("Scannez le code collé sur l'emballage, ou générez-en un et imprimez l'étiquette. Il permet de retrouver le produit d'un geste.")}</p>
          </div>
        </div>

        <ChampScan placeholder={t("Scanner le code du produit")} onCode={(lu) => { setCode(lu); startTransition(async () => appliquer(await definirCodeBarresProduit(produitId, lu))); }} />

        <form
          className="flex flex-wrap items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setEtat(null);
            startTransition(async () => appliquer(await definirCodeBarresProduit(produitId, code)));
          }}
        >
          <Champ label={t("Code-barres")} name="codeBarres" value={code} onChange={(e) => setCode(e.target.value)} maxLength={48} className="w-72" />
          <Button type="submit" variant="outline" disabled={enCours} className="mt-1">
            {enCours ? <Spinner /> : null}
            {t("Enregistrer le code")}
          </Button>
          <Button type="button" variant="outline" disabled={enCours} className="mt-1" onClick={() => { setEtat(null); startTransition(async () => appliquer(await genererCodeBarresProduit(produitId))); }}>
            <Sparkles data-icon="inline-start" aria-hidden />
            {t("Générer un code")}
          </Button>
        </form>

        {dessin ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border bg-white p-2" dangerouslySetInnerHTML={{ __html: dessin }} />
            <Button variant="outline" size="sm" render={<Link href={`/app/produits/${produitId}/etiquette`} />} nativeButton={false}>
              <Printer data-icon="inline-start" aria-hidden />
              {t("Imprimer l'étiquette")}
            </Button>
          </div>
        ) : enregistre ? (
          <p className="text-xs text-muted-foreground">{t("Ce code n'est pas un EAN-13 : il sert à retrouver le produit mais ne peut pas être imprimé ici. Générez un code pour obtenir une étiquette.")}</p>
        ) : null}

        {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
        {etat?.message ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-4" aria-hidden />
            {etat.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
