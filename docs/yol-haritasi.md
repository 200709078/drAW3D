# drAW3D yol haritası

Geçişten (`docs/gecis-plani.md`) sonra yapılacak işler. Kullanıcı 2026-10-24'te
nesne kartlarını, komut girişini ve önerilen özelliklerin hepsini plana aldı.
Uygulananlar "Uygulandı" notuyla işaretlidir. Sıra bir öneridir; neyin ne zaman
yapılacağına kullanıcı karar verir ve her adımdan sonra durulur.

## Planlanan sıra (2026-10-24)

**Bekliyor (2026-10-24):** Kullanıcı geçişten sonra bu listedeki işleri beklemeye
aldı; aynı gün Y1, Y2 ve Y3'ü, ardından Y4 ve Y5'i, sonra Y6–Y9'u istedi (sürüm
0.1.1). A1 ve A2 bekliyor; kullanıcı istemeden başlatılmaz.

1. Ortak paket (A1) — ertelendi, bkz. A1.
2. Nesne kartları ve görünüm ayarları (Y1). **Uygulandı (2026-10-24).**
3. Komut girişi, parametreler ve karttan yeniden tanımlama (Y2). **Uygulandı (2026-10-24).**
4. Ölçümler (Y3). **Uygulandı (2026-10-24).**
5. Görünüm: standart görünümler, eksenler, etiketler, gizli kenarlar (Y4). **Uygulandı (2026-10-24).**
6. Yapı araçları (Y5). **Uygulandı (2026-10-24).**
7. Kaydetme, açma, otomatik kayıt ve dışa aktarma (Y6). **Uygulandı (2026-10-24).**
8. Açınımı gerçek ölçekte yazdırma ve PDF olarak dışa aktarma (Y7). **Uygulandı (2026-10-24).**
9. Kesit (Y8). **Uygulandı (2026-10-24).**
10. Yeni cisimler ve açınım seçenekleri (Y9). **Uygulandı (2026-10-24).**
11. Android/iOS paketleme (A2). Önce Android, yalnız drAW3D'de (2026-10-25). **Android uygulandı (2026-10-25)**; imza anahtarı ve telefonda deneme bekleniyor. iOS beklemede.
12. Cihaza göre görüntü ayarları: telefon, akıllı tahta, PC, web (Y10). **Uygulandı (2026-10-25)**, gerçek cihazda denenmeyi bekliyor.
13. Dar ekranda araç çubuğunun düzeni (Y11) — not, acil değil.
14. İkinci telefon denemesinden notlar: standart görünüm, klavye yüksekliği, logo (Y12). Standart görünüm, klavye ve logo **uygulandı (2026-10-25)**.

**Telefonda deneme (2026-10-25, kullanıcı):** SVG kaydı çalışıyor. Belge `.drw3.json`
adıyla kaydediliyordu ve PNG kaydı uygulamayı çökertiyordu (dosya boş kalıyordu).
İkisi de düzeltildi, bkz. A2.

## Altyapı

### A1. drAW2D ile ortak paket

Geçiş sırasında drAW2D ile aynı API'yle yazılan ortak parçalar tek kaynağa
taşınır: Electron kabuğu ve betikler, başlık çubuğu, toast, araç kaydı ve araç
çubuğu, yan/alt panel, kart paneli, komut girişi, öneri/şablon, yardım penceresi,
matematik klavyesi, stiller, belge çekirdeği (ID, ad, snapshot geçmişi,
`graph-equality`), kare biriktirici ve test yardımcıları.

Kartlar (Y1) ve komut girişi (Y2) de bu paket üzerine kurulacağı için bu iş önce
gelir. Seçenekler: projeleri tek depoda npm workspaces ile toplamak (önerilen)
veya ayrı bir ortak paket deposu. Depo yapısı kullanıcının kararıdır. Ertelenirse
Y1 ve Y2 için drAW2D modülleri aynı API ile kopyalanır.

**Ertelendi (2026-10-24):** Kullanıcı tek depoya toplamayı şimdilik istemiyor.
Üçüncü bir uygulama olan drAW (`../drAW`) da var; gerekirse üçü birlikte ortak
depoya taşınacak. O zamana kadar ortak modüller drAW2D'deki dosyaların aynı API'li
kopyaları olarak kalır ve birlikte güncel tutulur.

**Yine ertelendi (2026-10-25):** Kullanıcı tek depo/ortak paketi ertelemeye devam ediyor.
Ortak kodların (matematik klavyesi, başlık çubuğu vb.) zamanla farklılaşması sorun
değil; kopyaları birebir aynı tutmak zorunlu değildir, yararlı düzeltmeler diğer
projeye aktarılır. Tek depoya geçişin bedeli: her depodaki
`releases/latest/download/...` bağlantı düzeni bozulur, iş akışları ve etiketler
yeniden düzenlenir. Sürüm iş akışı ve `release-assets.mjs` üç projede aynı kalır.

### A2. Android/iOS paketleme

Capacitor ile aynı `dist/` çıktısı paketlenir. Mobil WebView'da WebGL, bellek ve
ısınma kontrol edilir; piksel oranı ve gölgeler cihaza göre ayarlanır (bkz. Y10).

