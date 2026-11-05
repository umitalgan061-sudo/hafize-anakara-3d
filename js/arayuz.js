// Ankara 3D Harita — Arayüz ve İş Mantığı
// ArcGIS JS API 4.32 global require ile yüklenir; bu dosya view ready sonrası çalışır.

let map = null;
let view = null;
let katlanar = {};
const TABAN_SIRA = ['hybrid', 'satellite', 'streets', 'gray'];
let tabanIndex = 0;
let aramaAdaylar = [];
let footerRaf = null;
let sonKoordinat = null;
let sonZoom = null;
let oncekiAktifElement = null;
let surukleBaslangicY = 0;
let surukleMevcutY = 0;
let surukleAktif = false;

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

function temayiUygula(koyu) {
  document.documentElement.setAttribute('data-tema', koyu ? 'koyu' : 'acik');
  localStorage.setItem('tema', koyu ? 'koyu' : 'acik');
  const btn = $('btn-tema');
  if (btn) btn.setAttribute('aria-pressed', koyu ? 'true' : 'false');
}

function temayiBaslat() {
  const kayitli = localStorage.getItem('tema');
  const sistemKoyu = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const koyu = kayitli ? kayitli === 'koyu' : sistemKoyu;
  temayiUygula(koyu);
}

// --- URL Paylaşım ---
function urlOku() {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  return {
    taban: params.get('taban') || 'hybrid',
    lat: parseFloat(params.get('lat')),
    lon: parseFloat(params.get('lon')),
    zoom: parseInt(params.get('zoom'), 10),
    tilt: parseInt(params.get('tilt'), 10),
    adres: params.get('adres') || ''
  };
}

function urlYaz(state) {
  const params = new URLSearchParams();
  if (state.taban) params.set('taban', state.taban);
  if (!isNaN(state.lat)) params.set('lat', state.lat.toFixed(6));
  if (!isNaN(state.lon)) params.set('lon', state.lon.toFixed(6));
  if (!isNaN(state.zoom)) params.set('zoom', state.zoom);
  if (!isNaN(state.tilt)) params.set('tilt', state.tilt);
  if (state.adres) params.set('adres', state.adres);
  const yeniHash = params.toString();
  if (window.location.hash !== '#' + yeniHash) {
    history.replaceState(null, '', '#' + yeniHash);
  }
}

function parametreleriUygula() {
  const p = urlOku();
  // Tabanı uygula (harita yüklendikten sonra)
  if (p.taban && map) {
    map.basemap = p.taban;
    tabanIndex = TABAN_SIRA.indexOf(p.taban);
    document.querySelectorAll('.taban-btn').forEach(b => b.classList.toggle('aktif', b.dataset.taban === p.taban));
  }
  // Kamera pozisyonu varsa git
  if (!isNaN(p.lat) && !isNaN(p.lon) && view) {
    const opts = { target: { latitude: p.lat, longitude: p.lon } };
    if (!isNaN(p.zoom)) opts.zoom = p.zoom;
    if (!isNaN(p.tilt)) opts.tilt = p.tilt;
    view.goTo(opts).catch(() => {});
  }
  // Arama kutusuna adresi yaz
  if (p.adres) {
    const girdi = $('arama-girdi');
    if (girdi) girdi.value = decodeURIComponent(p.adres);
  }
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
        )}
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

      katlanar = { binalar, mahalle, yol, yapi, ilce };
      map.addMany(Object.values(katlanar));

      view = new SceneView({
        container: 'viewDiv',
        map: map,
        camera: { position: { x: 32.8597, y: 39.9334, z: 4500 }, tilt: 65 },
        ui: { components: ['attribution'] },
        popup: {
          dockEnabled: true,
          dockOptions: { buttonEnabled: false, breakpoint: false },
          collapseEnabled: false
        }
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

        // Checkbox senkronizasyonu (iki yönlü)
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
          if (cb) {
            cb.addEventListener('change', () => { layer.visible = cb.checked; });
            cb.checked = layer.visible;
          }
        });

        // Footer koordinat/zoom - throttling ile
        view.watch('scale', (s) => {
          if (s && isFinite(s)) {
            sonZoom = Math.round(s);
            footerGuncellePlanla();
          }
          urlGuncelleKamera();
        });
        view.on('target-change', () => {
          const c = view.center;
          if (c && isFinite(c.latitude) && isFinite(c.longitude)) {
            sonKoordinat = `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`;
            footerGuncellePlanla();
          }
          urlGuncelleKamera();
        });

        // URL'den parametreleri uygula
        parametreleriUygula();

        console.log('Harita ve katmanlar hazır.');
        resolve();
      });
    });
  });
}

function footerGuncellePlanla() {
  if (footerRaf) return;
  footerRaf = requestAnimationFrame(() => {
    const coordEl = $('coord');
    const zoomEl = $('zoom');
    if (coordEl && sonKoordinat) coordEl.textContent = sonKoordinat;
    if (zoomEl && sonZoom) zoomEl.textContent = sonZoom;
    footerRaf = null;
  });
}

