# drAW3D özellik envanteri

Geçişten önceki uygulamanın (2026-10-24, `src/legacy/`) davranışı. Yeni
uygulama bu maddelerin hepsini karşılamalıdır. Bilerek değiştirilen davranışlar
"Değişiklik" notuyla, gerekçesiyle birlikte yazılmıştır.

## Sahne

- E1. Açık gri arka plan, 50×50 birimlik zemin düzlemi (y = 0) ve 1 birim aralıklı
  ızgara. Perspektif kamera (75°), başlangıç konumu (18, 15, 18), hedef orijin.
- E2. Fare/dokunmayla döndürme, kaydırma ve yakınlaştırma (OrbitControls,
  sönümlü).
- E3. Düzlem/ızgara düğmesinin üç durumu sırayla döner: ikisi görünür → yalnızca
  ızgara → ikisi gizli → ikisi görünür. Düğmenin simgesi ve başlığı bir sonraki
  durumu söyler.
- E4. WebGL başlatılamazsa veya bağlam kaybolursa Türkçe bir hata sayfası çıkar
  (diğer 3B sekmeleri kapatma, donanım hızlandırma, sürücü önerileri).

## Araçlar

Araç seçilince bir bilgi mesajı (toast) aracın adını ve ne yapılacağını söyler.
Escape seçim aracına döner ve yarım kalan çizimi iptal eder; yarım çizimde
oluşturulan noktalar silinir.

- A1. **Seç/Taşı**: nesne seçer ve taşır (bkz. Seçim).
- A2. **Nokta**: boş yere tıklamak zemine (y = 0) serbest nokta koyar. Bir nesnenin
  üzerine tıklamak o nesneye bağlı (yeşil) nokta koyar. Var olan bir noktaya
  tıklamak noktayı seçer ve seçim aracına döner. Araç nokta koyduktan sonra
  etkin kalır. Farede imleç önizleme noktası gösterir.
- A3. **Doğru**, **Doğru Parçası**, **Işın**: iki farklı nokta. Var olan noktalar
  kullanılabilir, boş yere tıklamak zemine yeni nokta koyar. Aynı noktaya
  ikinci kez tıklamak yok sayılır. İlk noktadan sonra fareyi izleyen önizleme
  çizgisi çıkar. Bitince seçim aracına dönülür. Doğru her iki yönde, ışın
  başlangıçtan bir yönde uzar.
- A4. **Açı**: üç farklı nokta; ikincisi köşedir. Kollar, yay ve derece etiketi
  (tam sayı) çizilir. Önizlemede yay ve etiket görünür.
- A5. **Düzlem**: doğrusal olmayan üç nokta. Saydam düzlem, üç noktanın ağırlık
  merkezinde, 30×30 birim. Önizleme düzlemi çıkar.
