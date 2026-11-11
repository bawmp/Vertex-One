import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { avecEntreprise, db } from "@/db/client";
import { entreprise, modeleEmail } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { LIBELLES_MESSAGE_CLIENT, TYPES_MODELE_MESSAGE_CLIENT, elementsACompleter, estModeleMessageClient, interpoler, modeleParDefaut, recupererModele, variablesDuType, variablesExemple } from "@/lib/email/modeles";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

describe("Modèle de message « profil dans le bassin » — texte et règles", () => {
  const defaut = modeleParDefaut("MESSAGE_BASSIN");

  test("c'est un modèle de message écrit à la main, avec ses variables et son libellé", () => {
    expect(estModeleMessageClient("MESSAGE_BASSIN")).toBe(true);
    expect(estModeleMessageClient("ENVOI_DEVIS")).toBe(false);
    expect(TYPES_MODELE_MESSAGE_CLIENT).toContain("MESSAGE_BASSIN");
    expect(LIBELLES_MESSAGE_CLIENT.MESSAGE_BASSIN).toBe("Profil dans le bassin (conjointe de fait)");
    expect(variablesDuType("MESSAGE_BASSIN").map((v) => v.cle)).toEqual(["client", "entreprise"]);
    expect(variablesExemple("MESSAGE_BASSIN")).toMatchObject({ client: expect.any(String), entreprise: expect.any(String) });
  });

  test("le texte par défaut ne promet ni invitation ni délai, et reste à compléter à la main", () => {
    expect(defaut.objet).toContain("bassin");
    expect(defaut.corps).toContain("ne garantit pas une invitation");
    expect(defaut.corps).toContain("ne pouvons donc pas vous annoncer de délai");
    expect(defaut.corps).toContain("{{client}}");
    expect(defaut.corps).toContain("{{entreprise}}");
    expect(elementsACompleter(defaut.corps).sort()).toEqual(["[lien de suivi]", "[prénom du conjoint]"]);
  });

  test("le nom du client et de l'entreprise se remplissent, les crochets restent", () => {
    const texte = interpoler(defaut.corps, { client: "Linda Mbella", entreprise: "Global Mobility" });
    expect(texte).toContain("Bonjour Linda Mbella,");
    expect(texte.trimEnd().endsWith("Global Mobility")).toBe(true);
    expect(texte).not.toContain("{{");
    expect(elementsACompleter(texte)).toHaveLength(2);
  });

  test("une fois les crochets remplacés, plus rien à compléter ; un texte ordinaire n'en a jamais", () => {
    const rempli = interpoler(defaut.corps, { client: "Linda", entreprise: "GM" }).replaceAll("[prénom du conjoint]", "Marc").replaceAll("[lien de suivi]", "https://exemple.test/suivi/abc");
    expect(elementsACompleter(rempli)).toEqual([]);
    expect(elementsACompleter("Bonjour, voici votre devis. Cordialement.")).toEqual([]);
    expect(elementsACompleter("Dossier [Canada] et [Canada]")).toEqual(["[Canada]"]); // sans doublon
    expect(elementsACompleter("[" + "x".repeat(200) + "]")).toEqual([]); // un très long passage entre crochets n'est pas un « à compléter »
  });
});

describe("Modèle de message « profil dans le bassin » — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Bassin A ${suffixe}`;
  const nomB = `TEST Bassin B ${suffixe}`;
  let entA = "";
  let entB = "";

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "immigration" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "immigration" }).returning({ id: entreprise.id });
    entA = a.id;
    entB = b.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 120_000);

  test("sans personnalisation : le texte par défaut ; personnalisé par une entreprise : le sien, sans toucher aux autres", async () => {
    const avant = await avecEntreprise(entA, (tx) => recupererModele(tx, entA, "MESSAGE_BASSIN"));
    expect(avant).toEqual(modeleParDefaut("MESSAGE_BASSIN"));

    await avecEntreprise(entA, (tx) => tx.insert(modeleEmail).values({ entrepriseId: entA, type: "MESSAGE_BASSIN", objet: "Objet de A", corps: "Corps de A {{client}}" }));

    const pourA = await avecEntreprise(entA, (tx) => recupererModele(tx, entA, "MESSAGE_BASSIN"));
    expect(pourA).toEqual({ objet: "Objet de A", corps: "Corps de A {{client}}" });

    // B garde le texte par défaut : la personnalisation de A ne fuit pas (RLS)
    const pourB = await avecEntreprise(entB, (tx) => recupererModele(tx, entB, "MESSAGE_BASSIN"));
    expect(pourB).toEqual(modeleParDefaut("MESSAGE_BASSIN"));

    // et B ne voit aucune ligne de A, même en la demandant exactement
    const lignesVuesParB = await avecEntreprise(entB, (tx) => tx.select().from(modeleEmail).where(and(eq(modeleEmail.entrepriseId, entA), eq(modeleEmail.type, "MESSAGE_BASSIN"))));
    expect(lignesVuesParB).toEqual([]);
  }, 90_000);
});
