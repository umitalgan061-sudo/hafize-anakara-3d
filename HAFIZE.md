# Proje hedefi
Ankara için tarayıcıda çalışan 3B harita: Esri 3B binalar ve Ankara Büyükşehir'in herkese açık adres katmanları (Mahalle, Yol, Yapı, İlçe) tek sayfada. Kullanıcı adres arayıp oraya gidebilmeli, katmanları açıp kapatabilmeli, harita tabanını değiştirebilmeli, kendi konumunu görebilmeli.

# Kurallar
- Veri yalnızca herkese açık, anahtarsız servislerden gelir: https://baskentcbs.ankara.bel.tr/server/rest/services/ortak/adres/MapServer (0 Numarataj, 1 Yol, 2 Yapı, 3 Mahalle, 4 İlçe) ve ArcGIS World Geocoding. gisserver.ankara.bel.tr yalnızca belediye iç ağında var, kullanılmaz. Token isteyen servisler kullanılmaz.
- ArcGIS JS 4.32 dışında kütüphane eklenmez.
- onclick ile çağrılan her fonksiyon window'a atanır.
- Arayüz Türkçedir.

# Öncelikler
0. EN ÖNCELİKLİ — Tasarımı baştan yap (bir sonraki turun hedefi budur). Şimdiki görünümle hiçbir benzerliği olmayan, bambaşka ve modern bir tasarım:
   - Harita tam ekran olsun; üst başlık çubuğu, sol kenar çubuğu ve sağ kontrol sütunu kalksın. Bunların yerine haritanın üstünde yüzen, yarı saydam, bulanık arka planlı (backdrop-filter) kartlar gelsin: üstte ortada yüzen bir arama kutusu, solda katlanabilir bir katman kartı (açma-kapama anahtarları ile), sağ altta yuvarlak eylem düğmeleri (konum, taban değiştir, katmanlar).
   - Koyu tema varsayılan olsun, açık tema düğmesiyle geçilsin; renkler CSS değişkenleriyle (--renk-...) tanımlansın. Vurgu rengi Ankara'yı çağrıştıran bir turkuaz-lacivert geçişi olsun.
   - Simgeler satır içi SVG olsun (emoji kullanılmasın). Yazı tipi olarak Inter ya da benzeri bir yazı tipi jsdelivr üzerinden (@fontsource) yüklenebilir.
   - Mobilde katman kartı alttan açılan bir çekmeceye (bottom sheet) dönüşsün.
   - Geçişler yumuşak animasyonlu olsun (transition), odak halkaları ve aria etiketleri eksiksiz olsun.
   - Kod dosyalara bölünsün: css/tasarim.css ve js/arayuz.js; index.html sade kalsın.
   - Var olan bütün özellikler (arama, çoklu sonuç seçimi, katmanlar, popup bilgileri, konum, taban değiştirme, hata bildirimleri) yeni tasarımda çalışmaya devam etsin.
1. Katman noktasına tıklayınca bilgi penceresi (popupTemplate) ile adres bilgisini göster.
2. Mobilde sol paneli bir menü düğmesiyle açılır yap (şu an mobilde tamamen gizli).
3. Arama sonucunu haritada işaretle ve birden çok sonuç varsa listele.
4. Yüklenemeyen katman için kullanıcıya anlaşılır bir uyarı göster.
