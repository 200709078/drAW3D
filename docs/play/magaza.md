# drAW3D — Google Play mağaza kaydı

Play Console'a girilecek metinler ve görseller. Görseller `npm run play:gorseller` ile yeniden üretilir
(uygulamanın görünüşü değişince). Sınırlar Play'in sınırlarıdır; `node scripts/play/sinirlar.mjs` metinlerin
sığdığını denetler.

## Ayrıntılar

- **Uygulama adı** (en çok 30 karakter):

<!-- ad -->
drAW3D: 3B Geometri ve Açınım
<!-- /ad -->

- **Kısa açıklama** (en çok 80 karakter):

<!-- kisa -->
Prizma, piramit, küre ve açınımlar 3B'de; Türkçe komutlarla. Reklamsız.
<!-- /kisa -->

- **Tam açıklama** (en çok 4000 karakter):

<!-- tam -->
drAW3D, matematik derslerinde uzay geometrisi ve cisimlerin açınımları için tasarlanmış bir uygulamadır. Telefonda, tablette ve sınıftaki akıllı tahtada çalışır. Reklam yoktur, hesap istemez, hiçbir veri toplamaz.

• Cisimler: prizma, piramit, kesik piramit, silindir, koni, kesik koni, küre ve beş düzgün çokyüzlü (küp, dörtyüzlü, sekizyüzlü, onikiyüzlü, yirmiyüzlü).
• Açınımlar: cismi kaydırıcıyla yavaş yavaş açın ya da ▶ ile canlandırın. Küpün 11 farklı açınımı. Açınımı yapıştırma payıyla yazdırın, PDF ya da SVG olarak kaydedin; kesip katlayarak modelini yapın.
• Ölçüler: taban alanı, yüzey alanı, hacim, uzunluk, uzaklık ve açı.
• Uzayda nokta, doğru, doğru parçası, ışın ve düzlem; kesişim, izdüşüm, dik ve paralel doğru ya da düzlem, orta nokta.
• Kesitler: bir cismi düzlemle kesin, kesiti görün.
• Kaydırıcılar: a=2 yazın, kaydırıcıyla değiştirin; ona bağlı cisimler anında güncellenir.
• Türkçe komutlar: Prizma((0,0,0),(3,0,0),6,4), Küre((0,2,0),2), Açınım(küp1,90)… Matematik klavyesi ve komut önerileri yazmayı kolaylaştırır.
• Görünüm: tek parmakla çevirin, iki parmakla yakınlaştırın; dik ya da perspektif bakış, eksenler, gizli kenarlar kesikli.
• Dosyalar: çizimi .drw3 olarak kaydedin, PNG görüntü olarak dışa aktarın. Çalışmanız kendiliğinden saklanır.

Gizliliğiniz önce gelir
Çizimleriniz yalnızca cihazınızda işlenir; hiçbir şey internete ya da bir sunucuya gönderilmez.

Her yerde aynı uygulama
drAW3D'nin Linux (Pardus dahil) ve Windows sürümleri ile tarayıcıda çalışan web sürümü de vardır: madematik.com/drAW3D
Kardeşleri: drAW (akıllı tahta ve çizim) ve drAW2D (2B geometri ve fonksiyon çizimi).

drAW3D ücretsizdir. Öneri ve sorunlar için: destek@madematik.com
<!-- /tam -->

## Kategori ve iletişim

- **Uygulama mı, oyun mu:** Uygulama
- **Ücretli mi, ücretsiz mi:** Ücretsiz
- **Kategori:** Eğitim
- **Etiketler (öneri):** Eğitim, Araçlar, Verimlilik (Play'in listesinden en yakınları seçilir). (Play'in listesinden en yakınları seçilir).
- **E-posta (herkese açık):** destek@madematik.com
- **Web sitesi:** https://madematik.com
- **Telefon:** boş bırakılır (isteğe bağlı).
- **Gizlilik politikası:** https://madematik.com/drAW3D/gizlilik.html (kaynağı `public/gizlilik.html`)

## Uygulama içeriği beyanları (öneri; awPDF'te verilen cevaplarla aynı mantık)

- **Veri güvenliği:** Veri toplanmıyor, paylaşılmıyor. Paket yalnız Capacitor'ın standart internet iznini taşır;
  uygulama ağa veri göndermez (yalnız Hakkında'daki bağlantılar tarayıcıda açılır).
- **Reklam:** Reklam yok.
- **Uygulama erişimi:** Bütün işlevler herhangi bir giriş olmadan kullanılabilir.
- **İçerik derecelendirmesi:** Anket "eğitim / araç" uygulaması olarak doldurulur; şiddet, kumar, kullanıcılar arası
  iletişim yok.
- **Hedef kitle:** awPDF'te seçilenle aynı yaş grupları.
- **Satıcı statüsü:** Hesap düzeyinde "tacir değil" olarak zaten beyan edildi (2026-11-07, awPDF).
- **Yapay zekâ beyanı:** awPDF'te seçilenle aynı.

## Sürüm notları ("Bu sürümdeki yenilikler", en çok 500 karakter)

Play Console'da sürüm oluşturulurken `<tr-TR>` ile `</tr-TR>` arasına yazılır. En yenisi üstte.

### 0.1.6

<!-- not-0.1.6 -->
Google Play'deki ilk sürüm. Prizma, piramit, silindir, koni, küre ve düzgün çokyüzlüler; açınımlar kaydırıcıyla açılır, yazdırılır. Alan, hacim ve uzaklık ölçüleri; Türkçe komutlar. Reklam yok, hiçbir veri toplanmaz.
<!-- /not-0.1.6 -->

## Görseller (`docs/play/`)

| Play alanı | Dosya | Ölçü |
|---|---|---|
| Uygulama simgesi | `simge-512.png` | 512×512 |
| Öne çıkan görsel | `one-cikan-1024x500.png` | 1024×500 |
| Telefon ekran görüntüleri | `ekran/telefon-1…4-*.png` | 1080×2160 |
| 7 inç tablet ekran görüntüleri | `ekran/tablet7-1…3-*.png` | 1200×1920 |
| 10 inç tablet ekran görüntüleri | `ekran/tablet10-1…3-*.png` | 2560×1600 |

Ekran görüntülerindeki cisimler betiğin giriş satırına yazdığı komutlarla kurulur (`scripts/play/gorseller.mjs`);
kullanıcının çizimleri kullanılmaz.
