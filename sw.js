const AD = "ankara3d-v5";
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

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== AD).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Harita/veri servisleri (başka origin) her zaman ağdan
  if (url.origin !== location.origin) return;
  // Uygulama kabuğu: önce önbellek, yoksa ağ; ağ da yoksa index.html (çevrimdışı açılış)
  e.respondWith(
    caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" }).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(resp => {
        if (resp.ok) {
          const kopya = resp.clone();
          caches.open(AD).then(c => c.put(e.request, kopya));
        }
        return resp;
      }).catch(() => {
        if (e.request.mode === "navigate") return caches.match("index.html");
        return Response.error();
      });
    })
  );
});