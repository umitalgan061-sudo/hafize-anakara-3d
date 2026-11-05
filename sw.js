const AD = "ankara3d-v1";
const KABUK = ["./", "index.html", "css/uygulama.css", "js/uygulama.js", "manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(AD).then(c => c.addAll(KABUK)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== AD).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      if (resp.ok && new URL(e.request.url).origin === location.origin) {
        const kopya = resp.clone();
        caches.open(AD).then(c => c.put(e.request, kopya));
      }
      return resp;
    }).catch(() => caches.match("index.html")))
  );
});