**Kullanıcı kararları (2026-10-25):** Henüz kodlanmayacak, yalnız not alındı.

1. **Android şimdilik yalnız GitHub Releases'te** yayımlanır, ama ileride Play Store'a
   geçilebilecek şekilde tasarlanır.
2. **iOS beklemede.** (iOS paketi yalnız macOS'ta derlenir; GitHub'dan dosya olarak
   kurulamaz, App Store/TestFlight ve yıllık Apple Developer hesabı gerekir.)
3. **Önce yalnız drAW3D'de denenir.** Eksik, fazla ve hatalı yönler görüldükten sonra
   drAW ve drAW2D'ye eklenir. O zamana kadar drAW3D'nin `release.yml` ve
   `release-assets.mjs` dosyaları diğer iki projedekinden bilerek farklı olur;
   uygulanınca CLAUDE.md'deki "üç projede aynı dosya" kuralına bu geçici istisna yazılır.

**Tasarım notları (Play Store'a geçişi kolaylaştıracak seçimler):**

- **Uygulama kimliği** `com.madematik.draw3d` (Electron'daki `AppUserModelId` ile aynı).
  Play Store'da yayımlandıktan sonra değiştirilemez; baştan böyle sabitlenir.
- **Sürüm:** `versionName` `package.json`'dan, `versionCode` ondan türetilir
  (ör. `major·10000 + minor·100 + patch`), hep artar. Tek sürüm kaynağı yine `package.json`.
- **İmza (2026-10-25'te netleşti):** Tek bir imza anahtarı (keystore) oluşturulur: RSA
  4096, en az 30 yıl geçerli (Play en az 25 yıl ister). Dosya ve parolaları GitHub
  secrets'ta saklanır, kullanıcı ayrıca güvenli bir yedek tutar (kaybolursa GitHub
  sürümü güncellenemez). Play Store'a geçerken Play App Signing'de Google'ın yeni anahtar
  üretmesi seçilmez; bu anahtar Google'a **uygulama imza anahtarı** olarak verilir
  (PEPK aracıyla şifreli). Böylece GitHub APK'sı ile Play sürümü aynı imzayı taşır,
  kullanıcı silmeden (verisini kaybetmeden) Play'den güncelleme alır. Play'e yükleme
  için ayrı bir **yükleme anahtarı** oluşturulur (Google'ın önerisi; kaybolursa Google
  yeniler). Releases'teki APK'lar asıl anahtarla imzalanmaya devam eder.
  Anahtar kullanıcının bilgisayarında (`keytool`) oluşturulur, yedeğini kullanıcı tutar
  (kullanıcı onayı, 2026-10-25); depoya hiç girmez (`*.jks`, `*.keystore` `.gitignore`'a
  eklenir), GitHub'a yalnız secret olarak (base64) yüklenir.
- **Çıktılar:** Releases için imzalı `drAW3D-android.apk` (sürümsüz ad,
  `releases/latest/download/drAW3D-android.apk` bağlantısı sabit kalır); `SHA256SUMS.txt`
  ve Türkçe sürüm notları bu dosyayı da içerir. Play Store'un istediği AAB
  (`bundleRelease`) aynı Gradle projesinden üretilebilir durumda tutulur, şimdilik
  yayımlanmaz.
- **Derleme:** Sürüm iş akışına `ubuntu-latest` üzerinde ayrı bir Android işi: JDK ve
  Android SDK kurulur, `npm run build` → `npx cap sync android` → Gradle. Testler Linux
  işindeki gibi önce çalışır; bir adım başarısızsa sürüm yayımlanmaz. Elle yükleme yok.
- **Proje:** Capacitor'ın `android/` klasörü depoya girer (simgeler, açılış ekranı,
  izinler orada ayarlanır). İnternet izni gerekmez; uygulama paketin içinden açılır.
- **Platforma özel kod:** `app/files.ts` üçüncü platform olarak Android'i alır:
  açma/kaydetme Capacitor Filesystem ve dosya seçiciyle, PNG/SVG/PDF paylaşım menüsüyle
  (Share); yazdırma Android'in yazdırma servisiyle. `.drw3` dosyalarının uygulamayla
  açılması (intent filter) sonraki adımdır.
- **Android'e özgü davranış:** Geri tuşu önce açık menü/pencereyi kapatır, sonra
  uygulamadan çıkar. Otomatik kayıt uygulama arka plana geçerken de yapılır.
- **Denenecekler:** Gerçek cihazlarda (düşük ve orta seviye telefon, tablet) WebGL2,
  bellek, ısınma ve pil; en düşük Android sürümü (minSdk) bu denemeye göre seçilir.

**Android uygulandı (2026-10-25):** Capacitor 8 projesi `android/` depoda. Yukarıdaki
tasarım notları uygulandı: kimlik `com.madematik.draw3d`, sürüm adı ve kodu
`package.json`'dan (0.1.1 → 101), imza ortam değişkenlerinden (anahtar depoya girmez),
Android 7.0+ (minSdk 24). Dosya açma/kaydetme Android'in belge seçicileriyle (izin
istemez; açılan dosyaya Kaydet aynı dosyaya yazar), PNG/SVG kaydı aynı yolla, açınım
Android'in yazdırma servisiyle yazdırılır (oradan PDF de kaydedilir) — küçük bir yerel
eklenti (`DrawFilesPlugin.java`). Geri tuşu önce açık menü/pencere/aracı kapatır, sonra
uygulamayı arka plana alır; arka plana geçerken belge otomatik kaydedilir. Simgeler ve
açılış ekranı `public/img/app-icon.png`'den (`scripts/android-icons.sh`). Sürüm iş
akışında Android işi APK'yı üretip imzasını denetler, GitHub sürümüne
`drAW3D-android.apk` olarak koyar; `SHA256SUMS.txt` ve sürüm notu APK'yı ve kurulum
adımını içerir. Yerelde test anahtarıyla imzalı APK derlendi ve denetlendi.