function urlGuncelleKamera() {
  if (!view) return;
  const c = view.center;
  const state = {
    taban: map?.basemap?.id || 'hybrid',
    lat: c?.latitude,
    lon: c?.longitude,
    zoom: view.zoom,
    tilt: view.camera?.tilt
  };
  urlYaz(state);
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

  // Mobil bottom sheet sürükleme (pointer events)
  const kartEl = $('katman-karti');
  if (kartEl) {
    const handle = kartEl.querySelector('.surukle-cubuk');
    if (handle) {
      handle.addEventListener('pointerdown', surukleBaslat);
    }
  }

  // Mobil overlay tıklama ile kapanır
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
      const btn = e.target.closest('.taban-btn');
      if (btn) tabanSec(btn.dataset.taban);
    });
  }

  // ESC tuşu ile bottom-sheet kapatma
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const kart = $('katman-karti');
      if (kart && kart.classList.contains('acik')) katmanKapat();
    }
  });
}

// --- Sürükleme mantığı ---
function surukleBaslat(e) {
  const kart = $('katman-karti');
  if (!kart || !kart.classList.contains('acik')) return;
  surukleAktif = true;
  surukleBaslangicY = e.clientY;
  surukleMevcutY = 0;
  kart.style.transition = 'none';
  document.addEventListener('pointermove', surukleDevam);
  document.addEventListener('pointerup', surukleBitir);
  document.addEventListener('pointercancel', surukleBitir);
}

function surukleDevam(e) {
  if (!surukleAktif) return;
  const kart = $('katman-karti');
  if (!kart) return;
  surukleMevcutY = e.clientY - surukleBaslangicY;
  if (surukleMevcutY > 0) {
    kart.style.transform = `translateY(${surukleMevcutY}px)`;
  }
}

function surukleBitir(e) {
  if (!surukleAktif) return;
  surukleAktif = false;
  const kart = $('katman-karti');
  if (!kart) return;
  kart.style.transition = '';
  if (surukleMevcutY > 100) {
    katmanKapat();
  } else {
    kart.style.transform = '';
  }
  document.removeEventListener('pointermove', surukleDevam);
  document.removeEventListener('pointerup', surukleBitir);
  document.removeEventListener('pointercancel', surukleBitir);
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
      urlYaz({ ...urlOku(), lat: c.location.y, lon: c.location.x, zoom: 16, tilt: 65, adres: c.address });
      toastGoster('Adres bulundu', 'basari');
      return;
    }

    // Çoklu sonuç: popup içine document.createElement ile liste bas
    aramaAdaylar = adaylar;
    const ilk = adaylar[0];
    const pt = { type: 'point', longitude: ilk.location.x, latitude: ilk.location.y };
    
    const container = document.createElement('div');
    container.className = 'arama-sonuc-listesi';
    
    adaylar.forEach((c, i) => {
      const label = document.createElement('label');
      label.className = 'arama-sonuc-satiri';
      
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'aramaSonuc';
      radio.value = String(i);
      if (i === 0) radio.checked = true;
      
      const strong = document.createElement('strong');
      strong.textContent = c.address;
      
      label.appendChild(radio);
      label.appendChild(strong);
      container.appendChild(label);
      
      label.addEventListener('click', () => { radio.checked = true; });
    });

    const btn = document.createElement('button');
    btn.id = 'arama-sec-btn';
    btn.className = 'arama-sec-btn';
    btn.textContent = 'Seç ve Git';
    btn.addEventListener('click', aramaSec);

    view.popup.open({
      location: pt,
      title: `${adaylar.length} sonuç bulundu`,
      content: container
    });
    // butonu popup content'ine ekle
    if (view.popup.content) view.popup.content.appendChild(btn);

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
  // Popup'ı güncelle (kapatmadan)
  view.popup.location = pt;
  view.popup.title = 'Arama Sonucu';
  view.popup.content = c.address;
  // Haritayı animasyonlu git
  view.goTo({ target: pt, zoom: 16, tilt: 65 });
  urlYaz({ ...urlOku(), lat: c.location.y, lon: c.location.x, zoom: 16, tilt: 65, adres: c.address });
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
  document.querySelectorAll('.taban-btn').forEach(b => b.classList.toggle('aktif', b.dataset.taban === ad));
  toastGoster(`Harita tabanı: ${ad}`, 'bilgi');
  urlGuncelleKamera();
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
    urlGuncelleKamera();
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
  
  if (acik) {
    oncekiAktifElement = document.activeElement;
    const focusable = kart.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus();
    document.body.style.overflow = 'hidden';
  } else {
    if (oncekiAktifElement) oncekiAktifElement.focus();
    document.body.style.overflow = '';
  }
}

function katmanKapat() {
  const kart = $('katman-karti');
  const overlay = $('katman-overlay');
  if (kart) kart.classList.remove('acik');
  if (overlay) overlay.classList.remove('gorunur');
  const btn = $('btn-katmanlar');
  if (btn) btn.classList.remove('aktif');
  if (oncekiAktifElement) oncekiAktifElement.focus();
  document.body.style.overflow = '';
}

// ==================== BAŞLATMA ====================
async function baslat() {
  temayiBaslat();
  arayuzOlaylariniBagla();
  await katmanlariYukle();
}

// ArcGIS API yüklendikten sonra başlat
if (typeof require !== 'undefined') {
  baslat();
} else {
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