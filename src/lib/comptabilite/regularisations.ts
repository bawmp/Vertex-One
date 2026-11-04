import { and, eq, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise, journalManuel } from "@/db/schema";
import { genererNumeroJournalManuel } from "@/lib/facturation/numerotation";
import { m } from "@/lib/i18n/catalogue";
import { moisDebutExercice } from "./cloture";
import { definitionRegularisation, lignesExtourne, lignesRegularisation, debutExerciceSuivant, type LigneRegularisation, type TypeRegularisation } from "./regularisations-regles";
import { verifierDateNonVerrouillee } from "./verrouillage";

export type ParametresRegularisation = {
  type: TypeRegularisation;
  montant: number;
  /** Numéro du compte de charge ou de produit (obligatoire sauf provision). */
  compteGestion: string | null;
  date: Date;
  libelle: string;
  extourne: boolean;
};

export type ResultatRegularisation = { ok: true; numero: string; numeroExtourne: string | null } | { ok: false; erreur: string };

const formatLong = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Douala" }).format(d);

/**
 * Enregistre la régularisation (journal manuel numéroté) et, si demandé, son extourne au 1er janvier suivant (second journal manuel, miroir
 * exact). Refuse un montant invalide, un compte de gestion qui n'est pas de la bonne classe, une date future éloignée ou une période
 * verrouillée — pour l'écriture ET pour son extourne. À appeler dans la transaction de l'entreprise (RLS) ; droit revérifié par l'appelant.
 */
export async function enregistrerRegularisation(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, p: ParametresRegularisation, maintenant: Date = new Date()): Promise<ResultatRegularisation> {
  const def = definitionRegularisation(p.type);
  if (!def) return { ok: false, erreur: m("Type de régularisation inconnu.") };
  if (Number.isNaN(p.date.getTime())) return { ok: false, erreur: m("Date invalide.") };
  if (p.date.getTime() > maintenant.getTime() + 24 * 60 * 60 * 1000) return { ok: false, erreur: m("La date ne peut pas être dans le futur.") };
  const libelle = p.libelle.trim();
  if (!libelle) return { ok: false, erreur: m("Le libellé est requis.") };

  const lignes = lignesRegularisation(p.type, p.montant, def.classeCompte ? p.compteGestion : null);
  if (!lignes) return { ok: false, erreur: def.classeCompte && !p.compteGestion ? m("Choisissez le compte concerné.") : m("Le montant doit être un nombre entier positif.") };

  const numeros = [...new Set(lignes.map((l) => l.numero))];
  const comptes = await tx.select({ id: compteComptable.id, numero: compteComptable.numero, classe: compteComptable.classe }).from(compteComptable).where(inArray(compteComptable.numero, numeros));
  const parNumero = new Map(comptes.map((c) => [c.numero, c]));
  if (numeros.some((n) => !parNumero.has(n))) return { ok: false, erreur: m("Le plan comptable ne contient pas les comptes nécessaires : contactez le support.") };
  if (def.classeCompte && p.compteGestion && parNumero.get(p.compteGestion)?.classe !== def.classeCompte) {
    return { ok: false, erreur: def.classeCompte === 6 ? m("Choisissez un compte de charge (classe 6).") : m("Choisissez un compte de produit (classe 7).") };
  }

  const [monEntreprise] = await tx.select({ verrou: entreprise.dateVerrouillageComptable }).from(entreprise).where(and(eq(entreprise.id, entrepriseId)));
  const dateExtourne = p.extourne && def.extourne ? debutExerciceSuivant(p.date, await moisDebutExercice(tx, entrepriseId)) : null;
  for (const d of [p.date, dateExtourne]) {
    if (!d) continue;
    const erreur = verifierDateNonVerrouillee(monEntreprise?.verrou ?? null, d);
    if (erreur) return { ok: false, erreur };
  }

  const passer = async (lignesAPasser: LigneRegularisation[], date: Date, intitule: string) => {
    const numero = await genererNumeroJournalManuel(tx, entrepriseId);
    const [journal] = await tx.insert(journalManuel).values({ entrepriseId, numero, libelle: intitule, dateEcriture: date, creeParId: utilisateurId }).returning({ id: journalManuel.id });
    await tx.insert(ecritureComptable).values(
      lignesAPasser.map((l) => ({ entrepriseId, dateEcriture: date, libelle: intitule, compteId: parNumero.get(l.numero)!.id, debit: l.debit, credit: l.credit, journalManuelId: journal.id }))
    );
    return numero;
  };

  const numero = await passer(lignes, p.date, `${def.titre} au ${formatLong(p.date)} — ${libelle}`);
  const numeroExtourne = dateExtourne ? await passer(lignesExtourne(lignes), dateExtourne, `Extourne — ${def.titre} — ${libelle}`) : null;
  return { ok: true, numero, numeroExtourne };
}
