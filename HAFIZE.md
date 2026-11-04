# Proje hedefi
Ankara için tarayıcıda çalışan 3B harita: Esri 3B binalar ve Ankara Büyükşehir'in herkese açık adres katmanları (Mahalle, Yol, Yapı, İlçe) tek sayfada. Kullanıcı adres arayıp oraya gidebilmeli, katmanları açıp kapatabilmeli, harita tabanını değiştirebilmeli, kendi konumunu görebilmeli.

# Kurallar
- Veri yalnızca herkese açık, anahtarsız servislerden gelir: https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer (0 Numarataj, 1 Yol, 2 Yapı, 3 Mahalle, 4 İlçe) ve ArcGIS World Geocoding. gisserver.ankara.bel.tr yalnızca belediye iç ağında var, kullanılmaz. Token isteyen servisler kullanılmaz.
- ArcGIS JS 4.32 dışında kütüphane eklenmez.
- onclick ile çağrılan her fonksiyon window'a atanır.
- Arayüz Türkçedir.

# Öncelikler
1. Sol karttaki "Harita Tabanı" düğmeleri yeni tasarıma uymuyor (tarayıcının düz beyaz düğmeleri olarak görünüyor); bunları tasarımın geri kalanıyla aynı biçimde, seçili olanı vurgulu hâle getir.
2. Yazı tipi adresi @fontsource-variable/inter@latest yerine sabit bir sürüme bağlansın (ör. @5.1.0).
3. Arama sonuçları listesi ArcGIS açılır penceresine onclick'li HTML ile yazılıyorsa, öğeleri document.createElement ile oluşturup addEventListener bağla (kütüphane onclick'i temizler).
4. Mobilde alttan açılan çekmecenin sürükleyerek açılıp kapanması.
5. Seçili adresi ve tabanı URL'de tut (paylaşılabilir bağlantı), sayfa açılınca oradan geri yükle.

# Tamamlananlar
Yeni tasarım (5 Kasım 2026): tam ekran harita, yüzen kartlar, koyu/açık tema, SVG simgeler, dosyalara bölünmüş kod
Katman bilgi pencereleri
Mobil menü
Arama sonuç listesi
Katman hata bildirimleri