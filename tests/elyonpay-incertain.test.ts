import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PARAMS = {
  telephone: "+237677000000",
  operateur: "MTN_Cameroon" as const,
  reference: "ref_abc",
  montant: 1000,
  description: "Test",
};

const reponse = (statut: number, corps: unknown) => ({ ok: statut < 400, status: statut, json: async () => corps });
/** Ce que fetch lève quand le délai est dépassé, quand l'adresse est introuvable, puis quand la connexion est coupée en route. */
const delaiDepasse = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
const adresseIntrouvable = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
const connexionCoupee = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });

beforeEach(() => {
  vi.stubEnv("ELYONPAY_API_KEY", "cle-de-test");
  vi.stubEnv("ELYONPAY_MERCHANT_ID", "207");
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
    const { initierPaiementDirect, MESSAGE_PAIEMENT_INCERTAIN } = await import("@/lib/elyonpay/client");

    const r = await initierPaiementDirect(PARAMS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ incertain: true, erreur: MESSAGE_PAIEMENT_INCERTAIN });
    expect(MESSAGE_PAIEMENT_INCERTAIN).toMatch(/ne payez pas une seconde fois/i);
  });

  it("une coupure en cours de route est aussi incertaine : aucun rejeu", async () => {
    const fetchMock = vi.fn().mockRejectedValue(connexionCoupee());
    vi.stubGlobal("fetch", fetchMock);
    const { initierPaiementDirect } = await import("@/lib/elyonpay/client");
    expect(await initierPaiementDirect(PARAMS)).toMatchObject({ incertain: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("une erreur du serveur du prestataire (5xx) est incertaine", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponse(502, { message: "bad gateway" }));
    vi.stubGlobal("fetch", fetchMock);
    const { initierPaiementDirect } = await import("@/lib/elyonpay/client");
    expect(await initierPaiementDirect(PARAMS)).toMatchObject({ incertain: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("une requête qui n'est jamais partie (adresse introuvable) peut être rejouée sans risque", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(adresseIntrouvable()).mockResolvedValueOnce(reponse(200, { success: true, data: { uuid: "CI032667e43abf11" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { initierPaiementDirect } = await import("@/lib/elyonpay/client");
    expect(await initierPaiementDirect(PARAMS)).toMatchObject({ declenche: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("un refus clair (400) n'est PAS incertain : c'est un échec simple", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse(400, { message: "bad request" })));
    const { initierPaiementDirect } = await import("@/lib/elyonpay/client");
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse(200, { success: true, data: { uuid: "CI032667e43abf11" } })));
    const { initierPaiementDirect } = await import("@/lib/elyonpay/client");
    await initierPaiementDirect(PARAMS);
    expect(delais).toEqual([30_000]);
  });

  it("la relecture d'un statut (sans risque) continue d'être rejouée après un délai dépassé", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(delaiDepasse()).mockResolvedValueOnce(reponse(200, { state: "DELIVERED", amount: 1000 }));
    vi.stubGlobal("fetch", fetchMock);
    const { verifierTransaction } = await import("@/lib/elyonpay/client");
    const r = await verifierTransaction("CI032667e43abf11");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.indisponible).toBe(false);
  });
});

describe("paiement direct — requête envoyée à ElyonPay", () => {
  it("authentifie par clé Bearer, envoie le numéro international, le code d'opérateur et notre référence, et en tire l'identifiant de transaction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponse(200, { success: true, data: { uuid: "CI032667e43abf11" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { initierPaiementDirect } = await import("@/lib/elyonpay/client");

    const r = await initierPaiementDirect({ ...PARAMS, operateur: "Orange_Cameroon" });

    expect(r).toEqual({ declenche: true, payToken: "CI032667e43abf11" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.elyonpay.org/api/mobile-money/payment/request");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer cle-de-test");
    expect(JSON.parse(init.body)).toMatchObject({ amount: 1000, currency: "XAF", country_name: "Cameroon", merchant_id: 207, payment_method: "ORANGE_MONEY", msisdn: "+237677000000", transaction: "ref_abc" });
  });

  it("n'écrit jamais la clé dans les journaux, même quand le prestataire la répète dans son message d'erreur", async () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse(400, { message: "clé cle-de-test refusée" })));
    const { initierPaiementDirect } = await import("@/lib/elyonpay/client");
    await initierPaiementDirect(PARAMS);
    expect(JSON.stringify(erreurs.mock.calls)).not.toContain("cle-de-test");
  });

  it("non configuré (clé ou identifiant marchand absent) : aucun appel réseau", async () => {
    vi.stubEnv("ELYONPAY_MERCHANT_ID", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { initierPaiementDirect } = await import("@/lib/elyonpay/client");
    expect((await initierPaiementDirect(PARAMS)).erreur).toMatch(/non configurée/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("relecture d'une transaction", () => {
  it("GET /transactions/{uuid} avec la clé ; une clé refusée est « indisponible », un identifiant inconnu ne l'est pas", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reponse(200, { state: "DELIVERED", amount: 1000, payment: { name: "MTN" } })).mockResolvedValueOnce(reponse(403, { message: "forbidden" })).mockResolvedValueOnce(reponse(404, {}));
    vi.stubGlobal("fetch", fetchMock);
    const { verifierTransaction } = await import("@/lib/elyonpay/client");
    expect(await verifierTransaction("CI032667e43abf11")).toMatchObject({ statut: "ACCEPTED", montant: 1000, operateur: "MTN", indisponible: false });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.elyonpay.org/api/transactions/CI032667e43abf11");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer cle-de-test");
    expect(await verifierTransaction("CI032667e43abf11")).toMatchObject({ statut: "INCONNU", indisponible: true });
    expect(await verifierTransaction("CI032667e43abf11")).toMatchObject({ statut: "INCONNU", indisponible: false });
  });

  it("un identifiant au format douteux n'est jamais envoyé dans une adresse", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { verifierTransaction } = await import("@/lib/elyonpay/client");
    expect(await verifierTransaction("../../wallet/payouts")).toMatchObject({ statut: "INCONNU", indisponible: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