**İmza anahtarı (2026-10-25):** Kullanıcı anahtarı oluşturdu, yedekledi ve GitHub
secret'larına ekledi; yayımlamadan yapılan derlemede APK bu anahtarla imzalandı
(`CN=mADEMatik`, sertifika SHA-256 `84f78df0…b856f1fa96`).

**Ortak anahtar (2026-10-25, kullanıcı kararı):** drAW2D de aynı anahtarı kullanır; dosyanın
adı `draw3d-release.jks` iken `draw-general-release.jks` oldu. Ad imzayı ve secret'ları
etkilemez. İmza ortam değişkenleri iki projede ortak adlarla `ANDROID_KEYSTORE*` oldu;
`android/app/build.gradle` eski `DRAW3D_*` adlarını da okur.

**İlk telefon denemesi (2026-10-25):** SVG kaydı çalıştı. İki hata bulundu ve
düzeltildi:
- Belge `ad.drw3.json` olarak kaydediliyordu: türü `application/json` verilince Android
  adın sonuna `.json` ekliyor. Belge artık `application/octet-stream` türüyle
  kaydedilir, ad `.drw3` olarak kalır.
- PNG kaydı uygulamayı çökertiyor, dosya boş kalıyordu: seçici açıkken Android bekleyen
  eklenti çağrısını etkinliğin saklanan durumuna koyar; birkaç MB'lık PNG verisi bu
  durumun ~1 MB sınırını aşınca uygulama kapanıyordu. Kaydetme artık iki adımdır:
  önce yalnız ad ve türle yer sorulur (`create`), veri yer seçildikten sonra ayrı
  çağrıyla yazılır (`write`).

**İkinci telefon denemesi (2026-10-25):** PNG, SVG ve `.drw3` kaydı (adı artık yalnız
`.drw3`), açınımı yazdırma ve PDF olarak kaydetme, geri tuşu (menü, araç, klavye, alt
panel, yardım, sonra arka plan) ve otomatik kayıt (uygulama kapatılıp açılınca, arka
plana geçerken) çalışıyor. Yeni notlar Y12'de.

**`.drw3` dosyalarının drAW3D ile açılması uygulandı (2026-10-25):** Manifest'te iki
`VIEW` filtresi: `application/octet-stream` türü (Android `.drw3` için tür bilmez; dosya
yöneticileri onu böyle verir, drAW3D de öyle kaydeder) ve adresinde `.drw3` uzantısı
olan dosyalar. Bu yüzden drAW3D, türü bilinmeyen dosyalarda da "Birlikte aç" listesinde
görünür; içerik açılırken denetlenir, drAW3D belgesi değilse bildirilir. Uygulama
kapalıyken dokunulan dosya açılışta (`App.getLaunchUrl`), açıkken dokunulan dosya hemen
(`appUrlOpen`) açılır; açmak tek geçmiş adımıdır (Geri Al önceki çizime döner).
Eklentinin `read` yöntemi dosyayı verilen izinle okur; Kaydet o dosyaya yazamazsa
(çoğu uygulama yalnız okuma izni verir) kaydet penceresi açılır. Bilinen sınır:
uygulama Android tarafından kapatılıp son uygulamalardan yeniden açılırsa Android
aynı dosyayı yeniden verebilir; o zaman dosya yeniden açılır (Geri Al ile önceki
çizime dönülür).

**Bekleyen (A2):** Dosyaya dokunarak açmanın telefonda denenmesi; ilk Android'li sürümün
yayımlanması; uzun kullanımda ısınma ve pil; AAB/Play Store sonra.

## Özellikler

### Y1. Nesne kartları ve görünüm ayarları

drAW2D'deki kart paneli: geniş ekranda yan panel, dar ekranda alt panel. Kartlar
nesne ID'sine göre yerinde güncellenir, en yeni en üstte durur. Kartta ad, tanım
ve değer (koordinat, uzunluk, açı…) bulunur; gizle/göster düğmesi vardır.

Ayarlar: renk, boyut, çizgi stili, saydamlık, etiket, yüzleri ve kenarları ayrı
ayrı gösterme. Prizma ve piramitte kenar sayısı, açınım yapılabilen cisimlerde
açınım açısı kaydırıcısı karta taşınır.

