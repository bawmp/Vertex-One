import { echapper } from "@/lib/notifications/equipe";

/**
 * Email envoyé à la personne à qui l'on confie un prospect. Texte pur (pas d'accès base) ; tout ce qui a été saisi (nom du prospect, société, message
 * du responsable) est échappé avant d'entrer dans le HTML.
 */
export function gabaritProspectTransfere(p: {
  nomPersonne: string;
  transferePar: string;
  entreprise: string;
  prospect: { nom: string; societe: string | null; telephone: string; email: string | null };
  motif: string;
  lien: string;
}): { sujet: string; html: string } {
  const coordonnees = [p.prospect.societe, p.prospect.telephone, p.prospect.email].filter(Boolean).map((x) => echapper(String(x))).join(" · ");
  const lignes = [
    `<p>Bonjour ${echapper(p.nomPersonne)},</p>`,
    `<p>${echapper(p.transferePar)} vous confie un prospect chez ${echapper(p.entreprise)} :</p>`,
    `<p><strong>${echapper(p.prospect.nom)}</strong><br>${coordonnees}</p>`,
    p.motif ? `<p><strong>Message :</strong><br><span style="white-space:pre-line">${echapper(p.motif)}</span></p>` : "",
    `<p>Il est désormais dans votre liste, avec tout son historique : <a href="${echapper(p.lien)}">ouvrir la fiche du prospect</a>.</p>`,
  ];
  return { sujet: `Prospect confié : ${p.prospect.nom}`.replace(/\s+/g, " ").trim(), html: lignes.filter(Boolean).join("") };
}
