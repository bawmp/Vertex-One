import { and, eq, isNull } from "drizzle-orm";
import { connexionBoutique } from "@/db/schema";
import { enregistrerCommandeSite } from "@/lib/api-externe/stock-site";
import { m } from "@/lib/i18n/catalogue";
import { montant } from "../valeurs";
import { avertir, erreur, nouveauRapport, type ContexteImport, type LigneImport, type Rapport } from "./commun";

const NOM_CONNEXION_FICHIER = "Échange de fichiers";

/**
 * Commandes d'un site exportées en fichier (2026-11-12) : pour une boutique qu'on ne peut pas connecter automatiquement (Shopify, Wix,
 * PrestaShop, un simple tableur…). Une ligne par article commandé ; les lignes d'un même numéro de commande forment UNE commande, qui
 * fait sortir le stock des produits reconnus (même code-barres) exactement comme une commande reçue par l'API ou par WooCommerce.
 * Idempotent par numéro de commande : réimporter le même fichier (ou un export qui en contient une partie) ne fait jamais sortir le stock
 * deux fois — le numéro déjà vu est ignoré. Un code inconnu ne bloque pas : il est signalé, la commande est enregistrée.
 */
export async function importerCommandesSite(ctx: ContexteImport, lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId, utilisateurId } = ctx;
  const rapport = nouveauRapport();

  // Regroupement par numéro de commande (sans tenir compte de la casse ni des espaces), codes répétés additionnés.
  const commandes = new Map<string, { reference: string; articles: Map<string, { code: string; quantite: number }> }>();
  for (const { numero, v } of lignes) {
    const reference = (v.reference ?? "").trim().slice(0, 120);
    const code = (v.code ?? "").trim().slice(0, 100);
    if (!reference) {
      erreur(rapport, numero, m("Numéro de commande manquant."));
      continue;
    }
    if (!code) {
      erreur(rapport, numero, m("Code de l'article manquant."));
      continue;
    }
    const quantite = montant(v.quantite);
    if (quantite === null || quantite < 1 || quantite > 100_000) {
      erreur(rapport, numero, m("Quantité invalide (un nombre entier d'au moins 1)."));
      continue;
    }
    const cle = reference.toLowerCase();
    const commande = commandes.get(cle) ?? { reference, articles: new Map() };
    const a = commande.articles.get(code.toLowerCase());
    if (a) a.quantite += quantite;
    else commande.articles.set(code.toLowerCase(), { code, quantite });
    commandes.set(cle, commande);
  }
  if (commandes.size === 0) return rapport;

  // La connexion « échange de fichiers » est créée à la demande (une seule par entreprise) : c'est elle qui porte l'idempotence.
  let [connexion] = await tx
    .select({ id: connexionBoutique.id, nom: connexionBoutique.nom, depotId: connexionBoutique.depotId })
    .from(connexionBoutique)
    .where(and(eq(connexionBoutique.entrepriseId, entrepriseId), eq(connexionBoutique.type, "FICHIER"), isNull(connexionBoutique.archiveeLe)))
    .limit(1);
  if (!connexion) {
    [connexion] = await tx
      .insert(connexionBoutique)
      .values({ entrepriseId, type: "FICHIER", nom: NOM_CONNEXION_FICHIER, creeParId: utilisateurId })
      .returning({ id: connexionBoutique.id, nom: connexionBoutique.nom, depotId: connexionBoutique.depotId });
  }

  let codesInconnus = 0;
  let sansSuivi = 0;
  for (const c of commandes.values()) {
    const r = await enregistrerCommandeSite(tx, entrepriseId, { id: connexion.id, nom: connexion.nom, depotStockId: connexion.depotId, origine: "connexion" }, { reference: c.reference, lignes: [...c.articles.values()] });
    if (r.doublon) {
      rapport.ignores++;
      continue;
    }
    rapport.crees++;
    codesInconnus += r.lignes.filter((l) => l.statut === "inconnu").length;
    sansSuivi += r.lignes.filter((l) => l.statut === "non_suivi").length;
  }
  if (codesInconnus > 0) avertir(rapport, 0, m("{n} article(s) n'ont pas été reconnus (aucun produit ne porte ce code-barres) : leur stock n'a pas baissé. Renseignez le code dans la fiche du bon produit."), { n: codesInconnus });
  if (sansSuivi > 0) avertir(rapport, 0, m("{n} article(s) correspondent à un produit dont le stock n'est pas suivi : rien n'a baissé."), { n: sansSuivi });
  return rapport;
}
