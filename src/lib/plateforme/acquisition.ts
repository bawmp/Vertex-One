import "server-only";
import { sql } from "drizzle-orm";
import { dbPlateforme } from "@/db/plateforme";
import { EMAIL_DEMO } from "@/lib/demo";
import type { LigneAcquisition } from "@/lib/acquisition/stats";

const date = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string | number | Date));
const nombre = (v: unknown): number => Number(v ?? 0);

/**
 * Une ligne par entreprise cliente, avec les signaux d'activation lus en base (contacts créés, factures émises, règlements reçus de ses
 * clients, dernier paiement d'abonnement confirmé). Lecture seule, rôle plateforme_lecture (voir src/db/plateforme.ts) : la console voit
 * toutes les entreprises, aucune écriture possible. Exclut la démo publique et, par défaut, les entreprises de test (« TEST … ») et de démonstration (« DEMO … »).
 */
export async function recupererAcquisition(options: { inclureTests?: boolean } = {}): Promise<LigneAcquisition[]> {
  // Exclus : les entreprises de test (« TEST … », supprimées par les outils de nettoyage) et celles que l'équipe crée pour ses démonstrations
  // commerciales — à nommer « DEMO … » (jamais « TEST », que le nettoyage supprimerait).
  const exclureTests = options.inclureTests ? sql`` : sql`and e.nom not like 'TEST %' and e.nom not like 'DEMO %'`;
  const resultat = await dbPlateforme.execute(sql`
    select
      e.id, e.nom, e.secteur_profil as secteur, e.cree_le, e.essai_fin_le, e.abonnement_echeance_le as echeance_le,
      e.origine_source, e.origine_campagne, e.origine_parrain,
      adm.nom_complet as admin_nom, adm.email as admin_email,
      (select count(*)::int from contact c where c.entreprise_id = e.id) as nb_contacts,
      (select count(*)::int from facture f where f.entreprise_id = e.id) as nb_factures,
      (select min(f.date_emission) from facture f where f.entreprise_id = e.id) as premiere_facture_le,
      (select count(*)::int from paiement p where p.entreprise_id = e.id) as nb_paiements_clients,
      exists (select 1 from tentative_paiement_abonnement t where t.entreprise_id = e.id and t.statut = 'CONFIRME') as payant,
      dernier.montant as dernier_montant, dernier.mois as dernier_mois
    from entreprise e
    left join lateral (
      select u.nom_complet, u.email from utilisateur u
      where u.entreprise_id = e.id and u.role = 'ADMIN' and u.statut <> 'SUPPRIME' order by u.cree_le limit 1
    ) adm on true
    left join lateral (
      select t.montant, t.mois from tentative_paiement_abonnement t
      where t.entreprise_id = e.id and t.statut = 'CONFIRME' order by t.confirme_le desc nulls last limit 1
    ) dernier on true
    where not exists (select 1 from utilisateur d where d.entreprise_id = e.id and d.email = ${EMAIL_DEMO})
    ${exclureTests}
    order by e.cree_le desc
  `);

  return (resultat.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nom: String(r.nom),
    secteur: String(r.secteur),
    creeLe: date(r.cree_le)!,
    essaiFinLe: date(r.essai_fin_le)!,
    echeanceLe: date(r.echeance_le)!,
    origineSource: (r.origine_source as string | null) ?? null,
    origineCampagne: (r.origine_campagne as string | null) ?? null,
    origineParrain: (r.origine_parrain as string | null) ?? null,
    adminNom: (r.admin_nom as string | null) ?? null,
    adminEmail: (r.admin_email as string | null) ?? null,
    nbContacts: nombre(r.nb_contacts),
    nbFactures: nombre(r.nb_factures),
    premiereFactureLe: date(r.premiere_facture_le),
    nbPaiementsClients: nombre(r.nb_paiements_clients),
    payant: r.payant === true,
    dernierMontant: r.dernier_montant === null || r.dernier_montant === undefined ? null : nombre(r.dernier_montant),
    dernierMois: r.dernier_mois === null || r.dernier_mois === undefined ? null : nombre(r.dernier_mois),
  }));
}
