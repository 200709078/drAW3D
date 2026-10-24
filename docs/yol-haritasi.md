# drAW3D yol haritası

Geçişten (`docs/gecis-plani.md`) sonra yapılacak işler. Kullanıcı 2026-10-24'te
nesne kartlarını, komut girişini ve önerilen özelliklerin hepsini plana aldı.
Buradaki maddelerin hiçbiri henüz uygulanmadı. Sıra bir öneridir; neyin ne zaman
yapılacağına kullanıcı karar verir ve her adımdan sonra durulur.

## Planlanan sıra (2026-10-24)

1. Ortak paket (A1).
2. Nesne kartları ve görünüm ayarları (Y1).
3. Komut girişi, parametreler ve karttan yeniden tanımlama (Y2).
4. Ölçümler (Y3).
5. Görünüm: standart görünümler, eksenler, etiketler, gizli kenarlar (Y4).
6. Yapı araçları (Y5).
7. Kaydetme, açma, otomatik kayıt ve dışa aktarma (Y6).
8. Açınımı gerçek ölçekte yazdırma ve PDF olarak dışa aktarma (Y7).
9. Kesit (Y8).
10. Yeni cisimler ve açınım seçenekleri (Y9).
11. Android/iOS paketleme (A2).

## Altyapı

### A1. drAW2D ile ortak paket

Geçiş sırasında drAW2D ile aynı API'yle yazılan ortak parçalar tek kaynağa
taşınır: Electron kabuğu ve betikler, başlık çubuğu, toast, araç kaydı ve araç
çubuğu, yan/alt panel, kart paneli, komut girişi, öneri/şablon, yardım penceresi,
matematik klavyesi, stiller, belge çekirdeği (ID, ad, snapshot geçmişi,
`graph-equality`), kare biriktirici ve test yardımcıları.

Kartlar (Y1) ve komut girişi (Y2) de bu paket üzerine kurulacağı için bu iş önce
gelir. Seçenekler: iki projeyi tek depoda npm workspaces ile toplamak (önerilen)
veya ayrı bir ortak paket deposu. Depo yapısı kullanıcının kararıdır. Ertelenirse
Y1 ve Y2 için drAW2D modülleri aynı API ile kopyalanır.

### A2. Android/iOS paketleme

Capacitor ile aynı `dist/` çıktısı paketlenir. Mobil WebView'da WebGL, bellek ve
ısınma kontrol edilir; piksel oranı ve gölgeler cihaza göre ayarlanır.

## Özellikler

### Y1. Nesne kartları ve görünüm ayarları

drAW2D'deki kart paneli: geniş ekranda yan panel, dar ekranda alt panel. Kartlar
nesne ID'sine göre yerinde güncellenir, en yeni en üstte durur. Kartta ad, tanım
ve değer (koordinat, uzunluk, açı…) bulunur; gizle/göster düğmesi vardır.

Ayarlar: renk, boyut, çizgi stili, saydamlık, etiket, yüzleri ve kenarları ayrı
ayrı gösterme. Prizma ve piramitte kenar sayısı, açınım yapılabilen cisimlerde
açınım açısı kaydırıcısı karta taşınır.

### Y2. Komut girişi, parametreler ve karttan yeniden tanımlama

drAW2D'deki giriş dili tablosu (`language.ts`), ayrıştırıcı, ifade doğrulama
(math.js 15.2.0), öneri ve şablonlar, yardım penceresi ve matematik klavyesi,
3B'ye uyarlanır. Bir komut ya tamamen başarılı olur ya da belgeye hiç dokunmaz.

Taslak komutlar (Y2'de netleşir):

- `A=(1,2,3)`
- `Doğru(A,B)`, `DoğruParçası(A,B)`, `Işın(A,B)`
- `Düzlem(A,B,C)`, `Açı(A,B,C)`
- `Küre(A,B)`, `Küre(A,r)`
- `Prizma(A,B,n)`, `Piramit(A,B,n)`, `Silindir(A,B)`, `Koni(A,B)`
- `Açınım(Cisim, açı)`

`a=2` gibi parametreler kaydırıcı kartı olur. Parametreye bağlı nesneler
tanımlarından yeniden hesaplanır. Kart düzenlenerek ad ve tanım değiştirilebilir.

### Y3. Ölçümler

Uzunluk, uzaklık (nokta-doğru, nokta-düzlem, doğru-doğru), açı (iki doğru,
doğru-düzlem, iki düzlem), alan, yüzey alanı ve hacim. Kartta ve komut olarak
(`Uzunluk`, `Uzaklık`, `Alan`, `YüzeyAlanı`, `Hacim`) kullanılır.

### Y4. Görünüm

- Standart görünümler: önden, üstten, yandan, izometrik.
- Perspektif ve ortografik arasında geçiş.
- Koordinat eksenleri ve nokta koordinatları.
- Nesne etiketleri (A, B, C…).
- Gizli kenarların ders kitaplarındaki gibi kesikli çizgiyle gösterilmesi.

### Y5. Yapı araçları

Orta nokta; doğru-düzlem, düzlem-düzlem ve doğru-küre kesişimleri; dik ve paralel
doğru ile düzlem; bir noktanın düzleme izdüşümü. Hem araç çubuğunda hem komut
olarak sunulur.

### Y6. Kaydetme, açma, otomatik kayıt ve dışa aktarma

Belge JSON olarak kaydedilir ve açılır. Otomatik kayıt yapılır. Görünüm PNG
olarak dışa aktarılır. Electron'da dosya erişimi preload/IPC üzerinden olur,
web'de dosya indirme ve yükleme kullanılır.

### Y7. Açınımı ölçekli yazdırma ve PDF

90°'deki açınım ağı gerçek ölçekte (mm) SVG veya PDF olarak çıkarılır; yapıştırma
payları isteğe bağlıdır. Öğrenci yazdırıp kesip katlayabilir. Electron'da
`printToPDF`, web'de yazdırma sayfası kullanılır.

### Y8. Kesit

Bir cisim bir düzlemle kesilir; kesit çokgeni gösterilir, isteğe bağlı olarak
alanı da. Kesen düzlem sürüklendikçe kesit canlı güncellenir.

### Y9. Yeni cisimler ve açınım seçenekleri

- Kesik koni ve kesik piramit.
- Düzgün çokyüzlüler (dörtyüzlü, küp, sekizyüzlü, onikiyüzlü, yirmiyüzlü).
- Küpün 11 farklı açınımı arasından seçim.
- Açınım için oynat ve durdur düğmesi.

Kürenin düzleme açınımı yoktur; Y9'a girmez.
