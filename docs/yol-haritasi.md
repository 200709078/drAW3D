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
11. Android/iOS paketleme (A2).

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

**Açık karar (2026-10-24, kullanıcı sorusu):** Küp ayrı bir araç mı olmalı, yoksa prizmaya
mı dahil kalmalı? Şimdilik ayrı araç (Düzgün Çokyüzlüler grubunda) bırakıldı; kullanıcı
isterse kaldırılır ve 11 açınım seçimi kare tabanlı, yüksekliği kenarına eşit prizmalara
verilir.