- A6. **Küre**: merkez ve yüzey noktası; yarıçap doğru parçası da oluşur.
- A7. **Prizma** ve **Piramit**: iki nokta tabanın ilk kenarını (AB) verir. Kenar
  sayısı 3–20 (varsayılan 4), araç seçiliyken kenar sayısı kaydırıcısı görünür.
  Taban AB kenarına bağlı düzgün çokgendir. Tabanın düzlemini ve yönünü belirleyen
  serbest bir C noktası da oluşur (başta AB'ye dik, yatay, AB uzunluğunda). Yükseklik
  başta |AB|'dir ve taban düzleminin normali boyunca uzar. Önizlemede cisim çıkar.
- A8. **Silindir** ve **Koni**: taban merkezi ve tabandaki bir nokta (yarıçap).
  Yarıçap doğru parçası oluşur. Yükseklik başta 2r'dir; yön, dünyanın yukarı
  yönünün yarıçap doğrultusuna dik bileşenidir.

## Cisimlerin yardımcı noktaları

- Y1. Mor yükseklik noktası: prizmada A', piramitte tepe, silindirde üst merkez,
  konide tepe. Sürüklemek yalnızca yüksekliği değiştirir (dikey fare hareketi).
- Y2. Gri kilitli noktalar: prizma ve piramidin diğer köşeleri, piramidin taban
  merkezi, silindirin üst çemberindeki nokta. Sürüklenemez, ama başka çizimlerde
  nokta olarak kullanılabilir.
- Y3. Kesikli mor yükseklik çizgisi (prizmada A–A', piramit ve konide merkez–tepe,
  silindirde merkezler arası) ve silindirde kesikli ana doğru.

## Seçim

- S1. Noktalar ekran pikseli toleransıyla seçilir (fare 10 px, kalem 14 px, dokunma
  22 px); en yakın kazanır. Nokta yoksa cisim yüzeyi seçilir.
- S2. Seçilen nokta turuncu olur, taşıma yönlerini gösteren oklar çıkar. Seçilen
  cismin kenarları turuncu çizgiyle vurgulanır.
- S3. Serbest nokta kendi yüksekliğindeki yatay düzlemde sürüklenir. Aynı
  noktaya çift tıklamak/dokunmak dikey taşıma kipine geçirir (ok yukarı-aşağı
  döner); tekrar çift tıklamak geri alır.
- S4. Nesneye bağlı nokta yalnızca o nesnenin üzerinde hareket eder (doğru, doğru
  parçası, ışın, düzlem, küre, prizma ve piramidin kenar ve yüzleri, silindir ve
  koninin çember, yan yüz ve taban yüzleri, açının kolları ve yayı).
- S5. Noktayı taşımak ona bağlı her şeyi günceller (doğrular, cisimler, nesneye
  bağlı noktalar).
- S6. Seçili noktanın 70 px yakınından sürüklemeye başlamak o noktayı taşır.
- S7. Boşluğa tıklamak seçimi kaldırır ve kamerayı döndürmeye bırakır. Cisim
  seçiliyken sürüklemek kamerayı döndürür.
- S8. Prizma veya piramit seçilince kenar sayısı kaydırıcısı, prizma, piramit,
  silindir ya da koni seçilince açınım kaydırıcısı görünür.

## Açınım

- U1. Prizma: yan yüzler taban kenarları etrafında dışa döner, üst yüz son yan
  yüze bağlıdır. 0–90°.
- U2. Piramit: yan yüzler taban kenarları etrafında döner; en büyük açı yüzlerin
  tabanla aynı düzleme geldiği açıdır (180° − yan yüz ile taban arasındaki açı).
- U3. Silindir: yan yüzey 2πr genişliğinde dikdörtgen olarak açılır, üst taban
  dikdörtgenin üst kenarına bağlıdır. 0–90°.
- U4. Koni: yan yüzey daire dilimi olarak açılır, en büyük açı ana doğrunun
  tabana yatırıldığı açıdır.
- U5. Açınım ve kenar sayısı değişiklikleri geri alınabilir; kaydırıcı bırakılınca
  tek adım olarak kaydedilir.

## Düzenleme

- D1. Geri al / yinele düğmeleri; Ctrl+Z, Ctrl+Shift+Z ve Ctrl+Y.
- D2. Sil: seçili cisim, kendi yardımcı nokta ve çizgileriyle silinir; başka nesneye
  bağlı olmayan nokta da silinebilir. Nesneye bağlı noktalar ve cisimlerin
  yardımcı noktaları tek başına silinemez. Başka nesnelerin kullandığı noktalar
  silinemez.
- D3. Gizle: seçili nesneyi (cismin bütün parçalarıyla) gizler. Tümünü Göster gizli
  her şeyi geri getirir. İkisi de geri alınabilir.
- D4. Düğmeler yalnızca işlem yapılabilecekken etkindir; başlıkları neden etkin
  olmadıklarını söyler.

## Renkler

- R1. Her yeni çizgi ve cisim rastgele (koyulaştırılmış) bir renk alır. Serbest
  noktalar mavi, nesneye bağlı noktalar koyu yeşil, yükseklik noktaları mor,
  kilitli noktalar gri.

## Geçişte bilinçli değişiklikler (2026-10-24)

Yeni uygulama yukarıdaki maddelerin hepsini karşılar. Aşağıdakiler bilerek
değiştirildi:

- **Araç çubuğu** drAW2D'deki gibi gruplu (Taşı, Nokta, Doğrular, Açı, Düzlem,
  Cisimler). Eylemler (geri al, yinele, sil, gizle, tümünü göster, düzlem/ızgara,
  standart görünüm) çubuğun sağında. Dar ekranda araçlar alttan açılan panelde.
  Gizle ve Tümünü Göster artık ayrı simgeler (göz) kullanır.
- **mADEMatik imza bağlantısı** sağ alttan kaldırıldı (kullanıcı isteği).
- **Bağlı nokta her araçta**: yalnızca Nokta aracı değil, bütün çizim araçları bir
  nesnenin üzerine tıklanınca o nesneye bağlı nokta kullanır.
- **Silme** (D2): nesneyi silmek ona bağlı her şeyi de siler (geri alınabilir). Nesneye
  bağlı noktalar ve başka nesnelerin kullandığı noktalar da silinebilir. Cisimlerin
  yardımcı noktaları ve kenarları yine tek başına silinemez. Cismin kendi oluşturduğu
  A, B noktaları başka bir nesne kullanıyorsa cisimle silinmez, sıradan nokta olur.
  Delete/Backspace seçili nesneyi siler.
- **Yükseklik ve dikey taşıma** (Y1, S3): nokta, fare hareketinin sabit katsayılı bir
  oranıyla değil, imlecin altındaki eksen noktasıyla birebir hareket eder (yakınlaştırma
  düzeyinden bağımsız). Yükseklik en az 0,05'tir; prizma ve piramit tabanın öbür yanına
  devrilmez.
- **Escape** sürüklenen noktayı eski yerine koyar; ardından yarım çizimi iptal eder.
- **Kenar seçimi**: ekranda yakın görünse de bir yüzün arkasında kalan kenar seçilmez;
  üst üste binen kenarlardan kameraya yakın olan seçilir (eskiden 0,35 birim dünya
  toleransı vardı, şimdi ekran pikseli toleransı).
- **Düzlem üzerindeki nokta** çizilen 30×30 karenin içinde kalır.
- **Silindir ve koni açınımı** (U3, U4): yan yüzey artık birden düz dikdörtgen/dilim olarak
  dönmez; yuvarlanarak (eğriliği azalarak) açılır. Her ara durum gerçek bir bükülmedir,
  0°'de cisimle, en büyük açıda düz açınımla çakışır.
- **Açınım sırasında** cismin yüzleri soluklaşır, açınım ağı öne çıkar.
- **Açı etiketi** sahnede doku yerine HTML yazıdır; her yakınlaştırmada keskindir.
- **Çizim** yalnızca bir şey değişince ve kamera kayarken yapılır; sahne boştayken GPU
  çalışmaz.
