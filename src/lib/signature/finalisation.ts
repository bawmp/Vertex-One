import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { avecEntreprise } from "@/db/client";
import { entreprise, demandeSignature, document, contrat, utilisateur, projet } from "@/db/schema";
import { construireCertificatAudit } from "@/lib/signature/certificat";
import { formaterHorodatage, rendreCertificatSignaturePDF } from "@/lib/pdf/certificat-signature";
import { lireObjetStockage, televerserDocument } from "@/lib/documents/stockage";
import { adressesAAlerter, alerterParEmail, echapper } from "@/lib/notifications/equipe";
import { urlBase } from "@/lib/client-documents/liens";

async function chargerContexte(entrepriseId: string, demandeId: string) {
  return avecEntreprise(entrepriseId, async (tx) => {
    const certificat = await construireCertificatAudit(tx, demandeId);
    if (!certificat) return null;

    const [demande] = await tx
      .select({ creeParId: demandeSignature.creeParId, documentId: demandeSignature.documentId })
      .from(demandeSignature)
      .where(eq(demandeSignature.id, demandeId));
    const [leDocument] = await tx
      .select({ nom: document.nom, cleStockage: document.cleStockage, dossierId: document.dossierId, projetId: document.projetId })
      .from(document)
      .where(eq(document.id, demande.documentId));
    // Un document peut être rattaché à un projet plutôt qu'au dossier : on remonte alors au dossier du projet.
    let dossierId = leDocument.dossierId;
    if (!dossierId && leDocument.projetId) {
      const [leProjet] = await tx.select({ dossierId: projet.dossierId }).from(projet).where(eq(projet.id, leDocument.projetId));
      dossierId = leProjet?.dossierId ?? null;
    }
    const [monEntreprise] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    const [leContrat] = await tx.select({ titre: contrat.titre }).from(contrat).where(eq(contrat.demandeSignatureId, demandeId));
    const destinataires = await adressesAAlerter(tx, entrepriseId, [demande.creeParId]);

    return { certificat, demande, leDocument, dossierId, entrepriseNom: monEntreprise?.nom ?? "", titre: leContrat?.titre ?? leDocument.nom, destinataires };
  });
}

/**
 * Le contrat original suivi des pages du certificat de signature, en un seul PDF : c'est
 * « le document signé ». Renvoie null si l'original n'est pas un PDF lisible (un fichier
 * Word, par exemple) — l'appelant se rabat alors sur l'original et le certificat séparés.
 */
export async function fusionnerDocumentSigne(original: Buffer, certificat: Buffer): Promise<Buffer | null> {
  try {
    if (original.subarray(0, 4).toString() !== "%PDF") return null;
    const fusion = await PDFDocument.create();
    for (const source of [original, certificat]) {
      const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
      const pages = await fusion.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => fusion.addPage(page));
    }
    return Buffer.from(await fusion.save());
  } catch (erreur) {
    console.error("[signature] fusion du PDF signé impossible :", erreur instanceof Error ? erreur.message : erreur);
    return null;
  }
}

