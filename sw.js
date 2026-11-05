/* Ankara 3D — PWA service worker: uygulama kabuğu önbellekten, harita/servisler ağdan */
var ONBELLEK = 'ankara3d-v1';
var KABUK = [
  './',
  'index.html',
  'css/uygulama.css',
  'js/uygulama.js',
  'manifest.json',
  'ikon/atakule-180.png',
  'ikon/atakule-192.png',
  'ikon/atakule-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(ONBELLEK).then(function (c) { return c.addAll(KABUK); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (anahtarlar) {
      return Promise.all(anahtarlar.filter(function (k) { return k !== ONBELLEK; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Harita ve servis istekleri (ArcGIS, ABB, geocode) doğrudan ağdan
  if (url.origin !== self.location.origin || e.request.url.indexOf('arcgis') !== -1) {
    return;
  }
  // Kabuk: önce önbellek, bulamazsa ağ
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (resp) {
        if (resp && resp.ok && e.request.method === 'GET') {
          var kopya = resp.clone();
          caches.open(ONBELLEK).then(function (c) { c.put(e.request, kopya); });
        }
        return resp;
      }).catch(function () { return caches.match('index.html'); });
    })
  );
});