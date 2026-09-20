import { describe, test, expect } from "vitest";
import { decouperMentions, echapperMotifRecherche, emojiValide, extraireMentions } from "@/lib/messagerie/mentions";

const equipe = [
  { id: "u-marie", nom: "Marie" },
  { id: "u-claire", nom: "Marie Claire" },
  { id: "u-paul", nom: "Paul Mbarga" },
  { id: "u-jean", nom: "Jean-Pierre O'Neil" },
];

describe("One Chat — mentions", () => {
  test("reconnaît une mention par nom complet, sans tenir compte de la casse", () => {
    expect(extraireMentions("Salut @Paul Mbarga, tu as vu ?", equipe)).toEqual(["u-paul"]);
    expect(extraireMentions("@paul mbarga peux-tu valider", equipe)).toEqual(["u-paul"]);
  });

  test("le nom le plus long l'emporte : « @Marie Claire » ne mentionne pas aussi « Marie »", () => {
    expect(extraireMentions("Merci @Marie Claire !", equipe)).toEqual(["u-claire"]);
    expect(extraireMentions("Merci @Marie !", equipe)).toEqual(["u-marie"]);
    expect(extraireMentions("@Marie et @Marie Claire", equipe).sort()).toEqual(["u-claire", "u-marie"]);
  });

  test("gère les noms avec tiret, apostrophe ou ponctuation qui suit", () => {
    expect(extraireMentions("cc @Jean-Pierre O'Neil.", equipe)).toEqual(["u-jean"]);
    expect(extraireMentions("(@Paul Mbarga)", equipe)).toEqual(["u-paul"]);
  });

  test("une mention n'est comptée qu'une fois, même répétée", () => {
    expect(extraireMentions("@Paul Mbarga @Paul Mbarga @paul mbarga", equipe)).toEqual(["u-paul"]);
  });

  test("ne prend jamais une adresse email, un nom collé à un mot, ou un nom inconnu pour une mention", () => {
    expect(extraireMentions("écris à contact@Marie.com", equipe)).toEqual([]);
    expect(extraireMentions("@Mariette arrive", equipe)).toEqual([]); // « Marie » n'est pas la fin de mot
    expect(extraireMentions("@Inconnu Personne", equipe)).toEqual([]);
    expect(extraireMentions("Paul Mbarga sans arobase", equipe)).toEqual([]);
  });

  test("decouperMentions isole les mentions pour l'affichage, le nom long d'abord", () => {
    const noms = equipe.map((c) => c.nom);
    expect(decouperMentions("Salut @Marie Claire, ok ?", noms)).toEqual([
      { texte: "Salut ", mention: false },
      { texte: "@Marie Claire", mention: true },
      { texte: ", ok ?", mention: false },
    ]);
    expect(decouperMentions("rien ici", noms)).toEqual([{ texte: "rien ici", mention: false }]);
    expect(decouperMentions("@Paul Mbarga", noms)).toEqual([{ texte: "@Paul Mbarga", mention: true }]);
    // Sans aucun nom connu : le texte est rendu tel quel.
    expect(decouperMentions("@Paul Mbarga", [])).toEqual([{ texte: "@Paul Mbarga", mention: false }]);
  });

  test("les caractères spéciaux d'un nom ne cassent pas la reconnaissance", () => {
    const bizarre = [{ id: "x", nom: "A.(B)+C" }];
    expect(extraireMentions("hello @A.(B)+C !", bizarre)).toEqual(["x"]);
    expect(decouperMentions("hello @A.(B)+C !", ["A.(B)+C"]).some((m) => m.mention)).toBe(true);
  });

  test("emojiValide n'accepte que la liste fermée", () => {
    expect(emojiValide("👍")).toBe(true);
    expect(emojiValide("❤️")).toBe(true);
    expect(emojiValide("💀")).toBe(false);
    expect(emojiValide("<script>")).toBe(false);
    expect(emojiValide(undefined)).toBe(false);
  });

  test("echapperMotifRecherche neutralise % _ et \\ pour un ILIKE", () => {
    expect(echapperMotifRecherche("100%_sûr\\")).toBe("100\\%\\_sûr\\\\");
    expect(echapperMotifRecherche("simple")).toBe("simple");
  });
});