**Uygulandı (2026-10-24):** drAW2D'nin yan paneli (`ui/side-panel.ts`, aynı API)
ve kart paneli (`ui/object-panel.ts`, 3B görünüm ayarlarıyla) geldi. Dar ekranda
panel alt paneldir, Cebir ve Araçlar sekmeleri vardır; araç çubuğundaki ok paneli
açıp kapatır. Kartlar nesne kimliğine göre yerinde güncellenir, en yeni üstte;
cisimlerin yardımcıları (C noktası, köşeler, AB kenarı) kart göstermez. Değerler
(`app/object-cards.ts`): doğru parçasında uzunluk, düzlemde denklem (`y − z = 0`),
açıda derece, kürede yarıçap, yüzey alanı, hacim; prizma ve piramitte taban alanı,
yüzey alanı, hacim; silindir ve konide r, h, yüzey alanı, hacim. Renkli düğme gizler
ve gösterir, çöp kutusu siler. Sahnede seçilen nesnenin kartı öne gelir ve vurgulanır,
karta tıklamak nesneyi seçer. Görünüm düğmesi seçili kartta açılır: renk, boyut
(noktalar) ya da kalınlık (doğrular, açılar), çizgi stili (kalın doğrularda kesikli
ve noktalı parçalar; cisim kenarlarında kesikli/noktalı çizgi), saydamlık, etiket
(adı sahneye yazar), yüzler ve kenarlar. Varsayılana dönen ayar alanı modelden siler.
Cismin AB kenarı cismin kenar ayarlarını izler. Kenar sayısı ve açınım kaydırıcıları
seçili cismin kartındadır; panel kapalıyken aynı kaydırıcılar sahnenin üzerinde
çıkar, prizma ve piramit araçları kenar sayısını yine oradan alır. Kaydırıcı ve
ayar değişiklikleri bırakılınca tek geçmiş adımıdır.

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

**Uygulandı (2026-10-24):** `src/commands/language.ts` giriş dilinin tek tablosudur
(komut adları ve eş adları, şablonlar, yardım konuları ve örnekleri); öneriler,
şablonlar, yardım penceresi ve matematik klavyesinin Komutlar sekmesi buradan
üretilir. Komutlar: `(x, y, z)`, `A=(1,2,3)`, `Doğru`, `DoğruParçası`, `Işın`,
`Düzlem`, `Açı(A,B,C)`, `Küre(M,N)`, `Küre(M,r)` (yarıçapla; tepedeki mor nokta
yarıçapı değiştirir), `Prizma/Piramit(A,B[,n[,h]])`, `Silindir/Koni(M,N[,h])`,
`Açınım(cisim, açı)` (var olan cismi açar), ölçümler (Y3) ve `ad = değer`
parametreleri. Sayılar sabit ya da parametre ifadesi olabilir (`(a,0,1)`,
`Prizma(A,B,n,2*h)`); ifadeler math.js 15.2.0 ile, yalnız sayısal işlemlere izin
veren bir ağaç denetiminden sonra hesaplanır (`commands/expressions.ts`). Nesne
ifadeyi `definition` alanında saklar; her yenilemede parametrelerin güncel
değeriyle hesaplanır (`document/definitions.ts`), kenar sayısı değişince köşe
noktaları da eşitlenir. Parametre başka parametrelerin ifadesi olabilir
(`b=a+1`, döngü engellenir); kaydırıcı yalnız sayı değerli parametrede çıkar,
sınırları seçili kartta düzenlenir. Elle sürüklenen ya da kaydırıcıyla değiştirilen
bir değerin ifadesi bırakılır. Komut hazırlığı (`commands/prepare.ts`) belgeyi
değiştirmez: hatalı komut kimlik, ad ve geçmiş tüketmez. Kullanılan bir adla
yazılan komut o nesneyi yeniden tanımlar (`A=(1,2,3)` A'yı taşır, `a=3` a'yı
değiştirir). Karttan düzenleme (`document/redefine.ts`) `ad: tanım` metnini
uygular: ad değişince parametre ifadeleri izler; tanım değişince nesne kimliği,
rengi, yardımcıları ve ona bağlı her şey korunarak yerinde güncellenir. Aynı aile
içinde tür değişebilir (doğru/doğru parçası/ışın, prizma/piramit, silindir/koni);
nesne kendisine ya da ona bağlı bir nesneye başvuramaz; gerektiğinde belge
bağımlılık sırasına yeniden dizilir. Nesneye bağlı noktaya yazılan koordinatlar
noktayı nesnesi üzerinde en yakın yere taşır. Cisimlerin yardımcı kenarları kısa
adları kullanmaz (`kenar1`, `yarıçap1`), böylece `a`, `b` gibi adlar kullanıcıya
kalır.

**Klavyede büyük/küçük harf (2026-10-25, kullanıcı isteği):** matematik klavyesinin
harf sekmesine ⇧ tuşu eklendi (drAW2D ile aynı): bir kez basınca sonraki harf büyük,
iki kez basınca kilitli, üçüncüde kapalı; Türkçe büyük harfler (i → İ, ı → I).

### Y3. Ölçümler

