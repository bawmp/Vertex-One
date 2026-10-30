import { describe, expect, it } from "vitest";
import { prochaineEcheanceApresPaiement } from "@/lib/abonnement/etat";
import {
  GARANTIE_LANCEMENT_MOIS,
  MOIS_OFFERTS_ANNUEL,
  OFFRE_LANCEMENT_JUSQU_AU,
  PRIX_MENSUEL_EQUIPE,
  PRIX_MENSUEL_LANCEMENT,
  PRIX_MENSUEL_STANDARD,
  SEUIL_EQUIPE,
  finGarantieLancement,
  montantEtMois,
  tarifPour,
} from "@/lib/abonnement/tarif";

const JOUR = 86_400_000;

describe("Tarif de l'abonnement — prix de lancement garanti et formule annuelle", () => {
  it("le prix de lancement est 25 000 FCFA/mois et l'annuel offre deux mois (250 000 pour 12 mois)", () => {
    expect(PRIX_MENSUEL_LANCEMENT).toBe(25_000);
    const tarif = tarifPour(new Date("2026-11-20T09:00:00Z"), new Date("2026-11-20T09:00:00Z"));
    expect(tarif).toMatchObject({ prixMensuel: 25_000, montantMensuel: 25_000, montantAnnuel: 250_000, moisAnnuel: 12, palierEquipe: false });
    expect(MOIS_OFFERTS_ANNUEL).toBe(2);
  });

  it("une entreprise créée pendant l'offre est garantie 12 mois à partir de SA création ; après, plus de garantie", () => {
    const creee = new Date("2026-12-15T10:00:00Z");
    const fin = finGarantieLancement(creee)!;
    expect(fin.toISOString()).toBe("2027-12-15T10:00:00.000Z");
    expect(GARANTIE_LANCEMENT_MOIS).toBe(12);
    expect(tarifPour(creee, new Date(fin.getTime() - JOUR)).garantieJusquAu?.getTime()).toBe(fin.getTime());
    expect(tarifPour(creee, new Date(fin.getTime() + JOUR)).garantieJusquAu).toBeNull();
  });

  it("une entreprise créée après la fin de l'offre n'a aucune garantie", () => {
    const tardive = new Date(OFFRE_LANCEMENT_JUSQU_AU.getTime() + JOUR);
    expect(finGarantieLancement(tardive)).toBeNull();
    expect(tarifPour(tardive, tardive).garantieJusquAu).toBeNull();
  });

  it("si le prix standard monte plus tard, l'entreprise garantie garde 25 000 jusqu'à la fin de sa garantie, une entreprise tardive paie le nouveau prix", () => {
    const creee = new Date("2027-01-10T08:00:00Z");
    const pendant = tarifPour(creee, new Date("2027-09-01T08:00:00Z"), 0, { standard: 40_000 });
    expect(pendant).toMatchObject({ prixMensuel: 25_000, montantAnnuel: 250_000 });
    const apres = tarifPour(creee, new Date("2028-01-11T08:00:00Z"), 0, { standard: 40_000 });
    expect(apres).toMatchObject({ prixMensuel: 40_000, montantAnnuel: 400_000, garantieJusquAu: null });
    const tardive = new Date("2027-06-01T08:00:00Z");
    expect(tarifPour(tardive, tardive, 0, { standard: 40_000 }).prixMensuel).toBe(40_000);
  });

  it("la garantie ne fait jamais PAYER PLUS CHER : si le prix standard baisse sous le prix de lancement, c'est le plus bas qui s'applique", () => {
    const creee = new Date("2027-01-10T08:00:00Z");
    expect(tarifPour(creee, new Date("2027-02-01T08:00:00Z"), 0, { standard: 20_000 }).prixMensuel).toBe(20_000);
  });

  it("le montant et la durée ne viennent jamais du navigateur : toute valeur inconnue retombe sur le mensuel", () => {
    const tarif = tarifPour(new Date("2026-11-20T09:00:00Z"), new Date("2026-11-20T09:00:00Z"));
    expect(montantEtMois(tarif, "annuel")).toEqual({ montant: 250_000, mois: 12, formule: "annuel" });
    expect(montantEtMois(tarif, "mensuel")).toEqual({ montant: 25_000, mois: 1, formule: "mensuel" });
    for (const douteux of ["gratuit", "", null, undefined, 12, { mois: 99 }, "ANNUEL"]) {
      expect(montantEtMois(tarif, douteux)).toEqual({ montant: 25_000, mois: 1, formule: "mensuel" });
    }
  });

  it("la valeur standard actuelle égale le prix de lancement (la garantie ne joue qu'une fois le prix standard relevé)", () => {
    expect(PRIX_MENSUEL_STANDARD).toBe(PRIX_MENSUEL_LANCEMENT);
  });

  it("l'échéance avance de 30 jours (mensuel) ou 365 jours (annuel), depuis l'échéance courante si payé en avance, depuis aujourd'hui si payé en retard", () => {
    const maintenant = new Date("2026-12-01T00:00:00Z");
    const enAvance = new Date(maintenant.getTime() + 10 * JOUR);
    expect(Math.round((prochaineEcheanceApresPaiement(enAvance, maintenant).getTime() - enAvance.getTime()) / JOUR)).toBe(30);
    expect(Math.round((prochaineEcheanceApresPaiement(enAvance, maintenant, 12).getTime() - enAvance.getTime()) / JOUR)).toBe(365);
    const enRetard = new Date(maintenant.getTime() - 5 * JOUR);
    expect(Math.round((prochaineEcheanceApresPaiement(enRetard, maintenant, 12).getTime() - maintenant.getTime()) / JOUR)).toBe(365);
  });
});

