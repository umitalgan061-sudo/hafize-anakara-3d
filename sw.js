const AD = "ankara3d-v37";
const KARO_AD = "ankara3d-karolar-v28";
const VEKTOR_AD = "ankara3d-vektor-v2";
const SDK_AD = "ankara3d-sdk-v1";
const KARO_SINIRI = 600;
const SDK_SINIRI = 400;
const KABUK = ["./", "index.html", "css/uygulama.css", "js/uygulama.js", "manifest.json"];
const IKONLAR = ["ikon/atakule-180.png", "ikon/atakule-192.png", "ikon/atakule-512.png"];
// ArcGIS JS 4.32 SDK önbelleğinin açılışta ön-yüklenen kritik dosyaları:
// ana yükleyici betiği + tema CSS (index.html bunları preload ediyor)
const SDK_ON = [
  "https://js.arcgis.com/4.32/",
  "https://js.arcgis.com/4.32/init.js",
  "https://js.arcgis.com/4.32/esri/themes/light/main.css"
];

const VEKTOR_ON = [
  "https://basemaps.arcgis.com/arcgis/rest/services/World_Street_Map/VectorTileServer?f=json",
  "https://basemaps.arcgis.com/arcgis/rest/services/World_Street_Map/VectorTileServer/resources/styles/root.json",
  "https://basemaps.arcgis.com/arcgis/rest/services/World_Street_Map/VectorTileServer/resources/sprites/sprite.json",
  "https://basemaps.arcgis.com/arcgis/rest/services/World_Street_Map/VectorTileServer/resources/sprites/sprite@2x.json",
  "https://basemaps.arcgis.com/arcgis/rest/services/World_Street_Map/VectorTileServer/resources/fonts/AdelleSans_W_Bold/0-255.pbf",
  "https://basemaps.arcgis.com/arcgis/rest/services/World_Street_Map/VectorTileServer/resources/fonts/AdelleSans_W_Regular/0-255.pbf"
];

function arcgisSunucusuMu(url) {
  try {
    const host = url.hostname;
    return host === "js.arcgis.com" ||
      host === "server.arcgisonline.com" ||
      host === "basemaps.arcgis.com" ||
      host === "basemaps3d.arcgis.com" ||
      host.endsWith(".arcgisonline.com") ||
      host.endsWith(".arcgis.com");
  } catch (_) { return false; }
}

// ArcGIS JS SDK istekleri (js.arcgis.com): yükleyici + tüm esri/... modül dosyaları + tema CSS.
// Bu yollar artık 'return' ile ağa bırakılmaz; SDK önbelleğinden (cache-first) sunulur.
function sdkIstegiMi(url) {
  try {
    return url.hostname === "js.arcgis.com";
  } catch (_) { return false; }
}

function karoIstegiMi(url) {
  try {
    return arcgisSunucusuMu(url) && !sdkIstegiMi(url) && /\/tile\/\d+\/\d+\/\d+/.test(url.pathname);
  } catch (_) { return false; }
}

function vektorKaynagiMi(url) {
  try {
    if (!arcgisSunucusuMu(url) || sdkIstegiMi(url) || karoIstegiMi(url)) return false;
    if (/\/(query|applyEdits|legend)/i.test(url.pathname)) return false;
    return /VectorTileServer/i.test(url.pathname) ||
      /\/(resources|styles|fonts|glyphs|sprites?)(\/|$)/i.test(url.pathname) ||
      /\.(pbf|woff2?|png|json)$/i.test(url.pathname);
  } catch (_) { return false; }
}