Uzunluk, uzaklık (nokta-doğru, nokta-düzlem, doğru-doğru), açı (iki doğru,
doğru-düzlem, iki düzlem), alan, yüzey alanı ve hacim. Kartta ve komut olarak
(`Uzunluk`, `Uzaklık`, `Alan`, `YüzeyAlanı`, `Hacim`) kullanılır.

**Uygulandı (2026-10-24):** `geometry/measures.ts` saf fonksiyonları:
`Uzunluk(doğru parçası)`; `Uzaklık(a, b)` nokta, doğru, doğru parçası, ışın ve
düzlemin her ikilisi için (aykırı doğrular, uç noktalara kırpılan doğru parçaları,
paralel düzlemler; kesişenler 0); `Açı(a, b)` iki doğru, doğru-düzlem ve iki düzlem
arasındaki dar açı; `Alan(cisim)` taban alanı (`TabanAlanı` eş adı),
`YüzeyAlanı(cisim)` ve `Hacim(cisim)` prizma, piramit, silindir, koni ve kürede.
Ölçüm kendi nesnesidir (`measure`): kartında değeri, sahnede `ad = değer` yazısı
bulunur; uzaklık en kısa bağlantıyı kesikli çizgiyle gösterir. Ölçülen nesne
değişince değer izler, silinince ölçüm de silinir, tanımsızsa değer ∅ olur. Cisim,
küre ve doğru parçası kartları ayrıca kendi ölçülerini gösterir (Y1).

### Y4. Görünüm

Not (2026-10-24): Kartın görünüm ayarlarındaki "Etiket" seçeneği (Y1) bir nesnenin
adını sahneye yazar; adların varsayılan olarak gösterilmesi bu maddededir.

- Standart görünümler: önden, üstten, yandan, izometrik.
- Perspektif ve ortografik arasında geçiş.
- Koordinat eksenleri ve nokta koordinatları.
- Nesne etiketleri (A, B, C…).
- Gizli kenarların ders kitaplarındaki gibi kesikli çizgiyle gösterilmesi.

**Uygulandı (2026-10-24):** Araç çubuğundaki Görünüm menüsü (`ui/view-menu.ts`):
standart, önden, üstten, yandan ve izometrik bakış (hedef ve uzaklık korunur;
Standart her şeyi sıfırlar); Ortografik (dik izdüşüm) kamera — geçişte görünen boyut
korunur, yakınlaştırma çalışır (`app/camera-state.ts`); renkli x, y (yukarı), z
eksenleri, ok uçları, adları ve 5 birimde bir sayılarıyla; etiketleme (Hiçbiri,
Yalnız noktalar — varsayılan —, Tüm nesneler); nokta koordinatları (`A(1, 2, 0)`);
gizli kenarların kesikli çizilmesi (varsayılan açık). Dışbükey cisimde iki yüzü de
arkaya bakan kenar gizlidir (`geometry/visibility.ts`); silindir ve konide taban
çemberleri parça parça ayrılır ve yan yüzün görünür sınır çizgileri çizilir; kamera
dönerken her karede güncellenir. Kartın "Etiket" kutusu nesnenin kendi ayarıdır ve
etiketleme modunu geçer; mod ile aynı olan ayar saklanmaz. Görünüm ayarları belge
geçmişine girmez, tarayıcıda hatırlanır.

### Y5. Yapı araçları

Orta nokta; doğru-düzlem, düzlem-düzlem ve doğru-küre kesişimleri; dik ve paralel
doğru ile düzlem; bir noktanın düzleme izdüşümü. Hem araç çubuğunda hem komut
olarak sunulur.

**Uygulandı (2026-10-24):** Yapılmış noktalar tek bir kuralla kurulur
(`construct`: orta nokta, kesişim, izdüşüm; `geometry/derived.ts`): koyu gri çizilir,
sürüklenmez, kaynakları değişince izler, tanımsızken gizlenir ve geri gelir. Dik ve
paralel doğrular ve düzlemler, iki düzlemin kesişim doğrusu sıradan doğru/düzlem
nesneleridir; ikinci (ve üçüncü) noktaları sahnede görünmeyen, seçilmeyen iç
yardımcılardır (`yardımcı1…`), nesneyle silinir. Komutlar: `OrtaNokta(A,B)`,
`OrtaNokta(s)`, `Kesiştir(a,b)` (doğru-doğru, doğru-düzlem, doğru-küre iki nokta,
düzlem-düzlem doğru), `İzdüşüm(P, düzlem veya doğru)`, `DikDoğru(P, düzlem veya
doğru)`, `ParalelDoğru(P, d)`, `DikDüzlem(P, d)`, `ParalelDüzlem(P, p)`. Araçlar:
Nokta grubunda Orta Nokta, Kesiştir, İzdüşüm; Doğrular grubunda Dik ve Paralel Doğru;
Düzlem grubunda Dik ve Paralel Düzlem. Araçlar nokta adımlarının yanında nesne seçer
(uymayan nesne yok sayılır) ve aynı komut yolundan kurar; kurulamayan seçim bildirilir.
Kartlarda tanım (`M: OrtaNokta(A, B)`, `n: DikDoğru(P, p)`) görünür ve düzenlenerek
değiştirilebilir.

