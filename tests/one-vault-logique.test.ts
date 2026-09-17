import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, or, and, isNull, isNotNull, desc } from "drizzle-orm";
import { db, avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { entreprise, utilisateur, secretVault, journalAccesSecretVault } from "@/db/schema";
import { chiffrerContenuSecret, dechiffrerContenuSecret } from "@/lib/vault/crypto";

/**
 * src/lib/actions/one-vault.ts importe recupererUtilisateurConnecte()
 * (src/lib/session.ts, protégé par "server-only") — indisponible hors
 * requête HTTP réelle dans ce test, même limitation documentée dans
 * tests/one-form-logique.test.ts. La règle de visibilité (secretVisiblePour)
 * et revelerSecret() sont donc reproduites ici à l'identique, en réutilisant
 * directement src/lib/vault/crypto.ts (pas de "server-only", pur).
 */
type RoleTest = "ADMIN" | "EMPLOYE";

function filtreVisibilite(role: RoleTest, utilisateurId: string) {
  if (role === "ADMIN") return undefined;
  return or(eq(secretVault.partage, true), eq(secretVault.creeParId, utilisateurId));
}

async function secretVisiblePour(tx: TransactionDrizzle, role: RoleTest, utilisateurId: string, secretId: string): Promise<boolean> {
  const [ligne] = await tx.select({ partage: secretVault.partage, creeParId: secretVault.creeParId }).from(secretVault).where(eq(secretVault.id, secretId));
  if (!ligne) return false;
  if (role === "ADMIN") return true;
  return ligne.partage || ligne.creeParId === utilisateurId;
}

async function revelerSecret(tx: TransactionDrizzle, entrepriseId: string, role: RoleTest, utilisateurId: string, secretId: string) {
  const visible = await secretVisiblePour(tx, role, utilisateurId, secretId);
  if (!visible) return { ok: false as const, erreur: "Vous n'avez pas accès à ce secret." };

  const [ligne] = await tx.select({ contenuChiffre: secretVault.contenuChiffre }).from(secretVault).where(eq(secretVault.id, secretId));
  await tx.insert(journalAccesSecretVault).values({ entrepriseId, secretId, utilisateurId, action: "consultation" });
  return { ok: true as const, ...dechiffrerContenuSecret(ligne.contenuChiffre) };
}

// Corbeille (2026-09-17) — reproduit recupererSecrets()/recupererCorbeille()/
// restaurerSecret()/supprimerDefinitivement() à l'identique.
async function idsListeActive(tx: TransactionDrizzle, role: RoleTest, utilisateurId: string): Promise<string[]> {
  const filtre = filtreVisibilite(role, utilisateurId);
  const lignes = await tx
    .select({ id: secretVault.id })
    .from(secretVault)
    .where(filtre ? and(isNull(secretVault.supprimeLe), filtre) : isNull(secretVault.supprimeLe));
  return lignes.map((l) => l.id);
}

async function idsCorbeille(tx: TransactionDrizzle, role: RoleTest, utilisateurId: string): Promise<string[]> {
  const filtre = filtreVisibilite(role, utilisateurId);
  const lignes = await tx
    .select({ id: secretVault.id })
    .from(secretVault)
    .where(filtre ? and(isNotNull(secretVault.supprimeLe), filtre) : isNotNull(secretVault.supprimeLe));
  return lignes.map((l) => l.id);
}

async function supprimerDefinitivementTest(tx: TransactionDrizzle, role: RoleTest, utilisateurId: string, secretId: string): Promise<void> {
  const visible = await secretVisiblePour(tx, role, utilisateurId, secretId);
  if (!visible) return;
  const [ligne] = await tx.select({ supprimeLe: secretVault.supprimeLe }).from(secretVault).where(eq(secretVault.id, secretId));
  if (!ligne?.supprimeLe) return;
  await tx.delete(secretVault).where(eq(secretVault.id, secretId));
}

// Journal global (2026-09-17) — reproduit recupererJournal() à l'identique.
async function journalVisible(tx: TransactionDrizzle, role: RoleTest, utilisateurId: string) {
  const lignes = await tx
    .select({
      id: journalAccesSecretVault.id,
      action: journalAccesSecretVault.action,
      secretPartage: secretVault.partage,
      secretCreeParId: secretVault.creeParId,
    })
    .from(journalAccesSecretVault)
    .leftJoin(secretVault, eq(journalAccesSecretVault.secretId, secretVault.id))
    .orderBy(desc(journalAccesSecretVault.creeLe));

  if (role === "ADMIN") return lignes;
  return lignes.filter((l) => l.secretCreeParId !== null && (l.secretPartage || l.secretCreeParId === utilisateurId));
}

describe("One Vault — logique métier", () => {
  let entrepriseId: string;
  let adminId: string;
  let employeAId: string;
  let employeBId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST OneVault Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [admin] = await db.insert(utilisateur).values({ entrepriseId, email: "admin-onevault-logique@vertexone.test", nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [empA] = await db.insert(utilisateur).values({ entrepriseId, email: "employe-a-onevault-logique@vertexone.test", nomComplet: "Employé A", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    const [empB] = await db.insert(utilisateur).values({ entrepriseId, email: "employe-b-onevault-logique@vertexone.test", nomComplet: "Employé B", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    adminId = admin.id;
    employeAId = empA.id;
    employeBId = empB.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(journalAccesSecretVault).where(eq(journalAccesSecretVault.entrepriseId, entrepriseId));
      await tx.delete(secretVault).where(eq(secretVault.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeAId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeBId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("un secret privé n'apparaît que pour son créateur et l'Administrateur", async () => {
    const [prive] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(secretVault).values({ entrepriseId, titre: "Secret Privé A", contenuChiffre: chiffrerContenuSecret({ motDePasse: "x", notes: "" }), creeParId: employeAId, partage: false }).returning({ id: secretVault.id })
    );

    const listeA = await avecEntreprise(entrepriseId, (tx) => tx.select({ id: secretVault.id }).from(secretVault).where(filtreVisibilite("EMPLOYE", employeAId)));
    expect(listeA.map((s) => s.id)).toContain(prive.id);

    const listeB = await avecEntreprise(entrepriseId, (tx) => tx.select({ id: secretVault.id }).from(secretVault).where(filtreVisibilite("EMPLOYE", employeBId)));
    expect(listeB.map((s) => s.id)).not.toContain(prive.id);

    const listeAdmin = await avecEntreprise(entrepriseId, (tx) => tx.select({ id: secretVault.id }).from(secretVault).where(filtreVisibilite("ADMIN", adminId)));
    expect(listeAdmin.map((s) => s.id)).toContain(prive.id);
  });

  test("un secret partagé apparaît pour tout le monde", async () => {
    const [partage] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(secretVault).values({ entrepriseId, titre: "Secret Partagé", contenuChiffre: chiffrerContenuSecret({ motDePasse: "y", notes: "" }), creeParId: employeAId, partage: true }).returning({ id: secretVault.id })
    );

    const listeB = await avecEntreprise(entrepriseId, (tx) => tx.select({ id: secretVault.id }).from(secretVault).where(filtreVisibilite("EMPLOYE", employeBId)));
    expect(listeB.map((s) => s.id)).toContain(partage.id);
  });

  test("revelerSecret refuse pour un secret privé d'un autre utilisateur non-Admin, réussit pour son créateur et pour l'Admin", async () => {
    const [prive] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(secretVault).values({ entrepriseId, titre: "Secret Privé B", contenuChiffre: chiffrerContenuSecret({ motDePasse: "s3cret", notes: "confidentiel" }), creeParId: employeAId, partage: false }).returning({ id: secretVault.id })
    );

    const refusB = await avecEntreprise(entrepriseId, (tx) => revelerSecret(tx, entrepriseId, "EMPLOYE", employeBId, prive.id));
    expect(refusB.ok).toBe(false);

    const succesA = await avecEntreprise(entrepriseId, (tx) => revelerSecret(tx, entrepriseId, "EMPLOYE", employeAId, prive.id));
    expect(succesA.ok).toBe(true);
    if (succesA.ok) {
      expect(succesA.motDePasse).toBe("s3cret");
      expect(succesA.notes).toBe("confidentiel");
    }

    const succesAdmin = await avecEntreprise(entrepriseId, (tx) => revelerSecret(tx, entrepriseId, "ADMIN", adminId, prive.id));
    expect(succesAdmin.ok).toBe(true);
  });

  test("chaque révélation réussie journalise une ligne 'consultation'", async () => {
    const [secret] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(secretVault).values({ entrepriseId, titre: "Secret Journalisé", contenuChiffre: chiffrerContenuSecret({ motDePasse: "z", notes: "" }), creeParId: employeAId, partage: false }).returning({ id: secretVault.id })
    );

    const avant = await avecEntreprise(entrepriseId, (tx) => tx.select().from(journalAccesSecretVault).where(eq(journalAccesSecretVault.secretId, secret.id)));
    expect(avant).toHaveLength(0);

    await avecEntreprise(entrepriseId, (tx) => revelerSecret(tx, entrepriseId, "EMPLOYE", employeAId, secret.id));

    const apres = await avecEntreprise(entrepriseId, (tx) => tx.select().from(journalAccesSecretVault).where(eq(journalAccesSecretVault.secretId, secret.id)));
    expect(apres).toHaveLength(1);
    expect(apres[0].action).toBe("consultation");
    expect(apres[0].utilisateurId).toBe(employeAId);
  });

  test("une tentative de révélation refusée ne journalise rien", async () => {
    const [prive] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(secretVault).values({ entrepriseId, titre: "Secret Privé C", contenuChiffre: chiffrerContenuSecret({ motDePasse: "w", notes: "" }), creeParId: employeAId, partage: false }).returning({ id: secretVault.id })
    );

    await avecEntreprise(entrepriseId, (tx) => revelerSecret(tx, entrepriseId, "EMPLOYE", employeBId, prive.id));

    const journal = await avecEntreprise(entrepriseId, (tx) => tx.select().from(journalAccesSecretVault).where(eq(journalAccesSecretVault.secretId, prive.id)));
    expect(journal).toHaveLength(0);
  });

  test("un secret mis à la corbeille disparaît de la liste active et apparaît dans la corbeille, avec la même règle de visibilité", async () => {
    const [prive] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(secretVault).values({ entrepriseId, titre: "Secret À Corbeille", contenuChiffre: chiffrerContenuSecret({ motDePasse: "a", notes: "" }), creeParId: employeAId, partage: false }).returning({ id: secretVault.id })
    );

    expect(await avecEntreprise(entrepriseId, (tx) => idsListeActive(tx, "EMPLOYE", employeAId))).toContain(prive.id);

    await avecEntreprise(entrepriseId, (tx) => tx.update(secretVault).set({ supprimeLe: new Date() }).where(eq(secretVault.id, prive.id)));

    expect(await avecEntreprise(entrepriseId, (tx) => idsListeActive(tx, "EMPLOYE", employeAId))).not.toContain(prive.id);
    expect(await avecEntreprise(entrepriseId, (tx) => idsCorbeille(tx, "EMPLOYE", employeAId))).toContain(prive.id);
    // Un autre Employé (non créateur, secret privé) ne le voit ni dans la
    // liste active ni dans la corbeille.
    expect(await avecEntreprise(entrepriseId, (tx) => idsCorbeille(tx, "EMPLOYE", employeBId))).not.toContain(prive.id);
    // L'Admin voit tout, y compris dans la corbeille.
    expect(await avecEntreprise(entrepriseId, (tx) => idsCorbeille(tx, "ADMIN", adminId))).toContain(prive.id);
  });

  test("restaurer un secret le fait réapparaître dans la liste active", async () => {
    const [secret] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(secretVault)
        .values({ entrepriseId, titre: "Secret À Restaurer", contenuChiffre: chiffrerContenuSecret({ motDePasse: "b", notes: "" }), creeParId: employeAId, partage: false, supprimeLe: new Date() })
        .returning({ id: secretVault.id })
    );

    expect(await avecEntreprise(entrepriseId, (tx) => idsCorbeille(tx, "EMPLOYE", employeAId))).toContain(secret.id);

    await avecEntreprise(entrepriseId, (tx) => tx.update(secretVault).set({ supprimeLe: null }).where(eq(secretVault.id, secret.id)));

    expect(await avecEntreprise(entrepriseId, (tx) => idsListeActive(tx, "EMPLOYE", employeAId))).toContain(secret.id);
    expect(await avecEntreprise(entrepriseId, (tx) => idsCorbeille(tx, "EMPLOYE", employeAId))).not.toContain(secret.id);
  });

  test("supprimerDefinitivement refuse tant que le secret n'est pas déjà dans la corbeille", async () => {
    const [secret] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(secretVault).values({ entrepriseId, titre: "Secret Actif Protégé", contenuChiffre: chiffrerContenuSecret({ motDePasse: "c", notes: "" }), creeParId: employeAId, partage: false }).returning({ id: secretVault.id })
    );

    await avecEntreprise(entrepriseId, (tx) => supprimerDefinitivementTest(tx, "ADMIN", adminId, secret.id));

    const [toujoursLa] = await avecEntreprise(entrepriseId, (tx) => tx.select({ id: secretVault.id }).from(secretVault).where(eq(secretVault.id, secret.id)));
    expect(toujoursLa).toBeDefined();
  });

  test("supprimerDefinitivement supprime réellement un secret déjà dans la corbeille, sans effacer son journal", async () => {
    const [secret] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(secretVault)
        .values({ entrepriseId, titre: "Secret Définitif", contenuChiffre: chiffrerContenuSecret({ motDePasse: "d", notes: "" }), creeParId: employeAId, partage: false, supprimeLe: new Date() })
        .returning({ id: secretVault.id })
    );
    await avecEntreprise(entrepriseId, (tx) => tx.insert(journalAccesSecretVault).values({ entrepriseId, secretId: secret.id, utilisateurId: employeAId, action: "suppression" }));

    await avecEntreprise(entrepriseId, (tx) => supprimerDefinitivementTest(tx, "ADMIN", adminId, secret.id));

    const [disparu] = await avecEntreprise(entrepriseId, (tx) => tx.select({ id: secretVault.id }).from(secretVault).where(eq(secretVault.id, secret.id)));
    expect(disparu).toBeUndefined();

    const journalSurvivant = await avecEntreprise(entrepriseId, (tx) => tx.select().from(journalAccesSecretVault).where(eq(journalAccesSecretVault.secretId, secret.id)));
    expect(journalSurvivant.length).toBeGreaterThanOrEqual(1);
  });

  test("le journal global respecte la visibilité privé/partagé : un Employé ne voit pas les entrées d'un secret privé d'un collègue", async () => {
    const [prive] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(secretVault).values({ entrepriseId, titre: "Secret Journal Privé", contenuChiffre: chiffrerContenuSecret({ motDePasse: "e", notes: "" }), creeParId: employeAId, partage: false }).returning({ id: secretVault.id })
    );
    await avecEntreprise(entrepriseId, (tx) => revelerSecret(tx, entrepriseId, "EMPLOYE", employeAId, prive.id));

    const journalA = await avecEntreprise(entrepriseId, (tx) => journalVisible(tx, "EMPLOYE", employeAId));
    expect(journalA.some((j) => j.id)).toBe(true); // au moins une ligne visible pour le créateur

    const journalB = await avecEntreprise(entrepriseId, (tx) => journalVisible(tx, "EMPLOYE", employeBId));
    const idsJournalA = new Set((await avecEntreprise(entrepriseId, (tx) => journalVisible(tx, "EMPLOYE", employeAId))).map((j) => j.id));
    expect(journalB.some((j) => idsJournalA.has(j.id))).toBe(false);

    const journalAdmin = await avecEntreprise(entrepriseId, (tx) => journalVisible(tx, "ADMIN", adminId));
    expect(idsJournalA.size > 0 && journalAdmin.length >= idsJournalA.size).toBe(true);
  });
});