describe("Palier équipe — à partir de 50 utilisateurs actifs, 45 000 FCFA/mois pour toute l'équipe", () => {
  const creee = new Date("2026-12-01T08:00:00Z");
  const maintenant = new Date("2027-01-15T08:00:00Z");

  it("constantes : seuil de 50, 45 000 FCFA/mois", () => {
    expect(SEUIL_EQUIPE).toBe(50);
    expect(PRIX_MENSUEL_EQUIPE).toBe(45_000);
  });

  it("49 utilisateurs : prix de base ; 50 : 45 000 pour toute l'équipe (et pas un centime de plus à 80 ou 500 utilisateurs)", () => {
    expect(tarifPour(creee, maintenant, 49)).toMatchObject({ prixMensuel: 25_000, palierEquipe: false, utilisateursActifs: 49 });
    expect(tarifPour(creee, maintenant, 50)).toMatchObject({ prixMensuel: 45_000, montantMensuel: 45_000, palierEquipe: true });
    expect(tarifPour(creee, maintenant, 80).prixMensuel).toBe(45_000);
    expect(tarifPour(creee, maintenant, 500).prixMensuel).toBe(45_000);
  });

  it("la formule annuelle du palier équipe offre aussi deux mois : 450 000 FCFA pour 12 mois", () => {
    const tarif = tarifPour(creee, maintenant, 50);
    expect(tarif.montantAnnuel).toBe(450_000);
    expect(montantEtMois(tarif, "annuel")).toEqual({ montant: 450_000, mois: 12, formule: "annuel" });
  });

  it("la garantie du prix de lancement ne protège que le palier de base : au palier équipe, pas de garantie affichée, le prix équipe s'applique", () => {
    expect(tarifPour(creee, maintenant, 49).garantieJusquAu).not.toBeNull();
    expect(tarifPour(creee, maintenant, 50).garantieJusquAu).toBeNull();
    // Redescendre sous 50 utilisateurs rend le prix de base ET la garantie, tant qu'elle court.
    expect(tarifPour(creee, maintenant, 30)).toMatchObject({ prixMensuel: 25_000, palierEquipe: false });
    expect(tarifPour(creee, maintenant, 30).garantieJusquAu).not.toBeNull();
  });

  it("un nombre d'utilisateurs inconnu (0) donne le tarif de base, celui que voit un visiteur du site", () => {
    expect(tarifPour(creee, maintenant)).toMatchObject({ prixMensuel: 25_000, palierEquipe: false, utilisateursActifs: 0 });
  });
});
