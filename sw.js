const AD = "ankara3d-v42";
const VERI_AD = "ankara3d-veri-v2";
const KARO_AD = "ankara3d-karolar-v34";
const VEKTOR_AD = "ankara3d-vektor-v7";
const SDK_AD = "ankara3d-sdk-v6";
const KARO_SINIRI = 600;
const SDK_SINIRI = 400;
const VERI_SINIRI = 200;
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

// ONBELLEK_DURUMU için hafıza içi bayrak: ONBELLEKLE_ALAN sayi>0 ile tamamlanınca
// 'tamam' raporlanır; aksi hâlde 'yapilmadi' (SW localStorage okuyamaz)
let onbellekYapildi = false;

// ADIM 4 — ALAN_ONCELIK kuyruğu: alan istekleri kuyruğa alınır, bbox merkezinin
// Anıtkabir'e (MERKEZ) uzaklığına göre sıralanır (küçük skor = öncelikli), aynı anda
// TEK alan işlenir. Komşu öngörülü ön-yükleme: bir alan tamamlanınca 4 komşu bbox'ın
// düşük zoom (maxZoom-3, en az 1) karoları onlyEksik=true ile arka planda hafifçe çekilir.
const MERKEZ = { lon: 32.8387, lat: 39.9090 };

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
function veriSinirla() { return cacheSinirla(VERI_AD, VERI_SINIRI); }

async function karoYaz(c, anahtar, yanit) { return cacheYaz(c, anahtar, yanit); }

function bboxGecerliMi(bbox) {
  return !!bbox &&
    Number.isFinite(bbox.minLon) && Number.isFinite(bbox.maxLon) &&
    Number.isFinite(bbox.minLat) && Number.isFinite(bbox.maxLat) &&
    bbox.minLon >= -180 && bbox.maxLon <= 180 &&
    bbox.minLat >= -85 && bbox.maxLat <= 85 &&
    bbox.minLon < bbox.maxLon && bbox.minLat < bbox.maxLat;
}

// ADIM 4 — alan öncelik skoru: bbox merkez noktasının MERKEZ'e (Anıtkabir) olan
// kabaca mesafesi; küçük skor = öncelikli. Kuyruk bu skora göre sıralanır.
function alanOncelikSkoru(bbox) {
  try {
    if (!bboxGecerliMi(bbox)) return Number.MAX_SAFE_INTEGER;
    const cx = (bbox.minLon + bbox.maxLon) / 2;
    const cy = (bbox.minLat + bbox.maxLat) / 2;
    const dx = cx - MERKEZ.lon;
    const dy = cy - MERKEZ.lat;
    return Math.sqrt(dx * dx + dy * dy);
  } catch (_) { return Number.MAX_SAFE_INTEGER; }
}

// Çok-zoom kademeli önbellek: minZoom..maxZoom aralığındaki her zoom katı için karo
// çeker; onlyHighFirst=true ise yüksek zoom önce gelir (ön-yüklemede en kritik
// görünüm erkenden hazır olur). Plan üst sınırı 5000 karo; aşılırsa kalan zoomlar
// plana dahil edilmez. LRU KARO_SINIRI her çağrı sonunda korunur.
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

// ADIM 4 — komşu öngörülü ön-yükleme: tamamlanan alanın 4 komşusu (batı/doğu/güney/kuzey,
// alanın kendi genişliği/yüksekliği kadar kaydırılmış) düşük zoomda (maxZoom-3, en az 1)
// onlyEksik=true ile arka planda çekilir. Her çağrı kendi 5000 plan sınırı + LRU içinde.
async function komsuOnYukle(bbox, maxZoom) {
  if (!bboxGecerliMi(bbox)) return;
  const w = bbox.maxLon - bbox.minLon;
  const h = bbox.maxLat - bbox.minLat;
  if (!(w > 0) || !(h > 0)) return;
  const z = Math.max(1, Math.min(19, Math.floor(maxZoom || 15) - 3));
  const komsular = [
    { minLon: bbox.minLon - w, minLat: bbox.minLat, maxLon: bbox.minLon, maxLat: bbox.maxLat },       // batı
    { minLon: bbox.maxLon, minLat: bbox.minLat, maxLon: bbox.maxLon + w, maxLat: bbox.maxLat },       // doğu
    { minLon: bbox.minLon, minLat: bbox.minLat - h, maxLon: bbox.maxLon, maxLat: bbox.minLat },       // güney
    { minLon: bbox.minLon, minLat: bbox.maxLat, maxLon: bbox.maxLon, maxLat: bbox.maxLat + h }        // kuzey
  ];
  for (const k of komsular) {
    if (!bboxGecerliMi(k)) continue;
    try { await alanOnbellekle(k, z, z, true, false); } catch (_) {}
  }
}

