const AD = "ankara3d-v21";
const KARO_AD = "ankara3d-karolar-v18";
const KARO_SINIRI = 600; // önbellekte tutulacak en çok girdi sayısı (LRU)
const KABUK = ["./", "index.html", "css/uygulama.css", "js/uygulama.js", "manifest.json"];
const IKONLAR = ["ikon/atakule-180.png", "ikon/atakule-192.png", "ikon/atakule-512.png"];

// Esri/ArcGIS karo ve vektör-taban sunucuları (herkese açık, anahtarsız)
function arcgisSunucusuMu(url) {
  const host = url.hostname;
  return host === "server.arcgisonline.com" ||
    host === "basemaps.arcgis.com" ||
    host === "basemaps3d.arcgis.com" ||
    host.endsWith(".arcgisonline.com") ||
    host.endsWith(".arcgis.com");
}

// Raster/vektör karo isteği mi? (.../tile/z/y/x — veri sorguları değil)
function karoIstegiMi(url) {
  return arcgisSunucusuMu(url) && /\/tile\/\d+\/\d+\/\d+/.test(url.pathname);
}

// Vektör taban kaynakları (style json, glyph, sprite, pbf) — "Harita" tabanı çevrimdışı için
function vektorKaynagiMi(url) {
  if (!arcgisSunucusuMu(url) || karoIstegiMi(url)) return false;
  if (/\/(query|applyEdits|legend)/i.test(url.pathname)) return false;
  return /VectorTileServer/i.test(url.pathname) ||
    /\/(resources|styles|fonts|glyphs|sprites?)(\/|$)/i.test(url.pathname) ||
    /\.(pbf|woff2?|png|json)$/i.test(url.pathname);
}

