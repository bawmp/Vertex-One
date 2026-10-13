import type { LeadExterne } from "@/lib/api-externe/lead";
import type { ProspectFacebook } from "@/lib/facebook/graph";

export const SOURCE_FACEBOOK = "Facebook Ads";

const SANS_ACCENT = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Nom d'un champ de formulaire → rôle dans le lead. Les champs standards de Meta d'abord, puis des synonymes courants. */
function role(nomChamp: string): "nomComplet" | "prenom" | "nom" | "email" | "telephone" | "societe" | null {
  const n = SANS_ACCENT(nomChamp).replace(/[^a-z_ ]/g, "").trim().replace(/\s+/g, "_");
  if (["full_name", "nom_complet", "nom_et_prenom", "name"].includes(n)) return "nomComplet";
  if (["first_name", "prenom"].includes(n)) return "prenom";
  if (["last_name", "nom_de_famille", "nom"].includes(n)) return "nom";
  if (["email", "e_mail", "work_email", "adresse_email", "courriel"].includes(n)) return "email";
  if (["phone_number", "phone", "telephone", "numero_de_telephone", "work_phone_number", "whatsapp"].includes(n)) return "telephone";
  if (["company_name", "societe", "entreprise", "nom_de_lentreprise"].includes(n)) return "societe";
  return null;
}

function libelleChamp(nomChamp: string): string {
  return nomChamp.replace(/_/g, " ").trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 80);
}

/**
 * Convertit un prospect de formulaire Facebook en lead. Les champs reconnus (nom, email, téléphone, société) alimentent
 * le lead ; tous les autres (questions personnalisées du formulaire) sont conservés dans le message, sous la forme
 * « Question : réponse », pour que le commercial voie ce que le prospect a répondu. Tout est borné : cette entrée
 * vient d'un tiers. La référence `facebook-<id>` rend l'import idempotent (Meta peut renvoyer le même événement).
 */
export function leadDepuisProspectFacebook(prospect: ProspectFacebook, leadgenId: string): LeadExterne {
  let nomComplet = "";
  let prenom = "";
  let nom = "";
  let email = "";
  let telephone = "";
  let societe = "";
  const autres: string[] = [];

  for (const champ of prospect.field_data ?? []) {
    const valeur = (champ.values ?? []).map((v) => String(v).trim()).filter(Boolean).join(", ");
    if (!champ.name || !valeur) continue;
    switch (role(champ.name)) {
      case "nomComplet": nomComplet = valeur; break;
      case "prenom": prenom = valeur; break;
      case "nom": nom = valeur; break;
      case "email": email = valeur; break;
      case "telephone": telephone = valeur; break;
      case "societe": societe = valeur; break;
      default: autres.push(`${libelleChamp(champ.name)} : ${valeur}`);
    }
  }

  const nomFinal = (nomComplet || [prenom, nom].filter(Boolean).join(" ")).slice(0, 120);
  const origine = [prospect.ad_name ? `Publicité : ${prospect.ad_name}` : null, prospect.form_id ? `Formulaire : ${prospect.form_id}` : null].filter(Boolean);
  const message = [...autres, ...origine].join("\n").slice(0, 2000);

  return {
    nom: nomFinal.length >= 2 ? nomFinal : "Prospect Facebook",
    telephone: telephone.slice(0, 40) || undefined,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 160) : undefined,
    societe: societe.slice(0, 160) || undefined,
    message: message || undefined,
    source: SOURCE_FACEBOOK,
    reference: `facebook-${leadgenId}`.slice(0, 120),
  };
}
