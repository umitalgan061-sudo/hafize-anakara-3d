// Ankara 3D Harita — Arayüz ve İş Mantığı
// ArcGIS JS API 4.32 global require ile yüklenir; bu dosya view ready sonrası çalışır.

let map = null;
let view = null;
let katmanlar = {};
const TABAN_SIRA = ['hybrid', 'satellite', 'streets', 'gray'];
let tabanIndex = 0;
let aramaAdaylar = [];

// ==================== YARDIMCI FONKSIYONLAR ====================
function $(id) { return document.getElementById(id); }

function toastGoster(mesaj, tur = 'uyari') {
  const konteyner = $('toast-konteyner');
  if (!konteyner) return;
  const el = document.createElement('div');
  el.className = `toast ${tur === 'basari' ? 'basari' : tur === 'bilgi' ? 'bilgi' : ''}`;
  el.textContent = mesaj;
  konteyner.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function svgIkon(ad) {
  const ikonlar = {
    arama: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
    katlan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>',
    katman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>',
    konum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2"></path></svg>',
    taban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>',
    tema: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
    ayarlar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'
  };
  return ikonlar[ad] || '';
}

function temayiUygula(koyu) {
  document.documentElement.setAttribute('data-tema', koyu ? 'koyu' : 'acik');
  localStorage.setItem('tema', koyu ? 'koyu' : 'acik');
  const btn = $('btn-tema');
  if (btn) btn.setAttribute('aria-pressed', koyu ? 'false' : 'true'); // ters: açık tema butonu basılı görünsün
}

function temayiBaslat() {
  const kayitli = localStorage.getItem('tema');
  const sistemKoyu = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const koyu = kayitli ? kayitli === 'koyu' : sistemKoyu;
  temayiUygula(koyu);
}

// ==================== KATMAN YÖNETİMİ ====================
function popupOlustur(baslikAlan, alanlar) {
  return {
    title: `{${baslikAlan}}`,
    content: alanlar.map(a => `<b>${a.etiket}:</b> {${a.alan}}`).join('<br>'),
    fieldInfos: alanlar.map(a => ({ fieldName: a.alan, visible: true }))
  };
}

function katmanlariYukle() {
  return new Promise((resolve) => {
    require([
      'esri/Map',
      'esri/views/SceneView',
      'esri/layers/SceneLayer',
      'esri/layers/FeatureLayer',
      'esri/renderers/SimpleRenderer',
      'esri/symbols/MeshSymbol3D',
      'esri/symbols/edges/SketchEdges3D',
      'esri/PopupTemplate'
    ], (Map, SceneView, SceneLayer, FeatureLayer, SimpleRenderer, MeshSymbol3D, SketchEdges3D, PopupTemplate) => {
      map = new Map({ basemap: 'hybrid' });

      // 1) Esri 3D Binalar
      const binalar = new SceneLayer({
        url: 'https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer',
        title: 'Esri 3D Binalar',
        popupTemplate: new PopupTemplate({ title: '3D Bina', content: 'Esri 3D Buildings katmanı' })
      });
      binalar.renderer = new SimpleRenderer({
        symbol: new MeshSymbol3D({
          symbolLayers: [{
            type: 'fill',
            material: { color: [255, 255, 255, 0] },
            edges: new SketchEdges3D({ color: [173, 216, 230, 1], size: 2 })
          }]}
        })}
      );

      // 2) Ankara adres katmanları
      const mahalle = new FeatureLayer({
        url: 'https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer/3',
        title: 'Mahalle',
        outFields: ['*'],
        popupTemplate: new PopupTemplate(popupOlustur('MAHALLE_ADI', [
          { etiket: 'Mahalle', alan: 'MAHALLE_ADI' },
          { etiket: 'İlçe', alan: 'ILCE_ADI' }
        ]))
      });

      const yol = new FeatureLayer({
        url: 'https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer/1',
        title: 'Yol',
        outFields: ['*'],
        popupTemplate: new PopupTemplate(popupOlustur('CADDE_ADI', [
          { etiket: 'Cadde/Sokak', alan: 'CADDE_ADI' },
          { etiket: 'Mahalle', alan: 'MAHALLE_ADI' },
          { etiket: 'İlçe', alan: 'ILCE_ADI' }
        ]))
      });

      const yapi = new FeatureLayer({
        url: 'https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer/2',
        title: 'Yapı',
        outFields: ['*'],
        popupTemplate: new PopupTemplate(popupOlustur('YAPI_ADI', [
          { etiket: 'Yapı', alan: 'YAPI_ADI' },
          { etiket: 'Mahalle', alan: 'MAHALLE_ADI' },
          { etiket: 'İlçe', alan: 'ILCE_ADI' }
        ]))
      });

      const ilce = new FeatureLayer({
        url: 'https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer/4',
        title: 'İlçe',
        outFields: ['*'],
        popupTemplate: new PopupTemplate(popupOlustur('ILCE_ADI', [
          { etiket: 'İlçe', alan: 'ILCE_ADI' }
        ]))
      });

      katmanlar = { binalar, mahalle, yol, yapi, ilce };
      map.addMany(Object.values(katmanlar));

      view = new SceneView({
        container: 'viewDiv',
        map: map,
        camera: { position: { x: 32.8597, y: 39.9334, z: 4500 }, tilt: 65 },
        ui: { components: ['attribution'] }
      });

      view.when(() => {
        // Katman hatalarını dinle
        Object.entries({ cb_binalar: binalar, cb_mahalle: mahalle, cb_yol: yol, cb_yapi: yapi, cb_ilce: ilce }).forEach(([id, layer]) => {
          layer.when(null, (err) => {
            const cb = $(id);
            if (cb) {
              cb.disabled = true;
              cb.parentElement.classList.add('devre-disi');
            }
            toastGoster(`Katman yüklenemedi: ${layer.title}`, 'uyari');
            console.warn('Katman hatası (' + id + ')', err);
          });
        });

        // Checkbox senkronizasyonu
        const cbEslestirme = {
          cb_binalar: binalar,
          cb_mahalle: mahalle,
          cb_yol: yol,
          cb_yapi: yapi,
          cb_ilce: ilce
        };
        Object.entries(cbEslestirme).forEach(([id, layer]) => {
          layer.watch('visible', (vis) => { const cb = $(id); if (cb) cb.checked = vis; });
          const cb = $(id);
          if (cb) cb.addEventListener('change', () => { layer.visible = cb.checked; });
          if (cb) cb.checked = layer.visible;
        });

        // Footer koordinat/zoom
        view.watch('scale', (s) => { const el = $('zoom'); if (el) el.textContent = Math.round(s); });
        view.on('target-change', () => {
          const c = view.center;
          const el = $('coord');
          if (el && c) el.textContent = `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`;
        });

        console.log('Harita ve katmanlar hazır.');
        resolve();
      });
    });
  });
}

