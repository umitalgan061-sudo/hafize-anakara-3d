# Proje hedefi
Ankara için tarayıcıda çalışan 3B harita: Esri 3B binalar ve Ankara Büyükşehir'in herkese açık adres katmanları (Mahalle, Yol, Yapı, İlçe) tek sayfada. Kullanıcı adres arayıp oraya gidebilmeli, katmanları açıp kapatabilmeli, harita tabanını değiştirebilmeli, kendi konumunu görebilmeli.

# Kurallar
- Veri yalnızca herkese açık, anahtarsız servislerden gelir: https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer (0 Numarataj, 1 Yol, 2 Yapı, 3 Mahalle, 4 İlçe) ve ArcGIS World Geocoding. gisserver.ankara.bel.tr yalnızca belediye iç ağında var, kullanılmaz. Token isteyen servisler kullanılmaz.
- ArcGIS JS 4.32 dışında kütüphane eklenmez.
- onclick ile çağrılan her fonksiyon window'a atanır.
- Arayüz Türkçedir.

# Öncelikler
1. Kent rehberi katmanları: herkese açık ve anahtarsız şu servisleri Katmanlar sekmesinde gruplu aç-kapa ile ve her birine Türkçe popup şablonu ver: https://baskentcbs.ankara.bel.tr/server/rest/services/kentrehberi/ego_kent_Rehberi/MapServer (1 kart dolum, 2 elektrikli bisiklet istasyonları, 4 metro hattı, 5 Ankaray, 6 Başkentray, 7 teleferik, 8 otobüs durakları) ve https://baskentcbs.ankara.bel.tr/server/rest/services/kentrehberi/abb_kent_rehberi/MapServer (5 parklar, 6 kültür ve sanat, 7 spor tesisleri).
2. Araçlar sekmesi: ArcGIS 4.32'nin kendi bileşenleriyle 3B mesafe ve alan ölçümü (DirectLineMeasurement3D, AreaMeasurement3D) ve gün/saat seçilebilen gölge ve güneş ışığı analizi (Daylight, ShadowCast) — arayüz hazır, bileşenlerin canlı doğrulanıp ince ayarlanması.
3. Mahalle sekmesi: haritada bir mahalleye tıklayınca (adres MapServer/3) o mahallenin adı, ilçesi ve sınırı içindeki otobüs durağı, park ve kültür tesisi sayısı (sorgu ile) bir bilgi kartında gösterilsin.
4. Yakınımdakiler: konum ya da arama sonucuna göre en yakın 5 otobüs durağı, metro istasyonu ve parkı mesafeleriyle listele; tıklayınca haritada oraya git.
5. Keşif turları: Kızılay, Ulus, Anıtkabir, Kocatepe, Atakule arasında kamera animasyonlu, anlatı metinli otomatik tur; oynat/durdur düğmeleriyle.
6. Uygulamaya dönüştür: manifest.json ve service worker ile ana ekrana eklenebilir, çevrimdışıyken arayüzü açabilen bir PWA.

# Tamamlananlar
Editoryal (dergi tarzı) tasarım tamamlandı (5 Kasım 2026): krem zemin (#f7f1e6), Ankara kırmızısı vurgu, Fraunces serif başlıklar + Inter gövde, üst bantta Ankara silüeti (Anıtkabir, Atakule, Kocatepe SVG), masaüstünde 420px sol anlatı paneli + sağ harita, sekmeler (Keşfet/Katmanlar/Mahalle/Araçlar), mobilde 5 sekmeli alt çubuk + tam ekran sayfalar, Keşfet'te hero, Öne Çıkan Yerler ve Gündem kartları.
Yeni tasarım (5 Kasım 2026): tam ekran harita, yüzen kartlar, koyu/açık tema, SVG simgeler, dosyalara bölünmüş kod
Katman bilgi pencereleri
Mobil menü
Arama sonuç listesi
Katman hata bildirimleri
Taban düğmeleri, sabit yazı tipi, arama sonuç listesi, sürüklenebilir mobil çekmece, paylaşılabilir bağlantı (5 Kasım 2026)

===== README.md =====
# 3B Ankara Haritası

ArcGIS API for JavaScript 4.x ile Ankara 3D bina ve adres katmanları.

Canlı: https://ankara-3d-harita.web.app


===DÜZENLE js/arayuz.js===
<<<BUL
        view.watch('scale', s => { if (s && isFinite(s)) { sonZoom = Math.round(s); footerPlanla(); } urlGuncelleKamera(); });
>>>
        view.watch('zoom', z => { if (z && isFinite(z)) { sonZoom = Math.round(z); footerPlanla(); } });