import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { dossierRH, entreprise, rappelAnniversaire, stagiaireAcademique, utilisateur } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";
import { urlBase } from "@/lib/client-documents/liens";
import { alerterParEmail, echapper } from "@/lib/notifications/equipe";
import { anniversairesProches, prochainAnniversaire, type AnniversaireProche, type PersonneAnniversaire } from "./anniversaires-regles";

/**
 * Anniversaires visibles par l'utilisateur connecté : l'Administrateur voit toute l'entreprise, un Manager les collaborateurs de sa
 * portée RH (son équipe) et les stagiaires dont lui ou son équipe est le maître de stage ; un Employé n'en voit aucun. Seuls les
 * collaborateurs actifs et les stagiaires en cours comptent. On ne se rappelle pas son propre anniversaire. Jamais d'autre donnée que
 * le nom et la date de naissance (le salaire n'est même pas lu).
 */
export async function personnesVisiblesAvecNaissance(tx: TransactionDrizzle, u: UtilisateurConnecte): Promise<PersonneAnniversaire[]> {
  if (u.role !== "ADMIN" && u.role !== "MANAGER") return [];
  const ids = await idsVisibles(tx, u, "RH");
  const comptes = await tx
    .select({ id: utilisateur.id, nom: utilisateur.nomComplet, naissance: dossierRH.dateNaissance })
    .from(dossierRH)
    .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
    .where(
      and(
        eq(dossierRH.entrepriseId, u.entrepriseId),
        eq(utilisateur.entrepriseId, u.entrepriseId),
        eq(utilisateur.statut, "ACTIF"),
        isNotNull(dossierRH.dateNaissance),
        ids === "TOUT" ? undefined : inArray(dossierRH.utilisateurId, ids)
      )
    );
  const stagiaires = await tx
    .select({ id: stagiaireAcademique.id, nom: stagiaireAcademique.nom, naissance: stagiaireAcademique.dateNaissance, maitre: stagiaireAcademique.maitreStageId, creePar: stagiaireAcademique.creeParId })
    .from(stagiaireAcademique)
    .where(and(eq(stagiaireAcademique.entrepriseId, u.entrepriseId), eq(stagiaireAcademique.statut, "EN_COURS"), isNotNull(stagiaireAcademique.dateNaissance)));
  const permis = ids === "TOUT" ? null : new Set(ids);
  return [
    ...comptes.filter((c) => c.id !== u.utilisateurId && c.naissance).map((c): PersonneAnniversaire => ({ type: "UTILISATEUR", id: c.id, nom: c.nom, naissance: c.naissance! })),
    ...stagiaires
      .filter((s) => s.naissance && (permis === null || (s.maitre !== null && permis.has(s.maitre)) || s.creePar === u.utilisateurId))
      .map((s): PersonneAnniversaire => ({ type: "STAGIAIRE", id: s.id, nom: s.nom, naissance: s.naissance! })),
  ];
}

export async function anniversairesAVenir(tx: TransactionDrizzle, u: UtilisateurConnecte, aujourdhui: string, fenetre = 30): Promise<AnniversaireProche[]> {
  return anniversairesProches(await personnesVisiblesAvecNaissance(tx, u), aujourdhui, fenetre);
}

export type ResultatRappels = { anniversaires: number; destinataires: number };

/**
 * Rappel du jour pour UNE entreprise : un email par destinataire (Administrateurs actifs, et le responsable direct de la personne : son
 * manager, ou le maître de stage d'un stagiaire), listant les anniversaires d'aujourd'hui qui le concernent. Une personne n'est prévenue
 * qu'une fois par an (table `rappel_anniversaire`) : relancer la tâche ne renvoie rien. On ne prévient jamais quelqu'un de son propre
 * anniversaire. À appeler dans la transaction de l'entreprise (RLS) ; l'envoi est au mieux, un échec n'annule pas le marquage.
 */
