# Proje hedefi
Ankara için tarayıcıda çalışan 3B harita: Esri 3B binalar ve Ankara Büyükşehir'in herkese açık adres katmanları (Mahalle, Yol, Yapı, İlçe) tek sayfada. Kullanıcı adres arayıp oraya gidebilmeli, katmanları açıp kapatabilmeli, harita tabanını değiştirebilmeli, kendi konumunu görebilmeli.

# Kurallar
- Veri yalnızca herkese açık, anahtarsız servislerden gelir: https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer (0 Numarataj, 1 Yol, 2 Yapı, 3 Mahalle, 4 İlçe) ve ArcGIS World Geocoding. gisserver.ankara.bel.tr yalnızca belediye iç ağında var, kullanılmaz. Token isteyen servisler kullanılmaz.
- ArcGIS JS 4.32 dışında kütüphane eklenmez.
- onclick ile çağrılan her fonksiyon window'a atanır.
- Arayüz Türkçedir.

# Sahibin kesin istekleri (5 Kasım 2026) — hiçbir tur bunları geri almaz
- Uygulamanın adı "Ankara 3D". Sekme başlığı, üst banttaki yazı, ana ekran adı ve açıklama hep "Ankara 3D".
- Logo Atakule (5 Kasım düzeltmesi: şimdiki küçük koyu çubuk Atakule olarak tanınmıyor, sokak lambasına benziyor): üst bantta en az 32 px yüksekliğinde, Ankara kırmızısı (#b3261e) dolgulu özgün bir Atakule silüeti SVG'si; <svg role="img" aria-label="Atakule">. Atakule'yi tanıtan biçim: aşağıdan yukarı hafifçe incelen uzun, ince beton gövde; gövdenin üst dörtte birinde kadeh/lale gibi dışa açılan geniş baş (alttan ters koni gibi genişleyen bir boyun, üstünde gövdenin 3-4 katı genişlikte, 2-3 yatay pencere bandı olan basık silindir/disk biçimli restoran katları, en üstte daha dar bir kapak); başın ortasından yükselen kısa, ince bir anten. Gövde yüksekliğin yaklaşık yüzde 70'i, baş yüzde 20'si, anten yüzde 10'u. Başka kuleyle (Kocatepe minaresi, Anıtkabir) birleştirme, tek kule. Sekme simgesi (favicon) de aynı SVG. İnternetten logo kopyalama: Atakule'nin kendi logosu tescilli markadır; çizim özgün olmalı.
- 3B binalar (Esri3D_Buildings SceneLayer) dolu ve opak buz grisidir (sahibi "taralı buz grisi" dedi; ArcGIS 3B bina modellerinde tarama deseni desteklenmez, bu yüzden dolu buz grisi ve ince kenar): MeshSymbol3D fill, material: { color: [221, 230, 236, 1] (#DDE6EC), colorMixMode: "replace" } (ŞEFFAF OLMAZ: sahibi "bina modelleri şeffaf olmasın" dedi; colorMixMode verilmezse renk modelin dokusuyla karışır ve binalar cam gibi şeffaf görünür, tarayıcıda karşılaştırıldı), katman opacity 1, ışıkla gölgelenen gerçek yüzeyler; kenarlar ince ve hafif (SolidEdges3D, color [120, 135, 150, 0.55], size 0.5). İçi şeffaf, yalnızca dış çizgili (SketchEdges3D) bina görünümü KULLANILMAZ.
- Açılışta Anasayfa açıktır ve AÇIK KALIR (sahibi: "Harita ile başlıyor sonra hemen Keşfet'e geçiyor"; açılıştan sonra hiçbir kod kendiliğinden Keşfet'i ya da başka bir paneli açmaz, URL'de sekme yoksa varsayılan sekme Harita'dır; telefonda Keşfet paneli tam ekran açılmaz): alttaki sekmelerde "Harita" (Anasayfa) seçili gelir; Keşfet, Katmanlar, Mahalle ve Araçlar panelleri ile çekmece KAPALI açılır; ekranda üst bant ve Anıtkabir'e odaklı harita görünür, başka hiçbir kart ya da panel haritanın üstünde durmaz.
- Açılış görünümü Anıtkabir: adreste konum parametresi (lat/lon/zoom) yoksa harita Anıtkabir'e bakan eğik görünümle açılır: camera { position: { longitude: 32.8387, latitude: 39.9090, z: 650 }, heading: 355, tilt: 70 } (haritada arazi yüksekliği yok, z yerden yüksekliktir: 1600 m ekranın ortasını Anıtkabir'in 2,5 km kuzeyine düşürüyordu, 650 m tam Anıtkabir'e bakar; tarayıcıda ölçüldü). Anıtkabir (39.9255, 32.8369) ekranın ortasında, Anıtkabir parkı bütünüyle görünür. "Anasayfa"/"Başa dön" düğmesi de bu görünüme döner.
- Yapılar katmanı (adres MapServer/2) ve Numarataj (MAKS, adres MapServer/0, kapı numaraları) katmanı açılışta GÖRÜNÜR ve ETİKETLERİ AÇIKTIR: labelsVisible: true ve labelingInfo (LabelClass, symbol: LabelSymbol3D içinde TextSymbol3DLayer, koyu yazı + beyaz hale). Gerçek alan adları (servis tanımından okundu, büyük harf DEĞİL): Yapı etiketi $feature.ad (boşsa zeminustukatsayisi + " kat"), Numarataj etiketi $feature.kapino. Servisin kendi ölçek sınırı Yapı 1:5000, Numarataj 1:1500; etiketler de bu yakınlıkta görünür. Katmanlar sekmesinde "Numarataj (MAKS)" adıyla aç-kapa satırı olur.
- Bu servislerin gerçek alanları: Yapı (MapServer/2): ad, zeminustukatsayisi, zeminaltikatsayisi, postakodu, siteveyakooperatifadi, bagimsizbolumsayi, toplamyukseklik. Numarataj (MapServer/0): kapino, ad, tip. Bilgi pencereleri (popup) bu alanları kullanır; YAPI_ADI, MAHALLE_ADI gibi büyük harfli alanlar bu katmanlarda YOKTUR, kullanılmaz.

# Kabul denetimi
.github/hafize-kontrol.json içindeki "kabul" listesi sahibin isteklerinin otomatik testidir; tarayıcı kontrolü her adımda bunları açılmış sayfada çalıştırır. "Kabul hatası" çıkan tur main'e giremez. Bu listeyi değiştirme ya da gevşetme; kodu ona uydur.

# Kullanılabilirlik kuralları
- Bu bir harita sitesi: açılışta harita masaüstünde en az yüzde 55, telefonda en az yüzde 60 görünür. Hiçbir panel, kart ya da başlık haritanın üstünü kaplamaz.
- Telefonda harita tam ekrandır. Arama kutusu haritanın üstünde, en üstte ince bir şerit olarak yüzer. Diğer her şey alttan açılan bir çekmecedir: kapalıyken yalnızca tutamak ve bir satır sekme (yaklaşık 64 px), yarı açık ekranın en fazla yüzde 45'i, tam açık en fazla yüzde 85'i. Çekmece varsayılan olarak KAPALI açılır.
- Tek gezinme: aynı sekmeler hem üstte hem altta olmaz. Telefonda alttaki sabit sekme çubuğu kaldırılır, sekmeler çekmecenin içindedir.
- Masaüstünde sol panel en fazla 360 px genişliktedir ve daraltılabilir; harita geri kalan alanın tamamıdır.
- Kocaman tanıtım kartı (hero) yoktur; en fazla tek satırlık kısa bir açıklama olur. "Hızlı Erişim" düğmeleri tek satırda, yan yana, simge + kısa yazı biçiminde küçük düğmelerdir (yükseklik en fazla 48 px).
- Bildirimler tek bir özet bildirimde toplanır ("5 katman yüklenemedi") ve 4 saniyede kendiliğinden kapanır.
- Hiçbir şey yana taşmaz; dokunma hedefleri en az 44 px'tir.
- Yeni bir özellik bu kurallardan birini bozuyorsa eklenmez.

# Öncelikler
1. SAHİBİN İSTEKLERİ (bu turun ilk ve zorunlu hedefi, hepsi eksiksiz): "Sahibin kesin istekleri" bölümündeki bütün maddelerini uygula — Ankara 3D adı, Atakule logosu ve favicon, opak buz grisi binalar, Anıtkabir açılış görünümü, Yapılar ve Numarataj (MAKS) katmanlarının açılışta görünür ve etiketli olması. Kabul: index.html'de başlık "Ankara 3D", logoda Atakule SVG'si; js'de binalar fill rengi [221, 230, 236, 1] ve SolidEdges3D; açılış kamerası Anıtkabir; yapı ve numarataj katmanları visible: true, labelsVisible: true ve labelingInfo dolu ($feature.ad, $feature.kapino); yapı popup'ı gerçek alanları (ad, zeminustukatsayisi, postakodu) gösterir. Bunlar bittikten sonra tur aşağıdaki önceliklerle büyük geliştirmeye devam eder.
2. KULLANILABİLİRLİK ONARIMI: "Kullanılabilirlik kuralları"nı eksiksiz uygula. Telefonda harita tam ekran ve çekmece kapalı açılsın; üstteki tekrar eden sekmeleri ya da alttaki sabit çubuğu kaldır; hero kartını kaldır; Hızlı Erişim'i küçük düğme satırına çevir; masaüstünde paneli 360 px'e indir; bildirimleri tek özete topla; Keşfet'teki yer ve Gündem kartlarındaki "view.popup.open is not a function" hatasını view.openPopup ile düzelt. Kabul: tarayıcı kontrolündeki kullanılabilirlik ölçümü geçer.
3. Kent rehberi katmanları: herkese açık ve anahtarsız şu servisleri Katmanlar sekmesinde gruplu aç-kapa ile ve her birine Türkçe popup şablonu ver: https://baskentcbs.ankara.bel.tr/server/rest/services/kentrehberi/ego_kent_Rehberi/MapServer (1 kart dolum, 2 elektrikli bisiklet istasyonları, 4 metro hattı, 5 Ankaray, 6 Başkentray, 7 teleferik, 8 otobüs durakları) ve https://baskentcbs.ankara.bel.tr/server/rest/services/kentrehberi/abb_kent_rehberi/MapServer (5 parklar, 6 kültür ve sanat, 7 spor tesisleri).
4. Araçlar sekmesi: ArcGIS 4.32'nin kendi bileşenleriyle 3B mesafe ve alan ölçümü (DirectLineMeasurement3D, AreaMeasurement3D) ve gün/saat seçilebilen gölge ve güneş ışığı analizi (Daylight, ShadowCast) — arayüz hazır, bileşenlerin canlı doğrulanıp ince ayarlanması.
5. Mahalle sekmesi: haritada bir mahalleye tıklayınca (adres MapServer/3) o mahallenin adı, ilçesi ve sınırı içindeki otobüs durağı, park ve kültür tesisi sayısı (sorgu ile) bir bilgi kartında gösterilsin.
6. Yakınımdakiler: konum ya da arama sonucuna göre en yakın 5 otobüs durağı, metro istasyonu ve parkı mesafeleriyle listele; tıklayınca haritada oraya git.
7. Keşif turları: Kızılay, Ulus, Anıtkabir, Kocatepe, Atakule arasında kamera animasyonlu, anlatı metinli otomatik tur; oynat/durdur düğmeleriyle.
8. Uygulamaya dönüştür: manifest.json ve service worker ile ana ekrana eklenebilir, çevrimdışıyken arayüzü açabilen bir PWA.

# Tamamlananlar
Editoryal (dergi tarzı) tasarım tamamlandı (5 Kasım 2026): krem zemin (#f7f1e6), Ankara kırmızısı vurgu, Fraunces serif başlıklar + Inter gövde, üst bantta Ankara silüeti (Anıtkabir, Atakule, Kocatepe SVG), masaüstünde 420px sol anlatı paneli + sağ harita, sekmeler (Keşfet/Katmanlar/Mahalle/Araçlar), mobilde 5 sekmeli alt çubuk + tam ekran sayfalar, Keşfet'te hero, Öne Çıkan Yerler ve Gündem kartları.
Yeni tasarım (5 Kasım 2026): tam ekran harita, yüzen kartlar, koyu/açık tema, SVG simgeler, dosyalara bölünmüş kod
Katman bilgi pencereleri
Mobil menü
Arama sonuç listesi
Katman hata bildirimleri
Taban düğmeleri, sabit yazı tipi, arama sonuç listesi, sürüklenebilir mobil çekmece, paylaşılabilir bağlantı (5 Kasım 2026)
