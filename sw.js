const AD = "ankara3d-v10";
const KARO_AD = "ankara3d-karolar-v10";
const KARO_SINIRI = 600; // önbellekte tutulacak en çok karo sayısı (LRU)
const KABUK = ["./", "index.html", "css/uygulama.css", "js/uygulama.js", "manifest.json"];
const IKONLAR = ["ikon/atakule-180.png", "ikon/atakule-192.png", "ikon/atakule-512.png"];

// Harita karo isteği mi? (yalnızca .../tile/z/y/x — SceneServer/MapServer veri istekleri değil)
function karoIstegiMi(url) {
  const host = url.hostname;
  const alanOk = host === "server.arcgisonline.com" ||
    host === "basemaps.arcgis.com" ||
    host === "basemaps3d.arcgis.com" ||
    host.endsWith(".arcgisonline.com") ||
    host.endsWith(".arcgis.com");
  return alanOk && /\/tile\/\d+\/\d+\/\d+/.test(url.pathname);
}

// Önbellek sınırını aşınca en eski karoları baştan sil (Cache API keys eklenme sırasındadır)
async function karoSinirla() {
  const c = await caches.open(KARO_AD);
  const keys = await c.keys();
  const fazlalik = keys.length - KARO_SINIRI;
  for (let i = 0; i < fazlalik; i++) {
    await c.delete(keys[i]);
  }
}

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

// Eski önbellekler (eski karo önbellekleri dahil) temizlenir, yeni sürüm tüm istemcilere yayılır
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== AD && k !== KARO_AD).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // 1) Harita karoları: önce önbellekten, yoksa ağdan çek + önbelleğe yaz + sınırla (çevrimdışı son görünüm)
  if (karoIstegiMi(url)) {
    e.respondWith(
      caches.open(KARO_AD).then(async c => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        try {
          const resp = await fetch(e.request);
          if (resp.ok || resp.type === "opaque") {
            await c.put(e.request, resp.clone());
            karoSinirla();
          }
          return resp;
        } catch (err) {
          return new Response("", { status: 504 });
        }
      })
    );
    return;
  }

  // 2) Harita/veri servisleri (diğer tüm origin'ler) her zaman ağdan; ağ yoksa sessiz hata
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