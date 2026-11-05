// Ankara 3D Harita — Editoryal arayüz iş mantığı (ArcGIS JS 4.32)
let map = null;
let view = null;
let katmanlar = {};
let kentKatmanlar = {};
const TABANLAR = ['hybrid', 'satellite', 'streets', 'gray'];
let aramaAdaylar = [];
let sonKoordinat = null, sonZoom = null;
let footerRaf = null;
let olcumAktif = null;
let daylightWidget = null;
let turAktif = false, turZamanlayici = null, turAdim = 0;
let sonMerkez = null;

const TUR_NOKTALARI = [
  { ad: 'Kızılay', lat: 39.9208, lon: 32.8541, zoom: 15.5 },
  { ad: 'Ulus', lat: 39.9417, lon: 32.8530, zoom: 15.5 },
  { ad: 'Anıtkabir', lat: 39.9252, lon: 32.8364, zoom: 15 },
  { ad: 'Kocatepe', lat: 39.9176, lon: 32.8590, zoom: 15.5 },
  { ad: 'Atakule', lat: 39.8805, lon: 32.8918, zoom: 15.5 }
];

function $(id) { return document.getElementById(id); }

function toastGoster(mesaj, tur = 'uyari') {
  const k = $('toast-konteyner');
  if (!k) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (tur === 'basari' ? 'basari' : tur === 'bilgi' ? 'bilgi' : '');
  el.textContent = mesaj;
  k.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- TEMA ----------
function temayiUygula(koyu) {
  document.documentElement.setAttribute('data-tema', koyu ? 'koyu' : 'acik');
  try { localStorage.setItem('tema', koyu ? 'koyu' : 'acik'); } catch (e) {}
  const b = $('btn-tema');
  if (b) b.setAttribute('aria-pressed', koyu ? 'true' : 'false');
}
function temayiBaslat() {
  let koyu = false;
  try {
    const k = localStorage.getItem('tema');
    koyu = k ? k === 'koyu' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (e) {}
  temayiUygula(koyu);
}

// ---------- SEKME / MOBİL PANEL ----------
const SAYFA_ADLARI = ['kesfet', 'katmanlar', 'mahalle', 'araclar'];
function sayfaGoster(ad) {
  if (!SAYFA_ADLARI.includes(ad)) ad = 'kesfet';
  SAYFA_ADLARI.forEach(s => {
    const sekme = $('sekme-' + s);
    const sayfa = $('sayfa-' + s);
    if (sekme) { sekme.classList.toggle('aktif', s === ad); sekme.setAttribute('aria-selected', s === ad ? 'true' : 'false'); }
    if (sayfa) { sayfa.classList.toggle('aktif', s === ad); sayfa.hidden = s !== ad; }
  });
  // Mobil alt çubuk aktifliği
  const mobilKarsilik = { kesfet: 'bilgi', katmanlar: 'katmanlar', mahalle: 'bilgi', araclar: 'araclar' };
  document.querySelectorAll('.mobil-sekme-cubugu__btn').forEach(b => {
    const p = b.dataset.panel;
    const aktif = p === 'harita' ? false : mobilKarsilik[ad] === p;
    b.classList.toggle('aktif', aktif);
    b.setAttribute('aria-selected', aktif ? 'true' : 'false');
  });
  const panel = $('sol-panel');
  if (panel && window.innerWidth <= 1024) panel.classList.remove('gizli');
  if (view) view.container && view.resize && view.resize();
}
function mobilPanelGoster(panelAd) {
  const panel = $('sol-panel');
  if (!panel) return;
  if (panelAd === 'harita') {
    panel.classList.add('gizli');
    document.querySelectorAll('.mobil-sekme-cubugu__btn').forEach(b => {
      const aktif = b.dataset.panel === 'harita';
      b.classList.toggle('aktif', aktif);
      b.setAttribute('aria-selected', aktif ? 'true' : 'false');
    });
  } else {
    panel.classList.remove('gizli');
    sayfaGoster(panelAd === 'bilgi' ? 'kesfet' : panelAd === 'katmanlar' ? 'katmanlar' : 'araclar');
  }
  if (view && view.resize) view.resize();
}

// ---------- URL ----------
function urlOku() {
  const p = new URLSearchParams(window.location.hash.slice(1));
  return {
    taban: p.get('taban') || 'hybrid',
    lat: parseFloat(p.get('lat')), lon: parseFloat(p.get('lon')),
    zoom: parseInt(p.get('zoom'), 10), tilt: parseInt(p.get('tilt'), 10),
    adres: p.get('adres') || ''
  };
}
function urlYaz(s) {
  const p = new URLSearchParams();
  if (s.taban) p.set('taban', s.taban);
  if (!isNaN(s.lat)) p.set('lat', s.lat.toFixed(6));
  if (!isNaN(s.lon)) p.set('lon', s.lon.toFixed(6));
  if (!isNaN(s.zoom)) p.set('zoom', s.zoom);
  if (!isNaN(s.tilt)) p.set('tilt', s.tilt);
  if (s.adres) p.set('adres', s.adres);
  history.replaceState(null, '', '#' + p.toString());
}
function urlGuncelleKamera() {
  if (!view || !map) return;
  const c = view.center;
  urlYaz({
    taban: map.basemap ? (map.basemap.id || 'hybrid') : 'hybrid',
    lat: c ? c.latitude : NaN, lon: c ? c.longitude : NaN,
    zoom: view.zoom, tilt: view.camera ? view.camera.tilt : NaN
  });
}

// ---------- KATMAN LİSTELERİ ----------
function katmanSatiriOlustur(id, baslik, altBaslik) {
  const satir = document.createElement('div');
  satir.className = 'katman-satiri-editoryal';
  satir.setAttribute('role', 'listitem');
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.id = id; cb.checked = true;
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.innerHTML = baslik + (altBaslik ? '<span class="katman-alt-baslik">' + altBaslik + '</span>' : '');
  satir.appendChild(cb); satir.appendChild(lab);
  return { satir, cb };
}
function katmanListeleriniDoldur() {
  const adres = $('katman-listesi-adres');
  const kent = $('katman-listesi-kent');
  if (adres) {
    [['cb_binalar', '3D Binalar', 'Esri 3D bina katmanı'],
     ['cb_mahalle', 'Mahalle Sınırları', 'ABB adres katmanı'],
     ['cb_yol', 'Yollar / Caddeler', 'ABB adres katmanı'],
     ['cb_yapi', 'Yapılar', 'ABB adres katmanı — etiketli'],
     ['cb_numarataj', 'Numarataj (MAKS)', 'Kapı numaraları — etiketli'],
     ['cb_ilce', 'İlçeler', 'ABB adres katmanı']
    ].forEach(([id, b, a]) => adres.appendChild(katmanSatiriOlustur(id, b, a).satir));
  }
  if (kent) {
    const tanimlar = window.KENT_KATMAN_TANIMLARI || [];
    const gruplar = [];
    tanimlar.forEach(t => {
      let g = gruplar.find(x => x.ad === t.grup);
      if (!g) { g = { ad: t.grup, ogeler: [] }; gruplar.push(g); }
      g.ogeler.push(t);
    });
    gruplar.forEach(g => {
      const baslik = document.createElement('div');
      baslik.style.cssText = 'font-size:0.72rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--renk-metin-solgun);margin:14px 0 8px;';
      baslik.textContent = g.ad === 'EGO' ? 'EGO — Toplu Taşıma' : 'ABB — Kent Rehberi';
      kent.appendChild(baslik);
      g.ogeler.forEach(t => {
        const { satir, cb } = katmanSatiriOlustur(t.id, t.baslik, t.alt);
        cb.checked = false;
        kent.appendChild(satir);
      });
    });
  }
}
function katmanSenkronizeEt(id, layer) {
  const cb = $(id);
  if (!cb) return;
  layer.watch('visible', v => { cb.checked = v; });
  cb.addEventListener('change', () => { layer.visible = cb.checked; });
  cb.checked = layer.visible;
  layer.when(null, () => {
    cb.disabled = true;
    cb.closest('.katman-satiri-editoryal').classList.add('devre-disi');
    toastGoster('Katman yüklenemedi: ' + layer.title, 'uyari');
  });
}

// ---------- TABAN KARTLARI ----------
const TABAN_IKON = {
  hybrid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>',
  satellite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
  streets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20L20 4M4 4l16 16"/><path d="M9 4v4M15 4v4M9 16v4M15 16v4M4 9h4M4 15h4M16 9h4M16 15h4"/></svg>',
  gray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/></svg>'
};
const TABAN_AD = { hybrid: 'Uydu + Yol', satellite: 'Uydu', streets: 'Sokak', gray: 'Gri Ton' };
function tabanKartlariOlustur() {
  const kaps = $('taban-kartlari');
  if (!kaps) return;
  TABANLAR.forEach(ad => {
    const b = document.createElement('button');
    b.className = 'taban-kart';
    b.dataset.taban = ad;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-pressed', ad === 'hybrid' ? 'true' : 'false');
    b.innerHTML = TABAN_IKON[ad] + '<span>' + TABAN_AD[ad] + '</span>';
    b.addEventListener('click', () => tabanSec(ad));
    kaps.appendChild(b);
  });
}
function tabanSec(ad) {
  if (!TABANLAR.includes(ad)) ad = 'hybrid';
  if (map) map.basemap = ad;
  document.querySelectorAll('.taban-kart').forEach(b => {
    const aktif = b.dataset.taban === ad;
    b.classList.toggle('aktif', aktif);
    b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
  });
  toastGoster('Harita tabanı: ' + TABAN_AD[ad], 'bilgi');
  urlGuncelleKamera();
}

// ---------- HARİTA KURULUMU ----------
function popupSablon(baslikAlan, alanlar) {
  return {
    title: '{' + baslikAlan + '}',
    content: alanlar.map(a => '<b>' + a.etiket + ':</b> {' + a.alan + '}').join('<br>')
  };
}
function katmanlariYukle() {
  return new Promise(resolve => {
    require([
      'esri/Map', 'esri/views/SceneView', 'esri/layers/SceneLayer', 'esri/layers/FeatureLayer',
      'esri/renderers/SimpleRenderer', 'esri/symbols/MeshSymbol3D', 'esri/symbols/edges/SolidEdges3D',
      'esri/PopupTemplate', 'esri/layers/GraphicsLayer',
      'esri/symbols/SimpleMarkerSymbol', 'esri/symbols/SimpleLineSymbol', 'esri/symbols/SimpleFillSymbol'
    ], (Map, SceneView, SceneLayer, FeatureLayer, SimpleRenderer, MeshSymbol3D, SolidEdges3D, PopupTemplate, GraphicsLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol) => {
      map = new Map({ basemap: 'hybrid' });
      const adresUrl = 'https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer/';
      const egoUrl = 'https://baskentcbs.ankara.bel.tr/server/rest/services/kentrehberi/ego_kent_Rehberi/MapServer/';
      const abbUrl = 'https://baskentcbs.ankara.bel.tr/server/rest/services/kentrehberi/abb_kent_rehberi/MapServer/';

      const binalar = new SceneLayer({
        url: 'https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer',
        title: '3D Binalar', popupEnabled: false
      });
      // Sahibin isteği: opak buz grisi dolgulu, ince SolidEdges3D kenarlı 3D binalar
      binalar.renderer = new SimpleRenderer({
        symbol: new MeshSymbol3D({
          symbolLayers: [{
            type: 'fill',
            material: { color: [221, 230, 236, 1], colorMixMode: 'replace' },
            edges: new SolidEdges3D({ color: [120, 135, 150, 0.55], size: 0.5 })
          }]
        })
      });

      const mahalle = new FeatureLayer({ url: adresUrl + '3', title: 'Mahalle', outFields: ['*'], visible: true, popupTemplate: new PopupTemplate(popupSablon('MAHALLE_ADI', [{ etiket: 'Mahalle', alan: 'MAHALLE_ADI' }, { etiket: 'İlçe', alan: 'ILCE_ADI' }])) });
      const yol = new FeatureLayer({ url: adresUrl + '1', title: 'Yollar', outFields: ['*'], visible: false, popupTemplate: new PopupTemplate(popupSablon('CADDE_ADI', [{ etiket: 'Cadde/Sokak', alan: 'CADDE_ADI' }, { etiket: 'Mahalle', alan: 'MAHALLE_ADI' }])) });
      // Yapılar: açılışta görünür ve etiketli ($feature.ad; boşsa kat sayısı), gerçek alanlarla popup
      const yapi = new FeatureLayer({
        url: adresUrl + '2', title: 'Yapılar', outFields: ['*'], visible: true,
        labelsVisible: true,
        labelingInfo: [{
          labelExpressionInfo: { expression: "IIf(IsEmpty($feature.ad), $feature.zeminustukatsayisi + ' kat', $feature.ad)" },
          maxScale: 5000,
          symbol: { type: 'label-3d', symbolLayers: [{ type: 'text', size: 10, material: { color: [45, 38, 32, 1] }, haloColor: [255, 255, 255, 0.9], haloSize: 1.5 }] },
          labelPlacement: 'above-center'
        }],
        popupTemplate: new PopupTemplate({
          title: '{ad}',
          content: '<b>Kat sayısı:</b> {zeminustukatsayisi}<br><b>Alt kat:</b> {zeminaltikatsayisi}<br><b>Posta kodu:</b> {postakodu}<br><b>Site/Koop.:</b> {siteveyakooperatifadi}<br><b>Bağımsız bölüm:</b> {bagimsizbolumsayi}<br><b>Yükseklik:</b> {toplamyukseklik} m'
        })
      });
      // Numarataj (MAKS): açılışta görünür ve etiketli ($feature.kapino)
      const numarataj = new FeatureLayer({
        url: adresUrl + '0', title: 'Numarataj (MAKS)', outFields: ['*'], visible: true,
        labelsVisible: true,
        labelingInfo: [{
          labelExpressionInfo: { expression: '$feature.kapino' },
          maxScale: 1500,
          symbol: { type: 'label-3d', symbolLayers: [{ type: 'text', size: 9, material: { color: [140, 29, 23, 1] }, haloColor: [255, 255, 255, 0.9], haloSize: 1.5 }] },
          labelPlacement: 'center-center'
        }],
        popupTemplate: new PopupTemplate({
          title: 'No: {kapino}',
          content: '<b>Kapı No:</b> {kapino}<br><b>Adres:</b> {ad}<br><b>Tip:</b> {tip}'
        })
      });
      const ilce = new FeatureLayer({ url: adresUrl + '4', title: 'İlçeler', outFields: ['*'], visible: false, popupTemplate: new PopupTemplate(popupSablon('ILCE_ADI', [{ etiket: 'İlçe', alan: 'ILCE_ADI' }])) });

      // Kent rehberi katmanları: tek tanım dosyasından (js/kentrehberi.js) tümü yüklenir
      kentKatmanlar = {};
      (window.KENT_KATMAN_TANIMLARI || []).forEach(t => {
        const servis = t.grup === 'EGO' ? egoUrl : abbUrl;
        const layer = new FeatureLayer({
          url: servis + t.katman, title: t.baslik, outFields: ['*'], visible: false
        });
        let sembol;
        if (t.geometri === 'line') sembol = new SimpleLineSymbol({ color: t.renk, width: 3 });
        else if (t.geometri === 'polygon') sembol = new SimpleFillSymbol({ color: [t.renk[0], t.renk[1], t.renk[2], 0.45], outline: { color: t.renk, width: 1.5 } });
        else sembol = new SimpleMarkerSymbol({ color: t.renk, size: 9, outline: { color: [255, 255, 255], width: 1.5 } });
        layer.renderer = new SimpleRenderer({ symbol: sembol });
        window.KentRehberi.popupAyarla(layer);
        kentKatmanlar[t.id] = layer;
      });

      katmanlar = { cb_binalar: binalar, cb_mahalle: mahalle, cb_yol: yol, cb_yapi: yapi, cb_numarataj: numarataj, cb_ilce: ilce };
      map.addMany([...Object.values(katmanlar), ...Object.values(kentKatmanlar)]);

      // Açılış kamerası: URL'de konum yoksa Anıtkabir'e bakan eğik görünüm
      const p0 = urlOku();
      const acilisKamera = (!isNaN(p0.lat) && !isNaN(p0.lon))
        ? { position: { x: p0.lon, y: p0.lat, z: 1600 }, heading: 355, tilt: isNaN(p0.tilt) ? 62 : p0.tilt }
        : { position: { longitude: 32.8369, latitude: 39.9250, z: 650 }, heading: 355, tilt: 70 };
      view = new SceneView({
        container: 'viewDiv', map: map,
        camera: acilisKamera,
        ui: { components: ['attribution'] },
        popup: { dockEnabled: true, dockOptions: { buttonEnabled: false, breakpoint: false }, collapseEnabled: false }
      });

      view.when(() => {
        Object.entries(katmanlar).forEach(([id, l]) => katmanSenkronizeEt(id, l));
        Object.entries(kentKatmanlar).forEach(([id, l]) => katmanSenkronizeEt(id, l));

        view.watch('zoom', z => { if (z && isFinite(z)) { sonZoom = Math.round(z); footerPlanla(); } urlGuncelleKamera(); });
        view.watch('stationary', st => {
          if (!st) return;
          const c = view.center;
          if (c && isFinite(c.latitude)) { sonKoordinat = c.latitude.toFixed(4) + ', ' + c.longitude.toFixed(4); sonMerkez = { lat: c.latitude, lon: c.longitude }; footerPlanla(); }
          const t = $('tilt'), h = $('heading');
          if (t && view.camera) t.textContent = Math.round(view.camera.tilt) + '°';
          if (h && view.camera) h.textContent = Math.round(view.camera.heading) + '°';
          urlGuncelleKamera();
        });

        // Mahalle tıklama
        view.on('click', e => {
          view.hitTest(e).then(r => {
            const g = r.results.find(x => x.graphic && x.graphic.layer === mahalle);
            if (g) mahalleSec(g.graphic);
          }).catch(() => {});
        });

        // URL parametreleri
        const p = urlOku();
        if (p.taban) tabanSec(p.taban);
        if (!isNaN(p.lat) && !isNaN(p.lon)) {
          const o = { target: { latitude: p.lat, longitude: p.lon } };
          if (!isNaN(p.zoom)) o.zoom = p.zoom;
          if (!isNaN(p.tilt)) o.tilt = p.tilt;
          view.goTo(o).catch(() => {});
        }
        if (p.adres) { const g = $('arama-girdi'); if (g) g.value = p.adres; }
        sayfaGoster('kesfet');
        // Mobil açılış: panel kapalı, harita tam ekran, 'Harita' sekmesi aktif
        if (window.innerWidth <= 1024) {
          const p = $('sol-panel');
          if (p) p.classList.add('gizli');
          document.querySelectorAll('.mobil-sekme-cubugu__btn').forEach(b => {
            const aktif = b.dataset.panel === 'harita';
            b.classList.toggle('aktif', aktif);
            b.setAttribute('aria-selected', aktif ? 'true' : 'false');
          });
        }
        console.log('Harita hazır.');
        resolve();
      });
    });
  });
}
function footerPlanla() {
  if (footerRaf) return;
  footerRaf = requestAnimationFrame(() => {
    const c = $('coord'), z = $('zoom');
    if (c && sonKoordinat) c.textContent = sonKoordinat;
    if (z && sonZoom) z.textContent = sonZoom;
    footerRaf = null;
  });
}

// ---------- MAHALLE ----------
async function mahalleSec(graphic) {
  const a = graphic.attributes || {};
  sayfaGoster('mahalle');
  $('mahalle-bos-karti').style.display = 'none';
  const kart = $('mahalle-bilgi-karti');
  kart.style.display = 'block';
  $('mahalle-baslik').textContent = a.MAHALLE_ADI || 'Mahalle';
  $('mahalle-ilce').textContent = a.ILCE_ADI || '—';
  const alanlar = { 'mahalle-otobus': 'cb_ego_durak', 'mahalle-park': 'cb_abb_park', 'mahalle-kultur': 'cb_abb_kultur', 'mahalle-spor': 'cb_abb_spor' };
  Object.keys(alanlar).forEach(k => { const el = $(k); if (el) el.textContent = '…'; });
  const geom = graphic.geometry;
  for (const [elId, katId] of Object.entries(alanlar)) {
    const el = $(elId);
    try {
      const layer = kentKatmanlar[katId];
      const r = await layer.queryFeatures({ where: '1=1', geometry: geom, spatialRelationship: 'intersects', outFields: ['*'], returnGeometry: false });
      if (el) el.textContent = String(r.features.length);
    } catch (err) {
      if (el) el.textContent = '—';
    }
  }
  const git = $('mahalle-git');
  if (git) git.onclick = () => { view.goTo({ target: geom.extent ? geom.extent.center : geom, zoom: 16 }).catch(() => {}); };
}

// ---------- ARAMA ----------
async function aramaYap() {
  const g = $('arama-girdi');
  const metin = g ? g.value.trim() : '';
  if (!metin) return toastGoster('Lütfen bir adres girin.', 'uyari');
  if (!view) return;
  try {
    const resp = await fetch('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&maxLocations=10&countryCode=TUR&SingleLine=' + encodeURIComponent(metin + ', Ankara'));
    const veri = await resp.json();
    const adaylar = veri.candidates || [];
    if (!adaylar.length) return toastGoster('Sonuç bulunamadı.', 'uyari');
    if (adaylar.length === 1) return adresGit(adaylar[0]);
    aramaAdaylar = adaylar;
    const ilk = adaylar[0];
    const pt = { type: 'point', longitude: ilk.location.x, latitude: ilk.location.y };
    const liste = document.createElement('div');
    liste.className = 'arama-sonuc-listesi';
    adaylar.forEach((c, i) => {
      const lab = document.createElement('label');
      lab.className = 'arama-sonuc-satiri';
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'aramaSonuc'; radio.value = String(i);
      if (i === 0) radio.checked = true;
      const strong = document.createElement('strong');
      strong.textContent = c.address;
      lab.appendChild(radio); lab.appendChild(strong); liste.appendChild(lab);
      lab.addEventListener('click', () => { radio.checked = true; });
    });
    const btn = document.createElement('button');
    btn.className = 'arama-sec-btn';
    btn.textContent = 'Seç ve Git';
    btn.addEventListener('click', aramaSec);
    liste.appendChild(btn);
    view.openPopup({ location: pt, title: adaylar.length + ' sonuç bulundu', content: liste });
    toastGoster(adaylar.length + ' sonuç listelendi.', 'bilgi');
  } catch (err) {
    toastGoster('Arama hatası: ' + err.message, 'uyari');
  }
}
function aramaSec() {
  const secili = document.querySelector('input[name="aramaSonuc"]:checked');
  if (!secili) return;
  adresGit(aramaAdaylar[parseInt(secili.value, 10)]);
}
function adresGit(c) {
  const pt = { type: 'point', longitude: c.location.x, latitude: c.location.y };
  view.openPopup({ location: pt, title: 'Arama Sonucu', content: c.address });
  view.goTo({ target: pt, zoom: 16, tilt: 62 }).catch(() => {});
  urlYaz({ ...urlOku(), lat: c.location.y, lon: c.location.x, zoom: 16, tilt: 62, adres: c.address });
  toastGoster('Adres bulundu.', 'basari');
}

// ---------- KONUM / PAYLAŞ ----------
function konumBul() {
  if (!navigator.geolocation) return toastGoster('Tarayıcı konum desteklemiyor.', 'uyari');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    view.goTo({ target: { latitude, longitude }, zoom: 16, tilt: 62 }).catch(() => {});
    require(['esri/Graphic'], Graphic => {
      view.graphics.removeAll();
      view.graphics.add(new Graphic({
        geometry: { type: 'point', longitude, latitude },
        symbol: { type: 'simple-marker', color: [179, 38, 30], size: 14, outline: { color: [255, 255, 255], width: 2 } }
      }));
    });
    toastGoster('Konum bulundu.', 'basari');
    urlGuncelleKamera();
  }, err => toastGoster('Konum erişimi reddedildi.', 'uyari'));
}
function baglantiPaylas() {
  urlGuncelleKamera();
  const url = window.location.href;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => toastGoster('Bağlantı kopyalandı.', 'basari')).catch(() => toastGoster(url, 'bilgi'));
  } else toastGoster(url, 'bilgi');
}