export async function traiterRappelsAnniversaires(tx: TransactionDrizzle, entrepriseId: string, aujourdhui: string): Promise<ResultatRappels> {
  const annee = Number(aujourdhui.slice(0, 4));
  const [e] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!e) return { anniversaires: 0, destinataires: 0 };

  const comptes = await tx
    .select({ id: utilisateur.id, nom: utilisateur.nomComplet, naissance: dossierRH.dateNaissance, managerId: utilisateur.managerId })
    .from(dossierRH)
    .innerJoin(utilisateur, eq(dossierRH.utilisateurId, utilisateur.id))
    .where(and(eq(dossierRH.entrepriseId, entrepriseId), eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF"), isNotNull(dossierRH.dateNaissance)));
  const stagiaires = await tx
    .select({ id: stagiaireAcademique.id, nom: stagiaireAcademique.nom, naissance: stagiaireAcademique.dateNaissance, maitre: stagiaireAcademique.maitreStageId })
    .from(stagiaireAcademique)
    .where(and(eq(stagiaireAcademique.entrepriseId, entrepriseId), eq(stagiaireAcademique.statut, "EN_COURS"), isNotNull(stagiaireAcademique.dateNaissance)));

  const aujourdHui = [
    ...comptes.filter((c) => prochainAnniversaire(c.naissance!, aujourdhui)?.jours === 0).map((c) => ({ type: "UTILISATEUR" as const, id: c.id, nom: c.nom, naissance: c.naissance!, responsable: c.managerId })),
    ...stagiaires.filter((s) => prochainAnniversaire(s.naissance!, aujourdhui)?.jours === 0).map((s) => ({ type: "STAGIAIRE" as const, id: s.id, nom: s.nom, naissance: s.naissance!, responsable: s.maitre })),
  ];
  if (aujourdHui.length === 0) return { anniversaires: 0, destinataires: 0 };

  const deja = await tx.select({ type: rappelAnniversaire.cibleType, id: rappelAnniversaire.cibleId }).from(rappelAnniversaire).where(and(eq(rappelAnniversaire.entrepriseId, entrepriseId), eq(rappelAnniversaire.annee, annee)));
  const dejaVus = new Set(deja.map((d) => `${d.type}:${d.id}`));
  const nouveaux = aujourdHui.filter((p) => !dejaVus.has(`${p.type}:${p.id}`));
  if (nouveaux.length === 0) return { anniversaires: 0, destinataires: 0 };

  // Destinataires : Administrateurs actifs + responsables directs actifs.
  const personnes = await tx.select({ id: utilisateur.id, email: utilisateur.email, role: utilisateur.role }).from(utilisateur).where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF")));
  const admins = personnes.filter((p) => p.role === "ADMIN");
  const parId = new Map(personnes.map((p) => [p.id, p]));
  const aPrevenir = new Map<string, typeof nouveaux>();
  const ajouter = (adresseId: string, p: (typeof nouveaux)[number]) => {
    if (p.type === "UTILISATEUR" && adresseId === p.id) return; // jamais son propre anniversaire
    aPrevenir.set(adresseId, [...(aPrevenir.get(adresseId) ?? []), p]);
  };
  for (const p of nouveaux) {
    for (const a of admins) ajouter(a.id, p);
    if (p.responsable && parId.has(p.responsable) && !admins.some((a) => a.id === p.responsable)) ajouter(p.responsable, p);
  }

  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${aujourdhui}T00:00:00Z`));
  for (const [destinataireId, liste] of aPrevenir) {
    const adresse = parId.get(destinataireId)?.email;
    if (!adresse) continue;
    const lignes = liste
      .map((p) => {
        const age = prochainAnniversaire(p.naissance, aujourdhui)?.age;
        return `<li><strong>${echapper(p.nom)}</strong>${age ? ` — ${age} ans` : ""}${p.type === "STAGIAIRE" ? " (stagiaire)" : ""}</li>`;
      })
      .join("");
    await alerterParEmail(
      [adresse],
      liste.length === 1 ? `Anniversaire aujourd'hui : ${liste[0].nom}` : `${liste.length} anniversaires aujourd'hui`,
      `<p>Bonjour,</p><p>Aujourd'hui, ${echapper(date)}, c'est l'anniversaire de :</p><ul>${lignes}</ul><p>Un petit mot leur fera plaisir. <a href="${urlBase()}/app/rh">Voir l'équipe</a></p><p style="color:#666;font-size:12px">Rappel automatique de ${echapper(e.nom)} sur Vertex One : les dates de naissance ne sont visibles que de l'administrateur, du responsable et de la personne concernée.</p>`
    );
  }

  await tx.insert(rappelAnniversaire).values(nouveaux.map((p) => ({ entrepriseId, cibleType: p.type, cibleId: p.id, annee }))).onConflictDoNothing();
  return { anniversaires: nouveaux.length, destinataires: aPrevenir.size };
}
