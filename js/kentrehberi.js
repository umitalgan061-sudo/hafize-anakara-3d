/* Ankara 3D — Kent rehberi katman tanımları (herkese açık, anahtarsız ABB servisleri) */
window.KENT_KATMAN_TANIMLARI = [
  { id: 'cb_ego_kart', grup: 'EGO', katman: 1, baslik: 'Kart Dolum Noktaları', alt: 'EGO kent rehberi', geometri: 'point', renk: [30, 99, 214] },
  { id: 'cb_ego_bisiklet', grup: 'EGO', katman: 2, baslik: 'Elektrikli Bisiklet İstasyonları', alt: 'EGO kent rehberi', geometri: 'point', renk: [0, 150, 136] },
  { id: 'cb_ego_metro', grup: 'EGO', katman: 4, baslik: 'Metro Hattı', alt: 'EGO kent rehberi', geometri: 'line', renk: [229, 57, 53] },
  { id: 'cb_ego_ankaray', grup: 'EGO', katman: 5, baslik: 'Ankaray', alt: 'EGO kent rehberi', geometri: 'line', renk: [142, 36, 170] },
  { id: 'cb_ego_baskentray', grup: 'EGO', katman: 6, baslik: 'Başkentray', alt: 'EGO kent rehberi', geometri: 'line', renk: [69, 90, 100] },
  { id: 'cb_ego_teleferik', grup: 'EGO', katman: 7, baslik: 'Teleferik', alt: 'EGO kent rehberi', geometri: 'line', renk: [0, 172, 193] },
  { id: 'cb_ego_durak', grup: 'EGO', katman: 8, baslik: 'Otobüs Durakları', alt: 'EGO kent rehberi', geometri: 'point', renk: [255, 152, 0] },
  { id: 'cb_abb_park', grup: 'ABB', katman: 5, baslik: 'Parklar', alt: 'ABB kent rehberi', geometri: 'polygon', renk: [46, 125, 50] },
  { id: 'cb_abb_kultur', grup: 'ABB', katman: 6, baslik: 'Kültür ve Sanat', alt: 'ABB kent rehberi', geometri: 'point', renk: [123, 31, 162] },
  { id: 'cb_abb_spor', grup: 'ABB', katman: 7, baslik: 'Spor Tesisleri', alt: 'ABB kent rehberi', geometri: 'point', renk: [191, 54, 12] }
];

window.KentRehberi = {
  /* Servis alanlarından otomatik Türkçe alan listeli popup kurar */
  popupAyarla(layer) {
    if (!layer) return;
    layer.when(() => {
      const fields = (layer.fields || []).filter(f => f.name !== 'OBJECTID' && f.type !== 'geometry');
      layer.popupTemplate = {
        title: layer.title,
        content: [{
          type: 'fields',
          fieldInfos: fields.map(f => ({ fieldName: f.name, label: f.alias || f.name }))
        }]
      };
    });
  }
};