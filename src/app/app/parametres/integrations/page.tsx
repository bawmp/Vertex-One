import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { GestionClesApi } from "./gestion-cles-api";

export default async function PageIntegrations() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return <p className="text-muted-foreground">{t("Seul l'administrateur peut gérer les clés d'API.")}</p>;
  }

  const cles = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId)).orderBy(desc(cleApiEntreprise.creeLe))
  );
  const base = process.env.BETTER_AUTH_URL ?? "https://vertexone.cm";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Intégrations")}</h1>
        <p className="text-muted-foreground">
          {t("Reliez un site web à votre CRM : chaque demande reçue devient automatiquement un lead, assigné au premier administrateur.")}
        </p>
      </div>

      <GestionClesApi
        cles={cles.map((c) => ({
          id: c.id,
          nom: c.nom,
          prefixe: c.prefixe,
          creeLe: c.creeLe.toISOString(),
          dernierUsageLe: c.dernierUsageLe?.toISOString() ?? null,
          revoqueeLe: c.revoqueeLe?.toISOString() ?? null,
        }))}
      />

      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="text-sm font-medium">{t("Pour le développeur du site")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Envoyez une requête POST depuis le serveur de votre site (jamais depuis le navigateur du visiteur : la clé y serait visible).")}
        </p>
        <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed">{`POST ${base}/api/externe/leads
Authorization: Bearer vo_votre_cle
Content-Type: application/json

{
  "nom": "Jean Mbarga",
  "telephone": "+237690000000",
  "email": "jean@exemple.com",
  "message": "Je souhaite un visa étudiant pour le Canada",
  "source": "Site Global Mobility",
  "reference": "demande-12345"
}`}</pre>
        <p className="text-xs text-muted-foreground">
          {t("« nom » est obligatoire. « reference » évite les doublons si votre site renvoie la même demande. Réponses : 201 créé, 200 déjà reçu, 400 données invalides, 401 clé invalide, 429 trop de requêtes.")}
        </p>
      </div>
    </div>
  );
}
