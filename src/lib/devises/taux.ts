import { and, desc, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { tauxChange } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { dateJourValide, deviseValide, lireTaux, normaliserDevise, type TauxLu } from "./regles";

export type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

export async function listerTaux(tx: TransactionDrizzle, entrepriseId: string): Promise<TauxLu[]> {
  return tx
    .select({ id: tauxChange.id, devise: tauxChange.devise, tauxMilliemes: tauxChange.tauxMilliemes, dateEffet: tauxChange.dateEffet })
    .from(tauxChange)
    .where(eq(tauxChange.entrepriseId, entrepriseId))
    .orderBy(tauxChange.devise, desc(tauxChange.dateEffet));
}

/** Enregistre un taux à une date ; le même couple devise + date est remplacé (correction d'une saisie). */
export async function enregistrerTaux(tx: TransactionDrizzle, entrepriseId: string, saisie: { devise: string; taux: string; dateEffet: string }): Promise<Resultat> {
  const devise = normaliserDevise(saisie.devise);
  if (!deviseValide(devise)) return { ok: false, erreur: m("La devise s'écrit avec trois lettres (EUR, USD…), le FCFA étant la devise de la comptabilité.") };
  const milliemes = lireTaux(saisie.taux);
  if (!milliemes) return { ok: false, erreur: m("Le taux est un nombre positif, trois décimales au plus (exemple : 655,957).") };
  if (!dateJourValide(saisie.dateEffet)) return { ok: false, erreur: m("La date d'effet n'est pas valide.") };
  await tx
    .insert(tauxChange)
    .values({ entrepriseId, devise, tauxMilliemes: milliemes, dateEffet: saisie.dateEffet })
    .onConflictDoUpdate({ target: [tauxChange.entrepriseId, tauxChange.devise, tauxChange.dateEffet], set: { tauxMilliemes: milliemes } });
  return { ok: true };
}

export async function supprimerTaux(tx: TransactionDrizzle, entrepriseId: string, id: string): Promise<Resultat> {
  const sup = await tx.delete(tauxChange).where(and(eq(tauxChange.id, id), eq(tauxChange.entrepriseId, entrepriseId))).returning({ id: tauxChange.id });
  return sup.length ? { ok: true } : { ok: false, erreur: m("Taux introuvable.") };
}
