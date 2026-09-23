import { renderToBuffer } from "@react-pdf/renderer";
import { DocumentCommercialPDF, type DocumentCommercialProps } from "./document-commercial";
import { RecuAbonnementPDF, type RecuAbonnementProps } from "./recu-abonnement";

/**
 * Point d'entrée unique de rendu — utilisé à la fois par les Route Handlers
 * PDF (téléchargement) et par les actions d'envoi par email (pièce jointe),
 * pour ne pas dupliquer l'appel à renderToBuffer.
 */
export function rendreDocumentCommercialPDF(props: DocumentCommercialProps): Promise<Buffer> {
  return renderToBuffer(<DocumentCommercialPDF {...props} />);
}

/**
 * Récupère le logo Vertex One via son URL publique (jamais une lecture disque — non garantie incluse dans le
 * bundle d'une fonction serverless Vercel, contrairement à un fichier de public/ servi normalement par le CDN).
 * Échec silencieux : un reçu sans filigrane reste un reçu utilisable, jamais bloquant.
 */
let logoCache: Buffer | null | undefined;
async function logoVertexOne(): Promise<Buffer | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    const reponse = await fetch(`${base}/marque/logo.png`);
    logoCache = reponse.ok ? Buffer.from(await reponse.arrayBuffer()) : null;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** Reçu d'abonnement (Vertex One → tenant) — voir recu-abonnement.tsx. */
export async function rendreRecuAbonnementPDF(props: Omit<RecuAbonnementProps, "logo">): Promise<Buffer> {
  const logo = await logoVertexOne();
  return renderToBuffer(<RecuAbonnementPDF {...props} logo={logo} />);
}
