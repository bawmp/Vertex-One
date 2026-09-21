import { eq, inArray } from "drizzle-orm";
import { commentaire, contact, dossier, projet, tache } from "@/db/schema";
import { booleen, date, normaliser } from "../valeurs";
import { m } from "@/lib/i18n/catalogue";
import { avertir, avertirResponsablesInconnus, compter, erreur, lots, nouveauRapport, resoudreResponsable, TELEPHONE_ABSENT, type ContexteImport, type LigneImport, type Rapport } from "./commun";

export const NOM_CLIENT_PROJETS_IMPORTES = "Projets importés";
const PROJET_PAR_DEFAUT = "Tâches importées";
const LONGUEUR_MAX_NOTE = 2000;

type StatutTache = "A_FAIRE" | "EN_COURS" | "TERMINEE";

/** Statut d'une tâche : la date ou le « oui » de la colonne « terminée » prime, sinon le nom de la section/colonne (Asana : « Doing », « Done »…). */
export function statutDepuisLigne(v: Record<string, string>): { statut: StatutTache; termineeLe: Date | null } {
  const finie = (v.terminee ?? "").trim();
  if (finie) {
    const d = date(finie);
    if (d) return { statut: "TERMINEE", termineeLe: d };
    if (booleen(finie)) return { statut: "TERMINEE", termineeLe: new Date() };
  }
  const section = normaliser(v.section ?? "");
  if (/\b(done|termine|terminee|complete|completed|finished|fini|closed|clos)\b/.test(section)) return { statut: "TERMINEE", termineeLe: new Date() };
  if (/\b(progress|en cours|doing|wip|started|review|revision|in review)\b/.test(section)) return { statut: "EN_COURS", termineeLe: null };
  return { statut: "A_FAIRE", termineeLe: null };
}

/** Le client (et son dossier) auquel rattacher les projets créés — un projet exige un dossier, lui-même rattaché à un client. */
async function dossierDesProjets(ctx: ContexteImport): Promise<{ dossierId: string } | { erreur: string }> {
  const { tx, entrepriseId, utilisateurId, options } = ctx;
  let contactId: string;
  let nomClient: string;

  if (options.contactProjetsId && options.contactProjetsId !== "NOUVEAU") {
    const [choisi] = await tx
      .select({ id: contact.id, nom: contact.nom, assigneAId: contact.assigneAId })
      .from(contact)
      .where(eq(contact.id, options.contactProjetsId));
    // Jamais un identifiant pris tel quel : il doit exister dans CETTE entreprise (RLS) et être visible de l'importateur.
    if (!choisi || (ctx.visibleCrm !== "TOUT" && !ctx.visibleCrm.includes(choisi.assigneAId))) return { erreur: m("Le client choisi pour rattacher les projets est introuvable.") };
    contactId = choisi.id;
    nomClient = choisi.nom;
  } else {
    const [existant] = await tx.select({ id: contact.id, nom: contact.nom }).from(contact).where(eq(contact.nom, NOM_CLIENT_PROJETS_IMPORTES));
    if (existant) {
      contactId = existant.id;
      nomClient = existant.nom;
    } else {
      const [cree] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: NOM_CLIENT_PROJETS_IMPORTES, telephone: TELEPHONE_ABSENT, notes: "Client interne créé par l'import de projets.", assigneAId: utilisateurId })
        .returning({ id: contact.id, nom: contact.nom });
      contactId = cree.id;
      nomClient = cree.nom;
    }
  }

  const [dossierExistant] = await tx.select({ id: dossier.id }).from(dossier).where(eq(dossier.contactId, contactId));
  if (dossierExistant) return { dossierId: dossierExistant.id };
  const [nouveau] = await tx
    .insert(dossier)
    .values({ entrepriseId, contactId, titre: `Dossier ${nomClient}`, responsableId: utilisateurId })
    .returning({ id: dossier.id });
  return { dossierId: nouveau.id };
}

