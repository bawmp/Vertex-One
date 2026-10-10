import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { modeleEmail } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { recupererModele, variablesDuType, variablesExemple, type TypeModeleEmail } from "@/lib/email/modeles";
import { FormulaireModeleEmail } from "./formulaire-modele-email";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const TITRES: Record<TypeModeleEmail, string> = {
  ENVOI_DEVIS: m("Envoi d'un devis"),
  ENVOI_FACTURE: m("Envoi d'une facture"),
  CANDIDATURE_EN_EXAMEN: m("Candidature : en cours d'examen"),
  CANDIDATURE_ENTRETIEN: m("Candidature : entretien"),
  CANDIDATURE_OFFRE: m("Candidature : offre"),
  CANDIDATURE_EMBAUCHE: m("Candidature : embauche"),
  CANDIDATURE_REJETEE: m("Candidature : rejet"),
};

const TYPES_VENTES: TypeModeleEmail[] = ["ENVOI_DEVIS", "ENVOI_FACTURE"];
const TYPES_CANDIDATS: TypeModeleEmail[] = ["CANDIDATURE_EN_EXAMEN", "CANDIDATURE_ENTRETIEN", "CANDIDATURE_OFFRE", "CANDIDATURE_EMBAUCHE", "CANDIDATURE_REJETEE"];

export default async function PageModelesEmail() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return <p className="text-muted-foreground">{t("Seul un Administrateur peut modifier ces modèles.")}</p>;
  }

  const tous = [...TYPES_VENTES, ...TYPES_CANDIDATS];
  const { modeles, personnalises } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const lignes = await tx.select({ type: modeleEmail.type }).from(modeleEmail).where(eq(modeleEmail.entrepriseId, utilisateurConnecte.entrepriseId));
    const valeurs = await Promise.all(tous.map((type) => recupererModele(tx, utilisateurConnecte.entrepriseId, type)));
    return { modeles: new Map(tous.map((type, i) => [type, valeurs[i]])), personnalises: new Set(lignes.map((l) => l.type)) };
  });

  const formulaire = (type: TypeModeleEmail, i: number) => (
    <div key={type} style={{ animationDelay: `${i * 70}ms` }} className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
      <FormulaireModeleEmail
        type={type}
        titre={t(TITRES[type])}
        objet={modeles.get(type)!.objet}
        corps={modeles.get(type)!.corps}
        variables={[...variablesDuType(type)]}
        exemple={variablesExemple(type)}
        personnalise={personnalises.has(type)}
      />
    </div>
  );

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Modèles d'email")}</h1>
        <p className="mt-1 text-muted-foreground">{t("Personnalisez les textes envoyés par email. Chaque modèle montre un aperçu avec des valeurs d'exemple ; les variables entre accolades sont remplacées à l'envoi.")}</p>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("Devis et factures")}</h2>
          <p className="text-sm text-muted-foreground">{t("Texte envoyé au client lorsqu'un devis ou une facture lui est transmis. Le PDF du document est toujours joint automatiquement.")}</p>
        </div>
        {TYPES_VENTES.map(formulaire)}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("Candidatures (One Recruit)")}</h2>
          <p className="text-sm text-muted-foreground">{t("Texte envoyé au candidat quand le statut de sa candidature change. « Reçue » n'envoie rien. Les envois se coupent dans Recrutement → Paramètres.")}</p>
        </div>
        {TYPES_CANDIDATS.map((type, i) => formulaire(type, i))}
      </section>
    </div>
  );
}