// ==================== ARAYÜZ OLAYLARI ====================
function arayuzOlaylariniBagla() {
  // Arama formu
  const form = $('arama-form');
  const girdi = $('arama-girdi');
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); aramaYap(); });
  if (girdi) girdi.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aramaYap(); } });

  // Katlanabilir katman kartı
  const kart = $('katman-karti');
  const baslik = $('katman-baslik');
  if (baslik && kart) {
    baslik.addEventListener('click', () => kart.classList.toggle('katlanmis'));
    baslik.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kart.classList.toggle('katlanmis'); } });
  }

  // Mobil bottom sheet aç/kapa (overlay tıklama ile kapanır)
  const overlay = $('katman-overlay');
  if (overlay) overlay.addEventListener('click', () => katmanKapat());

  // Eylem düğmeleri
  const btnKonum = $('btn-konum');
  const btnTaban = $('btn-taban');
  const btnKatmanlar = $('btn-katmanlar');
  const btnTema = $('btn-tema');
  if (btnKonum) btnKonum.addEventListener('click', konumBul);
  if (btnTaban) btnTaban.addEventListener('click', tabanDegistir);
  if (btnKatmanlar) btnKatmanlar.addEventListener('click', katmanAc);
  if (btnTema) btnTema.addEventListener('click', () => temayiUygula(document.documentElement.getAttribute('data-tema') === 'acik'));

  // Taban listesi butonları (delegasyon)
  const tabanListesi = $('taban-listesi');
  if (tabanListesi) {
    tabanListesi.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-taban]');
      if (btn) tabanSec(btn.dataset.taban);
    });
  }
}