### Y6. Kaydetme, açma, otomatik kayıt ve dışa aktarma

**Dosya uzantısı (2026-10-24, kullanıcı isteği):** drAW3D belgeleri `.drw3` uzantısını
alır. Ailenin kuralı: drAW `.drw`, drAW2D `.drw2`, drAW3D `.drw3`.

Belge JSON olarak kaydedilir ve açılır. Otomatik kayıt yapılır. Görünüm PNG
olarak dışa aktarılır. Electron'da dosya erişimi preload/IPC üzerinden olur,
web'de dosya indirme ve yükleme kullanılır.

**Uygulandı (2026-10-24):** Araç çubuğunun başındaki Dosya menüsü (`ui/file-menu.ts`):
Yeni (geri alınabilir), Aç (Ctrl+O), Kaydet (Ctrl+S), Farklı Kaydet (Ctrl+Shift+S),
Görüntüyü PNG olarak kaydet. Belge biçimi `document/file-format.ts`:
`{ app: 'drAW3D', format: 1, objects, camera }` JSON'u, `.drw3` uzantısı; açarken türler,
kimlikler, başvurular ve koordinatlar denetlenir, geometri çözülemezse belge değişmez.
Açmak tek geçmiş adımıdır. Masaüstünde dosyalar yerel diyaloglarla açılıp kaydedilir
(`window.drAW3DDesktop.files`, `file:*` IPC; ana süreç yalnızca diyalogda seçilen yollara
yazar); Chromium tabanlı tarayıcılarda File System Access API ile aynı dosyaya
kaydedilir, diğerlerinde indirme ve dosya seçici kullanılır (`app/files.ts`). Belge her
değişiklikten bir saniye sonra ve sayfa kapanırken tarayıcıya kaydedilir; açılışta son
çalışma geri yüklenir ve geçmiş oradan başlar (`GeometryDocument.reset`). PNG, WebGL
tuvali ile HTML etiketlerinin birlikte çizilmesiyle elde edilir.

### Y7. Açınımı ölçekli yazdırma ve PDF

90°'deki açınım ağı gerçek ölçekte (mm) SVG veya PDF olarak çıkarılır; yapıştırma
payları isteğe bağlıdır. Öğrenci yazdırıp kesip katlayabilir. Electron'da
`printToPDF`, web'de yazdırma sayfası kullanılır.

**Uygulandı (2026-10-24):** Dosya menüsünün "Açınım (seçili cisim)" bölümü: Gerçek
ölçekte SVG olarak kaydet, Yazdır, masaüstünde PDF olarak kaydet; "Yapıştırma payları"
seçeneği hatırlanır. `geometry/net-sheet.ts` tamamen açılmış ağı düzleme indirir:
çokyüzlülerde kök yüzün düzlemi, katlanan kenarlar kesikli, kesilen her kenar iki kez;
payla her kesilen kenar çiftinin birine yamuk bir pay eklenir (yüzü örtmeyen taraf
yeğlenir). Silindir ve konide ağ doğrudan 2B hesaplanır: dikdörtgen veya daire dilimi
(kesik konide halka dilimi), kapaklar yan yüze teğet; paylar dikiş kenarında ve
kapakların çevresinde dişler halinde. `rendering/net-svg.ts` A4 dikey sayfa (mm) çizer:
1 birim = 1 cm, sığmazsa önce 5°'lik adımlarla döndürülür, yine sığmazsa en az
küçültülür ve alt yazıda belirtilir. Yazdırma gizli bir çerçeveyle (`@page` A4, kenar
boşluksuz) yapılır; tarayıcının yazdırma penceresi PDF kaydını da sunar. Masaüstünde
PDF, betik çalıştırmayan gizli bir pencerede `printToPDF` ile üretilir.

### Y8. Kesit

Bir cisim bir düzlemle kesilir; kesit çokgeni gösterilir, isteğe bağlı olarak
alanı da. Kesen düzlem sürüklendikçe kesit canlı güncellenir.

**Uygulandı (2026-10-24):** `Kesit(cisim, düzlem)` komutu ve Düzlem grubunda Kesit aracı
(önce cisim, sonra düzlem). Kesit, düzlemin cismin kenarlarıyla (yuvarlak cisimlerde
ana doğrular ve çemberlerle) kesişim noktalarından oluşan dışbükey çokgendir; kürede
çemberdir (`geometry/section.ts`). Kart alanı yazar, `Alan(kesit1)` ölçülür; düzlem veya
cisim değişince kesit izler, düzlem cismi kesmeyince tanımsız olur. Kesmeyen düzlemle
komut verilirse bildirilir.

### Y9. Yeni cisimler ve açınım seçenekleri

- Kesik koni ve kesik piramit.
- Düzgün çokyüzlüler (dörtyüzlü, küp, sekizyüzlü, onikiyüzlü, yirmiyüzlü).
- Küpün 11 farklı açınımı arasından seçim.
- Açınım için oynat ve durdur düğmesi.

Kürenin düzleme açınımı yoktur; Y9'a girmez.

