/* Ankara 3D — tek ekranlı sade uygulama (ArcGIS JS 4.32, AMD; dojo yok) */
(function () {
  'use strict';

  var ADRES = 'https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer/';
  var BINALAR_URL = 'https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer';
  var GEOCODE = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

  var ACILIS = { position: { longitude: 32.8387, latitude: 39.9090, z: 650 }, heading: 355, tilt: 70 };

  var view = null, map = null;
  var katmanlar = {};       // id -> layer
  var isaretKatmani = null; // arama/kullanıcı konumu graphics
  var konumIzleId = null, canliTakip = false;
  var aramaTimer = null;

  function $(id) { return document.getElementById(id); }

  // ---------- Bildirim ----------
  function bildirim(mesaj) {
    var el = $('bildirim');
    if (!el) return;
    el.textContent = mesaj;
    el.hidden = false;
    el.classList.remove('gorunur');
    void el.offsetWidth;
    el.classList.add('gorunur');
    clearTimeout(bildirim._t);
    bildirim._t = setTimeout(function () { el.hidden = true; }, 3000);
  }

  // ---------- Harita ----------
  function haritaKur() {
    require([
      'esri/Map', 'esri/views/SceneView',
      'esri/layers/SceneLayer', 'esri/layers/FeatureLayer', 'esri/layers/GraphicsLayer',
      'esri/renderers/SimpleRenderer', 'esri/symbols/MeshSymbol3D', 'esri/symbols/edges/SolidEdges3D',
      'esri/PopupTemplate', 'esri/Graphic',
      'esri/core/reactiveUtils'
    ], function (Map, SceneView, SceneLayer, FeatureLayer, GraphicsLayer, SimpleRenderer, MeshSymbol3D, SolidEdges3D, PopupTemplate, Graphic, reactiveUtils) {

      map = new Map({ basemap: 'hybrid' });

      // 3B Binalar — opak buz grisi
      var binalar = new SceneLayer({ url: BINALAR_URL, title: '3D Binalar', popupEnabled: false });
      binalar.renderer = new SimpleRenderer({
        symbol: new MeshSymbol3D({
          symbolLayers: [{
            type: 'fill',
            material: { color: [221, 230, 236, 1], colorMixMode: 'replace' },
            edges: new SolidEdges3D({ color: [120, 135, 150, 0.55], size: 0.5 })
          }]
        })
      });

      // Yapılar (2) — etiketli
      var yapilar = new FeatureLayer({
        url: ADRES + '2', title: 'Yapılar', outFields: ['*'], visible: true,
        labelsVisible: true,
        labelingInfo: [{
          labelExpressionInfo: { expression: "IIf(IsEmpty($feature.ad), $feature.zeminustukatsayisi + ' kat', $feature.ad)" },
          minScale: 5000,
          symbol: { type: 'label-3d', symbolLayers: [{ type: 'text', size: 10, material: { color: [31, 31, 31, 1] }, haloColor: [255, 255, 255, 0.9], haloSize: 1.5 }] }
        }],
        popupTemplate: new PopupTemplate({
          title: '{ad}',
          content: function (f) {
            var a = f.graphic.attributes, satirlar = [];
            if (a.zeminustukatsayisi != null) satirlar.push('<b>Kat:</b> ' + a.zeminustukatsayisi);
            if (a.zeminaltikatsayisi != null) satirlar.push('<b>Bodrum:</b> ' + a.zeminaltikatsayisi);
            if (a.bagimsizbolumsayi != null) satirlar.push('<b>Bağımsız bölüm:</b> ' + a.bagimsizbolumsayi);
            if (a.postakodu) satirlar.push('<b>Posta kodu:</b> ' + a.postakodu);
            return satirlar.join('<br>') || '—';
          }
        })
      });
      if (!yapilar.popupTemplate.title || yapilar.popupTemplate.title === '{ad}') {
        // başlık boşsa "Yapı"
      }

      // Numarataj (0) — etiketli
      var numarataj = new FeatureLayer({
        url: ADRES + '0', title: 'Numarataj (MAKS)', outFields: ['*'], visible: true,
        labelsVisible: true,
        labelingInfo: [{
          labelExpressionInfo: { expression: '$feature.kapino' },
          minScale: 1500,
          symbol: { type: 'label-3d', symbolLayers: [{ type: 'text', size: 9, material: { color: [140, 29, 23, 1] }, haloColor: [255, 255, 255, 0.9], haloSize: 1.5 }] }
        }],
        popupTemplate: new PopupTemplate({
          title: 'No {kapino}',
          content: '<b>Adres:</b> {ad}'
        })
      });

      // Mahalleler (3)
      var mahalleler = new FeatureLayer({
        url: ADRES + '3', title: 'Mahalleler', outFields: ['*'], visible: false,
        popupTemplate: new PopupTemplate({ title: '{ad}', content: '<b>Mahalle:</b> {ad}' })
      });

      // Yollar (1)
      var yollar = new FeatureLayer({
        url: ADRES + '1', title: 'Yollar', outFields: ['*'], visible: false,
        popupTemplate: new PopupTemplate({ title: '{ad}', content: '<b>Cadde/Sokak:</b> {ad}' })
      });

      katmanlar = {
        'cb-binalar': binalar, 'cb-yapilar': yapilar, 'cb-numarataj': numarataj,
        'cb-mahalleler': mahalleler, 'cb-yollar': yollar
      };
      map.addMany([binalar, yapilar, numarataj, mahalleler, yollar]);

      isaretKatmani = new GraphicsLayer({ title: 'İşaretler' });
      map.add(isaretKatmani);

      var telefon = window.matchMedia('(max-width: 720px)').matches;
      view = new SceneView({
        container: 'viewDiv',
        map: map,
        camera: ACILIS,
        ui: { components: ['attribution'] },
        environment: {
          lighting: { type: 'virtual', directShadowsEnabled: true },
          atmosphereEnabled: true,
          starsEnabled: false
        },
        qualityProfile: telefon ? 'medium' : 'high',
        popup: { dockEnabled: true, dockOptions: { buttonEnabled: false, breakpoint: false } }
      });
      window.view = view;

      // Katman yükleme hatası
      Object.keys(katmanlar).forEach(function (id) {
        var l = katmanlar[id];
        l.when(null, function () { bildirim('Bazı katmanlar yüklenemedi'); });
        var cb = $(id);
        if (cb) {
          cb.checked = l.visible;
          reactiveUtils.watch(function () { return l.visible; }, function (v) { cb.checked = v; });
          cb.addEventListener('change', function () { l.visible = cb.checked; });
        }
      });

      // Durum satırı (masaüstü)
      reactiveUtils.watch(function () { return view.stationary && view.center && view.camera; }, function () {
        if (!view.stationary || !view.center) return;
        var d = $('durum-satiri');
        if (d) {
          d.textContent = view.center.latitude.toFixed(4) + ', ' + view.center.longitude.toFixed(4) +
            '  ·  zoom ' + Math.round(view.zoom) + '  ·  eğim ' + Math.round(view.camera.tilt) + '°  ·  yön ' + Math.round(view.camera.heading) + '°';
        }
        // Kuzey simgesi yönü
        var k = $('kuzey-simge');
        if (k) k.style.transform = 'rotate(' + (-view.camera.heading) + 'deg)';
      });

      view.when(function () {
        var y = $('yukleniyor');
        if (y) y.hidden = true;
        olaylariBagla();
      });
    });
  }

  // ---------- Arama ----------
  function aramaYap() {
    var g = $('arama-girdi');
    var metin = g ? g.value.trim() : '';
    if (!metin) return;
    var url = GEOCODE + '?f=json&SingleLine=' + encodeURIComponent(metin) +
      '&countryCode=TUR&location=32.85,39.93&maxLocations=6&outFields=Match_addr';
    fetch(url).then(function (r) { return r.json(); }).then(function (veri) {
      var adaylar = (veri && veri.candidates) || [];
      listeyiGoster(adaylar);
    }).catch(function () { bildirim('Arama yapılamadı'); });
  }

  function listeyiGoster(adaylar) {
    var liste = $('arama-sonuclari');
    if (!liste) return;
    liste.innerHTML = '';
    if (!adaylar.length) {
      var bos = document.createElement('div');
      bos.className = 'arama-satir';
      bos.textContent = 'Sonuç yok';
      liste.appendChild(bos);
    } else {
      adaylar.forEach(function (c) {
        var satir = document.createElement('button');
        satir.type = 'button';
        satir.className = 'arama-satir';
        satir.textContent = c.address;
        satir.addEventListener('click', function () { adresGit(c); });
        liste.appendChild(satir);
      });
    }
    liste.hidden = false;
  }

  function adresGit(c) {
    var liste = $('arama-sonuclari');
    if (liste) liste.hidden = true;
    var pt = { type: 'point', longitude: c.location.x, latitude: c.location.y };
    isaretiKoy(pt, [179, 38, 30]);
    if (view) view.goTo({ target: pt, zoom: 17, tilt: 60 }, { duration: 1200 }).catch(function () {});
  }

  function isaretiKoy(pt, renk) {
    require(['esri/Graphic'], function (Graphic) {
      isaretKatmani.removeAll();
      isaretKatmani.add(new Graphic({
        geometry: pt,
        symbol: { type: 'simple-marker', color: renk, size: 14, outline: { color: [255, 255, 255], width: 2 } }
      }));
    });
  }

  // ---------- Araç çubuğu ----------
  function olaylariBagla() {
    var g = $('arama-girdi');
    if (g) {
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); aramaYap(); }
        if (e.key === 'Escape') { g.value = ''; var l = $('arama-sonuclari'); if (l) l.hidden = true; isaretKatmani && isaretKatmani.removeAll(); }
      });
      g.addEventListener('input', function () {
        clearTimeout(aramaTimer);
        aramaTimer = setTimeout(aramaYap, 500);
      });
    }
    document.addEventListener('click', function (e) {
      var liste = $('arama-sonuclari');
      if (liste && !liste.hidden && !liste.contains(e.target) && e.target !== g) liste.hidden = true;
      var kart = $('katman-karti');
      var kb = $('btn-katmanlar');
      if (kart && !kart.hidden && !kart.contains(e.target) && e.target !== kb && !kb.contains(e.target)) {
        kart.hidden = true; kb.setAttribute('aria-expanded', 'false');
      }
    });

    var bk = $('btn-konum');
    if (bk) bk.addEventListener('click', konumIsle);

    var ba = $('btn-anitkabir');
    if (ba) ba.addEventListener('click', function () {
      if (navigator.vibrate) navigator.vibrate(8);
      if (view) view.goTo(ACILIS, { duration: 1000 }).catch(function () {});
    });

    var bl = $('btn-katmanlar');
    if (bl) bl.addEventListener('click', function () {
      if (navigator.vibrate) navigator.vibrate(8);
      var kart = $('katman-karti');
      var ac = kart.hidden;
      kart.hidden = !ac;
      bl.setAttribute('aria-expanded', ac ? 'true' : 'false');
    });

    var bn = $('btn-kuzey');
    if (bn) bn.addEventListener('click', function () {
      if (navigator.vibrate) navigator.vibrate(8);
      if (view && view.camera) {
        var cam = view.camera.clone();
        cam.heading = 0;
        view.goTo({ camera: cam }, { duration: 500 }).catch(function () {});
      }
    });

    // Taban seçimi
    document.querySelectorAll('.taban-dugme').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.dataset.taban;
        if (map) map.basemap = t;
        document.querySelectorAll('.taban-dugme').forEach(function (x) {
          var aktif = x === b;
          x.classList.toggle('aktif', aktif);
          x.setAttribute('aria-pressed', aktif ? 'true' : 'false');
        });
      });
    });
  }

  // Konum: 1. dokunuş bul, 2. canlı takip, 3. kapat
  function konumIsle() {
    if (navigator.vibrate) navigator.vibrate(8);
    if (!navigator.geolocation) { bildirim('Konum alınamadı'); return; }
    if (canliTakip) {
      navigator.geolocation.clearWatch(konumIzleId);
      konumIzleId = null; canliTakip = false;
      $('btn-konum').classList.remove('takip');
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var pt = { type: 'point', longitude: pos.coords.longitude, latitude: pos.coords.latitude };
      isaretKatmani.removeAll();
      require(['esri/Graphic'], function (Graphic) {
        isaretKatmani.add(new Graphic({
          geometry: pt,
          symbol: { type: 'simple-marker', color: [30, 99, 214], size: 14, outline: { color: [255, 255, 255], width: 2 } }
        }));
        isaretKatmani.add(new Graphic({
          geometry: { type: 'circle', center: pt, radius: pos.coords.accuracy },
          symbol: { type: 'simple-fill', color: [30, 99, 214, 0.15], outline: { color: [30, 99, 214, 0.5], width: 1 } }
        }));
      });
      if (view) view.goTo({ target: pt, zoom: 17, tilt: 60 }, { duration: 1200 }).catch(function () {});
      // canlı takip aç
      canliTakip = true;
      $('btn-konum').classList.add('takip');
      konumIzleId = navigator.geolocation.watchPosition(function (p) {
        var p2 = { type: 'point', longitude: p.coords.longitude, latitude: p.coords.latitude };
        isaretKatmani.removeAll();
        require(['esri/Graphic'], function (Graphic) {
          isaretKatmani.add(new Graphic({ geometry: p2, symbol: { type: 'simple-marker', color: [30, 99, 214], size: 14, outline: { color: [255, 255, 255], width: 2 } } }));
          isaretKatmani.add(new Graphic({ geometry: { type: 'circle', center: p2, radius: p.coords.accuracy }, symbol: { type: 'simple-fill', color: [30, 99, 214, 0.15], outline: { color: [30, 99, 214, 0.5], width: 1 } } }));
        });
        if (view) view.goTo({ target: p2 }, { animate: false }).catch(function () {});
      });
    }, function () { bildirim('Konum alınamadı'); }, { enableHighAccuracy: true, timeout: 10000 });
  }

  // ---------- Başlat + PWA ----------
  function baslat() { haritaKur(); }
  if (typeof require !== 'undefined') { baslat(); } else { window.addEventListener('load', baslat); }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();