// ADIM 4 — ALAN_ONCELIK kuyruğu: gelen alan istekleri kuyruğa eklenir, skorla sıralanır
// (aynı anda tek alan işlenir — kuyruk zinciri ardışık promise'lerle koşturulur; her mesaj
// handler'ı dönen zinciri waitUntil'e verir, SW iş bitmeden kapanmaz). Yanıtlar kuyruk
// içinde gönderilir; yanıt tipleri ve mesajIsle garanti-yanıt fallback'ı korunur.
const alanKuyruk = [];
let alanZinciri = Promise.resolve();

function kuyrugaEkle(is) {
  try {
    is.skor = alanOncelikSkoru(is.bbox);
    alanKuyruk.push(is);
    alanKuyruk.sort((a, b) => a.skor - b.skor);
  } catch (_) {}
  alanZinciri = alanZinciri.then(() => kuyrukAdimi()).catch(() => {});
  return alanZinciri;
}

async function kuyrukAdimi() {
  const is = alanKuyruk.shift();
  if (!is) return;
  let sayi = 0;
  try {
    sayi = await alanOnbellekle(is.bbox, is.minZoom, is.maxZoom, is.sadeceEksik, is.onlyHighFirst);
  } catch (_) { sayi = 0; }
  try {
    if (is.tip === "ONBELLEKLE_ALAN" && sayi > 0) onbellekYapildi = true;
    portYanitla(is.port, { tip: is.yanitTipi, sayi: sayi });
    // Komşu öngörülü ön-yükleme: yanıt gönderildikten sonra arka planda hafifçe başlar
    komsuOnYukle(is.bbox, is.maxZoom).catch(() => {});
  } catch (_) {}
}

