"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const DELAI_SECONDES = 8;

/**
 * Fin de parcours : renvoie le client vers son espace de suivi. Juste après un paiement (`automatique`), un compte à rebours de
 * quelques secondes mène seul à l'espace, avec toujours un bouton immédiat et la possibilité de rester ici (le client veut peut-être
 * télécharger son reçu). Sans `automatique` (page rouverte plus tard, ou facture à payer plus tard), seul le bouton est proposé.
 * L'adresse arrive déjà validée par le serveur (https uniquement, voir adresseEspaceClientSure()).
 */
export function RedirectionEspaceClient({ url, automatique, nomEntreprise }: { url: string; automatique: boolean; nomEntreprise: string }) {
  const [reste, setReste] = useState<number | null>(automatique ? DELAI_SECONDES : null);

  useEffect(() => {
    if (reste === null) return;
    if (reste <= 0) {
      window.location.assign(url);
      return;
    }
    const minuterie = window.setTimeout(() => setReste((r) => (r === null ? null : r - 1)), 1000);
    return () => window.clearTimeout(minuterie);
  }, [reste, url]);

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <a href={url} className={buttonVariants({ size: "lg" })}>
        Accéder à mon espace de suivi
        <ArrowRight data-icon="inline-end" aria-hidden />
      </a>
      {reste !== null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Redirection vers l&apos;espace de suivi de {nomEntreprise} dans {Math.max(reste, 0)} s —{" "}
          <button type="button" onClick={() => setReste(null)} className="underline underline-offset-4 hover:text-foreground">
            rester sur cette page
          </button>
        </p>
      ) : null}
    </div>
  );
}