// ---------- ARAÇLAR: ÖLÇÜM ----------
function olcumBaslat(tip) {
  require(['esri/widgets/DirectLineMeasurement3D', 'esri/widgets/AreaMeasurement3D'], (DL, AM) => {
    if (olcumAktif) { olcumAktif.destroy(); olcumAktif = null; }
    olcumAktif = tip === 'mesafe' ? new DL({ view: view }) : new AM({ view: view });
    view.ui.add(olcumAktif, 'top-right');
    olcumAktif.viewModel.start().catch(() => {});
    document.querySelectorAll('#arac-olcum .eylem-btn-buyuk').forEach(b => b.classList.remove('aktif'));
    $(tip === 'mesafe' ? 'btn-olcum-mesafe' : 'btn-olcum-alan').classList.add('aktif');
    toastGoster(tip === 'mesafe' ? 'Mesafe ölçümü: haritada iki nokta tıklayın.' : 'Alan ölçümü: haritada en az 3 nokta tıklayın.', 'bilgi');
  });
}
function olcumTemizle() {
  if (olcumAktif) { olcumAktif.destroy(); olcumAktif = null; }
  document.querySelectorAll('#arac-olcum .eylem-btn-buyuk').forEach(b => b.classList.remove('aktif'));
  toastGoster('Ölçümler temizlendi.', 'bilgi');
}