// ALAN_OZET: KARO_AD anahtarlarından (/tile/z/y/x) zoom dağılımı ve toplam üretir;
// ADIM 4: yanıtta ek olarak kuyrukta bekleyen alan sayısı (bekleyen) raporlanır
async function alanOzetAl() {
  const ozet = { toplam: 0, dagilim: {}, bekleyen: 0 };
  try {
    ozet.bekleyen = alanKuyruk.length;
    const c = await caches.open(KARO_AD);
    const keys = await c.keys();
    for (const k of keys) {
      try {
        const m = /\/tile\/(\d+)\/\d+\/\d+/.exec(new URL(k.url).pathname);
        if (m) {
          const z = m[1];
          ozet.dagilim[z] = (ozet.dagilim[z] || 0) + 1;
          ozet.toplam++;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return ozet;
}

// VERİ (özellik) önbelleği: Numarataj (katman 0) ve Yapılar (katman 2) sorgu
// uçlarını bbox zarfıyla sorgular, yanıtları tam sorgu URL'siyle VERI_AD'e yazar.
const VERI_KATMANLAR = [0, 2];
async function veriOnbellekle(bbox) {
  if (!bboxGecerliMi(bbox)) return 0;
  let c;
  try { c = await caches.open(VERI_AD); } catch (_) { return 0; }
  const zarf = bbox.minLon + "," + bbox.minLat + "," + bbox.maxLon + "," + bbox.maxLat;
  let sayac = 0;
  const istekler = VERI_KATMANLAR.map(katman => (async () => {
    const u = "https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer/" + katman +
      "/query?f=json&geometry=" + encodeURIComponent(zarf) +
      "&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects" +
      "&outFields=*&returnGeometry=true&outSR=4326";
    try {
      if (await c.match(u)) return;
      const r = await fetch(u);
      if (r.ok) { sayac++; await cacheYaz(c, u, r); }
    } catch (_) {}
  })());
  await Promise.all(istekler);
  await veriSinirla();
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
    if (/\.js$/i.test(url.pathname)) ct = "application/javascript";
    else if (/\.css$/i.test(url.pathname)) ct = "text/css";
    else if (/\.json$/i.test(url.pathname)) ct = "application/json";
    else if (/\.pbf$/i.test(url.pathname)) ct = "application/x-protobuf";
    else if (/\.woff2?$/i.test(url.pathname)) ct = "font/woff2";
    else if (/\.png$/i.test(url.pathname)) ct = "image/png";
  } catch (_) {}
  return new Response("", { status: 200, headers: { "Content-Type": ct } });
}

// Nihai sertleştirme: her mesaj tipi için garanti yanıt — fn hata verse bile
// port asla yanıtsız kalmaz; BILINMEYEN fallback tüm tipleri kapsar.
// ADIM 4: kuyrukta işlenen tipler de fallback'da korunur (kuyruğa alınamasa bile
// garanti yanıt gönderilir).
function mesajIsle(e, fn) {
  const port = e.ports && e.ports[0];
  const garantiYanit = () => {
    const tip = (e.data && e.data.tip) || "";
    if (tip === "KARO_SAYISI") portYanitla(port, { tip: "KARO_SAYISI", sayi: 0 });
    else if (tip === "SDK_SAYISI") portYanitla(port, { tip: "SDK_SAYISI", sayi: 0 });
    else if (tip === "ONBELLEKLE_ALAN") portYanitla(port, { tip: "ONBELLEKLE_TAMAM", sayi: 0 });
    else if (tip === "TAZELE_ALAN") portYanitla(port, { tip: "TAZELE_TAMAM", sayi: 0 });
    else if (tip === "GUNCEL_ALAN") portYanitla(port, { tip: "GUNCEL_TAMAM", sayi: 0 });
    else if (tip === "ALAN_GENISLET") portYanitla(port, { tip: "ALAN_GENISLET_TAMAM", sayi: 0 });
    else if (tip === "ALAN_OZET") portYanitla(port, { tip: "ALAN_OZET_TAMAM", toplam: 0, dagilim: {}, bekleyen: alanKuyruk.length });
    else if (tip === "ONBELLEK_DURUMU") portYanitla(port, { tip: "ONBELLEK_DURUMU_TAMAM", durum: "yapilmadi" });
    else if (tip === "VERI_SENKRON") portYanitla(port, { tip: "VERI_SENKRON_TAMAM", sayi: 0 });
    else if (tip === "SKIP_WAITING") portYanitla(port, { tip: "SKIP_WAITING_TAMAM" });
    else if (tip === "VERI_ONBELLEKLE") portYanitla(port, { tip: "VERI_ONBELLEKLE_TAMAM", sayi: 0 });
    else if (tip === "VERI_AL") portYanitla(port, { tip: "VERI_YOK" });
    else if (tip === "VERI_SAYISI") portYanitla(port, { tip: "VERI_SAYISI", sayi: 0 });
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
// (eski v41/v33/... dahil her ad) kalıcı silinir; beş önbellek varestelle garanti edilir
self.addEventListener("activate", e => {
  const guncelAdlar = [AD, VERI_AD, KARO_AD, VEKTOR_AD, SDK_AD];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => guncelAdlar.indexOf(k) === -1)
          .map(k => caches.delete(k).catch(() => {}))
      ))
      .then(() => Promise.all([caches.open(AD), caches.open(VERI_AD), caches.open(KARO_AD), caches.open(VEKTOR_AD), caches.open(SDK_AD)]))
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

  // ADIM 4 — alan tipleri ARTIK kuyruğa: aynı anda tek alan işlenir, kuyruk merkez
  // yakınlığına göre sıralı; yanıt tipleri (ONBELLEKLE_TAMAM/TAZELE_TAMAM/GUNCEL_TAMAM/
  // ALAN_GENISLET_TAMAM) kuyruk içinde gönderilir, mesajIsle garanti-yanıt fallback'ı korunur.
  if (tip === "ONBELLEKLE_ALAN") {
    mesajIsle(e, port =>
      kuyrugaEkle({
        tip: tip, port: port, yanitTipi: "ONBELLEKLE_TAMAM",
        bbox: veri.bbox, minZoom: veri.minZoom || 15, maxZoom: veri.maxZoom || 17,
        sadeceEksik: false, onlyHighFirst: true
      })
    );
    return;
  }

  if (tip === "TAZELE_ALAN") {
    mesajIsle(e, port =>
      kuyrugaEkle({
        tip: tip, port: port, yanitTipi: "TAZELE_TAMAM",
        bbox: veri.bbox, minZoom: veri.minZoom || 15, maxZoom: veri.maxZoom || 17,
        sadeceEksik: false, onlyHighFirst: false
      })
    );
    return;
  }

  if (tip === "GUNCEL_ALAN") {
    mesajIsle(e, port =>
      kuyrugaEkle({
        tip: tip, port: port, yanitTipi: "GUNCEL_TAMAM",
        bbox: veri.bbox, minZoom: veri.minZoom || 15, maxZoom: veri.maxZoom || 17,
        sadeceEksik: true, onlyHighFirst: false
      })
    );
    return;
  }

  // Sözleşme: ALAN_GENISLET — gezilen alanın karoları YALNIZCA EKSİK those çekilerek
  // önbelleğe genişletilir (sadeceEksik=true); yanıt kuyrukta ALAN_GENISLET_TAMAM
  if (tip === "ALAN_GENISLET") {
    mesajIsle(e, port =>
      kuyrugaEkle({
        tip: tip, port: port, yanitTipi: "ALAN_GENISLET_TAMAM",
        bbox: veri.bbox, minZoom: veri.minZoom || 15, maxZoom: veri.maxZoom || 17,
        sadeceEksik: true, onlyHighFirst: false
      })
    );
    return;
  }

  // ADIM 4: ALAN_OZET — yanıtta bekleyen kuyruk sayısı da var (bekleyen: n)
  if (tip === "ALAN_OZET") {
    mesajIsle(e, port =>
      alanOzetAl().then(ozet => portYanitla(port, { tip: "ALAN_OZET_TAMAM", toplam: ozet.toplam, dagilim: ozet.dagilim, bekleyen: ozet.bekleyen }))
    );
    return;
  }

  // YENİ (adım 3): ONBELLEK_DURUMU — açılış alanı ön-yüklemesi tamamlandı mı?
  // SW localStorage okuyamaz; hafıza içi bayrak (ONBELLEKLE_ALAN sayi>0) kullanılır;
  // bayrak yoksa 'yapilmadi' döner → ONBELLEK_DURUMU_TAMAM
  if (tip === "ONBELLEK_DURUMU") {
    mesajIsle(e, port =>
      portYanitla(port, { tip: "ONBELLEK_DURUMU_TAMAM", durum: onbellekYapildi ? "tamam" : "yapilmadi" })
    );
    return;
  }

  if (tip === "VERI_SAYISI") {
    mesajIsle(e, port =>
      caches.open(VERI_AD)
        .then(c => c.keys())
        .then(keys => portYanitla(port, { tip: "VERI_SAYISI", sayi: keys.length }))
    );
    return;
  }

  if (tip === "VERI_ONBELLEKLE") {
    mesajIsle(e, port =>
      veriOnbellekle(veri.bbox)
        .then(sayi => portYanitla(port, { tip: "VERI_ONBELLEKLE_TAMAM", sayi: sayi }))
    );
    return;
  }

  if (tip === "VERI_AL") {
    mesajIsle(e, port =>
      caches.open(VERI_AD).then(async c => {
        try {
          const hit = await c.match(veri.url || veri.anahtar || "");
          if (hit) { portYanitla(port, { tip: "VERI_BULUNDU", veri: await hit.text() }); return; }
        } catch (_) {}
        portYanitla(port, { tip: "VERI_YOK" });
      })
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

    // 2b) Veri (özellik) sorguları (baskentcbs .../query): VERI_AD önbelleği önce-önbellek;
    // yoksa ağdan çekilip önbelleğe yazılır; uçak modunda önbellekten döner
    try {
      if (url.hostname === "baskentcbs.ankara.bel.tr" && /\/query/i.test(url.pathname)) {
        e.respondWith(
          caches.open(VERI_AD).then(async c => {
            let hit = null;
            try { hit = await c.match(e.request); } catch (_) {}
            if (hit) return hit;
            try {
              const resp = await fetch(e.request);
              if (resp.ok) {
                try { await cacheYaz(c, e.request, resp.clone()); veriSinirla().catch(() => {}); } catch (_) {}
              }
              return resp;
            } catch (err) {
              try {
                const tekrar = await c.match(e.request);
                if (tekrar) return tekrar;
              } catch (_) {}
              return bosYanit(url);
            }
          }).catch(() => fetch(e.request).catch(() => bosYanit(url)))
        );
        return;
      }
    } catch (_) {}

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