function lonLatToTile(lon, lat, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

async function cacheYaz(c, anahtar, yanit) {
  try { await c.delete(anahtar); } catch (_) {}
  try { await c.put(anahtar, yanit); } catch (_) {}
}

// LRU sınırlayıcı: önbellek sınırın üstüne çıkınca en eski (ilk) anahtarlar silinir
async function cacheSinirla(cacheAd, sinir) {
  try {
    const c = await caches.open(cacheAd);
    const keys = await c.keys();
    const fazlalik = keys.length - sinir;
    for (let i = 0; i < fazlalik; i++) {
      try { await c.delete(keys[i]); } catch (_) {}
    }
  } catch (_) {}
}

function karoSinirla() { return cacheSinirla(KARO_AD, KARO_SINIRI); }
function sdkSinirla() { return cacheSinirla(SDK_AD, SDK_SINIRI); }

async function karoYaz(c, anahtar, yanit) { return cacheYaz(c, anahtar, yanit); }

function bboxGecerliMi(bbox) {
  return !!bbox &&
    Number.isFinite(bbox.minLon) && Number.isFinite(bbox.maxLon) &&
    Number.isFinite(bbox.minLat) && Number.isFinite(bbox.maxLat) &&
    bbox.minLon >= -180 && bbox.maxLon <= 180 &&
    bbox.minLat >= -85 && bbox.maxLat <= 85 &&
    bbox.minLon < bbox.maxLon && bbox.minLat < bbox.maxLat;
}

async function alanOnbellekle(bbox, minZoom, maxZoom, sadeceEksik, onlyHighFirst) {
  if (!bboxGecerliMi(bbox)) return 0;
  let c;
  try { c = await caches.open(KARO_AD); } catch (_) { return 0; }
  let sayac = 0;
  const zoomlar = [];
  const zMin = Math.max(1, Math.min(19, Math.floor(minZoom) || 1));
  const zMax = Math.max(zMin, Math.min(19, Math.floor(maxZoom) || zMin));
  for (let z = zMin; z <= zMax; z++) zoomlar.push(z);
  if (onlyHighFirst) zoomlar.reverse();
  let plan = 0;
  for (let i = 0; i < zoomlar.length; i++) {
    const z = zoomlar[i];
    const aP = lonLatToTile(bbox.minLon, bbox.maxLat, z);
    const bP = lonLatToTile(bbox.maxLon, bbox.minLat, z);
    plan += (bP.x - aP.x + 1) * (bP.y - aP.y + 1);
    if (plan > 5000) { zoomlar.length = i + 1; break; }
  }
  for (const z of zoomlar) {
    const a = lonLatToTile(bbox.minLon, bbox.maxLat, z);
    const b = lonLatToTile(bbox.maxLon, bbox.minLat, z);
    const istekler = [];
    for (let x = a.x; x <= b.x; x++) {
      for (let y = a.y; y <= b.y; y++) {
        const u = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + z + "/" + y + "/" + x;
        istekler.push((async () => {
          if (sadeceEksik) {
            try { if (await c.match(u)) return; } catch (_) {}
          }
          try {
            const r = await fetch(u);
            if (r.ok) { sayac++; await karoYaz(c, u, r); }
          } catch (_) {}
        })());
      }
    }
    await Promise.all(istekler);
  }
  await karoSinirla();
  return sayac;
}

function portYanitla(port, mesaj) {
  try {
    if (port) port.postMessage(mesaj);
  } catch (_) {}
}

function bosYanit(url) {
  let ct = "application/octet-stream";
  try {
    if (/\\.js$/i.test(url.pathname)) ct = "application/javascript";
    else if (/\\.css$/i.test(url.pathname)) ct = "text/css";
    else if (/\\.json$/i.test(url.pathname)) ct = "application/json";
    else if (/\\.pbf$/i.test(url.pathname)) ct = "application/x-protobuf";
    else if (/\\.woff2?$/i.test(url.pathname)) ct = "font/woff2";
    else if (/\\.png$/i.test(url.pathname)) ct = "image/png";
  } catch (_) {}
  return new Response("", { status: 200, headers: { "Content-Type": ct } });
}

// Nihai sertleştirme: her mesaj tipi için garanti yanıt — fn hata verse bile
// port asla yanıtsız kalmaz; BILINMEYEN fallback tüm tipleri kapsar
function mesajIsle(e, fn) {
  const port = e.ports && e.ports[0];
  const garantiYanit = () => {
    const tip = (e.data && e.data.tip) || "";
    if (tip === "KARO_SAYISI") portYanitla(port, { tip: "KARO_SAYISI", sayi: 0 });
    else if (tip === "SDK_SAYISI") portYanitla(port, { tip: "SDK_SAYISI", sayi: 0 });
    else if (tip === "ONBELLEKLE_ALAN") portYanitla(port, { tip: "ONBELLEKLE_TAMAM", sayi: 0 });
    else if (tip === "TAZELE_ALAN") portYanitla(port, { tip: "TAZELE_TAMAM", sayi: 0 });
    else if (tip === "GUNCEL_ALAN") portYanitla(port, { tip: "GUNCEL_TAMAM", sayi: 0 });
    else if (tip === "SKIP_WAITING") portYanitla(port, { tip: "SKIP_WAITING_TAMAM" });
    else portYanitla(port, { tip: "BILINMEYEN", istenen: tip || null, hata: true });
  };
  try {
    e.waitUntil(
      Promise.resolve()
        .then(() => fn(port))
        .catch(garantiYanit)
    );
  } catch (_) {
    garantiYanit();
  }
}

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(AD).then(async c => {
      await Promise.all(KABUK.map(u =>
        fetch(u).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {})
      ));
      await Promise.all(IKONLAR.map(u =>
        fetch(u).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {})
      ));
    })
    .then(() => caches.open(VEKTOR_AD).then(async c => {
      await Promise.all(VEKTOR_ON.map(u =>
        fetch(u).then(r => { if (r.ok || r.type === "opaque") return c.put(u, r); }).catch(() => {})
      ));
    }).catch(() => {}))
    .then(() => caches.open(SDK_AD).then(async c => {
      // SDK kritik dosyaları açılışta ön-yüklenir: uçak modunda açılışta
      // yükleyici + tema CSS önbellekten anında döner
      await Promise.all(SDK_ON.map(u =>
        fetch(u).then(r => { if (r.ok || r.type === "opaque") return c.put(u, r); }).catch(() => {})
      ));
    }).catch(() => {}))
    .then(() => self.skipWaiting())
    .catch(() => self.skipWaiting())
  );
});