// ---------- ARAÇLAR: GÜNEŞ / GÖLGE ----------
function daylightHazirla() {
  return new Promise(resolve => {
    require(['esri/widgets/Daylight'], Daylight => {
      daylightWidget = new Daylight({ view: view, playRate: 30 });
      view.ui.add(daylightWidget, 'top-right');
      resolve();
    });
  });
}
function gunesAyarla(tarih) {
  if (!daylightWidget) return daylightHazirla().then(() => gunesAyarla(tarih));
  daylightWidget.timeOfDay = tarih.getTime();
  daylightWidget.playing = false;
  toastGoster('Güneş konumu: ' + tarih.toLocaleString('tr-TR'), 'bilgi');
}
function gunesOzelGoster() {
  const k = $('gunes-ayarlari');
  if (k) k.style.display = k.style.display === 'none' ? 'block' : 'none';
}

// ---------- KEŞİF TURU ----------
function kesifTuruBaslat() {
  if (turAktif) { kesifTuruDurdur(); return; }
  turAktif = true;
  turAdim = 0;
  const btn = $('btn-tur-baslat');
  if (btn) { btn.classList.add('aktif'); btn.querySelector('span').textContent = 'Turu Durdur'; }
  toastGoster('Keşif turu başladı.', 'bilgi');
  kesifTuruAdim();
}
function kesifTuruAdim() {
  if (!turAktif || turAdim >= TUR_NOKTALARI.length) { kesifTuruDurdur(); return; }
  const n = TUR_NOKTALARI[turAdim];
  view.goTo({ target: { latitude: n.lat, longitude: n.lon }, zoom: n.zoom, tilt: 60 }, { duration: 3000 }).catch(() => {});
  toastGoster((turAdim + 1) + '/' + TUR_NOKTALARI.length + ' — ' + n.ad, 'bilgi');
  turAdim++;
  turZamanlayici = setTimeout(kesifTuruAdim, 3600);
}
function kesifTuruDurdur() {
  turAktif = false;
  if (turZamanlayici) clearTimeout(turZamanlayici);
  const btn = $('btn-tur-baslat');
  if (btn) { btn.classList.remove('aktif'); btn.querySelector('span').textContent = 'Keşif Turu'; }
}

