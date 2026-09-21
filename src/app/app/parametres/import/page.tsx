import { redirect } from "next/navigation";
import { and, asc, inArray } from "drizzle-orm";
import { Lock, Upload } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { contact } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { idsVisibles } from "@/lib/portee";
import { DEFINITIONS } from "@/lib/import/definitions";
import { NB_MAX_LIGNES_IMPORT } from "@/lib/import/fichier";
import { typesImportables } from "@/lib/import/droits";
import { AssistantImport, type TypeAffiche } from "./assistant-import";

export default async function PageImport() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const types = typesImportables(utilisateurConnecte);
  if (types.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Vous n&apos;avez pas le droit d&apos;importer des données.</p>
      </div>
    );
  }

  // Clients auxquels on peut rattacher des projets importés : seulement ceux que la portée de la personne lui permet de voir.
  const clients = types.includes("PROJETS_TACHES")
    ? await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
        const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
        if (visibles !== "TOUT" && visibles.length === 0) return [];
        return tx
          .select({ id: contact.id, nom: contact.nom })
          .from(contact)
          .where(visibles === "TOUT" ? undefined : and(inArray(contact.assigneAId, visibles)))
          .orderBy(asc(contact.nom))
          .limit(500);
      })
    : [];

  const affiches: TypeAffiche[] = types.map((type) => {
    const def = DEFINITIONS[type];
    return {
      type,
      libelle: def.libelle,
      description: def.description,
      conseils: def.conseils,
      champs: def.champs.map((c) => ({ cle: c.cle, libelle: c.libelle, obligatoire: Boolean(c.obligatoire) })),
    };
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Upload className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Importer des données</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Reprenez vos données depuis Asana, Zoho One (CRM, Books, Projects…) ou toute autre application qui sait exporter en CSV ou Excel (.xlsx). Rien n&apos;est enregistré avant que vous ayez vu le résultat
        d&apos;une simulation et confirmé. Jusqu&apos;à {NB_MAX_LIGNES_IMPORT} lignes et 4 Mo par fichier.
      </p>
      <AssistantImport types={affiches} clients={clients} />
    </div>
  );
}
