const AD = "ankara3d-v9";
const KABUK = ["./", "index.html", "css/uygulama.css", "js/uygulama.js", "manifest.json"];
const IKONLAR = ["ikon/atakule-180.png", "ikon/atakule-192.png", "ikon/atakule-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(AD)
      .then(c => c.addAll(KABUK))
      // İkonlar tek tek eklenir; biri eksik olursa kurulum bozulmaz
      .then(() => Promise.all(IKONLAR.map(u =>
        fetch(u).then(r => { if (r.ok) return caches.open(AD).then(c => c.put(u, r)); }).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

// Eski önbellekler temizlenir, yeni sürüm tüm istemcilere yayılır
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== AD).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Harita/veri servisleri (başka origin) her zaman ağdan; ağ yoksa sessiz hata
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" }).then(hit => {
      // Navigasyon: önce önbellekten aç (çevrimdışı kurtarma), arka planda ağı önbelleğe güncelle
      if (e.request.mode === "navigate") {
        fetch(e.request)
          .then(resp => { if (resp.ok) caches.open(AD).then(c => c.put("index.html", resp)); })
          .catch(() => {});
        return hit || fetch(e.request).catch(() => caches.match("index.html"));
      }
      if (hit) return hit;
      return fetch(e.request).then(resp => {
        if (resp.ok && /\.(css|js|json|png|svg)$/.test(url.pathname)) {
          const kopya = resp.clone();
          caches.open(AD).then(c => c.put(e.request, kopya));
        }
        return resp;
      }).catch(() => {
        if (e.request.destination === "image") return new Response("", { status: 404 });
        return Response.error();
      });
    })
  );
});