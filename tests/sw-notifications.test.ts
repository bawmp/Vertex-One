import { describe, test, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";

/**
 * Le service worker (public/sw.js) est exécuté ici dans un faux environnement « worker » : on vérifie, sans navigateur,
 * ce qu'il fait d'un message push selon que l'application est visible ou non, et où mène un clic sur la notification.
 */
type Ecouteur = (evenement: Record<string, unknown>) => void;

function monterWorker(options: { fenetres: { url: string; visibilityState: "visible" | "hidden" }[] }) {
  const ecouteurs: Record<string, Ecouteur> = {};
  const notifications: { titre: string; options: Record<string, unknown> }[] = [];
  const messages: unknown[] = [];
  const ouvertes: string[] = [];
  const focus: string[] = [];
  const fenetres = options.fenetres.map((f) => ({
    ...f,
    postMessage: (m: unknown) => messages.push(m),
    focus: async () => focus.push(f.url),
    navigate: async (u: string) => focus.push(`navigate:${u}`),
  }));
  const self = {
    location: { origin: "https://vertexone.test" },
    addEventListener: (nom: string, fn: Ecouteur) => (ecouteurs[nom] = fn),
    skipWaiting: () => undefined,
    clients: { matchAll: async () => fenetres, claim: async () => undefined, openWindow: async (u: string) => ouvertes.push(u) },
    registration: { showNotification: async (titre: string, opts: Record<string, unknown>) => notifications.push({ titre, options: opts }) },
  };
  runInNewContext(readFileSync(join(process.cwd(), "public", "sw.js"), "utf8"), { self, URL, JSON, Promise });
  const declencher = async (nom: string, evenement: Record<string, unknown>) => {
    const attentes: Promise<unknown>[] = [];
    ecouteurs[nom]({ ...evenement, waitUntil: (p: Promise<unknown>) => attentes.push(p) });
    await Promise.all(attentes);
  };
  return { declencher, notifications, messages, ouvertes, focus };
}

const push = (charge: unknown) => ({ data: { json: () => charge } });

describe("service worker — notifications de One Chat", () => {
  let sw: ReturnType<typeof monterWorker>;

  describe("application non visible (fermée ou en arrière-plan)", () => {
    beforeEach(() => {
      sw = monterWorker({ fenetres: [] });
    });

    test("affiche une notification système regroupée par conversation", async () => {
      await sw.declencher("push", push({ titre: "Alice", corps: "Salut !", url: "/app/messagerie?canal=c1&message=m1", tag: "one-chat-c1", son: true }));
      expect(sw.notifications).toHaveLength(1);
      expect(sw.notifications[0].titre).toBe("Alice");
      expect(sw.notifications[0].options).toMatchObject({ body: "Salut !", tag: "one-chat-c1", renotify: true, silent: false, data: { url: "/app/messagerie?canal=c1&message=m1" } });
    });

    test("« son désactivé » rend la notification silencieuse", async () => {
      await sw.declencher("push", push({ titre: "Bob", corps: "x", url: "/app/messagerie", tag: "t", son: false }));
      expect(sw.notifications[0].options.silent).toBe(true);
    });

    test("une adresse venue d'ailleurs est ignorée : on retombe sur la messagerie", async () => {
      await sw.declencher("push", push({ titre: "Mallory", corps: "Cliquez", url: "https://evil.example/phishing", tag: "t", son: true }));
      expect(sw.notifications[0].options.data).toEqual({ url: "/app/messagerie" });
    });

    test("un contenu illisible donne quand même une notification neutre (jamais de plantage)", async () => {
      await sw.declencher("push", { data: { json: () => { throw new Error("pas du JSON"); } } });
      expect(sw.notifications).toHaveLength(1);
      expect(sw.notifications[0].titre).toBe("Vertex One");
    });

    test("un clic ouvre Vertex One sur la conversation", async () => {
      let fermee = false;
      await sw.declencher("notificationclick", { notification: { close: () => (fermee = true), data: { url: "/app/messagerie?canal=c1&message=m1" } } });
      expect(fermee).toBe(true);
      expect(sw.ouvertes).toEqual(["https://vertexone.test/app/messagerie?canal=c1&message=m1"]);
    });
  });

  describe("application visible", () => {
    beforeEach(() => {
      sw = monterWorker({ fenetres: [{ url: "https://vertexone.test/app/crm", visibilityState: "visible" }] });
    });

    test("aucune notification système : la page est prévenue (son, lecture immédiate)", async () => {
      await sw.declencher("push", push({ titre: "Alice", corps: "Salut", url: "/app/messagerie", tag: "t", son: true, canalId: "c1", messageId: "m1" }));
      expect(sw.notifications).toHaveLength(0);
      expect(sw.messages).toEqual([{ type: "one-chat-push", son: true, canalId: "c1", messageId: "m1" }]);
    });

    test("le clic ramène la fenêtre déjà ouverte au premier plan et l'amène à la conversation", async () => {
      await sw.declencher("notificationclick", { notification: { close: () => undefined, data: { url: "/app/messagerie?canal=c2" } } });
      expect(sw.ouvertes).toHaveLength(0);
      expect(sw.focus).toEqual(["https://vertexone.test/app/crm", "navigate:https://vertexone.test/app/messagerie?canal=c2"]);
    });
  });

  test("renouvellement de l'abonnement : les pages ouvertes sont prévenues pour se réabonner", async () => {
    sw = monterWorker({ fenetres: [{ url: "https://vertexone.test/app", visibilityState: "hidden" }] });
    await sw.declencher("pushsubscriptionchange", {});
    expect(sw.messages).toEqual([{ type: "one-chat-resubscribe" }]);
  });
});
