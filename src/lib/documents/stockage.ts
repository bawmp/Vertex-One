import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createId } from "@paralleldrive/cuid2";

// Cloudflare R2 expose une API compatible S3 — @aws-sdk/client-s3 fonctionne
// tel quel en pointant endpoint vers le compte R2, sans SDK propriétaire.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

const client =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
    ? new S3Client({
        region: "auto",
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      })
    : null;

/**
 * Même traitement que Migadu/NotchPay/Resend/le prestataire de chat avant
 * configuration (voir CLAUDE.md) : le code réel est en place, mais aucun
 * appel R2 n'a lieu tant que les variables d'environnement ne sont pas
 * configurées.
 *
 * cleStockage préfixée par entrepriseId — même principe de cloisonnement
 * que idExterneUtilisateur()/idExterneCanal() pour le chat (Palier 3,
 * section 3) : R2 est aussi un service externe partagé entre toutes les
 * entreprises clientes, sans notion d'entrepriseId de son côté.
 */
export async function televerserDocument(params: {
  entrepriseId: string;
  nomFichier: string;
  typeMime: string;
  contenu: Buffer;
}): Promise<{ cleStockage: string; televerse: boolean; erreur?: string }> {
  const cleStockage = `${params.entrepriseId}/${createId()}-${params.nomFichier}`;

  if (!client || !R2_BUCKET_NAME) {
    console.warn("[documents] R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME non configurés — stockage non disponible.");
    return { cleStockage, televerse: false, erreur: "Stockage R2 non configuré" };
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: cleStockage,
        Body: params.contenu,
        ContentType: params.typeMime,
      })
    );
    return { cleStockage, televerse: true };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    console.error(`[documents] échec de téléversement R2 pour ${cleStockage} :`, message);
    return { cleStockage, televerse: false, erreur: message };
  }
}

/**
 * URL signée temporaire (10 min) plutôt qu'un accès public au bucket — un
 * document, y compris non sensible, ne doit jamais être accessible sans
 * passer par le contrôle d'accès applicatif (peut()/portee() +
 * restriction PIECE_IDENTITE/DONNEES_SANTE, voir src/lib/documents/acces.ts).
 */
export async function urlTelechargementDocument(cleStockage: string): Promise<string | null> {
  if (!client || !R2_BUCKET_NAME) {
    console.warn("[documents] R2 non configuré — pas d'URL de téléchargement possible.");
    return null;
  }
  return getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: cleStockage }), { expiresIn: 600 });
}

/**
 * Lecture directe du contenu — utilisée pour calculer l'empreinte SHA-256
 * d'un document au moment de créer une demande de signature (Palier 4,
 * section 2), jamais pour un affichage direct côté client (voir
 * urlTelechargementDocument() pour ça).
 */
export async function lireObjetStockage(cleStockage: string): Promise<Buffer | null> {
  if (!client || !R2_BUCKET_NAME) {
    console.warn("[documents] R2 non configuré — lecture impossible.");
    return null;
  }
  const reponse = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: cleStockage }));
  const octets = await reponse.Body?.transformToByteArray();
  return octets ? Buffer.from(octets) : null;
}

/**
 * Suppression réelle de l'objet — droit à l'effacement (docs/palier-3-*,
 * section 9) : jamais une archive, le fichier disparaît vraiment de R2.
 */
export async function effacerObjetStockage(cleStockage: string): Promise<boolean> {
  if (!client || !R2_BUCKET_NAME) {
    console.warn("[documents] R2 non configuré — effacement ignoré.");
    return false;
  }
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: cleStockage }));
  return true;
}
