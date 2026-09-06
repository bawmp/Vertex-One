import { renderToBuffer } from "@react-pdf/renderer";
import { DocumentCommercialPDF, type DocumentCommercialProps } from "./document-commercial";

/**
 * Point d'entrée unique de rendu — utilisé à la fois par les Route Handlers
 * PDF (téléchargement) et par les actions d'envoi par email (pièce jointe),
 * pour ne pas dupliquer l'appel à renderToBuffer.
 */
export function rendreDocumentCommercialPDF(props: DocumentCommercialProps): Promise<Buffer> {
  return renderToBuffer(<DocumentCommercialPDF {...props} />);
}