/** Tâches (Asana, Zoho Projects…) : chaque tâche va dans le projet cité, créé s'il n'existe pas ; doublon (même projet, même titre) ignoré. */
export async function importerProjetsEtTaches(ctx: ContexteImport, lignes: LigneImport[]): Promise<Rapport> {
  const { tx, entrepriseId, utilisateurId } = ctx;
  const rapport = nouveauRapport();

  type Prepare = {
    projetNom: string;
    titre: string;
    statut: StatutTache;
    termineeLe: Date | null;
    assigneAId: string;
    echeance: Date | null;
    debut: Date | null;
    notes: string;
  };
  const taches: Prepare[] = [];

  for (const { numero, v } of lignes) {
    const titreBrut = (v.titre ?? "").trim();
    if (!titreBrut) {
      erreur(rapport, numero, m("Titre de la tâche manquant."));
      continue;
    }
    const parent = (v.parent ?? "").trim();
    const projetNom = ((v.projet ?? "").split(",")[0] ?? "").trim() || PROJET_PAR_DEFAUT;
    const { statut, termineeLe } = statutDepuisLigne(v);
    const echeanceBrute = (v.echeance ?? "").trim();
    if (echeanceBrute && !date(echeanceBrute)) avertir(rapport, numero, m("Échéance illisible (« {valeur} ») : ignorée."), { valeur: echeanceBrute });
    taches.push({
      projetNom,
      // Une sous-tâche Asana n'a pas d'équivalent ici : elle devient une tâche à part qui rappelle sa tâche parente.
      titre: (parent ? `${parent} › ${titreBrut}` : titreBrut).slice(0, 300),
      statut,
      termineeLe,
      assigneAId: resoudreResponsable(ctx, v.assigneEmail, v.assigne),
      echeance: date(echeanceBrute),
      debut: date(v.debut),
      notes: (v.notes ?? "").trim().slice(0, LONGUEUR_MAX_NOTE),
    });
  }

  if (taches.length > 0) {
    // Projets existants (comparés sans accents ni casse) et leurs tâches, pour ne rien dupliquer.
    const projetsExistants = await tx.select({ id: projet.id, titre: projet.titre }).from(projet).where(eq(projet.entrepriseId, entrepriseId));
    const projetParNom = new Map(projetsExistants.map((p) => [normaliser(p.titre), p.id]));
    const tachesExistantes = projetsExistants.length
      ? await tx.select({ projetId: tache.projetId, titre: tache.titre }).from(tache).where(inArray(tache.projetId, projetsExistants.map((p) => p.id)))
      : [];
    const dejaLa = new Set(tachesExistantes.map((t) => `${t.projetId}|${normaliser(t.titre)}`));
    const rangParProjet = new Map<string, number>();
    for (const t of tachesExistantes) rangParProjet.set(t.projetId, (rangParProjet.get(t.projetId) ?? 0) + 1);

    // Projets à créer : ceux du fichier qui n'existent pas encore, avec les dates et l'avancement déduits de leurs tâches.
    const groupes = new Map<string, Prepare[]>();
    for (const t of taches) {
      const cle = normaliser(t.projetNom);
      if (!projetParNom.has(cle)) groupes.set(cle, [...(groupes.get(cle) ?? []), t]);
    }

    if (groupes.size > 0) {
      const cible = await dossierDesProjets(ctx);
      if ("erreur" in cible) {
        erreur(rapport, 0, cible.erreur);
        return rapport;
      }
      for (const lot of lots([...groupes.entries()])) {
        const crees = await tx
          .insert(projet)
          .values(
            lot.map(([, membres]) => {
              const debuts = membres.map((t) => t.debut).filter((d): d is Date => d !== null);
              const echeances = membres.map((t) => t.echeance).filter((d): d is Date => d !== null);
              const toutesFinies = membres.every((t) => t.statut === "TERMINEE");
              const uneCommencee = membres.some((t) => t.statut !== "A_FAIRE");
              return {
                entrepriseId,
                dossierId: cible.dossierId,
                titre: membres[0].projetNom.slice(0, 200),
                statut: toutesFinies ? ("TERMINE" as const) : uneCommencee ? ("EN_COURS" as const) : ("A_FAIRE" as const),
                responsablePrincipalId: utilisateurId,
                dateDebut: debuts.length ? new Date(Math.min(...debuts.map((d) => d.getTime()))) : null,
                dateEcheance: echeances.length ? new Date(Math.max(...echeances.map((d) => d.getTime()))) : null,
              };
            })
          )
          .returning({ id: projet.id, titre: projet.titre });
        for (const p of crees) projetParNom.set(normaliser(p.titre), p.id);
      }
      compter(rapport, m("Projets créés"), groupes.size);
    }

    const aInserer: (typeof tache.$inferInsert)[] = [];
    const commentaires: (typeof commentaire.$inferInsert)[] = [];
    for (const t of taches) {
      const projetId = projetParNom.get(normaliser(t.projetNom));
      if (!projetId) continue;
      const cle = `${projetId}|${normaliser(t.titre)}`;
      if (dejaLa.has(cle)) {
        rapport.ignores++;
        continue;
      }
      dejaLa.add(cle);
      const rang = rangParProjet.get(projetId) ?? 0;
      rangParProjet.set(projetId, rang + 1);
      aInserer.push({
        entrepriseId,
        projetId,
        titre: t.titre,
        statut: t.statut,
        assigneAId: t.assigneAId,
        echeance: t.echeance,
        ordre: rang,
        creeParId: utilisateurId,
        termineeLe: t.statut === "TERMINEE" ? (t.termineeLe ?? new Date()) : null,
      });
      // Les tâches n'ont pas de description : leurs notes sont conservées en commentaire du projet.
      if (t.notes) commentaires.push({ entrepriseId, projetId, auteurId: utilisateurId, contenu: `Note de la tâche « ${t.titre} » (import) : ${t.notes}` });
    }
    for (const lot of lots(aInserer)) await tx.insert(tache).values(lot);
    for (const lot of lots(commentaires)) await tx.insert(commentaire).values(lot);
    rapport.crees = aInserer.length;
    compter(rapport, m("Notes de tâches conservées en commentaire"), commentaires.length);
  }

  avertirResponsablesInconnus(ctx, rapport);
  return rapport;
}
