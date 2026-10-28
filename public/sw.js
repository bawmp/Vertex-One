/* Service worker de Vertex One — notifications push de One Chat (et rien d'autre : aucun cache, aucune mise hors ligne).
 *
 * Un message envoyé arrive ici (événement « push ») même application fermée. Règles :
 *  - une fenêtre de l'application est visible : on ne montre PAS de notification système (la personne regarde déjà l'écran),
 *    on prévient seulement la page (son, lecture immédiate de la conversation) ;
 *  - sinon : notification système, regroupée par conversation (la plus récente remplace la précédente) ;
 *  - un clic ouvre (ou ramène au premier plan) Vertex One directement sur la conversation et le message.
 * Le contenu vient du serveur (src/lib/messagerie/push.ts) ; l'adresse ouverte est toujours relative à ce site.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let donnees = {};
  try {
    donnees = event.data ? event.data.json() : {};
  } catch (e) {
    donnees = {};
  }
  const titre = typeof donnees.titre === "string" && donnees.titre ? donnees.titre : "Vertex One";
  const corps = typeof donnees.corps === "string" ? donnees.corps : "Nouveau message";
  const url = typeof donnees.url === "string" && donnees.url.startsWith("/") ? donnees.url : "/app/messagerie";

  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = fenetres.some((f) => f.visibilityState === "visible");
      if (visible) {
        fenetres.forEach((f) => f.postMessage({ type: "one-chat-push", son: donnees.son !== false, canalId: donnees.canalId || "", messageId: donnees.messageId || "" }));
        return;
      }
      await self.registration.showNotification(titre, {
        body: corps,
        icon: "/marque/symbole.png",
        badge: "/marque/symbole.png",
        tag: typeof donnees.tag === "string" ? donnees.tag : "one-chat",
        renotify: true,
        silent: donnees.son === false,
        data: { url },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app/messagerie";
  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const cible = new URL(url, self.location.origin).href;
      for (const f of fenetres) {
        if (f.url.startsWith(self.location.origin + "/app") && "focus" in f) {
          await f.focus();
          if ("navigate" in f) await f.navigate(cible).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(cible);
    })()
  );
});

// Le navigateur a renouvelé l'abonnement : on prévient une page ouverte, qui l'enregistrera de nouveau côté serveur.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => fenetres.forEach((f) => f.postMessage({ type: "one-chat-resubscribe" })))
  );
});
