/* 家有备 · Service Worker（Web Push + 离线缓存基础） */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "家有备", body: "", url: "/" };
  try {
    const parsed = event.data ? event.data.json() : {};
    data = { title: parsed.title || "家有备", body: parsed.body || "", url: parsed.url || "/" };
  } catch {
    data.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: "jiayoubei-event",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          return client.navigate(url).then(() => client.focus());
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
