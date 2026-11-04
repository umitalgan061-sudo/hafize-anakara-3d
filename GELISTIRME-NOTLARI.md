# Geliştirme notları

- 4 Kasım 2026 22:00 — Arama butonu Enter tuşu ile erişilebilir hale getirildi: Arama butonu formun içindeyken type='submit' olmadığı ve Enter tuşu sadece input üzerinde çalışıyordu. Butona type='submit' eklenip form onsubmit ile yönetildi; böylece klavye/ekran okuyucu kullanıcıları da butonu tetikleyebilir.
- 4 Kasım 2026 21:31 — Sidebar checkbox'ları harita katmanlarıyla senkronize et: Harita yüklendiğinde ve kullanıcı bir katmanı açıp kapattığında, sol paneldeki checkbox'ların da güncellenmesi için iki yönlü dinleyici ekleniyor. Bu, kullanıcının her zaman doğru durumu görmesini sağlar.
- 4 Kasım 2026 21:00 — toggleLayers butonuna aktif/pasif görsel geri bildirimi ekle: Katmanları aç/kapa butonuna .active sınıfı ekleyerek kullanıcının anlık durum görebilmesini sağlıyor. Bu, erişilebilirlik ve Kullanıcı Deneyimi için kritik bir iyileştirmedir.
- 4 Kasım 2026 19:00 — Arama girdisi için Enter tuşu desteği: Kullanıcılar arama kutusuna yazıp Enter'a bastığında arama fonksiyonu çalışacak, bu da mobil ve masaüstü kullanım kolaylığını artırır.
Hafize her turda bir iyileştirme dener. Geçen tur main'e girer, geçmeyen tur buraya yazılır ama main'e girmez.

- 4 Kasım 2026 — Elle düzeltme: global fonksiyonlar, çalışan taban butonları, açık Ankara katmanları, gerçek arama, konum noktası; kontrol betiği artık butonlara da tıklıyor.
