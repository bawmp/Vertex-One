import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PARAMS = {
  telephone: "+237677000000",
  operateur: "MTN_Cameroon" as const,
  reference: "ref_abc",
  montant: 1000,
  description: "Test",
  notifyUrl: "https://exemple.cm/api/paiements/aangaraa/notify",
  returnUrl: "https://exemple.cm/retour",
};

const reponse = (statut: number, corps: unknown) => ({ ok: statut < 400, status: statut, json: async () => corps });
/** Ce que fetch lève quand le délai est dépassé, quand l'adresse est introuvable, puis quand la connexion est coupée en route. */
const delaiDepasse = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
const adresseIntrouvable = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
const connexionCoupee = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });

beforeEach(() => {
  vi.stubEnv("AANGARAA_PAY_APP_KEY", "cle-de-test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("paiement direct — résultat incertain (le client est peut-être déjà débité)", () => {
  it("un délai dépassé n'est JAMAIS rejoué : un seul appel, résultat « incertain » avec le message de prudence", async () => {
    const fetchMock = vi.fn().mockRejectedValue(delaiDepasse());
    vi.stubGlobal("fetch", fetchMock);
    const { initierPaiementDirect, MESSAGE_PAIEMENT_INCERTAIN } = await import("@/lib/aangaraa/client");

    const r = await initierPaiementDirect(PARAMS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ incertain: true, erreur: MESSAGE_PAIEMENT_INCERTAIN });
    expect(MESSAGE_PAIEMENT_INCERTAIN).toMatch(/ne payez pas une seconde fois/i);
  });

  it("une coupure en cours de route est aussi incertaine : aucun rejeu", async () => {
    const fetchMock = vi.fn().mockRejectedValue(connexionCoupee());
    vi.stubGlobal("fetch", fetchMock);
    const { initierPaiementDirect } = await import("@/lib/aangaraa/client");
    expect(await initierPaiementDirect(PARAMS)).toMatchObject({ incertain: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("une erreur du serveur du prestataire (5xx) est incertaine", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponse(502, { message: "bad gateway" }));
    vi.stubGlobal("fetch", fetchMock);
    const { initierPaiementDirect } = await import("@/lib/aangaraa/client");
    expect(await initierPaiementDirect(PARAMS)).toMatchObject({ incertain: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("une requête qui n'est jamais partie (adresse introuvable) peut être rejouée sans risque", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(adresseIntrouvable()).mockResolvedValueOnce(reponse(201, { data: { payToken: "PT-1234567890abcdef" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { initierPaiementDirect } = await import("@/lib/aangaraa/client");
    expect(await initierPaiementDirect(PARAMS)).toMatchObject({ declenche: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("un refus clair (400) n'est PAS incertain : c'est un échec simple", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse(400, { message: "bad request" })));
    const { initierPaiementDirect } = await import("@/lib/aangaraa/client");
    const r = await initierPaiementDirect(PARAMS);
    expect(r.incertain).toBeUndefined();
    expect(r.erreur).toBe("Impossible de déclencher le paiement pour le moment.");
  });

  it("le paiement direct laisse 30 secondes au prestataire", async () => {
    const delais: number[] = [];
    const vrai = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      delais.push(ms);
      return vrai(ms);
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse(201, { data: { payToken: "PT-1234567890abcdef" } })));
    const { initierPaiementDirect } = await import("@/lib/aangaraa/client");
    await initierPaiementDirect(PARAMS);
    expect(delais).toEqual([30_000]);
  });

  it("la relecture d'un statut (sans risque) continue d'être rejouée après un délai dépassé", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(delaiDepasse()).mockResolvedValueOnce(reponse(200, { data: { status: "SUCCESSFUL" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { verifierTransaction } = await import("@/lib/aangaraa/client");
    const r = await verifierTransaction("PT-1234567890abcdef");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.indisponible).toBe(false);
  });
});
