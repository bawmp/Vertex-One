import { Client } from "pg";

/**
 * Supprime l'entreprise de test et tout ce qui s'y rattache, via la connexion propriétaire (TCP direct, plus réactive que
 * le WebSocket sous latence Neon). Les tables sont vidées par tours successifs : celles dont une clé étrangère bloque
 * encore sont retentées au tour suivant, sans avoir à connaître l'ordre des dépendances.
 */
export async function supprimerEntrepriseDeTest(nomEntreprise: string): Promise<void> {
  if (!nomEntreprise.startsWith("TEST ")) throw new Error("Nettoyage refusé : seul un nom d'entreprise préfixé « TEST » est supprimable.");
  const c = new Client({ connectionString: process.env.DATABASE_URL_MIGRATIONS });
  await c.connect();
  try {
    const ids = (await c.query("select id from entreprise where nom = $1", [nomEntreprise])).rows.map((r) => r.id as string);
    if (ids.length === 0) return;
    const tables = (await c.query("select table_name from information_schema.columns where column_name = 'entreprise_id' and table_schema = 'public'")).rows
      .map((r) => r.table_name as string)
      .filter((t) => t !== "entreprise");
    await c.query("delete from account where user_id in (select id from utilisateur where entreprise_id = any($1))", [ids]);
    await c.query("delete from session where user_id in (select id from utilisateur where entreprise_id = any($1))", [ids]);
    let restantes = tables;
    for (let tour = 0; tour < 12 && restantes.length > 0; tour++) {
      const echecs: string[] = [];
      for (const t of restantes) {
        try {
          await c.query(`delete from "${t}" where entreprise_id = any($1)`, [ids]);
        } catch {
          echecs.push(t);
        }
      }
      restantes = echecs;
    }
    await c.query("delete from entreprise where id = any($1)", [ids]);
  } finally {
    await c.end();
  }
}
