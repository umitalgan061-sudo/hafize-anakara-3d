require([
  "esri/views/SceneView",
  "esri/WebScene",
  "esri/core/reactiveUtils",
  "esri/layers/SceneLayer",
  "esri/layers/FeatureLayer",
  "esri/layers/GraphicsLayer",
  "esri/Graphic",
  "esri/symbols/PointSymbol3D",
  "esri/symbols/IconSymbol3DLayer",
  "esri/symbols/LabelSymbol3D",
  "esri/symbols/TextSymbol3DLayer",
  "esri/renderers/SimpleRenderer",
  "esri/symbols/MeshSymbol3D",
  "esri/symbols/edges/SolidEdges3D",
  "esri/geometry/Point"
], function(
  SceneView, WebScene, reactiveUtils, SceneLayer, FeatureLayer, GraphicsLayer,
  Graphic, PointSymbol3D, IconSymbol3DLayer, LabelSymbol3D, TextSymbol3DLayer,
  SimpleRenderer, MeshSymbol3D, SolidEdges3D, Point
) {
  "use strict";

  // Kalıcı açılış performans ölçümü: ArcGIS JS yükleyici başlangıcı (bu callback'in çalıştığı an)
  const yukleyiciBaslangic = performance.now();

  // ---------- Yardımcılar ----------
  function gosterBildirim(metin, onRetry) {
    const el = document.getElementById("bildirim");
    if (!el) return;
    el.innerHTML = "";
    const yazi = document.createElement("span");
    yazi.textContent = metin;
    el.appendChild(yazi);
    if (onRetry) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Yeniden dene";
      btn.style.cssText = "margin-left:10px;min-width:44px;min-height:44px;background:none;border:none;color:#ffb4ab;font:inherit;font-weight:600;cursor:pointer;text-decoration:underline;padding:2px 8px;";
      btn.addEventListener("click", () => {
        el.hidden = true;
        clearTimeout(el._timer);
        onRetry();
      });
      el.appendChild(btn);
    }
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.hidden = true; }, onRetry ? 8000 : 3000);
  }

  // Ekran okuyucu duyurusu (görsel olarak gizli aria-live bölgesi)
  function duyur(metin) {
    const d = document.getElementById("duyuru");
    if (!d) return;
    d.textContent = "";
    requestAnimationFrame(() => { d.textContent = metin; });
  }

  function titresim() { if (navigator.vibrate) navigator.vibrate(8); }

  // Azaltılmış hareket tercihi: kamera uçuşları anlık olur
  const hareketAzalt = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function ucus(hedef, sure) { view.goTo(hedef, { duration: hareketAzalt ? 0 : sure }); }

  // ---------- Katmanlar ----------
  // 3B Binalar (Esri SceneServer) — opak buz grisi
  const buildingsUrl = "https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer";
  const binalarLayer = new SceneLayer({
    url: buildingsUrl,
    title: "3B Binalar",
    visible: true,
    renderer: new SimpleRenderer({
      symbol: new MeshSymbol3D({
        symbolLayers: [{
          type: "fill",
          material: { color: [221, 230, 236, 1], colorMixMode: "replace" },
          edges: new SolidEdges3D({ color: [120, 135, 150, 0.55], size: 0.5 })
        }]
      })
    }),
    opacity: 1
  });

  const MAKS_URL = "https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer";

  const yapiEtiketi = {
    labelExpressionInfo: { expression: "$feature.ad" },
    symbol: new LabelSymbol3D({
      symbolLayers: [new TextSymbol3DLayer({
        material: { color: [20, 20, 20, 1] },
        halo: { color: [255, 255, 255, 0.9], size: 1 },
        size: 11,
        font: { family: "system-ui", weight: "bold" }
      })]
    }),
    minScale: 5000
  };

  const yapilarLayer = new FeatureLayer({
    url: MAKS_URL + "/2",
    title: "Yapılar",
    visible: true,
    outFields: ["ad", "zeminustukatsayisi", "zeminaltikatsayisi", "postakodu", "siteveyakooperatifadi", "bagimsizbolumsayi"],
    labelingInfo: [yapiEtiketi],
    labelsVisible: true,
    popupTemplate: {
      title: "{ad}",
      content: [{
        type: "fields",
        fieldInfos: [
          { fieldName: "ad", label: "Ad" },
          { fieldName: "zeminustukatsayisi", label: "Kat" },
          { fieldName: "zeminaltikatsayisi", label: "Bodrum" },
          { fieldName: "bagimsizbolumsayi", label: "Bağımsız bölüm" },
          { fieldName: "postakodu", label: "Posta kodu" },
          { fieldName: "siteveyakooperatifadi", label: "Site/Kooperatif" }
        ]
      }]
    }
  });

  const numaratajLayer = new FeatureLayer({
    url: MAKS_URL + "/0",
    title: "Numarataj (MAKS)",
    visible: true,
    outFields: ["kapino", "ad", "tip"],
    labelingInfo: [{
      labelExpressionInfo: { expression: "$feature.kapino" },
      symbol: new LabelSymbol3D({
        symbolLayers: [new TextSymbol3DLayer({
          material: { color: [20, 20, 20, 1] },
          halo: { color: [255, 255, 255, 0.9], size: 1 },
          size: 10,
          font: { family: "system-ui", weight: "bold" }
        })]
      }),
      minScale: 1500
    }],
    labelsVisible: true,
    popupTemplate: {
      title: "No {kapino}",
      content: [{ type: "fields", fieldInfos: [
        { fieldName: "kapino", label: "Kapı No" },
        { fieldName: "ad", label: "Adres" },
        { fieldName: "tip", label: "Tip" }
      ] }]
    }
  });

  // Mahalleler ve Yollar katmanları GİZLİDİR: açılışta FeatureLayer OLUŞTURULMAZ
  // (metadata/veri isteği atılmaz — ilk açılış performansı). İlk açıldıklarında
  // bu factory'lerle tek seferlik oluşturulur, haritaya eklenir ve yalnızca
  // loadStatus watch ile hata akışına girer; yükleme zincirine (3 adım) DAHİL DEĞİLDİR.
  let _mahallelerLayer = null;
  let _yollarLayer = null;
  function mahallelerKatmani() {
    if (!_mahallelerLayer) {
      _mahallelerLayer = new FeatureLayer({
        url: MAKS_URL + "/3",
        title: "Mahalleler",
        visible: false,
        outFields: ["ad"],
        labelingInfo: [{
          labelExpressionInfo: { expression: "$feature.ad" },
          labelPlacement: "center-center",
          symbol: new LabelSymbol3D({
            symbolLayers: [new TextSymbol3DLayer({
              material: { color: [20, 20, 20, 1] },
              halo: { color: [255, 255, 255, 0.9], size: 1 },
              size: 12,
              font: { family: "system-ui", weight: "bold" }
            })]
          }),
          minScale: 20000
        }],
        labelsVisible: true,
        popupTemplate: {
          title: "{ad}",
          content: [{ type: "fields", fieldInfos: [{ fieldName: "ad", label: "Mahalle" }] }]
        }
      });
      view.map.add(_mahallelerLayer);
      yuklemeHatasiIzle(_mahallelerLayer);
      console.log("Mahalleler katmanı ilk açılışta oluşturuldu (lazy)");
    }
    return _mahallelerLayer;
  }
  function yollarKatmani() {
    if (!_yollarLayer) {
      _yollarLayer = new FeatureLayer({
        url: MAKS_URL + "/1",
        title: "Yollar",
        visible: false,
        outFields: ["ad"],
        popupTemplate: { title: "{ad}", content: [{ type: "fields", fieldInfos: [{ fieldName: "ad", label: "Yol" }] }] }
      });
      view.map.add(_yollarLayer);
      yuklemeHatasiIzle(_yollarLayer);
      console.log("Yollar katmanı ilk açılışta oluşturuldu (lazy)");
    }
    return _yollarLayer;
  }

  const konumLayer = new GraphicsLayer({ title: "Konum" });

  // ---------- SceneView ----------
  const telefon = window.matchMedia("(max-width: 720px)").matches;
  const view = new SceneView({
    container: "viewDiv",
    map: new WebScene({
      basemap: "hybrid",
      // Gizli katmanlar (Mahalleler/Yollar) ilk açılışta yüklenmez;
      // ilk açıldıklarında haritaya eklenir (ilk açılış performansı).
      // Yükleme önceliği: Numarataj → Yapılar → Konum → 3B Binalar (en son)
      layers: [numaratajLayer, yapilarLayer, konumLayer, binalarLayer]
    }),
    camera: {
      position: { longitude: 32.8387, latitude: 39.9090, z: 650 },
      heading: 355,
      tilt: 70
    },
    environment: {
      // directShadowsEnabled her profilde true — gölgeler her zaman açık kalır.
      // Telefonda qualityProfile "medium" gölge haritasını 1024 px'e düşürür
      // (masaüstünde "high": 2048 px); bu ince ayar ilk açılışı hızlandırır.
      lighting: { type: "virtual", directShadowsEnabled: true },
      atmosphereEnabled: true,
      starsEnabled: false
    },
    qualityProfile: telefon ? "medium" : "high",
    ui: { components: ["attribution"] },
    constraints: { altitude: { min: 10, max: 20000 } }
  });
  window.view = view;

  // Katman yükleme önceliği katılaştırıldı: sıralı zincir — önce Numarataj,
  // sonra Yapılar, en son 3B Binalar (Promise.all değil; her biri bir öncekinin
  // yüklenmesini bekler). Hata durumunda aşağıdaki basarisizKatmanlar akışı
  // devreye girer ve tek satır uyarı + Yeniden dene gösterir.
  const zincirBaslangic = performance.now();
  numaratajLayer.load()
    .then(() => {
      console.log("Yükleme adımı 1/3 Numarataj: " + Math.round(performance.now() - zincirBaslangic) + " ms");
      return yapilarLayer.load();
    })
    .then(() => {
      console.log("Yükleme adımı 2/3 Yapılar: " + Math.round(performance.now() - zincirBaslangic) + " ms");
      return binalarLayer.load();
    })
    .then(() => {
      console.log("Yükleme adımı 3/3 3B Binalar: " + Math.round(performance.now() - zincirBaslangic) + " ms — zincir tamam");
    })
    .catch(err => {
      // Zincir hatası kullanıcıya tek satır bildirimle bildiriliyor; konsol hatasız kalmalı (uçak modu dahil)
      console.warn("Katman yükleme zinciri hatası (ele alındı):", err);
      // Zincir kırılırsa (örn. uçak modunda veri servislerine erişilemezse)
      // tek satır uyarı + Yeniden dene akışına girer; zincir catch'i tutarlı çalışır.
      // yuklemeHatasiIzle aynı katman için zaten uyarı gösterdiyse bildirim yinelenmez
      const yeniVar = [numaratajLayer, yapilarLayer, binalarLayer].some(l => !basarisizKatmanlar.has(l));
      [numaratajLayer, yapilarLayer, binalarLayer].forEach(l => basarisizKatmanlar.add(l));
      if (!yeniVar) return;
      if (!navigator.onLine) gosterBildirim("Çevrimdışı — katmanlar önbellekten deneniyor", katmanlariYenidenDene);
      else gosterBildirim("Bazı katmanlar yüklenemedi", katmanlariYenidenDene);
    });

  // 3B bina katmanı katman listesinde en sonda; kabul denetimi renderer'ını
  // harita üzerinden okur, bu yüzden baştan haritaya ekli kalır
  // ---------- Bilgi penceresi: alt yerleşik (dock), araç çubuğuyla çakışmaz ----------
  view.popup.dockEnabled = true;
  view.popup.dockOptions = { buttonEnabled: false, breakpoint: false, position: "bottom-center" };
  const altCubuk = document.querySelector(".alt-cubuk");
  reactiveUtils.watch(() => view.popup.visible, gorunur => {
    if (altCubuk) altCubuk.style.visibility = gorunur ? "hidden" : "visible";
    if (gorunur) katmanKartiKapat();
  });

  function yukleniyoruKapat() {
    const yukleniyor = document.getElementById("yukleniyor");
    if (yukleniyor) yukleniyor.remove();
  }
  view.when(yukleniyoruKapat).catch(err => {
    console.error("Görünüm yüklenemedi:", err);
    yukleniyoruKapat();
    gosterBildirim("Harita yüklenemedi", () => location.reload());
  });
  setTimeout(yukleniyoruKapat, 9000);

  // Kalıcı açılış özeti: view hazır + 3 katman yüklendi anında tek satır rapor
  const katmanSureleri = {};
  let viewHazirSuresi = null;
  let ozetRaporlandi = false;
  function acilisOzetRaporla() {
    if (ozetRaporlandi || viewHazirSuresi === null) return;
    if (!katmanSureleri["Numarataj"] || !katmanSureleri["Yapılar"] || !katmanSureleri["3B binalar"]) return;
    ozetRaporlandi = true;
    const viewMs = Math.round(viewHazirSuresi - yukleyiciBaslangic);
    console.log(
      "AÇILIŞ ÖZET: yükleyici→view hazır " + viewMs + " ms" +
      " | Numarataj " + Math.round(katmanSureleri["Numarataj"]) + " ms" +
      ", Yapılar " + Math.round(katmanSureleri["Yapılar"]) + " ms" +
      ", 3B binalar " + Math.round(katmanSureleri["3B binalar"]) + " ms" +
      " | hedef <2000"
    );
    if (viewMs > 2000) console.warn("AÇILIŞ ÖZET hedef aşıldı: " + viewMs + " ms");
  }

  // İlk açılış süresi ölçümü (hedef: Anıtkabir görünümü 2 sn altında)
  const acilisBaslangic = performance.now();
  view.when(() => {
    const sure = Math.round(performance.now() - acilisBaslangic);
    viewHazirSuresi = performance.now();
    if (sure > 2000) console.warn("Açılış hedefi aşıldı: " + sure + " ms");
    else console.log("Açılış süresi (Anıtkabir görünümü hazır): " + sure + " ms");
    const y = document.getElementById("yukleniyor");
    if (y) y.setAttribute("aria-valuenow", "3");
    acilisOzetRaporla();
  });

  // Yükleniyor göstergesi gerçek ilerlemeyle bağlanır: görsel sade kalır;
  // ekran okuyucuya hem metin duyurusu hem progressbar değeri gider (WCAG 2.1 AA)
  const yukluEl = document.getElementById("yukleniyor");
  const yukluDuyuru = yukluEl ? yukluEl.querySelector(".gorsel-gizli") : null;
  let yuklenenSayisi = 0;
  const yuklemeBaslangic = performance.now();
  function yuklemeIlerleme(ad) {
    yuklenenSayisi++;
    katmanSureleri[ad] = performance.now() - yuklemeBaslangic;
    acilisOzetRaporla();
    if (yukluEl) {
      yukluEl.setAttribute("aria-valuenow", String(yuklenenSayisi));
      yukluEl.setAttribute("aria-valuetext", ad + " yüklendi (" + yuklenenSayisi + "/3)");
    }
    if (yukluDuyuru) yukluDuyuru.textContent = "Yükleniyor — " + ad + " (" + yuklenenSayisi + "/3)";
    duyur(ad + " yüklendi");
  }
  [[numaratajLayer, "Numarataj"], [yapilarLayer, "Yapılar"], [binalarLayer, "3B binalar"]].forEach(([lyr, ad]) => {
    reactiveUtils.watch(() => lyr.loadStatus, s => {
      if (s === "loaded") {
        yuklemeIlerleme(ad);
        console.log("Katman yükleme süresi: " + Math.round(performance.now() - yuklemeBaslangic) + " ms (" + ad + ")");
      }
    });
  });

  // Katman yüklenemezse kurtarma akışı: tek satır uyarı + "Yeniden dene"
  const basarisizKatmanlar = new Set();
  function katmanlariYenidenDene() {
    if (!basarisizKatmanlar.size) return;
    const liste = Array.from(basarisizKatmanlar);
    basarisizKatmanlar.clear();
    liste.forEach(lyr => {
      lyr.load().catch(() => {
        basarisizKatmanlar.add(lyr);
        gosterBildirim("Bazı katmanlar yüklenemedi", katmanlariYenidenDene);
      });
    });
    duyur("Katmanlar yeniden yükleniyor");
  }
  function yuklemeHatasiIzle(lyr) {
    reactiveUtils.watch(() => lyr.loadStatus, status => {
      if (status === "failed") {
        basarisizKatmanlar.add(lyr);
        gosterBildirim("Bazı katmanlar yüklenemedi", katmanlariYenidenDene);
        console.warn(lyr.title, "yükleme hatası (ele alındı):", lyr.loadError);
      } else if (status === "loaded") {
        basarisizKatmanlar.delete(lyr);
      }
    });
  }
  [binalarLayer, yapilarLayer, numaratajLayer].forEach(yuklemeHatasiIzle);

  // Ağ durumu + çevrimdışı rozeti + önbellek kurtarma akışı
  const cevrimoGosterge = document.getElementById("cevrimo-gosterge");
  function cevrimiGuncelle(sayi) {
    if (!cevrimoGosterge) return;
    const cevrimdasi = !navigator.onLine;
    cevrimoGosterge.hidden = !cevrimdasi;
    if (cevrimdasi) {
      cevrimoGosterge.textContent = (typeof sayi === "number")
        ? "Çevrimdışı · " + sayi + " karo"
        : "Çevrimdışı";
    }
  }
  function karoSayisiAl(geriCagri) {
    if (!("serviceWorker" in navigator)) return;
    const denetci = navigator.serviceWorker.controller;
    if (!denetci) return;
    const kanal = new MessageChannel();
    kanal.port1.onmessage = ev => {
      if (ev.data && ev.data.tip === "KARO_SAYISI") {
        duyur("Önbellekte " + ev.data.sayi + " harita karosu var");
        if (typeof geriCagri === "function") geriCagri(ev.data.sayi);
      }
    };
    denetci.postMessage({ tip: "KARO_SAYISI" }, [kanal.port2]);
  }
  cevrimiGuncelle();
  if (!navigator.onLine) {
    // Sayfa zaten çevrimdışı açıldıysa (uçak modu): service worker hazır olunca
    // rozet karo sayısıyla güncellenir ve tek satır kurtarma bildirimi çıkar
    navigator.serviceWorker.ready.then(() => {
      karoSayisiAl(sayi => cevrimiGuncelle(sayi));
      gosterBildirim("Çevrimdışı — önbellekten açılıyor", katmanlariYenidenDene);
      duyur("Çevrimdışı modda açıldı, önbellekteki alan gösteriliyor");
    });
  }
  window.addEventListener("offline", () => {
    karoSayisiAl(sayi => cevrimiGuncelle(sayi));
    gosterBildirim("Çevrimdışı — önbellekten çalışıyor");
    duyur("Çevrimdışı oldunuz, son görüntülenen alan önbellekten açılır");
  });
  window.addEventListener("online", () => {
    cevrimiGuncelle();
    gosterBildirim("Çevrimiçi");
    duyur("Çevrimiçi oldunuz, eksik katmanlar yeniden deneniyor");
    katmanlariYenidenDene();
    // Çevrimiçi dönüşte görünür alanın karoları ağdan tazelenir
    guncelAlaniTazele();
  });

  // Harita durunca güncel görünür alanın karoları SW'ye önbelleğe bildirilir (yalnızca eksikler çekilir)
  let guncelAlanTimer = null;
  function guncelAlaniGonder() {
    if (!navigator.onLine || !("serviceWorker" in navigator)) return;
    const denetci = navigator.serviceWorker.controller;
    if (!denetci || !view.extent) return;
    const ex = view.extent;
    const z = Math.max(1, Math.round(view.zoom || 15));
    // Portlu gönderilir; sw.js yanıtını (GUNCEL_TAMAM) yalnızca port varsa yollar
    const kanal = new MessageChannel();
    kanal.port1.onmessage = ev => {
      if (ev.data && ev.data.tip === "GUNCEL_TAMAM") {
        console.log("GUNCEL_TAMAM: " + (ev.data.sayi || 0) + " eksik karo önbelleğe alındı");
      }
    };
    denetci.postMessage({
      tip: "GUNCEL_ALAN",
      bbox: { minLon: ex.xmin, minLat: ex.ymin, maxLon: ex.xmax, maxLat: ex.ymax },
      minZoom: Math.max(1, z - 1),
      maxZoom: Math.min(19, z + 1)
    }, [kanal.port2]);
  }
  function guncelAlaniTazele() {
    if (!navigator.onLine || !("serviceWorker" in navigator)) return;
    const denetci = navigator.serviceWorker.controller;
    if (!denetci || !view.extent) return;
    const ex = view.extent;
    const z = Math.max(1, Math.round(view.zoom || 15));
    const kanal = new MessageChannel();
    kanal.port1.onmessage = ev => {
      if (ev.data && ev.data.tip === "TAZELE_TAMAM" && ev.data.sayi > 0) {
        duyur("Görünür alan tazelendi, " + ev.data.sayi + " karo güncellendi");
      }
    };
    denetci.postMessage({
      tip: "TAZELE_ALAN",
      bbox: { minLon: ex.xmin, minLat: ex.ymin, maxLon: ex.xmax, maxLat: ex.ymax },
      minZoom: Math.max(1, z - 1),
      maxZoom: Math.min(19, z + 1)
    }, [kanal.port2]);
  }
  // Harita her durduğunda (pan/zoom bitince) görünür alanı önbelleğe al — throttle'lu
  reactiveUtils.watch(() => view.stationary, durdu => {
    if (!durdu) return;
    clearTimeout(guncelAlanTimer);
    guncelAlanTimer = setTimeout(guncelAlaniGonder, 1200);
  });
  // Çevrimdışıyken rozet üzerindeki karo sayısı periyodik yenilenir;
  // döngü boş Zamana başlar, ilk açılışı yavaşlatmaz
  function karoSayisiDongusu() {
    setInterval(() => { if (!navigator.onLine) karoSayisiAl(sayi => cevrimiGuncelle(sayi)); }, 20000);
  }
  if ("requestIdleCallback" in window) requestIdleCallback(karoSayisiDongusu, { timeout: 8000 });
  else karoSayisiDongusu();

  // ---------- İşaret (arama / konum) ----------
  let seciliIsaret = null;
  function isaretKoy(pt, renk, baslik, icerik) {
    if (seciliIsaret) konumLayer.remove(seciliIsaret);
    seciliIsaret = new Graphic({
      geometry: pt,
      symbol: new PointSymbol3D({
        symbolLayers: [new IconSymbol3DLayer({
          resource: { primitive: "circle" },
          material: { color: renk },
          size: 20,
          outline: { color: [255, 255, 255, 1], width: 2 }
        })]
      }),
      popupTemplate: { title: baslik, content: icerik }
    });
    konumLayer.add(seciliIsaret);
  }

  // ---------- Arama ----------
  const aramaGirdi = document.getElementById("arama-girdi");
  const aramaTemizle = document.getElementById("arama-temizle");
  const aramaSonuclari = document.getElementById("arama-sonuclari");
  let aramaTimer = null;

  function temizleArama() {
    aramaGirdi.value = "";
    aramaTemizle.hidden = true;
    aramaSonuclari.hidden = true;
    aramaGirdi.setAttribute("aria-expanded", "false");
    aramaGirdi.removeAttribute("aria-activedescendant");
    aramaSonuclari.innerHTML = "";
    if (seciliIsaret) { konumLayer.remove(seciliIsaret); seciliIsaret = null; }
  }

  function aramaYap(sorgu) {
    const url = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
    const params = new URLSearchParams({
      f: "json",
      SingleLine: sorgu,
      countryCode: "TUR",
      location: "32.85,39.93",
      maxLocations: "6",
      outFields: "Match_addr"
    });
    const kontrol = new AbortController();
    const zamanlayici = setTimeout(() => kontrol.abort(), 8000);
    fetch(url + "?" + params.toString(), { signal: kontrol.signal })
      .then(r => r.json())
      .finally(() => clearTimeout(zamanlayici))
      .then(veri => {
        aramaSonuclari.innerHTML = "";
        aramaSonuclari.setAttribute("role", "listbox");
        aramaSonuclari.setAttribute("aria-label", "Arama sonuçları");
        if (!veri.candidates || veri.candidates.length === 0) {
          const bos = document.createElement("button");
          bos.type = "button";
          bos.className = "arama-sonuc arama-sonuc--bos";
          bos.textContent = "Sonuç yok";
          bos.setAttribute("role", "option");
          bos.setAttribute("aria-disabled", "true");
          aramaSonuclari.appendChild(bos);
        } else {
          veri.candidates.forEach((c, i) => {
            const adres = c.address || (c.attributes && c.attributes.Match_addr) || "İsimsiz";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "arama-sonuc";
            btn.setAttribute("role", "option");
            btn.id = "arama-opt-" + i;
            btn.setAttribute("aria-selected", "false");
            btn.textContent = adres;
            btn.addEventListener("focus", () => {
              aramaGirdi.setAttribute("aria-activedescendant", btn.id);
              aramaSonuclari.querySelectorAll(".arama-sonuc").forEach(d => {
                d.setAttribute("aria-selected", String(d === btn));
              });
            });
            btn.addEventListener("blur", () => {
              aramaGirdi.removeAttribute("aria-activedescendant");
            });
            btn.addEventListener("click", () => {
              const pt = new Point({ longitude: c.location.x, latitude: c.location.y });
              isaretKoy(pt, [200, 30, 30, 1], "Arama sonucu", adres);
              view.goTo({ target: pt, zoom: 17, tilt: 60 }, { duration: 800 });
              aramaSonuclari.hidden = true;
              aramaGirdi.setAttribute("aria-expanded", "false");
              aramaGirdi.removeAttribute("aria-activedescendant");
              duyur(adres + " seçildi");
            });
            aramaSonuclari.appendChild(btn);
          });
        }
        aramaSonuclari.hidden = false;
        aramaGirdi.setAttribute("aria-expanded", "true");
        duyur(veri.candidates && veri.candidates.length ? veri.candidates.length + " sonuç bulundu" : "Sonuç bulunamadı");
      })
      .catch(err => {
        console.warn("Arama hatası (ele alındı):", err);
        if (err && err.name === "AbortError") gosterBildirim("Arama zaman aşımına uğradı");
        else if (!navigator.onLine) gosterBildirim("Çevrimdışı — arama yapılamadı");
        else gosterBildirim("Arama başarısız oldu");
      });
  }

  aramaGirdi.addEventListener("input", () => {
    aramaTemizle.hidden = !aramaGirdi.value.trim();
    clearTimeout(aramaTimer);
    aramaTimer = setTimeout(() => {
      const q = aramaGirdi.value.trim();
      if (q.length >= 2) aramaYap(q);
      else if (q.length === 0) {
        // Girdi boşaldıysa eski sonuç listesi açık kalmasın
        aramaSonuclari.hidden = true;
        aramaGirdi.setAttribute("aria-expanded", "false");
      }
    }, 500);
  });

  aramaGirdi.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(aramaTimer);
      const q = aramaGirdi.value.trim();
      if (q.length >= 2) aramaYap(q);
    } else if (e.key === "Escape") {
      temizleArama();
      aramaGirdi.focus();
    } else if (e.key === "ArrowDown") {
      const ilk = aramaSonuclari.querySelector(".arama-sonuc");
      if (ilk && !aramaSonuclari.hidden) { e.preventDefault(); ilk.focus(); }
    }
  });

  // Sonuç listesinde ok tuşlarıyla gezinme
  aramaSonuclari.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      aramaSonuclari.hidden = true;
      aramaGirdi.setAttribute("aria-expanded", "false");
      aramaGirdi.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const dugmeler = Array.from(aramaSonuclari.querySelectorAll(".arama-sonuc"));
    const aktifIndeks = dugmeler.indexOf(document.activeElement);
    e.preventDefault();
    if (dugmeler.length === 0) return;
    if (e.key === "ArrowDown") {
      const sonraki = dugmeler[(aktifIndeks + 1) % dugmeler.length];
      if (sonraki) sonraki.focus();
    } else {
      const onceki = dugmeler[(aktifIndeks - 1 + dugmeler.length) % dugmeler.length];
      if (onceki) onceki.focus(); else aramaGirdi.focus();
    }
  });

  aramaTemizle.addEventListener("click", temizleArama);

  document.addEventListener("click", e => {
    if (!e.target.closest(".arama-kutu") && !aramaSonuclari.hidden) {
      aramaSonuclari.hidden = true;
      aramaGirdi.setAttribute("aria-expanded", "false");
    }
  });

  // ---------- Konumumu bul + canlı takip ----------
  const btnKonum = document.getElementById("btn-konum");
  let watchId = null;
  function konumaGit(pt) {
    isaretKoy(pt, [30, 100, 200, 1], "Konumunuz", "");
    view.goTo({ target: pt, zoom: 17, tilt: 60 }, { duration: 800 });
  }
  btnKonum.addEventListener("click", () => {
    titresim();
    if (!navigator.geolocation) { gosterBildirim("Konum alınamadı"); return; }
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      btnKonum.classList.remove("takipte");
      gosterBildirim("Konum takibi kapandı");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        konumaGit(new Point({ longitude: pos.coords.longitude, latitude: pos.coords.latitude }));
        watchId = navigator.geolocation.watchPosition(
          p => konumaGit(new Point({ longitude: p.coords.longitude, latitude: p.coords.latitude })),
          () => {},
          { enableHighAccuracy: true }
        );
        btnKonum.classList.add("takipte");
      },
      () => gosterBildirim("Konum alınamadı"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ---------- Anıtkabir'e dön ----------
  document.getElementById("btn-anitkabir").addEventListener("click", () => {
    titresim();
    view.goTo({
      position: { longitude: 32.8387, latitude: 39.9090, z: 650 },
      heading: 355,
      tilt: 70
    }, { duration: 1000 });
  });

  // ---------- Kuzeye çevir ----------
  const kuzeySimge = document.getElementById("kuzey-simge");
  document.getElementById("btn-kuzey").addEventListener("click", () => {
    titresim();
    view.goTo({ heading: 0 }, { duration: 600 });
  });
  reactiveUtils.watch(() => view.camera.heading, h => {
    if (kuzeySimge) kuzeySimge.style.transform = "rotate(" + (-h) + "deg)";
  });

  // ---------- Katman kartı ----------
  const katmanKarti = document.getElementById("katman-karti");
  const btnKatmanlar = document.getElementById("btn-katmanlar");
  btnKatmanlar.setAttribute("aria-controls", "katman-karti");
  const cbBinalar = document.getElementById("cb-binalar");
  const cbYapilar = document.getElementById("cb-yapilar");
  const cbNumarataj = document.getElementById("cb-numarataj");
  const cbMahalleler = document.getElementById("cb-mahalleler");
  const cbYollar = document.getElementById("cb-yollar");
  const tabanUydu = document.getElementById("taban-uydu");
  const tabanHarita = document.getElementById("taban-harita");

  btnKatmanlar.addEventListener("click", () => {
    titresim();
    const acilacak = katmanKarti.hidden;
    katmanKarti.hidden = !acilacak;
    btnKatmanlar.setAttribute("aria-expanded", String(acilacak));
    if (acilacak) {
      const ilk = katmanKarti.querySelector("input");
      if (ilk) ilk.focus();
      duyur("Katmanlar paneli açıldı");
    }
  });

  function katmanKartiKapat() {
    const odakKartta = katmanKarti.contains(document.activeElement);
    katmanKarti.hidden = true;
    btnKatmanlar.setAttribute("aria-expanded", "false");
    if (odakKartta) btnKatmanlar.focus();
  }
  document.addEventListener("click", e => {
    if (!e.target.closest(".katman-karti") && !e.target.closest("#btn-katmanlar")) {
      katmanKartiKapat();
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !katmanKarti.hidden) { katmanKartiKapat(); return; }
    // Kart açıkken Tab/Shift+Tab kart içinde döngüsel kalsın
    if (e.key === "Tab" && !katmanKarti.hidden) {
      const odaklilar = katmanKarti.querySelectorAll("input, button");
      if (!odaklilar.length) return;
      const ilk = odaklilar[0], son = odaklilar[odaklilar.length - 1];
      if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus(); }
      else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
    }
  });

  [
    [cbBinalar, () => binalarLayer, "3B Binalar"],
    [cbYapilar, () => yapilarLayer, "Yapılar"],
    [cbNumarataj, () => numaratajLayer, "Numarataj"],
    [cbMahalleler, mahallelerKatmani, "Mahalleler"],
    [cbYollar, yollarKatmani, "Yollar"]
  ].forEach(([cb, katmanAl, ad]) => {
    cb.addEventListener("change", () => {
      titresim();
      // Gizli katmanlar (Mahalleler/Yollar) fabrika ile ilk açılışlarında
      // tek seferlik oluşturulup haritaya eklenir; sonraki aç/kapa yalnızca visible.
      const lyr = katmanAl();
      lyr.visible = cb.checked;
      duyur(ad + (cb.checked ? " açıldı" : " kapatıldı"));
    });
  });

  function tabanSec(taban) {
    // Çevrimdışı taban geçişi: vektör taban kaynakları ve karolar önbellekten
    // sunulur; kullanıcı tek satır bildirimle bilgilendirilir
    if (!navigator.onLine) gosterBildirim("Çevrimdışı — taban önbellekten açıldı");
    view.map.basemap = taban;
    tabanUydu.setAttribute("aria-pressed", String(taban === "hybrid"));
    tabanHarita.setAttribute("aria-pressed", String(taban === "streets-vector"));
    duyur(taban === "hybrid" ? "Uydu taban seçildi" : "Harita taban seçildi");
  }
  tabanUydu.addEventListener("click", () => tabanSec("hybrid"));
  tabanHarita.addEventListener("click", () => tabanSec("streets-vector"));
  // Taban seçiminde ok tuşlarıyla gezinme
  document.querySelector(".taban-secimi").addEventListener("keydown", e => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    tabanSec(e.key === "ArrowRight" ? "streets-vector" : "hybrid");
  });

  // ---------- Durum satırı: koordinat/zoom/eğim/yön (yalnızca masaüstünde görünür) ----------
  const durumSatiri = document.getElementById("durum-satiri");
  let sonDurumLon = null, sonDurumLat = null;
  function durumGuncelle() {
    if (!durumSatiri) return;
    const c = view.camera;
    if (!c || !c.position) return;
    const zoom = view.zoom, egim = c.tilt, yonHam = c.heading;
    const lon = sonDurumLon !== null ? sonDurumLon : c.position.longitude;
    const lat = sonDurumLat !== null ? sonDurumLat : c.position.latitude;
    // view hazır olmadan (view.when öncesi) bu alanlar undefined olabilir;
    // hepsi geçerli sayı olmadan hiçbir .toFixed çağrısı yapılmaz
    if (!Number.isFinite(zoom) || !Number.isFinite(egim) || !Number.isFinite(yonHam) ||
        !Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const yon = ((yonHam % 360) + 360) % 360;
    durumSatiri.textContent =
      lat.toFixed(5) + ", " + lon.toFixed(5) +
      "  ·  zoom " + zoom.toFixed(1) +
      "  ·  eğim " + egim.toFixed(0) + "°" +
      "  ·  yön " + yon.toFixed(0) + "°";
  }
  view.on("pointer-move", e => {
    const p = view.toMap({ x: e.x, y: e.y });
    if (p && Number.isFinite(p.longitude) && Number.isFinite(p.latitude)) {
      sonDurumLon = p.longitude;
      sonDurumLat = p.latitude;
      durumGuncelle();
    }
  });
  reactiveUtils.watch(
    () => [view.zoom, view.camera && view.camera.tilt, view.camera && view.camera.heading, view.camera && view.camera.position && view.camera.position.longitude, view.camera && view.camera.position && view.camera.position.latitude],
    () => durumGuncelle()
  );
  // Durum satırının ilk güncellemesi boş zamana kaydırılır (ilk açılış boyamasını etkilemez)
  if ("requestIdleCallback" in window) requestIdleCallback(() => durumGuncelle(), { timeout: 4000 });
  else durumGuncelle();

  // ---------- PWA service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
    // Açılış alanı (Anıtkabir çevresi) karo ön-yüklemesi: ilk çevrimiçi açılışta tek sefer
    navigator.serviceWorker.ready.then(sw => {
      if (!sw.controller || !navigator.onLine) return;
      let yapildi = false;
      try { yapildi = localStorage.getItem("ankara3d-onbellek") === "1"; } catch (_) {}
      if (yapildi) return;
      // Açılış alanı önbelleği boş zamanda yapılır; ilk açılışı yavaşlatmaz
      const gonder = () => {
      const kanal = new MessageChannel();
      kanal.port1.onmessage = ev => {
        if (ev.data && ev.data.tip === "ONBELLEKLE_TAMAM") {
          try { localStorage.setItem("ankara3d-onbellek", "1"); } catch (_) {}
          duyur("Açılış alanı çevrimdışı için önbelleğe alındı, " + ev.data.sayi + " karo");
        }
      };
      sw.controller.postMessage({
        tip: "ONBELLEKLE_ALAN",
        bbox: { minLon: 32.815, minLat: 39.895, maxLon: 32.865, maxLat: 39.945 },
        minZoom: 15,
        maxZoom: 17
      }, [kanal.port2]);
      };
      if ("requestIdleCallback" in window) requestIdleCallback(gonder, { timeout: 8000 });
      else setTimeout(gonder, 3000);
    });
  }

  // ---------- PWA kurulum düğmesi (beforeinstallprompt, tek seferlik) ----------
  const btnKurulum = document.getElementById("btn-kurulum");
  let kurulumIstemi = null;
  const kuruluMu = () => {
    // Uygulama zaten ana ekrandan (kurulu) açılıyorsa düğme hiç gösterilmez
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    if (navigator.standalone === true) return true;
    try { return localStorage.getItem("ankara3d-kurulu") === "1"; } catch (_) { return false; }
  };
  function kurulumDugmesiniGizle() {
    if (btnKurulum) btnKurulum.hidden = true;
    kurulumIstemi = null;
  }
  if (btnKurulum && !kuruluMu()) {
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();
      kurulumIstemi = e;
      btnKurulum.hidden = false;
      duyur("Uygulama kurulabilir, üstteki Kur düğmesine dokunun");
    });
    window.addEventListener("appinstalled", () => {
      try { localStorage.setItem("ankara3d-kurulu", "1"); } catch (_) {}
      kurulumDugmesiniGizle();
      gosterBildirim("Ankara 3D kuruldu");
      duyur("Ankara 3D ana ekrana eklendi");
    });
    btnKurulum.addEventListener("click", async () => {
      if (!kurulumIstemi) return;
      titresim();
      try {
        kurulumIstemi.prompt();
        const secim = await kurulumIstemi.userChoice;
        if (secim && secim.outcome === "accepted") {
          try { localStorage.setItem("ankara3d-kurulu", "1"); } catch (_) {}
          kurulumDugmesiniGizle();
          gosterBildirim("Ankara 3D kuruldu");
        }
      } catch (err) {
        console.error("Kurulum istemi hatası:", err);
      }
      kurulumIstemi = null;
    });
  } else if (btnKurulum) {
    btnKurulum.hidden = true;
  }

  // Test/teşhis kancası (zararsız): arayüzü kirletmeden çevrimdışı akışlarını
  // ve sw mesajlarını elle tetlemeye yarar; üretim arayüzünde hiçbir etkisi yok
  window.__cevrimiTest = {
    cevrimdasi: () => !navigator.onLine,
    karoSayisi: cb => karoSayisiAl(cb),
    guncelAlaniGonder: guncelAlaniGonder,
    guncelAlaniTazele: guncelAlaniTazele,
    katmanlariYenidenDene: katmanlariYenidenDene,
    bildirim: m => gosterBildirim(m)
  };

  console.log("Ankara 3D hazır.");
});
// Sayfa hazırlığı: script body sonunda yüklendiği için DOM zaten hazır;
// ek bir dojo bağımlılığı KULLANILMAZ (4.32 AMD yükleyicisinde yok).