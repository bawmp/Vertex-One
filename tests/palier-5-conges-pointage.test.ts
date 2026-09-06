import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, dossierRH, demandeConge, pointage } from "@/db/schema";
import { approuverDemandeConge, refuserDemandeConge } from "@/lib/rh/conges";
import { pointerArrivee, pointerDepart, debutJournee } from "@/lib/rh/pointage";

describe("Palier 5 — congés et pointage", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let dossierRHId: string;
  let adminId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST P5 Congés Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [emp] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "employe-p5-conges@vertexone.test", nomComplet: "Employé Congés", role: "EMPLOYE" })
      .returning({ id: utilisateur.id });
    utilisateurId = emp.id;

    const [adm] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-p5-conges@vertexone.test", nomComplet: "Admin Congés", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    adminId = adm.id;

    dossierRHId = await avecEntreprise(entrepriseId, async (tx) => {
      const [d] = await tx
        .insert(dossierRH)
        .values({ entrepriseId, utilisateurId, poste: "Développeur", typeContrat: "CDI", dateEmbauche: new Date(), soldeConges: 10 })
        .returning({ id: dossierRH.id });
      return d.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(pointage).where(eq(pointage.entrepriseId, entrepriseId));
      await tx.delete(demandeConge).where(eq(demandeConge.entrepriseId, entrepriseId));
      await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("approuver un congé payé décompte le solde de congés", async () => {
    const [demande] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(demandeConge).values({ entrepriseId, dossierRHId, type: "CONGE_PAYE", dateDebut: new Date(), dateFin: new Date(), nombreJours: 3 }).returning({ id: demandeConge.id })
    );

    await avecEntreprise(entrepriseId, (tx) => approuverDemandeConge(tx, demande.id, adminId));

    const [demandeMiseAJour] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(demandeConge).where(eq(demandeConge.id, demande.id)));
    expect(demandeMiseAJour.statut).toBe("APPROUVEE");
    expect(demandeMiseAJour.approuveParId).toBe(adminId);

    const [dossier] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierRHId)));
    expect(dossier.soldeConges).toBe(7);
  });

  test("approuver un congé sans solde ne touche pas au solde de congés payés", async () => {
    const [demande] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(demandeConge).values({ entrepriseId, dossierRHId, type: "SANS_SOLDE", dateDebut: new Date(), dateFin: new Date(), nombreJours: 2 }).returning({ id: demandeConge.id })
    );

    await avecEntreprise(entrepriseId, (tx) => approuverDemandeConge(tx, demande.id, adminId));

    const [dossier] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierRHId)));
    expect(dossier.soldeConges).toBe(7); // inchangé depuis le test précédent
  });

  test("refuser une demande ne décompte jamais le solde", async () => {
    const [demande] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(demandeConge).values({ entrepriseId, dossierRHId, type: "CONGE_PAYE", dateDebut: new Date(), dateFin: new Date(), nombreJours: 5 }).returning({ id: demandeConge.id })
    );

    await avecEntreprise(entrepriseId, (tx) => refuserDemandeConge(tx, demande.id, adminId));

    const [demandeMiseAJour] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(demandeConge).where(eq(demandeConge.id, demande.id)));
    expect(demandeMiseAJour.statut).toBe("REFUSEE");

    const [dossier] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierRHId)));
    expect(dossier.soldeConges).toBe(7);
  });

  test("une demande déjà traitée ne peut pas être re-traitée", async () => {
    const [demande] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(demandeConge).values({ entrepriseId, dossierRHId, type: "CONGE_PAYE", dateDebut: new Date(), dateFin: new Date(), nombreJours: 1 }).returning({ id: demandeConge.id })
    );

    await avecEntreprise(entrepriseId, (tx) => approuverDemandeConge(tx, demande.id, adminId));
    await avecEntreprise(entrepriseId, (tx) => approuverDemandeConge(tx, demande.id, adminId)); // deuxième appel, doit être un no-op

    const [dossier] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierRHId)));
    expect(dossier.soldeConges).toBe(6); // décompté une seule fois (7 - 1), pas deux
  });

  test("pointerArrivee crée une ligne du jour, pointerDepart la complète, sans double pointage", async () => {
    await avecEntreprise(entrepriseId, (tx) => pointerArrivee(tx, entrepriseId, dossierRHId));

    const aujourdHui = debutJournee(new Date());
    const [ligne] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(pointage).where(eq(pointage.dossierRHId, dossierRHId)));
    expect(ligne.date.getTime()).toBe(aujourdHui.getTime());
    expect(ligne.heureArrivee).not.toBeNull();
    expect(ligne.heureDepart).toBeNull();

    const heureArriveeInitiale = ligne.heureArrivee;
    await avecEntreprise(entrepriseId, (tx) => pointerArrivee(tx, entrepriseId, dossierRHId)); // deuxième "arrivée" le même jour, ignorée

    const [ligneApresDoublon] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(pointage).where(eq(pointage.dossierRHId, dossierRHId)));
    expect(ligneApresDoublon.heureArrivee?.getTime()).toBe(heureArriveeInitiale?.getTime());

    await avecEntreprise(entrepriseId, (tx) => pointerDepart(tx, dossierRHId));
    const [ligneFinale] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(pointage).where(eq(pointage.dossierRHId, dossierRHId)));
    expect(ligneFinale.heureDepart).not.toBeNull();
  });
});
