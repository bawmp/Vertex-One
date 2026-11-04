"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { genererCle } from "@/lib/api-externe/cle";
import { FORME_ETAT, NOM_CLE_KYRIA, kyriaConfigure, retourAutorise, transmettreCleAKyria } from "@/lib/kyria/connexion";

const CHEMIN = "/app/parametres/integrations";
const MAX_CLES_ACTIVES = 10;

function versRetour(retour: string, statut: string): never {
  const url = new URL(retour);
  url.searchParams.set("statut", statut);
  redirect(url.toString());
}

/**
 * L'Administrateur autorise Kyria (écran /app/parametres/integrations/kyria, arrivé depuis son portail Kyria). Crée une clé dédiée « Kyria WhatsApp »
 * (création de prospects SEULEMENT : jamais le droit de facturer), la transmet au serveur de Kyria, puis renvoie le navigateur vers le portail
 * avec un statut (ok, echec, droits, limite, indisponible). Les droits sont revérifiés ICI, jamais seulement sur l'écran. Une connexion
 * réussie révoque les anciennes clés « Kyria WhatsApp » (une seule reste active) ; une transmission ratée révoque la clé qu'on vient de créer.
 */
export async function autoriserKyria(formData: FormData): Promise<void> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const etat = String(formData.get("etat") ?? "");
  const retour = retourAutorise(String(formData.get("retour") ?? ""));
  if (!FORME_ETAT.test(etat) || !retour) redirect(`${CHEMIN}/kyria?erreur=invalide`);

  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) return versRetour(retour, "droits");
  if (!kyriaConfigure()) return versRetour(retour, "indisponible");

  const { cle, prefixe, empreinte } = genererCle();
  const creation = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const actives = await tx
      .select({ id: cleApiEntreprise.id })
      .from(cleApiEntreprise)
      .where(and(eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId), isNull(cleApiEntreprise.revoqueeLe)));
    if (actives.length >= MAX_CLES_ACTIVES) return null;

    const [ligne] = await tx
      .insert(cleApiEntreprise)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, nom: NOM_CLE_KYRIA, prefixe, empreinte, creeParId: utilisateurConnecte.utilisateurId, autoriseFacturation: false })
      .returning({ id: cleApiEntreprise.id });
    const [e] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return { id: ligne.id, nomEntreprise: e?.nom ?? "" };
  });
  if (!creation) return versRetour(retour, "limite");

  const envoi = await transmettreCleAKyria({ etat, cle, entreprise: creation.nomEntreprise });
  const maintenant = new Date();
  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    envoi.ok
      ? tx
          .update(cleApiEntreprise)
          .set({ revoqueeLe: maintenant })
          .where(and(eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId), eq(cleApiEntreprise.nom, NOM_CLE_KYRIA), isNull(cleApiEntreprise.revoqueeLe), ne(cleApiEntreprise.id, creation.id)))
      : tx
          .update(cleApiEntreprise)
          .set({ revoqueeLe: maintenant })
          .where(and(eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId), eq(cleApiEntreprise.id, creation.id))),
  );
  revalidatePath(CHEMIN);
  return versRetour(retour, envoi.ok ? "ok" : "echec");
}
