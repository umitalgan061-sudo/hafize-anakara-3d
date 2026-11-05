# Proje hedefi
Ankara için tarayıcıda çalışan 3B harita: Esri 3B binalar ve Ankara Büyükşehir'in herkese açık adres katmanları (Mahalle, Yol, Yapı, İlçe) tek sayfada. Kullanıcı adres arayıp oraya gidebilmeli, katmanları açıp kapatabilmeli, harita tabanını değiştirebilmeli, kendi konumunu görebilmeli.

# Kurallar
- Veri yalnızca herkese açık, anahtarsız servislerden gelir: https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer (0 Numarataj, 1 Yol, 2 Yapı, 3 Mahalle, 4 İlçe) ve ArcGIS World Geocoding. gisserver.ankara.bel.tr yalnızca belediye iç ağında var, kullanılmaz. Token isteyen servisler kullanılmaz.
- ArcGIS JS 4.32 dışında kütüphane eklenmez.
- onclick ile çağrılan her fonksiyon window'a atanır.
- Arayüz Türkçedir.

# Öncelikler
1. TASARIMI TAMAMEN DEĞİŞTİR (bir sonraki turun hedefi). Şimdiki koyu, yüzen kartlı tasarımla hiçbir benzerliği olmasın. Yeni yön: açık renkli, dergi/editoryal düzen. Masaüstünde solda geniş (yaklaşık 420 px) bir anlatı paneli, sağda harita; üstte Ankara silüetini (Anıtkabir, Atakule, Kocatepe; satır içi SVG) taşıyan ince bir bant. Renkler: krem zemin (#f7f1e6 civarı), Ankara kırmızısı (#b3261e civarı) vurgu, koyu kahve metin. Başlıklarda serif bir yazı tipi (Fraunces, jsdelivr @fontsource ile sabit sürüm), gövdede sans. Panelde sekmeler: Keşfet, Katmanlar, Mahalle, Araçlar. Mobilde panel tam ekran sayfalar arasında geçişe dönüşsün, harita ayrı bir sekme olsun. Bütün mevcut özellikler yeni tasarımda çalışsın.
2. Kent rehberi katmanları: herkese açık ve anahtarsız şu servisleri ekle, Katmanlar sekmesinde gruplu aç-kapa ile: https://baskentcbs.ankara.bel.tr/server/rest/services/kentrehberi/ego_kent_Rehberi/MapServer (1 kart dolum, 2 elektrikli bisiklet istasyonları, 4 metro hattı, 5 Ankaray, 6 Başkentray, 7 teleferik, 8 otobüs durakları) ve https://baskentcbs.ankara.bel.tr/server/rest/services/kentrehberi/abb_kent_rehberi/MapServer (5 parklar, 6 kültür ve sanat, 7 spor tesisleri). Her birine Türkçe popup şablonu.
3. Araçlar sekmesi: ArcGIS 4.32'nin kendi bileşenleriyle 3B mesafe ve alan ölçümü (DirectLineMeasurement3D, AreaMeasurement3D) ve gün/saat seçilebilen gölge ve güneş ışığı analizi (Daylight, ShadowCast).
4. Mahalle sekmesi: haritada bir mahalleye tıklayınca (adres MapServer/3) o mahallenin adı, ilçesi ve sınırı içindeki otobüs durağı, park ve kültür tesisi sayısı (sorgu ile) bir bilgi kartında gösterilsin.
5. Yakınımdakiler: konum ya da arama sonucuna göre en yakın 5 otobüs durağı, metro istasyonu ve parkı mesafeleriyle listele; tıklayınca haritada oraya git.
6. Keşif turları: Kızılay, Ulus, Anıtkabir, Kocatepe, Atakule arasında kamera animasyonlu, anlatı metinli otomatik tur; oynat/durdur düğmeleriyle.
7. Uygulamaya dönüştür: manifest.json ve service worker ile ana ekrana eklenebilir, çevrimdışıyken arayüzü açabilen bir PWA.

# Tamamlananlar
Yeni tasarım (5 Kasım 2026): tam ekran harita, yüzen kartlar, koyu/açık tema, SVG simgeler, dosyalara bölünmüş kod
Katman bilgi pencereleri
Mobil menü
Arama sonuç listesi
Katman hata bildirimleri
Taban düğmeleri, sabit yazı tipi, arama sonuç listesi, sürüklenebilir mobil çekmece, paylaşılabilir bağlantı (5 Kasım 2026)