// ---------- YAKINIMDAKİLER ----------
async function yakindakiler() {
  let merkez = sonMerkez;
  if (!merkez && navigator.geolocation) {
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
      merkez = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch (e) {}
  }
  if (!merkez) return toastGoster('Önce haritayı bir konuma taşıyın veya konum izni verin.', 'uyari');
  const kategoriler = [
    { ad: 'Otobüs Durağı', layer: kentKatmanlar.cb_ego_durak, alan: 'DURAK_ADI' },
    { ad: 'Metro İstasyonu', layer: kentKatmanlar.cb_ego_metro, alan: 'ISTASYON_ADI' },
    { ad: 'Park', layer: kentKatmanlar.cb_abb_park, alan: 'PARK_ADI' }
  ];
  const kaps = document.createElement('div');
  kaps.className = 'kart-editoryal';
  kaps.id = 'yakindakiler-karti';
  kaps.innerHTML = '<h2 class="grup-baslik">Yakınımdakiler</h2>';
  for (const kat of kategoriler) {
    const h = document.createElement('p');
    h.style.cssText = 'font-weight:600;font-size:0.85rem;margin:10px 0 6px;color:var(--renk-vurgu)';
    h.textContent = kat.ad;
    kaps.appendChild(h);
    try {
      const r = await kat.layer.queryFeatures({
        where: '1=1', returnGeometry: true, outFields: ['*'],
        geometry: { type: 'point', longitude: merkez.lon, latitude: merkez.lat },
        distance: 5000, units: 'meters', spatialRelationship: 'intersects'
      });
      const sirali = r.features
        .map(f => ({ f, d: mesafe(merkez.lat, merkez.lon, f.geometry.latitude, f.geometry.longitude) }))
        .sort((a, b) => a.d - b.d).slice(0, 5);
      if (!sirali.length) { const p = document.createElement('p'); p.style.cssText = 'font-size:0.85rem;color:var(--renk-metin-solgun)'; p.textContent = 'Yakında yok'; kaps.appendChild(p); continue; }
      sirali.forEach(({ f, d }) => {
        const satir = document.createElement('button');
        satir.className = 'katman-satiri-editoryal';
        satir.style.cssText = 'width:100%;margin-bottom:6px;text-align:left;font:inherit;cursor:pointer';
        satir.innerHTML = '<span style="flex:1"><span style="font-size:0.85rem;font-weight:500">' + (f.attributes[kat.alan] || kat.ad) + '</span><span class="katman-alt-baslik">' + Math.round(d) + ' m</span></span>';
        satir.addEventListener('click', () => {
          view.goTo({ target: f.geometry, zoom: 17, tilt: 55 }).catch(() => {});
          view.openPopup({ location: f.geometry, title: f.attributes[kat.alan] || kat.ad, content: Math.round(d) + ' m mesafede' });
        });
        kaps.appendChild(satir);
      });
    } catch (e) {
      const p = document.createElement('p');
      p.style.cssText = 'font-size:0.85rem;color:var(--renk-metin-solgun)';
      p.textContent = 'Yüklenemedi';
      kaps.appendChild(p);
    }
  }
  const eski = $('yakindakiler-karti');
  if (eski) eski.remove();
  const kesfet = $('sayfa-kesfet');
  if (kesfet) { kesfet.appendChild(kaps); kaps.scrollIntoView({ behavior: 'smooth' }); }
  sayfaGoster('kesfet');
}
// ---------- ÖNE ÇIKAN YERLER (Editoryal liste) ----------
const ONE_CIKAN_YERLER = [
  { ad: 'Kızılay Meydanı', aciklama: 'Başkent\u2019in kalbi, buluşma noktası', lat: 39.9208, lon: 32.8541, zoom: 16 },
  { ad: 'Anıtkabir', aciklama: 'Atatürk\u2019ün anıt mezarı ve tören alanı', lat: 39.9252, lon: 32.8364, zoom: 15.5 },
  { ad: 'Ulus / Anafartalar', aciklama: 'Tarihi kent merkezi, kale etekleri', lat: 39.9417, lon: 32.8530, zoom: 16 },
  { ad: 'Kocatepe Camii', aciklama: 'Kızılay\u2019ın simge camisi', lat: 39.9176, lon: 32.8590, zoom: 16 },
  { ad: 'Atakule', aciklama: 'Çankaya\u2019n tepesindeki simge yapı', lat: 39.8805, lon: 32.8918, zoom: 16 }
];
function oneCikanlariDoldur() {
  const kaps = $('one-cikan-yerler');
  if (!kaps) return;
  ONE_CIKAN_YERLER.forEach((y, i) => {
    const b = document.createElement('button');
    b.className = 'one-cikan-satir';
    b.type = 'button';
    const num = document.createElement('span');
    num.className = 'one-cikan-satir__num';
    num.textContent = String(i + 1).padStart(2, '0');
    const govde = document.createElement('span');
    govde.style.flex = '1';
    const ad = document.createElement('span');
    ad.className = 'one-cikan-satir__ad';
    ad.textContent = y.ad;
    const acik = document.createElement('span');
    acik.className = 'one-cikan-satir__aciklama';
    acik.textContent = y.aciklama;
    govde.appendChild(ad);
    govde.appendChild(acik);
    b.appendChild(num);
    b.appendChild(govde);
    b.addEventListener('click', () => {
      if (!view) return;
      view.goTo({ target: { latitude: y.lat, longitude: y.lon }, zoom: y.zoom, tilt: 58 }, { duration: 2200 }).catch(() => {});
      view.openPopup({ location: { type: 'point', longitude: y.lon, latitude: y.lat }, title: y.ad, content: y.aciklama });
      toastGoster(y.ad + ' konumuna gidiliyor.', 'bilgi');
    });
    kaps.appendChild(b);
  });
}
// ---------- GÜNDEM KARTLARI (Editoryal makale listesi) ----------
const GUNDEM_KONULARI = [
  { etiket: 'Tarih', baslik: 'Anıtkabir ve tören alanı', ozet: 'Başkent\u2019in en çok ziyaret edilen anıt kompleksi, tepeden panoramik görünüm.', ikon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>', lat: 39.9252, lon: 32.8364, zoom: 15 },
  { etiket: 'Kent Yaşamı', baslik: 'Kızılay Meydanı çevresi', ozet: 'Başkent\u2019in kalbi; duraklar, parklar ve yaya aksı bir arada.', ikon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>', lat: 39.9208, lon: 32.8541, zoom: 15.5 },
  { etiket: 'Mimari', baslik: 'Atakule ve Çankaya tepesi', ozet: 'Şehrin simge yapılarından biri; tepeden Ankara manzarası.', ikon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 6v12H5V9z"/><circle cx="12" cy="10" r="2"/></svg>', lat: 39.8805, lon: 32.8918, zoom: 15.5 },
  { etiket: 'Tarih', baslik: 'Ulus ve Ankara Kalesi etekleri', ozet: 'Tarihi kent merkezinin dar sokakları ve kale surları.', ikon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9l4-3 4 3 4-3 4 3v12M4 21h16M9 21v-5h6v5"/></svg>', lat: 39.9417, lon: 32.8530, zoom: 15.5 }
];
function gundemKartlariniDoldur() {
  const kaps = $('gundem-kartlari');
  if (!kaps) return;
  GUNDEM_KONULARI.forEach(k => {
    const b = document.createElement('button');
    b.className = 'makale-karti';
    b.type = 'button';
    b.setAttribute('role', 'listitem');
    const gorsel = document.createElement('span');
    gorsel.className = 'makale-karti__gorsel';
    gorsel.innerHTML = k.ikon;
    const govde = document.createElement('span');
    govde.className = 'makale-karti__govde';
    const et = document.createElement('span');
    et.className = 'makale-karti__etiket';
    et.textContent = k.etiket;
    const bas = document.createElement('span');
    bas.className = 'makale-karti__baslik';
    bas.textContent = k.baslik;
    const oz = document.createElement('span');
    oz.className = 'makale-karti__ozet';
    oz.textContent = k.ozet;
    govde.appendChild(et); govde.appendChild(bas); govde.appendChild(oz);
    b.appendChild(gorsel); b.appendChild(govde);
    b.addEventListener('click', () => {
      if (!view) return;
      view.goTo({ target: { latitude: k.lat, longitude: k.lon }, zoom: k.zoom, tilt: 58 }, { duration: 2200 }).catch(() => {});
      view.openPopup({ location: { type: 'point', longitude: k.lon, latitude: k.lat }, title: k.baslik, content: k.ozet });
      toastGoster(k.baslik + ' konumuna gidiliyor.', 'bilgi');
    });
    kaps.appendChild(b);
  });
}
function mesafe(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------- OLAY BAĞLAMA ----------
function olaylariBagla() {
  document.querySelectorAll('.sol-panel__sekme').forEach(s => {
    s.addEventListener('click', () => sayfaGoster(s.dataset.sayfa));
  });
  document.querySelectorAll('.mobil-sekme-cubugu__btn').forEach(b => {
    b.addEventListener('click', () => mobilPanelGoster(b.dataset.panel));
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 1024) { const p = $('sol-panel'); if (p) p.classList.remove('gizli'); } if (view && view.resize) view.resize(); });

  const form = $('arama-form');
  if (form) form.addEventListener('submit', e => { e.preventDefault(); aramaYap(); });
  const g = $('arama-girdi');
  if (g) g.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); aramaYap(); } });

  const bt = $('btn-tema');
  if (bt) bt.addEventListener('click', () => temayiUygula(document.documentElement.getAttribute('data-tema') === 'acik'));
  const bk = $('btn-konum-hizli');
  if (bk) bk.addEventListener('click', konumBul);
  const bp = $('btn-paylas');
  if (bp) bp.addEventListener('click', baglantiPaylas);
  const btur = $('btn-tur-baslat');
  if (btur) btur.addEventListener('click', kesifTuruBaslat);
  const byak = $('btn-yakindakiler');
  if (byak) byak.addEventListener('click', yakindakiler);

  const bm = $('btn-olcum-mesafe'); if (bm) bm.addEventListener('click', () => olcumBaslat('mesafe'));
  const ba = $('btn-olcum-alan'); if (ba) ba.addEventListener('click', () => olcumBaslat('alan'));
  const bt2 = $('btn-olcum-temizle'); if (bt2) bt2.addEventListener('click', olcumTemizle);
  const bg = $('btn-gunes-gunduz');
  if (bg) bg.addEventListener('click', () => { const d = new Date(); d.setHours(12, 0, 0, 0); gunesAyarla(d); });
  const bn = $('btn-gunes-gece');
  if (bn) bn.addEventListener('click', () => { const d = new Date(); d.setHours(0, 0, 0, 0); gunesAyarla(d); });
  const bo = $('btn-gunes-ozel'); if (bo) bo.addEventListener('click', gunesOzelGoster);
  const bu = $('btn-gunes-uygula');
  if (bu) bu.addEventListener('click', () => {
    const v = $('gunes-tarih-saat').value;
    if (v) gunesAyarla(new Date(v));
  });
}

// ---------- BAŞLAT ----------
async function baslat() {
  temayiBaslat();
  if (window.innerWidth <= 1024) {
    const p0 = $('sol-panel');
    if (p0) p0.classList.add('gizli');
  }
  katmanListeleriniDoldur();
  tabanKartlariOlustur();
  oneCikanlariDoldur();
  gundemKartlariniDoldur();
  olaylariBagla();
  await katmanlariYukle();
}
if (typeof require !== 'undefined') { baslat(); } else { window.addEventListener('load', baslat); }

Object.assign(window, { aramaYap, aramaSec, konumBul, baglantiPaylas, tabanSec, sayfaGoster, kesifTuruBaslat, kesifTuruDurdur, yakindakiler, olcumBaslat, olcumTemizle, gunesAyarla, temayiUygula, oneCikanlariDoldur, gundemKartlariniDoldur });