function lonLatToTile(lon, lat, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

// Alan karo önbellekleme: minZoom–maxZoom arasındaki tüm uydu karoları önbelleğe alır.
// onlyHighFirst=true ise en yüksek zoom (açılış görünümü) ÖNCE önbelleklenir;
// sadeceEksik=true ise önbellekte zaten olan karolar ağdan yeniden çekilmez.
async function alanOnbellekle(bbox, minZoom, maxZoom, sadeceEksik, onlyHighFirst) {
  if (!bbox || typeof bbox.minLon !== "number" || typeof bbox.maxLon !== "number" ||
      typeof bbox.minLat !== "number" || typeof bbox.maxLat !== "number") return 0;
  const c = await caches.open(KARO_AD);
  let sayac = 0;
  const zoomlar = [];
  const zMin = Math.max(1, Math.min(19, minZoom | 0));
  const zMax = Math.max(zMin, Math.min(19, maxZoom | 0));
  for (let z = zMin; z <= zMax; z++) zoomlar.push(z);
  if (onlyHighFirst) zoomlar.reverse(); // z17 (Anıtkabir açılış alanı) ilk önce
  for (const z of zoomlar) {
    const a = lonLatToTile(bbox.minLon, bbox.maxLat, z);
    const b = lonLatToTile(bbox.maxLon, bbox.minLat, z);
    const istekler = [];
    for (let x = a.x; x <= b.x; x++) {
      for (let y = a.y; y <= b.y; y++) {
        const u = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + z + "/" + y + "/" + x;
        istekler.push((async () => {
          if (sadeceEksik && await c.match(u)) return;
          try {
            const r = await fetch(u);
            if (r.ok) { sayac++; await c.put(u, r); }
          } catch (_) {}
        })());
      }
    }
    await Promise.all(istekler);
  }
  await karoSinirla();
  return sayac;
}

// Önbellek sınırını aşınca en eski girdileri baştan sil (Cache API keys eklenme sırasındadır)
async function karoSinirla() {
  const c = await caches.open(KARO_AD);
  const keys = await c.keys();
  const fazlalik = keys.length - KARO_SINIRI;
  for (let i = 0; i < fazlalik; i++) {
    await c.delete(keys[i]);
  }
}

// Port üzerinden yanıtı garanti et: hata olsa bile istemci beklemesin
function portYanitla(port, mesaj) {
  try {
    if (port) port.postMessage(mesaj);
  } catch (_) {}
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
  const port = e.ports && e.ports[0];
  const veri = e.data || {};

  if (veri === "SKIP_WAITING" || veri.tip === "SKIP_WAITING") { self.skipWaiting(); return; }

  if (veri.tip === "KARO_SAYISI") {
    e.waitUntil(
      caches.open(KARO_AD)
        .then(c => c.keys())
        .then(keys => portYanitla(port, { tip: "KARO_SAYISI", sayi: keys.length }))
        .catch(() => portYanitla(port, { tip: "KARO_SAYISI", sayi: 0 }))
    );
    return;
  }

  // Açılış alanı (Anıtkabir çevresi, minZoom 15–17) önbelleklemesi ÖNCELİKLİ yapılır:
  // en yüksek zoom (açılış görünümü) ilk önce önbelleğe girer
  if (veri.tip === "ONBELLEKLE_ALAN") {
    e.waitUntil(
      alanOnbellekle(veri.bbox, veri.minZoom || 15, veri.maxZoom || 17, false, true)
        .then(sayi => portYanitla(port, { tip: "ONBELLEKLE_TAMAM", sayi: sayi }))
        .catch(() => portYanitla(port, { tip: "ONBELLEKLE_TAMAM", sayi: 0 }))
    );
    return;
  }

  // Çevrimiçi dönüşte görünür alanın karoları ağdan tazelenir (kurtarma akışı)
  if (veri.tip === "TAZELE_ALAN") {
    e.waitUntil(
      alanOnbellekle(veri.bbox, veri.minZoom || 15, veri.maxZoom || 17, false)
        .then(sayi => portYanitla(port, { tip: "TAZELE_TAMAM", sayi: sayi }))
        .catch(() => portYanitla(port, { tip: "TAZELE_TAMAM", sayi: 0 }))
    );
    return;
  }

  // Harita durunca güncel görünür alanın karoları arka planda önbelleğe alınır;
  // yalnızca eksik karolar çekilir, ağ yoksa sessizce geçilir
  if (veri.tip === "GUNCEL_ALAN") {
    e.waitUntil(
      alanOnbellekle(veri.bbox, veri.minZoom || 15, veri.maxZoom || 17, true)
        .then(sayi => portYanitla(port, { tip: "GUNCEL_TAMAM", sayi: sayi }))
        .catch(() => portYanitla(port, { tip: "GUNCEL_TAMAM", sayi: 0 }))
    );
  }
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // 1) Harita karoları + vektör taban kaynakları: önce önbellekten anında sun,
  //    varsa arka planda ağdan tazele (stale-while-revalidate); önbellekte yoksa
  //    ağdan çek, ağ yoksa/bozuksa önbelleği son kez dene, yoksa 504
  if (karoIstegiMi(url) || vektorKaynagiMi(url)) {
    e.respondWith(
      caches.open(KARO_AD).then(async c => {
        const hit = await c.match(e.request);
        if (hit) {
          // Çevrimiçiysek arka planda güncelle; ağ yoksa sessizce geç
          fetch(e.request)
            .then(r => {
              if (r.ok || r.type === "opaque") {
                c.put(e.request, r.clone()).then(karoSinirla).catch(() => {});
              }
            })
            .catch(() => {});
          return hit;
        }
        try {
          const resp = await fetch(e.request);
          if (resp.ok || resp.type === "opaque") {
            await c.put(e.request, resp.clone());
            karoSinirla().catch(() => {});
          }
          return resp;
        } catch (err) {
          // Ağ yokken 504 yerine önbellek dönüşünü son kez dene
          const tekrar = await c.match(e.request);
          if (tekrar) return tekrar;
          return new Response("", { status: 504 });
        }
      })
    );
    return;
  }

  // 2) Diğer ArcGIS istekleri (veri sorguları vb.) her zaman ağdan
  if (arcgisSunucusuMu(url)) return;

  // 3) Uygulama kabuğu (aynı origin) — çevrimdışı navigasyon kurtarma
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" }).then(hit => {
      // Navigasyon: önce önbellekten aç (çevrimdışı kurtarma), arka planda ağı önbelleğe güncelle
      if (e.request.mode === "navigate") {
        fetch(e.request)
          .then(resp => { if (resp.ok) caches.open(AD).then(c => c.put("index.html", resp)).catch(() => {}); })
          .catch(() => {});
        return hit || fetch(e.request).catch(() => caches.match("index.html"));
      }
      if (hit) return hit;
      return fetch(e.request).then(resp => {
        if (resp.ok && /\.(css|js|json|png|svg)$/.test(url.pathname)) {
          const kopya = resp.clone();
          caches.open(AD).then(c => c.put(e.request, kopya)).catch(() => {});
        }
        return resp;
      }).catch(() => {
        if (e.request.destination === "image") return new Response("", { status: 404 });
        return Response.error();
      });
    })
  );
});