**Uygulandı (2026-10-24):** Kesik piramit (`KesikPiramit(A, B, n, h, k)`) ve kesik koni
(`KesikKoni(M, N, h, k)`) piramit ve koninin `topRatio` (üst/alt oranı k, 0–1) alanlı
halidir; kartta Oran kaydırıcısı, üst köşeler gri kilitli noktalar. Düzgün çokyüzlüler
(`Dörtyüzlü`, `Küp`, `Sekizyüzlü`, `Onikiyüzlü`, `Yirmiyüzlü`, araç çubuğunda ayrı grup)
bir kenarın iki ucundan kurulur (`geometry/polyhedra.ts`); prizmanın varsayılanı da küp
olmaya devam eder, ama küp aracındaki cisim sürüklense de küp kalır ve 11 açınımı
yalnız onda vardır. Açınım her çokyüzlüde yüz ağacı üzerinden yapılır
(`geometry/nets.ts`): menteşe, yüz komşusunun düzlemine gelene kadar döner. Küpün 11
açınımı yüz grafiğinin kapsayan ağaçlarının düzlemdeki biçimine göre sınıflanır;
`Açınım(küp1, 90, 3)` veya kartın Biçim kaydırıcısı seçer. Kesik koni tam koninin bir
bandı olarak açılır, üst kapak iç yaya teğet katlanır. Kartlarda ve yüzen denetimde
▶/⏸ düğmesi açınımı saniyede 60° açar (açıksa kapatır); bir oynatma tek geçmiş adımıdır.

**Karar (2026-10-25, kullanıcı):** Küp ayrı araç olarak (Düzgün Çokyüzlüler grubunda)
kalır. Prizma aracı da küple başlamaya devam eder; 11 açınım seçimi yalnız küp
aracındaki cisimdedir.

### Y10. Cihaza göre görüntü ayarları

**Kullanıcı isteği (2026-10-25):** Görüntü ayarları telefon, akıllı tahta, PC ve web
için ayrı ayrı uygun olmalı. Kullanıcıya göre PC ve web'de şu an sorun görünmüyor.
Henüz kodlanmayacak, yalnız not alındı.

- **Telefon/tablet:** Piksel oranı sınırı (şu an 2) ve gölgeler cihazın gücüne göre
  düşürülür; kenar yumuşatma gerekirse kapanır. Sahne zaten yalnız değişince çizildiği
  için ısınma çoğunlukla dokunma ve açınım oynatma sırasında olur; bunlar denenir.
  Dar ekran düzeni ve dokunma toleransı (22 px) zaten var; küçük ekranda kart ve
  menülerin sığması kontrol edilir.
