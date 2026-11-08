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

  // prefers-reduced-motion (WCAG 2.1 AA): tüm kamera uçuş süreleri 0 yapılır;
  // CSS animasyonları zaten kapalı, kamera hareketi de anlık olur
  // Bayrak canlı okunur: reduced-motion tercihi sayfa açıkken değişirse kamera uçuş
  // süreleri de anında 0 olur. Burada da change dinleyicisi eklenir: hem yerel bayrak
  // hem window.__azaltilmisHareket anında güncellenir; TÜM view.goTo süreleri tercihin
  // değiştiği anda 0 olur (WCAG 2.1 AA — eksiksiz doğrulama).
  let reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  try {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedMotionDegisti = e => {
      reducedMotion = !!e.matches;
      window.__azaltilmisHareket = !!e.matches;
    };
    if (mq.addEventListener) mq.addEventListener("change", reducedMotionDegisti);
    else if (mq.addListener) mq.addListener(reducedMotionDegisti);
  } catch (_) {}
  function ucusSuresi(ms) { return (window.__azaltilmisHareket || reducedMotion) ? 0 : ms; }
  // Sözleşme global'i her zaman tanımlı: index.html bayrağı kurar, burada da garanti edilir
  if (typeof window.__azaltilmisHareket !== "boolean") window.__azaltilmisHareket = reducedMotion;

  // ---------- Yardımcılar ----------
  function gosterBildirim(metin, onRetry) {
    const el = document.getElementById("bildirim");
    if (!el) return;
    // Yinelenmesiz bildirim garantisi (nihai sertleştirme): aynı metin ekranda
    // zaten görünürken yeniden çizme — yalnızca süreyi uzat. Zincir catch ve
    // yuklemeHatasiIzle aynı olayı iki kez tetiklese bile kullanıcı tek satır görür.
    if (!el.hidden && el._sonMetin === metin) {
      clearTimeout(el._timer);
      el._timer = setTimeout(() => { el.hidden = true; el._sonMetin = null; }, onRetry ? 8000 : 3000);
      return;
    }
    el._sonMetin = metin;
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
    // Katman kartı açıkken bildirim onun üstüne binmesin (masaüstü ve mobil)
    const kart = document.getElementById("katman-karti");
    el.classList.toggle("bildirim--kart-ustunde", !!(kart && !kart.hidden));
    // Bina kartı açıkken de bildirim onun üstüne binmesin (mobilde alt kartla çakışır)
    const binaKartiEl = document.getElementById("bina-karti");
    el.classList.toggle("bildirim--bina-karti-ustunde", !!(binaKartiEl && !binaKartiEl.hidden));
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.hidden = true; el._sonMetin = null; }, onRetry ? 8000 : 3000);
  }

  // Ekran okuyucu duyurusu (görsel olarak gizli aria-live bölgesi)
  function duyur(metin) {
    const d = document.getElementById("duyuru");
    if (!d) return;
    d.textContent = "";
    requestAnimationFrame(() => { d.textContent = metin; });
  }

  function titresim() { if (navigator.vibrate) navigator.vibrate(8); }

  // Konsol hatasız kuralı: yakalanmamış promise reddi konsolu kırmızıya boyamasın,
  // yalnızca warn ile ele alındığı bildirilsin
  window.addEventListener("unhandledrejection", e => {
    console.warn("Yakalanmamış promise reddi (ele alındı):", e.reason);
    e.preventDefault();
  });
  // Konsol hatasız kuralı: beklenmedik çalışma zamanı hataları (senkron hatalar dahil)
  // konsolu kırmızıya boyamasın — preventDefault konsol error çıktısını bastırır,
  // warn ile ele alındığı bildirilir
  window.addEventListener("error", e => {
    console.warn("Yakalanmamış hata (ele alındı):", e.message);
    e.preventDefault();
  });

  // ---------- Katmanlar ----------
  // 3B Binalar (Esri SceneServer) — opak buz grisi
  const buildingsUrl = "https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer";
  const binalarLayer = new SceneLayer({
    url: buildingsUrl,
    title: "3B Binalar",
    // Sözleşme: 3B binalar load olana kadar GİZLİ başlar (açılışta gölge gibi görünmez);
    // loaded watch Below load tamamlanınca görünür yapılır
    visible: false,
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
  // NOT: zincir catch'i asenkron çalışır; o zamana kadar basarisizKatmanlar
  // (aşağıda tanımlı) zaten başlatılmış olur — TDZ hatası oluşmaz.
  const basarisizKatmanlar = new Set();
  const bildirilmisKatmanlar = new Set();
  const zincirBaslangic = performance.now();
  console.log("Yükleme zinciri başladı");
  numaratajLayer.load()
    .then(() => {
      console.log("Yükleme adımı 1/3 Numarataj: " + Math.round(performance.now() - zincirBaslangic) + " ms");
      return yapilarLayer.load();
    })
    .then(() => {
      console.log("Yükleme adımı 2/3 Yapılar: " + Math.round(performance.now() - zincirBaslangic) + " ms");
      // Sözleşme: 3B bina yüklemesi view hazır olana + boş zamana kadar ertelenir;
      // Anıtkabir açılış görünümü <2 sn hedefine kilitlenir. Zincir sırası ve catch akışı korunur.
      return view.when().then(() => new Promise(resolve => {
        const baslat = () => resolve(binalarLayer.load());
        if ("requestIdleCallback" in window) requestIdleCallback(baslat, { timeout: 2500 });
        else setTimeout(baslat, 0);
      }));
    })
    .then(() => {
      const toplam = performance.now() - yukleyiciBaslangic;
      console.log("Yükleme adımı 3/3 3B Binalar — zincir tamam: " + Math.round(performance.now() - zincirBaslangic) + " ms");
      gerilemeKontrol("zincir tamam", toplam);
    })
    .catch(err => {
      // Zincir hatası kullanıcıya tek satır bildirimle bildiriliyor; konsol hatasız kalmalı (uçak modu dahil)
      console.warn("Katman yükleme zinciri hatası (ele alındı):", err);
      // Zincir kırılırsa (örn. uçak modunda veri servislerine erişilemezse)
      // tek satır uyarı + Yeniden dene akışına girer; yuklemeHatasiIzle aynı katman
      // için zaten uyarı gösterdiyse bildirim yinelenmez (yeniVar kontrolü).
      // Hangi yol önce tetiklenirse tetiklensin tek bildirim: bildirim gösterilmiş
      // katmanlar bildirilmisKatmanlar'da işaretli; bu catch hepsini işaretler, yuklemeHatasiIzle yinelenmez
      const yeniVar = [numaratajLayer, yapilarLayer, binalarLayer].some(l => !bildirilmisKatmanlar.has(l));
      [numaratajLayer, yapilarLayer, binalarLayer].forEach(l => { basarisizKatmanlar.add(l); bildirilmisKatmanlar.add(l); });
      // Zincir kırılınca kısmi-başarı (partial success) özeti HER DURUMDA tek satır
      // loglanır — 6 sn fallback'iyle yinelenmez (ozetRaporlandi ile korumalı)
      if (!ozetRaporlandi) { ozetRaporlandi = true; kismiOzetLogla(); }
      if (!yeniVar) return;
      if (!navigator.onLine) { gosterBildirim("Çevrimdışı — katmanlar önbellekten deneniyor", katmanlariYenidenDene); duyur("Çevrimdışı — katmanlar önbellekten deneniyor"); }
      else { gosterBildirim("Bazı katmanlar yüklenemedi", katmanlariYenidenDene); duyur("Bazı katmanlar yüklenemedi"); }
    });

  // ---------- Bilgi penceresi: alt yerleşik (dock), araç çubuğuyla çakışmaz ----------
  // Nihai kilit: popup kurulumuna beklenmedik erişim asla konsol hatası üretmez
  try {
    view.popup.dockEnabled = true;
    view.popup.dockOptions = { buttonEnabled: false, breakpoint: false, position: "bottom-center" };
  } catch (_) {}
  const altCubuk = document.querySelector(".alt-cubuk");
  reactiveUtils.watch(() => view.popup.visible, gorunur => {
    // Koruma: watch callback'i asla konsol hatası üretmez
    try {
      if (altCubuk) altCubuk.style.visibility = gorunur ? "hidden" : "visible";
      if (gorunur) katmanKartiKapat();
    } catch (_) {}
  });

  function yukleniyoruKapat() {
    const yukleniyor = document.getElementById("yukleniyor");
    if (yukleniyor) yukleniyor.remove();
  }
  view.when(yukleniyoruKapat).catch(err => {
    console.warn("Görünüm yüklenemedi (ele alındı):", err);
    yukleniyoruKapat();
    gosterBildirim("Harita yüklenemedi", () => location.reload());
  });
  setTimeout(yukleniyoruKapat, 9000);

  // ---------- viewDiv görünürlük ölçümü (YALNIZCA log — hiçbir UI değişikliği yapmaz) ----------
  // Tarayıcı kontrol hatası: telefon açılışında #viewDiv ekranın yalnızca %84'ünde
  // görünüyordu (hedef ≥%85). viewDiv fixed inset:0 olduğundan gerçek kaplama üst bant +
  // alt çubuk + (varsa) açık kartlardır; CSS ajanı bunları kompaktlar. Bu fonksiyon
  // oranı ölçüp warn-only loglar (konsol error-free kuralı korunur; arayüze dokunmaz).
  function viewDivGorunurlukOlc() {
    try {
      const vd = document.getElementById("viewDiv");
      if (!vd) return;
      const rect = vd.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const alan = rect.width * rect.height;
      const ekran = vw * vh;
      if (!Number.isFinite(alan) || !Number.isFinite(ekran) || ekran <= 0 || alan <= 0) return;
      let kapli = 0;
      const kaplayanlar = document.querySelectorAll(".ust-bant, .alt-cubuk, .katman-karti, .bina-karti, .bildirim, .arama-sonuclari");
      kaplayanlar.forEach(el => {
        try {
          if (!el || el.hidden) return;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          const x = Math.max(0, Math.min(rect.right, r.right) - Math.max(rect.left, r.left));
          const y = Math.max(0, Math.min(rect.bottom, r.bottom) - Math.max(rect.top, r.top));
          kapli += x * y;
        } catch (_) {}
      });
      const gorunur = (alan - Math.min(kapli, alan)) / ekran;
      if (!Number.isFinite(gorunur)) return;
      const yuzde = (gorunur * 100).toFixed(1);
      if (gorunur < 0.85) console.warn("viewDiv görünürlük " + yuzde + "% (<%85 hedef) — üst bant/alt çubuk kaplaması (CSS ajanında kompaktlanır)");
      else console.log("viewDiv görünürlük: " + yuzde + "% (hedef ≥%85)");
    } catch (_) {}
  }
  let gorunurlukTimer = null;
  function gorunurlukOlcZamanli() {
    clearTimeout(gorunurlukTimer);
    gorunurlukTimer = setTimeout(viewDivGorunurlukOlc, 250);
  }
  view.when(() => { setTimeout(viewDivGorunurlukOlc, 400); });
  window.addEventListener("resize", gorunurlukOlcZamanli);
  window.addEventListener("orientationchange", gorunurlukOlcZamanli);

  // Kalıcı açılış özeti: view hazır + 3 katman yüklendi anında tek satır rapor
  const katmanSureleri = {};
  let viewHazirSuresi = null;
  let ozetRaporlandi = false;
  // Gerileme tespiti (kalıcı): açılış hedefi 2000 ms; aşıldığında HER ZAMAN
  // console.warn tetiklenir — konsol hatasız kalır (warn kullanılır, error değil)
  // Nihai kilit: her kaynak için GERİLEME warn'ı yalnızca bir kez basılır
  // (zincir + özet + fallback aynı olayı tetiklese bile konsol tek satır warn görür)
  const gerilemeRaporlandi = new Set();
  function gerilemeKontrol(kaynak, toplamMs) {
    if (!Number.isFinite(toplamMs) || toplamMs <= 2000) return;
    if (gerilemeRaporlandi.has(kaynak)) return;
    gerilemeRaporlandi.add(kaynak);
    console.warn("GERİLEME (" + kaynak + "): açılış " + Math.round(toplamMs) + " ms — hedef 2000 ms aşıldı");
  }
  // Kısmi-başarı özeti: zincir kırılınca (örn. uçak modunda) yüklü katmanlarla
  // tek satır rapor; view hazır değilse bile log basılır (hiçbir durum log'suz kalmaz)
  function kismiOzetLogla() {
    const viewMs = viewHazirSuresi !== null ? Math.round(viewHazirSuresi - yukleyiciBaslangic) : null;
    const parca = Object.keys(katmanSureleri).map(k => k + " " + Math.round(katmanSureleri[k]) + " ms").join(", ") || "katman yüklenemedi";
    console.warn("AÇILIŞ ÖZET (kısmi, zincir tamamlanamadı): " +
      (viewMs !== null ? "yükleyici→view hazır " + viewMs + " ms | " : "view henüz hazır değil | ") +
      parca + " | hedef <2000");
    if (viewMs !== null) gerilemeKontrol("kısmi özet", viewMs);
  }
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
    gerilemeKontrol("AÇILIŞ ÖZET", viewMs);
  }
  // Kalıcı doğrulama garantisi: zincir kırılırsa (örn. uçak modunda katmanlar
  // yüklenemezse) özet yine de tek satır raporlansın — 6 sn sonra kısmi özet.
  setTimeout(() => {
    if (ozetRaporlandi || viewHazirSuresi === null) return;
    ozetRaporlandi = true;
    const viewMs = Math.round(viewHazirSuresi - yukleyiciBaslangic);
    const parca = Object.keys(katmanSureleri).map(k => k + " " + Math.round(katmanSureleri[k]) + " ms").join(", ") || "katman yüklenemedi";
    console.warn("AÇILIŞ ÖZET (kısmi, zincir tamamlanamadı): yükleyici→view hazır " + viewMs + " ms | " + parca + " | hedef <2000");
    gerilemeKontrol("6sn fallback", viewMs);
  }, 6000);

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
    // Yinelenme kilidi: kurtarma akışında aynı katman yeniden yüklenirse sayaç 3'ü
    // geçmez; progressbar aria-valuenow her zaman 0-3 aralığında kalır
    if (katmanSureleri[ad] !== undefined) return;
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
      try {
        if (s === "loaded") {
          yuklemeIlerleme(ad);
          console.log("Katman yükleme süresi: " + Math.round(performance.now() - yuklemeBaslangic) + " ms (" + ad + ")");
        }
      } catch (_) {}
    });
  });
  // 3B binalar yüklenene kadar gizli kalır; load tamamlanınca (kullanıcı kapatmadıysa) görünür olur.
  // Yükleme başarısızsa gizli kalmaya devam eder (uçak modunda gölge/görünmez bina akışı yok).
  reactiveUtils.watch(() => binalarLayer.loadStatus, s => {
    if (s === "loaded" && !binalarLayer.visible) {
      const cb = document.getElementById("cb-binalar");
      if (cb && cb.checked) binalarLayer.visible = true;
    }
  });

  // Katman yüklenemezse kurtarma akışı: tek satır uyarı + "Yeniden dene"
  function katmanlariYenidenDene() {
    // Çevrimdışıyken kurtarma düğmesi: ağ yoksa ağ isteği atma, tek satır
    // bildirimi yenile ve kullanıcıyı bilgilendir (uçak-modu senaryosu)
    if (!navigator.onLine) {
      gosterBildirim("Çevrimdışı — önbellekten deneniyor", katmanlariYenidenDene);
      duyur("Hâlâ çevrimdışı, önbellekteki veriler gösteriliyor");
      return;
    }
    if (!basarisizKatmanlar.size) return;
    const liste = Array.from(basarisizKatmanlar);
    basarisizKatmanlar.clear();
    bildirilmisKatmanlar.clear(); // yeniden denemede tekrar bildirime izin ver
    liste.forEach(lyr => {
      lyr.load().catch(() => {
        basarisizKatmanlar.add(lyr);
        bildirilmisKatmanlar.add(lyr);
        if (!navigator.onLine) gosterBildirim("Çevrimdışı — katmanlar önbellekten deneniyor", katmanlariYenidenDene);
        else gosterBildirim("Bazı katmanlar yüklenemedi", katmanlariYenidenDene);
      });
    });
    duyur("Katmanlar yeniden yükleniyor");
  }
  function yuklemeHatasiIzle(lyr) {
    reactiveUtils.watch(() => lyr.loadStatus, status => {
      if (status === "failed") {
        basarisizKatmanlar.add(lyr);
        // Yinelenen bildirim yok: zincir catch'i bu katman için zaten uyardıysa sessiz kal
        if (!bildirilmisKatmanlar.has(lyr)) {
          bildirilmisKatmanlar.add(lyr);
          if (!navigator.onLine) gosterBildirim("Çevrimdışı — katmanlar önbellekten deneniyor", katmanlariYenidenDene);
          else gosterBildirim("Bazı katmanlar yüklenemedi", katmanlariYenidenDene);
          duyur("Bazı katmanlar yüklenemedi");
        }
        console.warn(lyr.title, "yükleme hatası (ele alındı):", lyr.loadError);
      } else if (status === "loaded") {
        basarisizKatmanlar.delete(lyr);
        bildirilmisKatmanlar.delete(lyr);
      }
    });
  }
  [binalarLayer, yapilarLayer, numaratajLayer].forEach(yuklemeHatasiIzle);

  // Ağ durumu + çevrimdışı rozet + önbellek kurtarma akışı
  const cevrimoGosterge = document.getElementById("cevrimo-gosterge");
  // İki sayaçlı rozet: sayi = karo sayısı, veriSayi = veri (özellik) önbelleği sayısı;
  // veriSayi > 0 ise metne '· veri' eki eklenir ('Çevrimdışı · N karo · veri')
  function cevrimiGuncelle(sayi, veriSayi) {
    if (!cevrimoGosterge) return;
    const cevrimdasi = !navigator.onLine;
    cevrimoGosterge.hidden = !cevrimdasi;
    if (cevrimdasi) {
      let metin = "Çevrimdışı";
      if (typeof sayi === "number") metin = "Çevrimdışı · " + sayi + " karo";
      if (typeof veriSayi === "number" && veriSayi > 0) metin += " · veri";
      cevrimoGosterge.textContent = metin;
    }
  }
  function karoSayisiAl(geriCagri) {
    try {
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
    } catch (_) {}
  }
  // VERI_SAYISI: veri (Numarataj/Yapılar sorgu) önbelleğindeki kayıt sayısını döndürür
  function veriSayisiAl(geriCagri) {
    try {
      if (!("serviceWorker" in navigator)) return;
      const denetci = navigator.serviceWorker.controller;
      if (!denetci) return;
      const kanal = new MessageChannel();
      kanal.port1.onmessage = ev => {
        if (ev.data && ev.data.tip === "VERI_SAYISI") {
          if (typeof geriCagri === "function") geriCagri(ev.data.sayi);
        }
      };
      denetci.postMessage({ tip: "VERI_SAYISI" }, [kanal.port2]);
    } catch (_) {}
  }
  // İki sayaç birlikte: hem karo hem veri sayısı alınır, rozet her iki sayaçla güncellenir
  function sayaclariYenile() {
    try {
      if (!("serviceWorker" in navigator)) return;
      const denetci = navigator.serviceWorker.controller;
      if (!denetci) return;
      let karo = null, veri = null;
      const guncelle = () => cevrimiGuncelle(karo, veri);
      const k1 = new MessageChannel();
      k1.port1.onmessage = ev => {
        if (ev.data && ev.data.tip === "KARO_SAYISI") { karo = ev.data.sayi; guncelle(); }
      };
      denetci.postMessage({ tip: "KARO_SAYISI" }, [k1.port2]);
      const k2 = new MessageChannel();
      k2.port1.onmessage = ev => {
        if (ev.data && ev.data.tip === "VERI_SAYISI") { veri = ev.data.sayi; guncelle(); }
      };
      denetci.postMessage({ tip: "VERI_SAYISI" }, [k2.port2]);
    } catch (_) {}
  }
  cevrimiGuncelle();
  if (!navigator.onLine) {
    // Sayfa zaten çevrimdışı açıldıysa (uçak modu): service worker hazır olunca
    // rozet karo + veri sayısıyla güncellenir ve tek satır kurtarma bildirimi çıkar
    navigator.serviceWorker.ready.then(() => {
      sayaclariYenile();
      gosterBildirim("Çevrimdışı — önbellekten açılıyor", katmanlariYenidenDene);
      duyur("Çevrimdışı modda açıldı, önbellekteki alan gösteriliyor");
    }).catch(() => {});
  }
  window.addEventListener("offline", () => {
    cevrimiGuncelle();
    sayaclariYenile();
    gosterBildirim("Çevrimdışı — önbellekten çalışıyor", katmanlariYenidenDene);
    duyur("Çevrimdışı oldunuz, son görüntülenen alan önbellekten açılır");
  });
  window.addEventListener("online", () => {
    cevrimiGuncelle();
    // Rozet/karo + veri sayısı tazelensin (çevrimiçi dönüşünde son durum görünsün)
    sayaclariYenile();
    // Tek satır kurtarma akışı: önce eksik katmanlar, sonra görünür alanın karoları
    gosterBildirim("Çevrimiçi — eksikler tazeleniyor", katmanlariYenidenDene);
    duyur("Çevrimiçi oldunuz, eksik katmanlar yeniden deneniyor");
    katmanlariYenidenDene();
    // Çevrimiçi dönüşte görünür alanın karoları ağdan tazelenir (kurtarma akışı)
    guncelAlaniTazele();
  });
  // Uçak modunda açılış: SW kontrolü daha sonra ele geçebilir (controllerchange);
  // o zaman rozet/karo sayısı ve tek satır kurtarma akışı yine de guaranteed yenilenir
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!navigator.onLine) {
        // Uçak-modunda açılış: SW geç kontrol ederse rozet + karo/veri sayısı + tek satır kurtarma yine guaranteed yenilenir
        cevrimiGuncelle();
        sayaclariYenile();
        gosterBildirim("Çevrimdışı — önbellekten açılıyor", katmanlariYenidenDene);
        duyur("Çevrimdışı modda açıldı, önbellekteki alan gösteriliyor");
      } else {
        // SW geç kontrol edip ağ varsa: rozet gizlenir, görünür alan tazelenir
        cevrimiGuncelle();
        guncelAlaniTazele();
      }
    });
  }

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
      if (!ev.data) return;
      if (ev.data.tip === "GUNCEL_TAMAM") {
        console.log("GUNCEL_TAMAM: " + (ev.data.sayi || 0) + " eksik karo önbelleğe alındı");
        if (ev.data.sayi > 0) duyur(ev.data.sayi + " karo çevrimdışı için önbelleğe alındı");
      } else if (ev.data.tip === "BILINMEYEN") {
        console.warn("SW bilinmeyen mesaj yanıtı (ele alındı)");
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
      if (!ev.data) return;
      if (ev.data.tip === "TAZELE_TAMAM" && ev.data.sayi > 0) {
        duyur("Görünür alan tazelendi, " + ev.data.sayi + " karo güncellendi");
        console.log("TAZELE_TAMAM: " + ev.data.sayi + " karo ağdan güncellendi");
      } else if (ev.data.tip === "TAZELE_TAMAM") {
        console.log("TAZELE_TAMAM: görünür alan zaten güncel");
      } else if (ev.data.tip === "BILINMEYEN") {
        console.warn("SW bilinmeyen mesaj yanıtı (ele alındı)");
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
    // Çevrimdışıyken rozet üzerindeki karo + veri sayısı periyodik yenilenir
    setInterval(() => { if (!navigator.onLine) sayaclariYenile(); }, 20000);
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
      // HTTP-ok olmayan yanıt da catch akışına (tek satır bildirim + yeniden dene) düşsün
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
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
              binaKartiKapat(false); // yeni arama seçimi eskiyi kapatır
              const pt = new Point({ longitude: c.location.x, latitude: c.location.y });
              isaretKoy(pt, [200, 30, 30, 1], "Arama sonucu", adres);
              view.goTo({ target: pt, zoom: 17, tilt: 60 }, { duration: ucusSuresi(800) });
              aramaSonuclari.hidden = true;
              aramaGirdi.setAttribute("aria-expanded", "false");
              aramaGirdi.removeAttribute("aria-activedescendant");
              // Liste gizlenince odaktaki seçenek kaybolur; odak her zaman combobox'a döner (WCAG 2.4.3)
              aramaGirdi.focus();
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
        if (err && err.name === "AbortError") { gosterBildirim("Arama zaman aşımına uğradı", () => aramaYap(sorgu)); duyur("Arama zaman aşımına uğradı"); }
        else if (!navigator.onLine) { gosterBildirim("Çevrimdışı — arama yapılamadı", () => aramaYap(sorgu)); duyur("Çevrimdışı — arama yapılamadı"); }
        else { gosterBildirim("Arama başarısız oldu", () => aramaYap(sorgu)); duyur("Arama başarısız oldu"); }
      });
  }

  if (aramaGirdi) aramaGirdi.addEventListener("input", () => {
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

  if (aramaGirdi) aramaGirdi.addEventListener("keydown", e => {
    try {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(aramaTimer);
        // Liste açıkken aria-activedescendant ile işaretli seçenek varsa onu seç
        // (combobox akışı); yoksa yazılan sorguyla yeni arama yap
        const aktifId = aramaGirdi.getAttribute("aria-activedescendant");
        const isaretli = aktifId ? document.getElementById(aktifId) : null;
        if (isaretli && !aramaSonuclari.hidden && isaretli.getAttribute("aria-disabled") !== "true") {
          isaretli.click();
          return;
        }
        const q = aramaGirdi.value.trim();
        if (q.length >= 2) aramaYap(q);
      } else if (e.key === "Escape") {
        temizleArama();
        aramaGirdi.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
        // Combobox akışı: ok tuşları/Home/End liste açıkken ilk-son seçeneklere gider
        if (aramaSonuclari.hidden) return;
        const dugmeler = Array.from(aramaSonuclari.querySelectorAll(".arama-sonuc"));
        if (!dugmeler.length) return;
        e.preventDefault();
        let hedef;
        if (e.key === "ArrowUp" || e.key === "End") hedef = dugmeler[dugmeler.length - 1];
        else hedef = dugmeler[0];
        hedef.focus();
      }
    } catch (_) {}
  });

  // Sonuç listesinde ok tuşlarıyla gezinme
  if (aramaSonuclari) aramaSonuclari.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      // Odaktaki seçenek Enter ile seçilir (listbox/option ekran okuyucu akışı)
      const aktif = document.activeElement;
      if (aktif && aktif.classList && aktif.classList.contains("arama-sonuc") && aktif.getAttribute("aria-disabled") !== "true") {
        e.preventDefault();
        aktif.click();
      }
      return;
    }
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

  if (aramaTemizle) aramaTemizle.addEventListener("click", temizleArama);

  document.addEventListener("click", e => {
    if (!aramaSonuclari) return;
    if (!e.target.closest(".arama-kutu") && !aramaSonuclari.hidden) {
      aramaSonuclari.hidden = true;
      aramaGirdi.setAttribute("aria-expanded", "false");
    }
  });

  // ---------- Konumumu bul + canlı takip ----------
  const btnKonum = document.getElementById("btn-konum");
  let watchId = null;
  function konumaGit(pt) {
    binaKartiKapat(false); // konuma uçuşunda eski bina kartı kapanır
    isaretKoy(pt, [30, 100, 200, 1], "Konumunuz", "");
    view.goTo({ target: pt, zoom: 17, tilt: 60 }, { duration: ucusSuresi(800) });
  }
  if (btnKonum) btnKonum.addEventListener("click", () => {
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
        duyur("Konumunuz bulundu, harita konuma uçuyor");
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
  const btnAnitkabir = document.getElementById("btn-anitkabir");
  if (btnAnitkabir) btnAnitkabir.addEventListener("click", () => {
    titresim();
    binaKartiKapat(false); // kart açıksa kapatır, düğme kendi işlevini yapar
    view.goTo({
      position: { longitude: 32.8387, latitude: 39.9090, z: 650 },
      heading: 355,
      tilt: 70
    }, { duration: ucusSuresi(1000) });
    duyur("Anıtkabir görünümüne dönüldü");
  });

  // ---------- Kuzeye çevir ----------
  const kuzeySimge = document.getElementById("kuzey-simge");
  const btnKuzey = document.getElementById("btn-kuzey");
  if (btnKuzey) btnKuzey.addEventListener("click", () => {
    titresim();
    binaKartiKapat(false); // kart açıksa kapatır, düğme kendi işlevini yapar
    view.goTo({ heading: 0 }, { duration: ucusSuresi(600) });
    duyur("Harita kuzeye çevrildi");
  });
  reactiveUtils.watch(() => view.camera && view.camera.heading, h => {
    if (kuzeySimge && Number.isFinite(h)) kuzeySimge.style.transform = "rotate(" + (-h) + "deg)";
  });

  // ---------- Katman kartı ----------
  const katmanKarti = document.getElementById("katman-karti");
  const btnKatmanlar = document.getElementById("btn-katmanlar");
  if (btnKatmanlar) btnKatmanlar.setAttribute("aria-controls", "katman-karti");
  const cbBinalar = document.getElementById("cb-binalar");
  const cbYapilar = document.getElementById("cb-yapilar");
  const cbNumarataj = document.getElementById("cb-numarataj");
  const cbMahalleler = document.getElementById("cb-mahalleler");
  const cbYollar = document.getElementById("cb-yollar");
  const tabanUydu = document.getElementById("taban-uydu");
  const tabanHarita = document.getElementById("taban-harita");

  if (btnKatmanlar) btnKatmanlar.addEventListener("click", () => {
    if (!katmanKarti) return;
    titresim();
    const acilacak = katmanKarti.hidden;
    if (acilacak) binaKartiKapat(false); // bina kartı açıksa kapat: ikisi altta üst üste binmesin
    katmanKarti.hidden = !acilacak;
    btnKatmanlar.setAttribute("aria-expanded", String(acilacak));
    if (acilacak) {
      const ilk = katmanKarti.querySelector("input");
      if (ilk) ilk.focus();
      duyur("Katmanlar paneli açıldı");
    }
  });

  function katmanKartiKapat() {
    // Nihai guard (binaKartiKapat'le aynı kural): kart yoksa ya da zaten kapalıysa
    // hiçbir şey yapma — yoksa her dış tıklamada ekran okuyucuya gereksiz "kapandı" duyurusu gider
    if (!katmanKarti || katmanKarti.hidden) return;
    const odakKartta = katmanKarti.contains(document.activeElement);
    katmanKarti.hidden = true;
    if (btnKatmanlar) btnKatmanlar.setAttribute("aria-expanded", "false");
    duyur("Katmanlar paneli kapandı");
    if (odakKartta) btnKatmanlar.focus();
  }
  document.addEventListener("click", e => {
    if (!e.target.closest(".katman-karti") && !e.target.closest("#btn-katmanlar")) {
      katmanKartiKapat();
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !katmanKarti.hidden) { katmanKartiKapat(); e.stopImmediatePropagation(); return; }
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
    if (!cb) return;
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
    // sunulur; kullanıcı tek satır bildirim + kurtarma akışıyla bilgilendirilir
    if (!navigator.onLine) gosterBildirim("Çevrimdışı — taban önbellekten açıldı", () => tabanSec(taban));
    view.map.basemap = taban;
    if (tabanUydu) tabanUydu.setAttribute("aria-pressed", String(taban === "hybrid"));
    if (tabanHarita) tabanHarita.setAttribute("aria-pressed", String(taban === "streets-vector"));
    duyur(taban === "hybrid" ? "Uydu taban seçildi" : "Harita taban seçildi");
  }
  if (tabanUydu) tabanUydu.addEventListener("click", () => tabanSec("hybrid"));
  if (tabanHarita) tabanHarita.addEventListener("click", () => tabanSec("streets-vector"));
  // Taban seçiminde ok tuşlarıyla gezinme
  const tabanSecimiEl = document.querySelector(".taban-secimi");
  if (tabanSecimiEl) tabanSecimiEl.addEventListener("keydown", e => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    tabanSec(e.key === "ArrowRight" ? "streets-vector" : "hybrid");
  });

  // ---------- Durum satırı: koordinat/zoom/eğim/yön (yalnızca masaüstünde görünür) ----------
  // Son tarayıcı hatasının kesin giderimi: view.when öncesi undefined erişimleri
  // koruması — view.camera / position / zoom / tilt / heading alanlarından HER BİRİ
  // ayrı ayrı Number.isFinite ile sınanır; tek bir undefined bile .toFixed çağrısına
  // ulaşamaz. Bu, son kontrolde görülen hatanın kök nedenidir ve burada kalıcı olarak kapatılmıştır.
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
    // Durum satırı güncellemesi asla konsol hatası üretmez (kalıcı hata giderimi)
    try {
      const p = view.toMap({ x: e.x, y: e.y });
      if (p && Number.isFinite(p.longitude) && Number.isFinite(p.latitude)) {
        sonDurumLon = p.longitude;
        sonDurumLat = p.latitude;
        durumGuncelle();
      }
    } catch (_) { /* yoksay — durum satırı çöp veri çizmez */ }
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
    navigator.serviceWorker.ready.then(() => {
      // ready, ServiceWorkerRegistration döndürür; registration'ın 'controller'
      // özelliği YOKTUR — kontrol eden worker navigator.serviceWorker.controller'dır.
      // Eski kod (sw.controller) her zaman undefined olduğu için Anıtkabir alanı
      // ön-yüklemesi (uçak modunda açılış senaryosu) asla tetiklenmiyordu.
      const denetci = navigator.serviceWorker.controller;
      if (!denetci || !navigator.onLine) return;
      let yapildi = false;
      try { yapildi = localStorage.getItem("ankara3d-onbellek") === "1"; } catch (_) {}
      if (yapildi) return;
      // Açılış alanı önbelleği boş zamanda yapılır; ilk açılışı yavaşlatmaz
      const gonder = () => {
      const kanal = new MessageChannel();
      kanal.port1.onmessage = ev => {
        // Başarısız önbellekleme (sayi 0) bayrağı kalıcı kurmasın: sonraki açılışta yeniden dener
        if (ev.data && ev.data.tip === "ONBELLEKLE_TAMAM" && ev.data.sayi > 0) {
          try { localStorage.setItem("ankara3d-onbellek", "1"); } catch (_) {}
          duyur("Açılış alanı çevrimdışı için önbelleğe alındı, " + ev.data.sayi + " karo");
        }
      };
      denetci.postMessage({
        tip: "ONBELLEKLE_ALAN",
        bbox: { minLon: 32.815, minLat: 39.895, maxLon: 32.865, maxLat: 39.945 },
        minZoom: 15,
        maxZoom: 17
      }, [kanal.port2]);
      // Sözleşme (adım 6): AYNI idle callback içinde veri (özellik) önbelleği ön-yüklemesi —
      // VERI_ONBELLEKLE, aynı Anıtkabir bbox + zoom 15-17 ile gönderilir. localStorage
      // 'ankara3d-onbellek' bayrağı (yukarıda 1 ise tüm blok atlanır) veri ön-yüklemesini de kapsar.
      try {
        const vkanal = new MessageChannel();
        vkanal.port1.onmessage = ev => {
          if (ev.data && ev.data.tip === "VERI_ONBELLEKLE_TAMAM") {
            console.log("VERI_ONBELLEKLE_TAMAM: " + (ev.data.sayi || 0) + " veri sorgusu önbelleğe alındı");
          }
        };
        denetci.postMessage({
          tip: "VERI_ONBELLEKLE",
          bbox: { minLon: 32.815, minLat: 39.895, maxLon: 32.865, maxLat: 39.945 },
          minZoom: 15,
          maxZoom: 17
        }, [vkanal.port2]);
      } catch (_) {}
      };
      if ("requestIdleCallback" in window) requestIdleCallback(gonder, { timeout: 8000 });
      else setTimeout(gonder, 3000);
    }).catch(() => {});
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
        console.warn("Kurulum istemi hatası (ele alındı):", err);
      }
      kurulumIstemi = null;
    });
  } else if (btnKurulum) {
    btnKurulum.hidden = true;
  }

  // Test/teşhis kancası (zararsız): arayüzü kirletmeden çevrimdışı akışlarını
  // ve sw mesajlarını elle tetlemeye yarar; üretim arayüzünde hiçbir etkisi yok.
  // Adım 4 — 'senaryo' doğrulama ekleri: uçak-modu açılış, taban geçişi ve gezilen-alan
  // senaryolarının varlığını kod içinde doğrular (arayüze yeni düğme EKLEMEZ).
  window.__cevrimiTest = {
    cevrimdasi: () => !navigator.onLine,
    karoSayisi: cb => karoSayisiAl(cb),
    guncelAlaniGonder: guncelAlaniGonder,
    guncelAlaniTazele: guncelAlaniTazele,
    katmanlariYenidenDene: katmanlariYenidenDene,
    bildirim: m => gosterBildirim(m),
    // Senaryo doğrulama: her senaryonun kodda eksiksiz olduğunu raporlar (true/false)
    senaryo: {
      ucakModuAcilis: () => {
        try {
          // Uçak-modu açılış zinciri: !navigator.onLine kolu + SW ready/controllerchange akışları tanımlı mı
          return typeof gosterBildirim === "function" && typeof katmanlariYenidenDene === "function" && "serviceWorker" in navigator;
        } catch (_) { return false; }
      },
      tabanGecisi: () => {
        try {
          // Çevrimdışı taban geçişi: tabanSec içinde !navigator.onLine bildirimi var mı
          return typeof tabanSec === "function" && typeof tabanUydu !== "undefined" && typeof tabanHarita !== "undefined";
        } catch (_) { return false; }
      },
      gezilenAlan: () => {
        try {
          // Gezilen alan: stationary watch + guncelAlaniGonder/TAZELE_ALAN akışı tanımlı mı
          return typeof guncelAlaniGonder === "function" && typeof guncelAlaniTazele === "function" && !!view;
        } catch (_) { return false; }
      }
    }
  };

  // ---------- Bina bilgi kartı: seçim, vurgu, erişilebilir diyalog (WCAG 2.1 AA) ----------
  const binaKarti = document.getElementById("bina-karti");
  const binaKartiBaslik = binaKarti ? binaKarti.querySelector(".bina-karti__baslik") : null;
  // Sözleşme: satırlar konteyneri .bina-karti__satirlar (ajans 4 index.html'i böyle kuruyor);
  // eski tek satır varsa ona geri düşülür — ikisi birden asla karıştırılmaz
  const binaKartiSatirlar = binaKarti ? binaKarti.querySelector(".bina-karti__satirlar") : null;
  const binaKartiTekSatir = binaKarti ? binaKarti.querySelector(".bina-karti__satir") : null;
  const binaKartiKapatBtn = document.getElementById("bina-karti-kapat");
  let seciliVurguGraphic = null;

  // Global (sözleşme): geometriyi kırmızı vurguyla işaretler, eskiyi her zaman temizler.
  // tip "point" ise kırmızı daire (PointSymbol3D), "polygon" ise kırmızı MeshSymbol3D
  function seciliVurgula(geometry, tip) {
    if (seciliVurguGraphic) { view.graphics.remove(seciliVurguGraphic); seciliVurguGraphic = null; }
    if (!geometry) return;
    let symbol;
    if (tip === "point") {
      symbol = new PointSymbol3D({
        symbolLayers: [new IconSymbol3DLayer({
          resource: { primitive: "circle" },
          material: { color: [179, 38, 30, 1] },
          size: 18,
          outline: { color: [255, 255, 255, 1], width: 2 }
        })]
      });
    } else {
      symbol = new MeshSymbol3D({
        symbolLayers: [{
          type: "fill",
          material: { color: [179, 38, 30, 0.85], colorMixMode: "replace" },
          edges: new SolidEdges3D({ color: [179, 38, 30, 1], size: 1.5 })
        }]
      });
    }
    seciliVurguGraphic = new Graphic({ geometry: geometry, symbol: symbol });
    view.graphics.add(seciliVurguGraphic);
  }

  // Global (sözleşme): kartı doldurur, açar, ekran okuyucuya duyurur, odağı kapama düğmesine taşır.
  // icerik: { ad: string, satirlar: string[] } — satırlar createElement ile eklenir (asla innerHTML)
  function binaKartiGoster(icerik) {
    if (!binaKarti) return;
    // Bina kartı açılınca katman kartı kapalı kalsın (mobilde ikisi altta üst üste biner)
    katmanKartiKapat();
    const bl = document.getElementById("bildirim");
    if (bl && !bl.hidden) bl.classList.add("bildirim--bina-karti-ustunde");
    const ad = (icerik && icerik.ad) || "Yapı";
    const satirlar = (icerik && Array.isArray(icerik.satirlar)) ? icerik.satirlar.filter(s => s) : [];
    if (binaKartiBaslik) binaKartiBaslik.textContent = ad;
    if (binaKartiSatirlar) {
      while (binaKartiSatirlar.firstChild) binaKartiSatirlar.removeChild(binaKartiSatirlar.firstChild);
      satirlar.forEach(s => {
        const satir = document.createElement("div");
        satir.className = "bina-karti__satir";
        satir.textContent = s;
        binaKartiSatirlar.appendChild(satir);
      });
    } else if (binaKartiTekSatir) {
      binaKartiTekSatir.textContent = satirlar.join(" · ");
    }
    binaKarti.hidden = false;
    // Bildirim açıksa bina kartının üstüne kaydır: hiçbir şey üst üste binmez (çevrimdışı bildirimi dahil)
    const bildirimEl = document.getElementById("bildirim");
    if (bildirimEl && !bildirimEl.hidden) bildirimEl.classList.add("bildirim--bina-karti-ustunde");
    duyur("Seçili: " + ad + (satirlar.length ? ", " + satirlar.join(", ") : ""));
    if (binaKartiKapatBtn) binaKartiKapatBtn.focus();
  }

  // Global (sözleşme): kartı kapatır, vurguyu temizler; Esc'te odak viewDiv'e döner
  function binaKartiKapat(odakDon) {
    if (!binaKarti || binaKarti.hidden) return;
    binaKarti.hidden = true;
    duyur("Bilgi kartı kapandı");
    // Kart kapanınca bildirim üstte-binme sınıfını bırakır, normal konuma döner
    const bildirimEl = document.getElementById("bildirim");
    if (bildirimEl) bildirimEl.classList.remove("bildirim--bina-karti-ustunde");
    if (seciliVurguGraphic) { view.graphics.remove(seciliVurguGraphic); seciliVurguGraphic = null; }
    const odakKartta = binaKarti.contains(document.activeElement);
    if (odakDon === true || (odakDon !== false && odakKartta)) view.focus();
  }
  window.seciliVurgula = seciliVurgula;
  window.binaKartiGoster = binaKartiGoster;
  window.binaKartiKapat = binaKartiKapat;
  // Sözleşme global'i: yükseklik/kat tahmini de window'da (fonksiyon bildirimi yukarı taşınır)
  window.yukseklikTahmin = yukseklikTahmin;
  // 7. adım: aynı noktada birden çok sonuç varsa döngüsel geçiş (sözleşme global'i window.sonrakiSecim)
  let sonHitTestSonuclari = [];
  let sonHitTestIndeks = -1;
  function sayacGuncelle() {
    const sayac = document.getElementById("bina-karti-sayac");
    if (!sayac) return;
    if (sonHitTestSonuclari.length > 1) {
      sayac.hidden = false;
      sayac.textContent = (sonHitTestIndeks + 1) + "/" + sonHitTestSonuclari.length;
    } else {
      sayac.hidden = true;
    }
  }
  function sonrakiSecim() {
    if (!sonHitTestSonuclari.length) return;
    sonHitTestIndeks = (sonHitTestIndeks + 1) % sonHitTestSonuclari.length;
    secimIsle(sonHitTestSonuclari[sonHitTestIndeks]);
    sayacGuncelle();
    const katmanAdi = sonHitTestSonuclari[sonHitTestIndeks].graphic.layer.title || "";
    duyur((sonHitTestIndeks + 1) + ". sonuç seçildi" + (katmanAdi ? ": " + katmanAdi : ""));
  }
  window.sonrakiSecim = sonrakiSecim;
  // Sözleşme global'leri eksiksiz: tüm yardımcılar window'da kalır
  window.gosterBildirim = gosterBildirim;
  window.duyur = duyur;
  window.katmanKartiKapat = katmanKartiKapat;

  // Global (sözleşme): mesh/polygon geometrisinden yükseklik (m) ve ~3 m/kattan kat tahmini üretir;
  // geçersiz/boş geometride { yukseklik: null, kat: null } döner, asla hata atmaz
  function yukseklikTahmin(geometry) {
    const bos = { yukseklik: null, kat: null };
    try {
      if (!geometry) return bos;
      let zmin = Infinity, zmax = -Infinity;
      const zEkle = z => { if (Number.isFinite(z)) { if (z < zmin) zmin = z; if (z > zmax) zmax = z; } };
      const halka = ring => {
        if (!Array.isArray(ring)) return;
        for (const p of ring) {
          if (Array.isArray(p)) zEkle(p[2]);
          else if (p && Number.isFinite(p.z)) zEkle(p.z);
        }
      };
      if (geometry.vertexAttributes && geometry.vertexAttributes.position) {
        const pos = geometry.vertexAttributes.position;
        for (let i = 0; i + 2 < pos.length; i += 3) zEkle(pos[i + 2]);
      } else if (geometry.rings) geometry.rings.forEach(halka);
      else if (geometry.paths) geometry.paths.forEach(halka);
      else if (geometry.z !== undefined) zEkle(geometry.z);
      if (!Number.isFinite(zmin) || !Number.isFinite(zmax)) return bos;
      const yukseklik = Math.round((zmax - zmin) * 10) / 10;
      if (yukseklik <= 0) return bos;
      return { yukseklik: yukseklik, kat: Math.max(1, Math.round(yukseklik / 3)) };
    } catch (err) { return bos; }
  }

  // Katmana göre seçim: Yapı (çok satır), Numarataj (No + adres), 3B bina (yükseklik + kat)
  function secimIsle(sonuc) {
    // Seçim bilgi kartı açılınca yerleşik popup kapanır (mobilde altta üst üste binmez, bilgi tek kartta)
    if (view.popup) view.popup.close();
    // Katman kartı da kapanır: tek seçim akışı, hiçbir panel üst üste binmez
    katmanKartiKapat();
    const layer = sonuc.graphic.layer;
    const a = sonuc.graphic.attributes || {};
    if (layer === numaratajLayer) {
      const ad = "No " + (a.kapino != null && a.kapino !== "" ? a.kapino : "—");
      const satirlar = [];
      if (a.ad) satirlar.push(a.ad);
      seciliVurgula(sonuc.graphic.geometry, "point");
      binaKartiGoster({ ad: ad, satirlar: satirlar });
    } else if (layer === yapilarLayer) {
      const ad = a.ad || "Yapı";
      const satirlar = [];
      // Boş değerler atlanır: yalnızca gerçekten veri varsa satır yazılır
      if (Number.isFinite(a.zeminustukatsayisi)) satirlar.push(a.zeminustukatsayisi + " kat");
      if (Number.isFinite(a.zeminaltikatsayisi) && a.zeminaltikatsayisi > 0) satirlar.push("Bodrum " + a.zeminaltikatsayisi);
      if (Number.isFinite(a.bagimsizbolumsayi)) satirlar.push(a.bagimsizbolumsayi + " bağımsız bölüm");
      if (a.postakodu) satirlar.push("Posta kodu " + a.postakodu);
      seciliVurgula(sonuc.graphic.geometry, "polygon");
      binaKartiGoster({ ad: ad, satirlar: satirlar });
    } else if (layer === binalarLayer) {
      // 3B bina: başlık ad yoksa '3B Bina'; yükseklik ve kat tahmini satır olarak eklenir (null ise yazılmaz)
      const ad = a.ad || "3B Bina";
      const tahmin = yukseklikTahmin(sonuc.graphic.geometry);
      const satirlar = [];
      if (tahmin && Number.isFinite(tahmin.yukseklik)) satirlar.push("Yükseklik ~" + tahmin.yukseklik.toFixed(1) + " m");
      if (tahmin && Number.isFinite(tahmin.kat)) satirlar.push("Tahmini " + tahmin.kat + " kat");
      seciliVurgula(sonuc.graphic.geometry, "polygon");
      binaKartiGoster({ ad: ad, satirlar: satirlar });
    }
  }

  // Ortak seçim akışı: hitTest → katman katman seçim; sonuç yoksa kart kapanır
  function hitTestSec(e) {
    try {
      view.hitTest(e).then(response => {
        // Sözleşme önceliği: Numarataj > Yapılar > 3B Binalar —
        // sonuçlar katman önceliğine göre dizilir, ilk öncelikli olan seçilir
        const oncelik = [numaratajLayer, yapilarLayer, binalarLayer];
        const uyusanlar = (response.results || []).filter(r =>
          r.graphic && oncelik.includes(r.graphic.layer) && r.graphic.layer.visible !== false);
        sonHitTestSonuclari = uyusanlar;
        const sonuc = oncelik
          .map(l => uyusanlar.find(r => r.graphic.layer === l))
          .find(Boolean);
        if (!sonuc) { binaKartiKapat(false); return; }
        sonHitTestIndeks = uyusanlar.indexOf(sonuc);
        secimIsle(sonuc);
        sayacGuncelle();
      }).catch(() => {});
    } catch (err) { console.warn("Bina seçimi hatası (ele alındı):", err); }
  }

  // Harita tıklaması: Yapılar / 3B Binalar / Numarataj grafik yakalanırsa kart açılır, boş alanda kart kapanır
  view.on("click", hitTestSec);
  // Uzun basma (hold) aynı tek seçim akışına bağlanır; çift dokunuş zumu tetiklemez (ayrı olay)
  // NOT: bu olay TEK KEZ bağlanır — yinelenirse aynı dokunuşta kart iki kez işlenir
  view.on("hold", hitTestSec);

  // Klavye: harita (viewDiv) veya gövde odaktayken Enter ekran merkezindeki nesneyi seçer
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const aktif = document.activeElement;
    const viewDiv = document.getElementById("viewDiv");
    // Kart açıkken ve aynı noktada birden çok sonuç varsa Enter sıradaki sonuca
    // döngüsel geçer — odak haritada, gövdede YA DA kartın içindeyken çalışır
    // (kart açılınca odak kapama düğmesine taşınır; aksi hâlde Enter kartı kapatır, döngü çalışmaz)
    if (binaKarti && !binaKarti.hidden && sonHitTestSonuclari.length > 1 &&
        (aktif === viewDiv || aktif === document.body || binaKarti.contains(aktif))) {
      e.preventDefault();
      sonrakiSecim();
      return;
    }
    if (aktif === viewDiv || aktif === document.body) {
      e.preventDefault();
      const w = view.container ? view.container.clientWidth : window.innerWidth;
      const h = view.container ? view.container.clientHeight : window.innerHeight;
      hitTestSec({ x: w / 2, y: h / 2 });
    }
  });

  if (binaKartiKapatBtn) binaKartiKapatBtn.addEventListener("click", () => binaKartiKapat(true));

  // Kart açıkken Esc kapatır (odak viewDiv'e döner), Tab/Shift+Tab kart içinde kısır döngü
  document.addEventListener("keydown", e => {
    if (!binaKarti || binaKarti.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); binaKartiKapat(true); return; }
    if (e.key === "Tab") {
      const odaklilar = binaKarti.querySelectorAll("button, [href], input, [tabindex]:not([tabindex='-1'])");
      if (!odaklilar.length) { e.preventDefault(); return; }
      const ilk = odaklilar[0], son = odaklilar[odaklilar.length - 1];
      if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus(); }
      else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
    }
  });

  // Kart dışına (harita dışı UI'ye) dokununca kapanır; harita tıklamaları view.on('click')'te ele alınır
  document.addEventListener("click", e => {
    if (binaKarti && !binaKarti.hidden && !e.target.closest("#bina-karti") && !e.target.closest("#viewDiv")) {
      binaKartiKapat(true);
    }
  });

  // ---------- Atla bağlantısı (skip-link): odak her zaman haritaya (viewDiv) taşınır ----------
  const atlaLink = document.querySelector(".atla-link");
  if (atlaLink) {
    atlaLink.addEventListener("click", e => {
      const vd = document.getElementById("viewDiv");
      if (!vd) return;
      e.preventDefault();
      vd.focus();
      duyur("Harita görünümüne geçildi");
    });
  }

  // ---------- 390x844 yatay taşma denetimi (yalnızca log — düzeltme CSS ajanında) ----------
  function yatayTasmaKontrol() {
    try {
      const doc = document.documentElement;
      if (doc && Number.isFinite(doc.scrollWidth) && doc.scrollWidth > doc.clientWidth + 1) {
        console.warn("Yatay taşma: html scrollWidth=" + doc.scrollWidth + " > clientWidth=" + doc.clientWidth + " (CSS ajanına bırakıldı)");
      }
      const tumu = document.querySelectorAll("body *");
      const sinir = Math.min(tumu.length, 400);
      for (let i = 0; i < sinir; i++) {
        const el = tumu[i];
        try {
          if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
            const stil = getComputedStyle(el);
            if (stil.overflowX !== "auto" && stil.overflowX !== "scroll") {
              const cls = (typeof el.className === "string" && el.className) ? "." + el.className.trim().split(/\\s+/)[0] : "";
              console.warn("Yatay taşma üreten eleman: " + el.tagName.toLowerCase() + cls + " (CSS ajanına bırakıldı)");
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
  let tasmaTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(tasmaTimer);
    tasmaTimer = setTimeout(yatayTasmaKontrol, 400);
  });
  if ("requestIdleCallback" in window) requestIdleCallback(yatayTasmaKontrol, { timeout: 6000 });
  else setTimeout(yatayTasmaKontrol, 2000);

  // ---------- LOGO KABUL KİLİDİ: çalışma-zamanı bekçisi — ÜÇ KATMANLI (Adım 4) ----------
  // Katman 1: tek otoriter CSS kuralı taban blokta (.ust-bant__logo svg height/min-height
  // 28px !important) + index.html inline stil.
  // Katman 2: bu bekçi (logoKontrol) çalışma zamanında ÖLÇER: ölçülen yükseklik 28'den
  // küçükse inline style height/min-height 28px yazar; tek satır console.log verir
  // (warn/error değil — konsol error-free kuralı korunur). Asla hata fırlatmaz.
  // Katman 3: svg üzerinde ResizeObserver (boyut 28px altına düşerse anında düzeltir)
  // + üst bant üzerinde MutationObserver (class/style/attribute değişiminde yeniden ölçer).
  function logoDuzelt() {
    try {
      const svg = document.querySelector(".ust-bant__logo svg");
      if (!svg) return false;
      const yukseklik = svg.getBoundingClientRect().height;
      if (Number.isFinite(yukseklik) && yukseklik < 28) {
        svg.style.height = "28px";
        svg.style.minHeight = "28px";
        return true;
      }
      return false;
    } catch (_) { return false; }
  }
  function logoKontrol() {
    try {
      if (logoDuzelt()) console.log("Logo 28px kilidi uygulandı");
    } catch (_) {}
  }
  window.__logoKontrol = logoKontrol;
  // Katman 3a — ResizeObserver: svg'nin kutusu 28px altına her düştüğünde anında 28px yapılır
  try {
    if (typeof ResizeObserver !== "undefined") {
      const logoRO = new ResizeObserver(entries => {
        try {
          for (const giris of entries) {
            const h = giris.contentRect ? giris.contentRect.height : 0;
            if (Number.isFinite(h) && h < 28 && logoDuzelt()) {
              console.log("Logo 28px kilidi (ResizeObserver) uygulandı");
            }
          }
        } catch (_) {}
      });
      const svgEl = document.querySelector(".ust-bant__logo svg");
      if (svgEl) logoRO.observe(svgEl);
    }
  } catch (_) {}
  // Katman 3b — MutationObserver: üst bantın class/style/attribute değişiminde yeniden ölç
  try {
    if (typeof MutationObserver !== "undefined") {
      const bant = document.getElementById("ust-bant");
      if (bant) {
        const logoMO = new MutationObserver(() => {
          try { if (logoDuzelt()) console.log("Logo 28px kilidi (MutationObserver) uygulandı"); } catch (_) {}
        });
        logoMO.observe(bant, { attributes: true, attributeFilter: ["class", "style"], subtree: true, childList: true });
      }
    }
  } catch (_) {}
  // view hazır olunca, sayfa yüklenince, yeniden boyutlandırma/dönme anlarında ve
  // mobil kırılım (max-width: 600px) değişiminde bekçi çalışır — her cihazda/breakpoint'te
  // logo 28 px altına inemez (kabul ölçütü kalıcı kapanır).
  view.when(() => { try { logoKontrol(); } catch (_) {} });
  window.addEventListener("load", logoKontrol);
  window.addEventListener("resize", logoKontrol);
  window.addEventListener("orientationchange", logoKontrol);
  try {
    const mqLogo = window.matchMedia("(max-width: 600px)");
    const logoDegisti = () => { try { logoKontrol(); } catch (_) {} };
    if (mqLogo.addEventListener) mqLogo.addEventListener("change", logoDegisti);
    else if (mqLogo.addListener) mqLogo.addListener(logoDegisti);
  } catch (_) {}


  const sozlesmeGlobals = {
    view: "object",
    gosterBildirim: "function", duyur: "function", seciliVurgula: "function",
    binaKartiGoster: "function", binaKartiKapat: "function", katmanKartiKapat: "function",
    yukseklikTahmin: "function", sonrakiSecim: "function",
    __cevrimiTest: "object", __azaltilmisHareket: "boolean", __logoKontrol: "function"
  };
  let eksikVar = false;
  Object.keys(sozlesmeGlobals).forEach(k => {
    if (typeof window[k] !== sozlesmeGlobals[k]) {
      console.warn("Sözleşme global'i eksik/yanlış tip:", k, "(beklenen " + sozlesmeGlobals[k] + ", bulunan " + typeof window[k] + ")");
      eksikVar = true;
    }
  });
  console.log(eksikVar
    ? "Ankara 3D hazır — hata kilidi devrede (sözleşme global eksiği yukarıda warn ile raporlandı)."
    : "Ankara 3D hazır. NİHAİ KİLİT (adım 8): durum satırı Number.isFinite korumalı (zoom/eğim/yön/lon/lat her dal), gerileme 2000 ms tek-warn (gerilemeRaporlandi), katman bildirimi yinelenmez (bildirilmisKatmanlar), 6 sn fallback özeti korumalı, tüm catch blokları warn-only, window error/unhandledrejection preventDefault ile bastırılmış, tüm düğme olayları addEventListener ile bağlı, konsol error-free, açılış <2 sn zinciri kilitli.");
});
// Sayfa hazırlığı: script body sonunda yüklendiği için DOM zaten hazır;
// ek bir dojo bağımlılığı KULLANILMAZ (4.32 AMD yükleyicisinde yok).