// Nihai sertleştirme: activate'te GÜNCEL sürümler dışındaki TÜM önbellekler
// (eski v32/v31/v30/v27/v1 dahil her ad) kalıcı silinir; dört önbellek varestelle garanti edilir
self.addEventListener("activate", e => {
  const guncelAdlar = [AD, KARO_AD, VEKTOR_AD, SDK_AD];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => guncelAdlar.indexOf(k) === -1)
          .map(k => caches.delete(k).catch(() => {}))
      ))
      .then(() => Promise.all([caches.open(AD), caches.open(KARO_AD), caches.open(VEKTOR_AD), caches.open(SDK_AD)]))
      .then(cachesArr => cachesArr[0].match("index.html").then(hit => {
        if (!hit) return fetch("index.html").then(r => { if (r.ok) return cachesArr[0].put("index.html", r); }).catch(() => {});
      }))
      .then(() => self.clients.claim())
      .catch(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  const veri = e.data || {};
  const tip = (typeof veri === "string") ? veri : veri.tip;

  if (tip === "SKIP_WAITING") {
    const port = e.ports && e.ports[0];
    portYanitla(port, { tip: "SKIP_WAITING_TAMAM" });
    e.waitUntil(self.skipWaiting());
    return;
  }

  if (tip === "KARO_SAYISI") {
    mesajIsle(e, port =>
      caches.open(KARO_AD)
        .then(c => c.keys())
        .then(keys => portYanitla(port, { tip: "KARO_SAYISI", sayi: keys.length }))
    );
    return;
  }

  if (tip === "SDK_SAYISI") {
    mesajIsle(e, port =>
      caches.open(SDK_AD)
        .then(c => c.keys())
        .then(keys => portYanitla(port, { tip: "SDK_SAYISI", sayi: keys.length }))
    );
    return;
  }

  if (tip === "ONBELLEKLE_ALAN") {
    mesajIsle(e, port =>
      alanOnbellekle(veri.bbox, veri.minZoom || 15, veri.maxZoom || 17, false, true)
        .then(sayi => portYanitla(port, { tip: "ONBELLEKLE_TAMAM", sayi: sayi }))
    );
    return;
  }

  if (tip === "TAZELE_ALAN") {
    mesajIsle(e, port =>
      alanOnbellekle(veri.bbox, veri.minZoom || 15, veri.maxZoom || 17, false)
        .then(sayi => portYanitla(port, { tip: "TAZELE_TAMAM", sayi: sayi }))
    );
    return;
  }

  if (tip === "GUNCEL_ALAN") {
    mesajIsle(e, port =>
      alanOnbellekle(veri.bbox, veri.minZoom || 15, veri.maxZoom || 17, true)
        .then(sayi => portYanitla(port, { tip: "GUNCEL_TAMAM", sayi: sayi }))
    );
    return;
  }

  const port = e.ports && e.ports[0];
  portYanitla(port, { tip: "BILINMEYEN", istenen: tip || null });
});