// ==================== İŞLEVLER ====================
async function aramaYap() {
  const girdi = $('arama-girdi');
  if (!girdi) return;
  const metin = girdi.value.trim();
  if (!metin) return toastGoster('Lütfen bir adres girin.', 'uyari');

  try {
    const resp = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&maxLocations=10&countryCode=TUR&SingleLine=${encodeURIComponent(metin + ', Ankara')}`);
    const veri = await resp.json();
    const adaylar = veri.candidates || [];
    if (adaylar.length === 0) return toastGoster('Sonuç bulunamadı', 'uyari');

    if (adaylar.length === 1) {
      const c = adaylar[0];
      const pt = { type: 'point', longitude: c.location.x, latitude: c.location.y };
      view.popup.open({ location: pt, title: 'Arama Sonucu', content: c.address });
      view.goTo({ target: pt, zoom: 16, tilt: 65 });
      $('coord').textContent = c.address;
      toastGoster('Adres bulundu', 'basari');
      return;
    }

    // Çoklu sonuç: popup içine liste bas
    aramaAdaylar = adaylar;
    const ilk = adaylar[0];
    const pt = { type: 'point', longitude: ilk.location.x, latitude: ilk.location.y };
    const listeHtml = adaylar.map((c, i) => `
      <label class="arama-sonuc-satiri">
        <input type="radio" name="aramaSonuc" value="${i}" ${i === 0 ? 'checked' : ''}>
        <strong>${c.address}</strong>
      </label>
    `).join('');
    view.popup.open({
      location: pt,
      title: `${adaylar.length} sonuç bulundu`,
      content: `<div class="arama-sonuc-listesi">${listeHtml}</div>
        <button id="arama-sec-btn" class="arama-sec-btn">Seç ve Git</button>`
    });
    // Buton olayı (popup açıldıktan sonra bağla)
    setTimeout(() => {
      const b = document.getElementById('arama-sec-btn');
      if (b) b.addEventListener('click', aramaSec);
    }, 0);
    toastGoster(`${adaylar.length} sonuç listelendi`, 'bilgi');
  } catch (err) {
    console.error(err);
    toastGoster('Arama hatası: ' + err.message, 'uyari');
  }
}

function aramaSec() {
  const secili = document.querySelector('input[name="aramaSonuc"]:checked');
  if (!secili || !aramaAdaylar.length) return;
  const c = aramaAdaylar[parseInt(secili.value, 10)];
  const pt = { type: 'point', longitude: c.location.x, latitude: c.location.y };
  view.popup.open({ location: pt, title: 'Arama Sonucu', content: c.address });
  view.goTo({ target: pt, zoom: 16, tilt: 65 });
  $('coord').textContent = c.address;
  toastGoster('Adres seçildi', 'basari');
}

function katmanlariAcKapa() {
  const layers = map?.layers?.items || [];
  let anyVisible = false;
  layers.forEach(l => { const nv = !l.visible; l.visible = nv; if (nv) anyVisible = true; });
  const btn = $('btn-katmanlar');
  if (btn) btn.classList.toggle('aktif', anyVisible);
}

function tabanDegistir() {
  tabanIndex = (tabanIndex + 1) % TABAN_SIRA.length;
  tabanSec(TABAN_SIRA[tabanIndex]);
}

function tabanSec(ad) {
  if (map) map.basemap = ad;
  tabanIndex = TABAN_SIRA.indexOf(ad);
  document.querySelectorAll('button[data-taban]').forEach(b => b.classList.toggle('aktif', b.dataset.taban === ad));
  toastGoster(`Harita tabanı: ${ad}`, 'bilgi');
}

function konumBul() {
  if (!navigator.geolocation) return toastGoster('Tarayıcı konum desteklemiyor.', 'uyari');
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    view.goTo({ latitude, longitude, heading: 0, tilt: 65 });
    require(['esri/Graphic'], (Graphic) => {
      view.graphics.removeAll();
      view.graphics.add(new Graphic({
        geometry: { type: 'point', longitude, latitude },
        symbol: { type: 'simple-marker', color: [6, 182, 212], size: 14, outline: { color: [255,255,255,0.9], width: 2 } }
      }));
    });
    toastGoster('Konum bulundu', 'basari');
  }, (err) => toastGoster('Konum erişimi reddedildi: ' + err.message, 'uyari'));
}

function katmanAc() {
  const kart = $('katman-karti');
  const overlay = $('katman-overlay');
  if (!kart) return;
  const acik = kart.classList.toggle('acik');
  if (overlay) overlay.classList.toggle('gorunur', acik);
  const btn = $('btn-katmanlar');
  if (btn) btn.classList.toggle('aktif', acik);
}

function katmanKapat() {
  const kart = $('katman-karti');
  const overlay = $('katman-overlay');
  if (kart) kart.classList.remove('acik');
  if (overlay) overlay.classList.remove('gorunur');
  const btn = $('btn-katmanlar');
  if (btn) btn.classList.remove('aktif');
}

// ==================== BAŞLATMA ====================
async function baslat() {
  temayiBaslat();
  arayuzOlaylariniBagla();
  await katmanlariYukle();
}

// ArcGIS API yüklendikten sonra başlat
if (typeof require !== 'undefined') {
  // require zaten sayfada varsa (index.html script src) hemen çalıştır
  baslat();
} else {
  // yoksa script yüklenene kadar bekle (güvenlik için)
  window.addEventListener('load', baslat);
}

// Global onclick için (index.html içindeki eski çağrılar uyumluluk)
Object.assign(window, {
  aramaYap,
  aramaSec,
  katmanlariAcKapa,
  tabanDegistir,
  konumBul,
  katmanAc,
  katmanKapat,
  temayiUygula
});
