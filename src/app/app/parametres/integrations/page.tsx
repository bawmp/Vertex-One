import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { cleApiEntreprise, connexionFacebook } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { getT } from "@/lib/i18n/langue";
import { GestionClesApi } from "./gestion-cles-api";
import { PagesFacebook } from "./pages-facebook";
import { facebookConfigure } from "@/lib/facebook/graph";
import { listerPagesAChoisir } from "@/lib/actions/facebook";

export default async function PageIntegrations({ searchParams }: { searchParams: Promise<{ facebook?: string }> }) {
  const { facebook } = await searchParams;
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return <p className="text-muted-foreground">{t("Seul l'administrateur peut gérer les clés d'API.")}</p>;
  }

  const cles = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select().from(cleApiEntreprise).where(eq(cleApiEntreprise.entrepriseId, utilisateurConnecte.entrepriseId)).orderBy(desc(cleApiEntreprise.creeLe))
  );
  const pagesFacebook = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .select({ id: connexionFacebook.id, nom: connexionFacebook.pageNom, creeLe: connexionFacebook.creeLe, dernierLeadLe: connexionFacebook.dernierLeadLe })
      .from(connexionFacebook)
      .where(eq(connexionFacebook.entrepriseId, utilisateurConnecte.entrepriseId))
      .orderBy(desc(connexionFacebook.creeLe))
  );
  const pagesAChoisir = facebook === "choisir" ? await listerPagesAChoisir() : [];
  const base = process.env.BETTER_AUTH_URL ?? "https://vertexone.cm";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Intégrations")}</h1>
        <p className="text-muted-foreground">
          {t("Reliez un site web à votre CRM : chaque demande reçue devient automatiquement un lead, assigné au premier administrateur.")}
        </p>
      </div>

      <PagesFacebook
        configure={facebookConfigure()}
        pages={pagesFacebook.map((p) => ({ id: p.id, nom: p.nom, creeLe: p.creeLe.toISOString(), dernierLeadLe: p.dernierLeadLe?.toISOString() ?? null }))}
        pagesAChoisir={pagesAChoisir}
        retour={facebook && facebook !== "choisir" ? facebook : null}
      />

      <GestionClesApi
        cles={cles.map((c) => ({
          id: c.id,
          nom: c.nom,
          prefixe: c.prefixe,
          creeLe: c.creeLe.toISOString(),
          dernierUsageLe: c.dernierUsageLe?.toISOString() ?? null,
          revoqueeLe: c.revoqueeLe?.toISOString() ?? null,
          autoriseFacturation: c.autoriseFacturation,
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

      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="text-sm font-medium">{t("Facturer un paiement reçu sur le site")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Quand un client paie sur votre site, celui-ci peut demander à Vertex One d'émettre la facture payée : le numéro, le règlement et la comptabilité sont créés ici, le client reçoit sa facture par email à votre nom, et vous en êtes prévenu. La clé doit y être autorisée (bouton « Autoriser les factures »).")}
        </p>
        <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed">{`POST ${base}/api/externe/factures
Authorization: Bearer vo_votre_cle
Content-Type: application/json

{
  "source": "Site Global Mobility",
  "reference": "demande-12345",
  "client": { "nom": "Jean Mbarga", "email": "jean@exemple.com", "telephone": "+237690000000" },
  "designation": "Ouverture de dossier visa",
  "montantTTC": 30000,
  "operateur": "MTN_Cameroon",
  "payeLe": "2026-10-25T10:30:00Z"
}`}</pre>
        <p className="text-xs text-muted-foreground">
          {t("« montantTTC » est le montant tout compris payé, en FCFA entier : la TVA en est déduite selon vos réglages. « reference » est obligatoire : renvoyer la même référence ne crée jamais une seconde facture. Réponses : 201 créée, 200 déjà créée, 400 données invalides, 401 clé invalide, 403 clé non autorisée à facturer, 402 abonnement suspendu.")}
        </p>
      </div>
    </div>
  );
}