- **Akıllı tahta:** Büyük ekran, uzaktan bakılır, parmak ya da kalemle kullanılır.
  Daha büyük düğmeler ve dokunma hedefleri, daha kalın çizgiler, daha büyük noktalar ve
  etiketler gerekir. Tahta ayırt edilemediği için (çoğu Windows PC veya Android'dir)
  Görünüm menüsünde seçilebilen bir "Tahta / sunum" ölçeği olur; dokunmatik büyük ekranda
  öneri olarak sunulabilir.
- **PC ve web:** Bugünkü ayarlar varsayılan kalır.
- Seçim görünüm ayarı gibi cihazda (localStorage) saklanır, belgeye girmez.
- Akıllı tahta ve telefonda gerçek cihazla denenmeden "bitti" denmez.

**Uygulandı (2026-10-25):** Görünüm menüsünde "Ekran türü": Otomatik (bu cihazda neyi
seçtiğini yazar), Bilgisayar, Telefon / tablet, Akıllı tahta; seçim cihazda saklanır.
Profiller `rendering/display.ts`'te:

| | Çizim çözünürlüğü | Gölge haritası | Arayüz | Nokta ve kalın çizgiler | Kenar çizgisi |
|---|---|---|---|---|---|
| Bilgisayar (bugünkü görünüm) | ekranın, en çok 2× | 2048 | 1× | 1× | 1 piksel |
| Telefon / tablet | en çok 1,5× | 1024 | 1× | 1× | ~1 piksel |
| Akıllı tahta | en çok 1,5× | 2048 | 1,4× | 1,6× | 2,5 piksel |

- Otomatik: dokunmatik ve kısa kenarı 900 pikselden küçük ekran telefon/tablet, diğerleri
  bilgisayar. Tahta ayırt edilemediği için hiçbir zaman kendiliğinden seçilmez; büyük
  dokunmatik ekranda bir kez "Görünüm → Ekran türü → Akıllı tahta" önerisi gösterilir.
- Kenarlar artık genişliği ayarlanabilen çizgilerle çizilir (Three.js `LineSegments2`,
  `rendering/edge-lines.ts`): WebGL'in kendi çizgileri hep 1 piksel olduğu için tahtada
  kalınlaştırılamıyordu. Bilgisayarda genişlik yine 1 çizim pikselidir.
- Tahtada arayüz sayfanın CSS `zoom`'uyla büyür; tuval üzerindeki konumlar ekran
  pikselinde kalır, etiketler buna göre yerleştirilir, dokunma toleransı da büyür. Yan
  panelin genişliği ve sürüklenmesi büyütülmüş sayfada doğru çalışır (`side-panel.ts`,
  drAW2D'deki kopyadan bu yüzden ayrıldı).
- Bilinen sınır: CSS `zoom`'un tutarlı davranışı Chromium 128+ ve Firefox 126+ ister.
  Masaüstü uygulaması kendi Chromium'unu taşır; çok eski tarayıcılı tahtalarda masaüstü
  uygulaması önerilir.
- **Bekleyen:** Telefon (ısınma, pil, okunabilirlik) ve akıllı tahta (uzaktan okunurluk,
  dokunma) gerçek cihazda denenmedi; değerler denemeye göre ayarlanacak.

### Y11. Dar ekranda araç çubuğu

**Kullanıcı notu (2026-10-25, telefonda deneme, acil değil):** Henüz kodlanmayacak.

- Üstteki işlem düğmeleri (dosya, geri al/yinele, sil, gizle, görünüm, yardım vb.) dar
  ekranda tek satırda, yana kaydırılarak duruyor. İki satır ya da bir menü (örneğin
  "⋯" düğmesinin altında toplanan işlemler) daha iyi olabilir.
- Alt paneli açıp kapatan düğmenin üst çubukta olması garip duruyor. Düğme panelin
  kendi üzerinde (örneğin panelin tutamacında) ya da başka bir yerde olmalı.

### Y12. İkinci telefon denemesinden notlar

**Kullanıcı notları (2026-10-25):** Henüz kodlanmayacak. Ekran görüntüleri kullanıcının
masaüstünde ("şu anki standart görünüm", "standart görünüm bence böyle biraz uzak
olmalı", "klavye-1", "klavye-2").

1. **Standart görünüm telefonda çok yakın.** Kamera hep aynı noktadan bakıyor
   (`STANDARD_POSITION` = (18, 15, 18), dikey görüş açısı 75°). Dikey tutulan telefonda
   yatay görüş çok dar kaldığı için bir silindir bile ekranı kaplıyor. İstenen: ikinci
   ekran görüntüsündeki gibi cisim ortada, zemin ızgarası bütünüyle görünür. Olası
   yollar: standart görünümde uzaklığı ekranın en/boy oranına göre ayarlamak (dar
   ekranda kamerayı geri çekmek) ya da çizimdeki nesneleri ekrana sığdırmak.
2. **Matematik klavyesinin yüksekliği sabit olmalı.** "123" sekmesinde klavye uzun ve
   giriş alanının üstünü kapatıyor; "Komutlar" sekmesinde yüksekliği farklı. Sekmeler
   arasında geçince yükseklik değişmesin; giriş alanı ve kartın üstü açık kalsın. Aynı
   değişiklik drAW2D'nin klavyesine de yapılacak (drAW'da matematik klavyesi yok).
3. **Logo/simge:** Şu anki simgede küpün içinde "G" harfi var. Küpün içinde "AW" olan
   daha sade bir simge ya da başka bir tasarım düşünülüyor; kullanıcı kararını
   vermedi. drAW2D'nin simgesi için de not alındı (drAW2D yol haritası). Simge
   değişince `public/img/app-icon.png`, `favicon.png` ve Android simgeleri
   (`scripts/android-icons.sh`) yeniden üretilir.

**Uygulandı (2026-10-25):**
- **Standart görünüm:** Kamera aynı yönden bakar; uzaklığı ekranın en/boy oranından
  hesaplanır (`CameraState.standardDistance`). Yatay ekranda bugünkü uzaklık
  (`STANDARD_POSITION`) kalır; dikey ekranda kamera, aynı bölge (merkezden 18 birim)
  yatayda da sığacak kadar geri çekilir. Açılışta ekranın boyutu bilinince standart
  görünüm yeniden kurulur.
- **Klavye:** Bütün sekmeler en uzun sekme kadar (beş satır) sabit yüksekliktedir; az
  satırlı sekmelerin tuşları uzar, komutlar sayfanın içinde kayar. Dar ekranda klavye
  açıkken alt panel uzar (`clamp(42%, 440px, 80%)`), giriş alanı ve bir kartın üstü
  klavyenin üstünde kalır. Aynı değişiklik drAW2D'de de yapıldı.
- **Logo taslakları (karar bekleniyor):** Kullanıcının masaüstünde, projedeki simgeye
  dokunulmadı. A: tel kafes küp, içinde noktalar ve doğru parçalarıyla çizilmiş AW.
  B: dolu mavi küp, ön yüzünde AW. C (kullanıcının isteğiyle A'dan): AW küpün sol ön
  dikey kenarından sağ arka dikey kenarına uzanan köşegen düzlemde, küpün yüzleri hafif
  saydam renkli. D: C'de harfler köşegen düzlemde daha ortada.
- **Logo seçildi (2026-10-25, kullanıcı):** E taslağı — A'daki gibi ön yüze paralel,
  noktalar ve doğru parçalarıyla çizilmiş AW; küpün yüzleri C'deki gibi hafif saydam,
  gizli kenarlar kesikli. Kaynağı `public/img/app-icon.svg`; web, masaüstü paketleri
  (`build/icons`, `build/icon.ico`) ve Android simgeleri `scripts/icons.sh` ile ondan
  üretilir.

