/**
 * Docs/palier-6-*, section 4 : "un lien généré, pas un moteur construit" —
 * Jitsi Meet crée une salle instantanément à partir d'une simple URL, sans
 * compte ni clé d'API à gérer. Le lien s'attache à une Interaction de type
 * "rendez-vous" (Palier 1) — aucun nouveau modèle de données nécessaire.
 */
export function genererLienVisio(entrepriseId: string, contactId: string): string {
  const salle = `${entrepriseId}-${contactId}-${Date.now()}`;
  return `https://meet.jit.si/${salle}`;
}
