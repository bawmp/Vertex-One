/**
 * Docs/palier-5-*, section 9, étape 7 : "Export du Dossier RH dans un format
 * exploitable par un partenaire paie, sans aucun calcul de cotisation ou
 * d'IRPP dans le produit lui-même." Colonnes brutes, aucune formule —
 * charge au partenaire (Omamori ou équivalent, voir section 6) d'appliquer
 * les taux/barèmes CNPS/IRPP en vigueur.
 */
export function exporterDossierRHCsv(dossier: {
  nomComplet: string;
  poste: string;
  typeContrat: string;
  dateEmbauche: Date;
  dateFinContrat: Date | null;
  salaireBase: number | null;
  nombrePersonnesACharge: number;
  soldeConges: number;
}): string {
  const entetes = [
    "nom_complet",
    "poste",
    "type_contrat",
    "date_embauche",
    "date_fin_contrat",
    "salaire_base_fcfa",
    "nombre_personnes_a_charge",
    "solde_conges_jours",
  ];

  const formaterDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const echapper = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const ligne = [
    echapper(dossier.nomComplet),
    echapper(dossier.poste),
    dossier.typeContrat,
    formaterDate(dossier.dateEmbauche),
    formaterDate(dossier.dateFinContrat),
    dossier.salaireBase ?? "",
    dossier.nombrePersonnesACharge,
    dossier.soldeConges,
  ].join(",");

  return `${entetes.join(",")}\n${ligne}\n`;
}