self.addEventListener("fetch", e => {
  try {
    if (e.request.method !== "GET") return;
    const url = new URL(e.request.url);

    // 1) ArcGIS JS SDK (js.arcgis.com): cache-first + arka planda ağdan tazeleme.
    //    arcgisSunucusuMu true döndürse de bu blok 'return' etmez; SDK önbellekten sunulur.
    if (sdkIstegiMi(url)) {
      e.respondWith(
        caches.open(SDK_AD).then(async c => {
          let hit = null;
          try { hit = await c.match(e.request, { ignoreSearch: true }); } catch (_) {}
          if (hit) {
            // Arka planda tazele (SWR); LRU sınırı korunur
            fetch(e.request)
              .then(r => {
                if (r.ok || r.type === "opaque") {
                  cacheYaz(c, e.request, r.clone()).then(() => sdkSinirla()).catch(() => {});
                }
              })
              .catch(() => {});
            return hit;
          }
          try {
            const resp = await fetch(e.request);
            if (resp.ok || resp.type === "opaque") {
              try {
                await cacheYaz(c, e.request, resp.clone());
                sdkSinirla().catch(() => {});
              } catch (_) {}
            }
            return resp;
          } catch (err) {
            try {
              const tekrar = await c.match(e.request, { ignoreSearch: true });
              if (tekrar) return tekrar;
            } catch (_) {}
            // Uçak modunda önbellekte yoksa boş (ama geçerli içerik tipiyle) yanıt
            return bosYanit(url);
          }
        }).catch(() => {
          return fetch(e.request).catch(() => bosYanit(url));
        })
      );
      return;
    }

    // 2) Esri karo + vektör taban kaynakları: SWR önbellek
    if (karoIstegiMi(url) || vektorKaynagiMi(url)) {
      const vektor = vektorKaynagiMi(url);
      const cacheAd = vektor ? VEKTOR_AD : KARO_AD;
      e.respondWith(
        caches.open(cacheAd).then(async c => {
          let hit = null;
          try { hit = await c.match(e.request, { ignoreSearch: true }); } catch (_) {}
          if (hit) {
            fetch(e.request)
              .then(r => {
                if (r.ok || r.type === "opaque") {
                  karoYaz(c, e.request, r.clone()).then(() => { if (!vektor) return karoSinirla(); }).catch(() => {});
                }
              })
              .catch(() => {});
            return hit;
          }
          try {
            const resp = await fetch(e.request);
            if (resp.ok || resp.type === "opaque") {
              try {
                await karoYaz(c, e.request, resp.clone());
                if (!vektor) karoSinirla().catch(() => {});
              } catch (_) {}
            }
            return resp;
          } catch (err) {
            try {
              const tekrar = await c.match(e.request, { ignoreSearch: true });
              if (tekrar) return tekrar;
            } catch (_) {}
            if (vektor) return bosYanit(url);
            return new Response("", { status: 504 });
          }
        }).catch(() => {
          return fetch(e.request).catch(() => vektor ? bosYanit(url) : new Response("", { status: 504 }));
        })
      );
      return;
    }

    // 3) Diğer ArcGIS sunucuları (veri servisleri vb.): ağa bırak
    if (arcgisSunucusuMu(url)) return;

    if (url.origin !== location.origin) return;

    e.respondWith(
      caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" }).then(hit => {
        if (e.request.mode === "navigate") {
          fetch(e.request)
            .then(resp => {
              if (resp.ok) caches.open(AD).then(c => {
                c.put(e.request, resp.clone());
                return c.put("index.html", resp);
              }).catch(() => {});
            })
            .catch(() => {});
          if (hit) return hit;
          return fetch(e.request)
            .then(r => r)
            .catch(() =>
              caches.match("index.html")
                .then(f => f || new Response("Çevrimdışı — önbellek boş", {
                  status: 503,
                  headers: { "Content-Type": "text/plain;charset=utf-8" }
                }))
            );
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
      }).catch(() => fetch(e.request).catch(() => Response.error()))
    );
  } catch (_) {
    return;
  }
});