const nomFichierSain = (nom: string) => nom.replace(/[\\/:*?"<>|]/g, "-");

/**
 * Appelée une seule fois, au moment où le dernier signataire signe :
 * 1. fabrique le document signé (contrat + certificat horodaté, en un seul PDF) ;
 * 2. le range directement dans le dossier du client ;
 * 3. l'envoie à l'Administrateur et à l'auteur de la demande (avec le certificat : signataire,
 *    date et heure, adresse IP, empreinte) et en envoie une copie au signataire.
 * Meilleur effort : un échec d'envoi ou de stockage ne doit jamais faire échouer la signature
 * déjà enregistrée. Renvoie `archive: true` quand le document signé a été rangé dans le dossier.
 */
export async function envoyerCopieSignee(entrepriseId: string, demandeId: string): Promise<{ archive: boolean }> {
  const contexte = await chargerContexte(entrepriseId, demandeId);
  if (!contexte) return { archive: false };
  const { certificat, demande, leDocument, dossierId, entrepriseNom, titre, destinataires } = contexte;

  const pdfCertificat = await rendreCertificatSignaturePDF({
    entrepriseNom,
    titreDocument: titre,
    nomFichier: leDocument.nom,
    empreinteDocument: certificat.empreinteDocument,
    referenceDemande: demandeId,
    demandeParNom: certificat.creeParNom,
    demandeLe: certificat.creeLe,
    signataires: certificat.signataires,
    genereLe: new Date(),
  });

  let original: Buffer | null = null;
  try {
    original = await lireObjetStockage(leDocument.cleStockage);
  } catch (erreur) {
    console.error("[signature] lecture du document original impossible :", erreur instanceof Error ? erreur.message : erreur);
  }

  const documentSigne = original ? await fusionnerDocumentSigne(original, pdfCertificat) : null;
  const nomSigne = nomFichierSain(`${titre} - signé.pdf`);
  const nomCertificat = nomFichierSain(`Certificat de signature - ${titre}.pdf`);

  // Pièces jointes : le document signé (contrat + certificat) quand on a pu le fabriquer, sinon
  // l'original et le certificat séparés. Le certificat reste toujours joint à part comme preuve.
  const pieces = documentSigne
    ? [
        { filename: nomSigne, content: documentSigne },
        { filename: nomCertificat, content: pdfCertificat },
      ]
    : [...(original ? [{ filename: leDocument.nom, content: original }] : []), { filename: nomCertificat, content: pdfCertificat }];

  const signes = certificat.signataires.filter((s) => s.statut === "SIGNE" && s.signeLe);
  const listeSignatures = signes.map((s) => `<li><strong>${echapper(s.nom)}</strong> — signé le ${echapper(formaterHorodatage(s.signeLe!))}</li>`).join("");

  await alerterParEmail(
    destinataires,
    `Signé : ${titre}`,
    `<p>Le document « ${echapper(titre)} » a été <strong>signé</strong>.</p><ul>${listeSignatures}</ul><p>Vous trouverez en pièces jointes le document signé et son certificat de signature (empreinte, horodatage, adresse IP).${dossierId ? " Il est aussi rangé dans le dossier du client." : ""}</p><p><a href="${urlBase()}/app/signatures/${demandeId}">Consulter le certificat dans Vertex One</a></p>`,
    pieces
  );

  // Copie pour chaque signataire qui a une adresse email.
  for (const s of signes) {
    if (!s.email) continue;
    await alerterParEmail(
      [s.email],
      `Votre copie signée : ${titre}`,
      `<p>Bonjour ${echapper(s.nom)},</p><p>Merci d'avoir signé « ${echapper(titre)} » le ${echapper(formaterHorodatage(s.signeLe!))}. Voici votre copie du document signé et son certificat de signature, à conserver.</p><p>${echapper(entrepriseNom)}</p>`,
      pieces
    );
  }

  // Le document signé est rangé directement dans le dossier du client (quand le stockage est
  // configuré) : le contrat signé + son certificat si on a pu les fusionner, sinon le certificat
  // seul (l'original, lui, est déjà dans le dossier).
  let archive = false;
  if (dossierId) {
    try {
      const aRanger = documentSigne ? { nom: nomSigne, contenu: documentSigne } : { nom: nomCertificat, contenu: pdfCertificat };
      const televersement = await televerserDocument({ entrepriseId, nomFichier: aRanger.nom, typeMime: "application/pdf", contenu: aRanger.contenu, dossier: "documents-signes" });
      if (televersement.televerse) {
        archive = await avecEntreprise(entrepriseId, async (tx) => {
          const [auteur] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.id, demande.creeParId));
          if (!auteur) return false;
          await tx.insert(document).values({
            entrepriseId,
            dossierId,
            nom: aRanger.nom,
            cleStockage: televersement.cleStockage,
            typeMime: "application/pdf",
            tailleOctets: aRanger.contenu.length,
            televerseParId: auteur.id,
          });
          return true;
        });
      }
    } catch (erreur) {
      console.error("[signature] archivage du document signé impossible :", erreur instanceof Error ? erreur.message : erreur);
    }
  }
  return { archive };
}

/** Prévient l'Administrateur qu'un signataire a refusé de signer, avec le motif éventuel. */
export async function notifierRefusSignature(entrepriseId: string, demandeId: string, nomSignataire: string, motif: string | null, refuseLe: Date): Promise<void> {
  const contexte = await chargerContexte(entrepriseId, demandeId);
  if (!contexte) return;
  await alerterParEmail(
    contexte.destinataires,
    `Signature refusée : ${contexte.titre}`,
    `<p><strong>${echapper(nomSignataire)}</strong> a <strong>refusé de signer</strong> « ${echapper(contexte.titre)} » le ${echapper(formaterHorodatage(refuseLe))}.</p>${motif ? `<p>Motif indiqué : « ${echapper(motif)} »</p>` : "<p>Aucun motif indiqué.</p>"}`
  );
}
