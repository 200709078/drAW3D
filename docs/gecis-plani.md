# drAW3D geçiş planı

drAW3D'yi drAW2D gibi web + Electron (ileride Android/iOS) olarak çalışan, test
edilmiş, strict TypeScript bir uygulamaya taşıma planı. Geçişten sonraki
özellikler `docs/yol-haritasi.md` içindedir.

Tarih: 2026-10-24

## Durum

Aşama 0–6 tamamlandı (2026-10-24). Eski kod silindi; yeni uygulama
`docs/ozellik-envanteri.md` maddelerinin hepsini karşılıyor, bilerek yapılan
değişiklikler orada yazılı. Ortak paket (yol haritası A1) kullanıcının kararıyla
bekliyor; ortak parçalar şimdilik drAW2D'deki dosyaların aynı API'li kopyaları.

## Kararlar

- **Platform değişmiyor:** TypeScript (strict) + Vite + Three.js (WebGL2).
  Masaüstü Electron, mobil ileride Capacitor. Unity, Godot, Flutter ve Tauri
  değerlendirildi; yeniden yazma maliyeti, ağır web çıktısı veya Linux'ta WebGL
  tutarsızlığı nedeniyle seçilmedi.
- **Kod korunmuyor:** modüller, algoritmalar ve davranışlar daha verimli, doğru
  veya kullanışlı olacaksa yeniden tasarlanır. Her değişiklik test edilir ve
  açıklanır.
- **Her aşamadan sonra durulur**, kullanıcı onaylamadan sonraki aşamaya geçilmez.
- **drAW2D ile olabildiğince ortak kod ve stil:** ortak parçalar drAW2D'deki dosya
  adları ve API ile yazılır, uygulamaya özel hiçbir şey import etmez. Geçiş
  bitince tek kaynağa taşınır (yol haritası A1).
- **mADEMatik imza bağlantısı** (sağ alttaki `made-signature`) şimdilik kaldırılır.
  Pencere başlığı, meta etiketleri, README ve paket bilgisindeki ad kalır.
- **Araç çubuğu** drAW2D'deki gibi gruplu yapıya geçer.
- **Nesne kartları, komut girişi ve önerilen özellikler** geçişten sonra yapılır
  (yol haritası). Geçişte model bunlara yer bırakacak şekilde kurulur.

## Mevcut durum (2026-10-24)

- Yaklaşık 11 300 satır TypeScript, test yok, `strict` kapalı.
- Durum Three.js nesnelerinde tutuluyor (`mesh.userData` içinde nokta rolü ve
  kısıtlar). Nesne sınıfları (`Prism`, `Cone`…) hem matematiği hem mesh'leri
  hem sahneyi yönetiyor.
- `interaction/LineSegmentConstraint.ts` (1906 satır) bütün nesne türlerini
  tanıyor. `tools/SelectTool.ts` 1191 satır.
- `history/HistoryManager.ts` sahneye nesne ekleyip çıkaran closure'larla çalışıyor,
  bağımlılıklar elle izleniyor.
- 11 çizim aracının çoğu "iki nokta seç, nesne kur" akışını kendi içinde tekrar
  ediyor.
- `core/Loop.ts` sahne değişmese de her karede çiziyor. Açınım sınıfları her
  kaydırıcı hareketinde geometri ve materyali baştan oluşturuyor.
- Araç çubuğu grupsuz bir liste; seçilen araç başa geçtiği için araçların yeri
  değişiyor; dar ekrana uygun değil.

## Strateji

Nesne modeli çok iç içe olduğu için dosya dosya dönüştürme yapılmaz. Eski kod
`src/legacy/` klasörüne taşınır ve uygulama onunla çalışmaya devam eder. Yeni
katmanlar yanında büyür. Yeni uygulama Aşama 0'daki özellik envanterini
karşıladığında `main.ts` yeni koda geçer ve `legacy/` silinir.

## Hedef yapı

```
src/
  main.ts              başlık çubuğunu bağlar, startApp'i çağırır
  app/                 app.ts (bileşim kökü), tools.ts, hit-test.ts,
                       object-drag.ts, camera-state.ts
  document/            geometry-document.ts, graph-equality.ts, dependencies.ts
  geometry/            types.ts, vec3.ts, models.ts, primitives.ts, solids.ts,
                       unfold/ (prizma, piramit, silindir, koni)
  rendering/           frame-renderer.ts, scene-sync.ts, materials.ts,
                       grid.ts, labels.ts
  ui/                  title-bar, toast, tool-registry, main-toolbar,
                       right-actions (ortak olanlar drAW2D ile aynı)
  styles/              styles.css, toolbar.css, titlebar.css (index.html'den link)
electron/              main.ts, preload.cts (yalnızca kabuk)
scripts/               dev-electron, start-electron, test-electron
tests/                 Playwright testleri
build/, public/        ikonlar, paket kaynakları
```

Bağımlılık yönü: `geometry` → `document` → `rendering` / `app` → `ui`.
`geometry` ve `document` DOM ve Three.js bilmez. Geometri kodu Electron'a bağlı
olamaz; işletim sistemi erişimi preload/IPC katmanından geçer.

## Aşamalar

### Aşama 0: Altyapı ve hijyen

**Tamamlandı (2026-10-24).**

- `tsconfig.json`: `strict`. Node ≥ 22.12, `.nvmrc`. `package.json` içinde ad,
  sürüm, açıklama, `engines`; gereksiz `tree` bağımlılığı kaldırılır.
- `index.html`: `lang="tr"`, `made-signature` bağlantısı ve stilleri kaldırılır.
  Stiller TS'den import edilmez, `index.html`'den link edilir (ilk boyamada
  stilsiz görüntü olmasın diye). Kalıntı dosyalar (`vite-dev*.log`) silinir.
- Playwright kurulumu (drAW2D yapılandırması): `/usr/bin/chromium` veya
  Playwright Chromium. WebGL için SwiftShader/ANGLE bayrakları.
- `CLAUDE.md` (drAW2D formatında, Türkçe arayüz kuralı) ve `docs/` dosyaları.
- **Özellik envanteri** (`docs/ozellik-envanteri.md`): her aracın ve kontrolün
  bugünkü davranışı kabul maddeleri olarak yazılır (nokta yerleştirme ve
  nesneye bağlama, iki/üç nokta araçları, prizma ve piramit kenar sayısı,
  açınım 0–90°, düzlem/ızgara üç durumu, seçme/taşıma, sil/gizle/göster,
  geri al/yinele, kısayollar, WebGL hata sayfası).
- Eski kod `src/legacy/` altına taşınır, davranış değişmez.

**Bitiş ölçütü:** `npm run build` geçiyor; duman testi uygulamanın açıldığını,
WebGL bağlamının kurulduğunu ve araç çubuğunun çıktığını doğruluyor.

### Aşama 1: Electron kabuğu ve ortak kabuk parçaları

**Tamamlandı (2026-10-24).**

- drAW2D kalıbı: `electron/main.ts` + `preload.cts` (sandbox,
  `contextIsolation`, `nodeIntegration: false`), çerçevesiz pencere,
  `window.drAW3DDesktop.windowControls`, `DRAW3D_DEV_SERVER_URL`.
- `scripts/` (dev, start, test-electron), `tsconfig.electron.json`, electron-builder
  (`com.madematik.draw3d`, AppImage + deb, NSIS), `build/` ikonları.
- Ortak arayüz parçaları drAW2D'den aynı API ile alınır: `title-bar.ts`,
  `toast.ts`, `titlebar.css`, renk/ölçü değişkenleri.
- Electron'da GPU/WebGL doğrulanır: bağlam kaybı, Linux GPU kara listesi,
  hata sayfası.

**Bitiş ölçütü:** eski uygulama `npm run electron` ile başlık çubuğuyla açılıyor;
`npm run dist:linux` paket üretiyor; `npm run test:electron` geçiyor.

### Aşama 2: Belge modeli (saf TypeScript)

**Tamamlandı (2026-10-24).**

- `geometry/types.ts`, `vec3.ts`: düz `{x, y, z}` vektörleri ve saf işlemler.
- `geometry/models.ts`: nokta, doğru, doğru parçası, ışın, açı, düzlem, küre,
  prizma, piramit, silindir, koni. Ad, ID ve renk üretimi dışarıdan verilir.
- **Kartlar ve komutlar için yer:** her nesnenin bir `name` alanı (A, B, C… ve
  türüne göre ad grupları, drAW2D `names.ts`) ve tanımı (hangi nesnelerden,
  hangi parametrelerle) olur. İsteğe bağlı görünüm alanları baştan tanımlanır:
  `color`, `size`, `lineStyle`, `opacity`, `labelHidden`, `hidden`. Alan yoksa
  varsayılan kullanılır, böylece bir ayarı geri almak tam olarak eski hale döner.
- **Kısıtlar veri olarak tutulur:** `{ type: 'onPlane', ownerId, u, v }`,
  `onSegment`, `onSphere`, `onPrismFace`… Her nesne türü kendi küçük
  izdüşüm/konum fonksiyonunu getirir. `dependencies.ts` `resolveConstraints`
  oluşturma sırasıyla (topolojik) hesaplar; `collectDependents` zincirleme
  silmeyi yönetir. `LineSegmentConstraint.ts` bu yapıyla değiştirilir.
- `document/geometry-document.ts`, drAW2D ile aynı çekirdek: üyelik, seçim,
  tekrar kullanılmayan ID'ler, taslaklar, **snapshot + imleç ile geri al /
  yinele** (sınırlı, varsayılan 100). `graph-equality.ts` sayesinde etkisiz
  düzenleme geçmişe yazılmaz ve yinele dalını silmez. Sürükleme tek adım sayılır.
- Model JSON'a serileştirilebilir olur (kaydet/aç sonradan neredeyse hazır gelir).
- Tanımsız hale gelen bağımlı geometri son koordinatlarını korur ve
  `geometryValid: false` ile gizlenir, koşul düzelince geri gelir.

**Bitiş ölçütü:** model, kısıt, bağımlılık ve geçmiş için sayfasız birim testleri.

### Aşama 3: Geometri ve açınım hesabı

**Tamamlandı (2026-10-24).**

- `geometry/primitives.ts`: doğruya, ışına, doğru parçasına, düzleme ve küreye
  izdüşüm; doğrusallık ve düzlemsellik testleri; açı.
- `geometry/solids.ts`: prizma ve piramit köşe/yüz üretimi (3–20 kenar),
  silindir ve koni parametreleri, yüz ve kenar listeleri.
- `geometry/unfold/`: **açınımlar saf fonksiyonlardır:**
  `(cisim, açı) → yüz çokgenleri ve dönüşümleri`. Mesh üretmez. Ölçekli çıktı
  (yol haritası Y7) için 90°'deki düzlemsel ağ da buradan alınır.
- Değişmez testleri: 90°'de bütün yüzler tek düzlemde; kenar uzunlukları ve toplam
  alan açıdan bağımsız; 0°'de cisim kapalı; silindir ve koni yanal yüzey alanı
  formülle aynı.

**Bitiş ölçütü:** primitive, cisim ve açınım testleri.

### Aşama 4: Çizim katmanı

**Tamamlandı (2026-10-24).**

- `rendering/scene-sync.ts`: belgeyi nesne ID'sine göre Three.js sahnesiyle eşler
  (oluştur, yerinde güncelle, `dispose` et). Paylaşılan geometri ve materyal
  önbelleği (`materials.ts`). Açınım güncellemesi yeni geometri oluşturmaz,
  yalnızca dönüşümleri ve tampon değerlerini değiştirir.
- `rendering/frame-renderer.ts`: çizim istekleri tek bir
  `requestAnimationFrame` içinde toplanır. Yalnızca belge, seçim, kamera veya
  OrbitControls damping değişince kare çizilir. Piksel oranı sınırlı, boyut
  değişince yeniden çizilir.
- Ekranda sabit boyutlu noktalar, ızgara ve düzlem, ışıklandırma.
- `labels.ts` için yer: etiket katmanı arayüzü tanımlanır, görünür etiketler
  yol haritası Y4'te açılır.
- `app/camera-state.ts`: kamera durumu ve OrbitControls tek yerde; standart
  görünüme dönüş.

**Bitiş ölçütü:** kare sayısı, önbellek ve `dispose` testleri (zamana değil
sayıma bakılır); her nesne türü için görsel duman testi.

### Aşama 5: Etkileşim, araçlar ve gruplu araç çubuğu

**Tamamlandı (2026-10-24).**

- Pointer Events ve pointer capture; pencere seviyesinde
  `pointerup`/`pointercancel`.
- `app/hit-test.ts`: ekran pikseli toleransı (dokunmada daha büyük), en yakın
  kazanır, noktalar önce gelir.
- `app/tools.ts` (`ToolController`): araçlar kayıt tablosunda tanımlanır (kaç
  nokta, hangi nesneyi kurar, ek parametreler). Seçilen noktalar belge
  taslağına yazılır, nesne tek bir `prepare` yolundan kurulur (komut girişi
  sonradan aynı yolu kullanacak). Nesnenin üzerine tıklamak ona bağlı nokta
  oluşturur. 11 araç sınıfının yerini bu yapı alır.
- `app/object-drag.ts`: seçim aracıyla serbest nokta, kısıta bağlı nokta ve
  yükseklik ekseninde sürükleme; tanımlayan noktaları serbestse bütün
  nesneyi taşıma. Escape sürüklemeyi geri alır.
- Dokunmatik: tek parmak döndürür, iki parmak yakınlaştırıp kaydırır. Çizim
  araçlarında dokununca nişan alınır, parmak kalkınca işlem yapılır; ikinci
  parmak tek parmak hareketini iptal eder.
- `ui/tool-registry.ts` + `ui/main-toolbar.ts` (drAW2D ile aynı API):
  - **Seç / Taşı**
  - **Nokta:** nokta
  - **Doğrular:** doğru, doğru parçası, ışın
  - **Açı**
  - **Düzlem**
  - **Cisimler:** küre, prizma, piramit, silindir, koni
  - **Eylemler:** geri al / yinele, sil, gizle / göster, düzlem / ızgara,
    standart görünüm

  Dar ekranda geçerli araç düğmesi ve alt panel. `window.drAW3DToolbar` test
  kancası, `#mainToolbar[data-action]`.
- Kısayollar: Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Escape, Delete.

**Bitiş ölçütü:** araç ve sürükleme testleri; sentetik `PointerEvent` ve CDP
dokunma olaylarıyla entegrasyon testleri.

### Aşama 6: Arayüzün tamamlanması ve yeni koda geçiş

**Tamamlandı (2026-10-24).**

- Kenar sayısı ve açınım kaydırıcıları seçili nesneye bağlanır (kartlar
  gelince karta taşınır), düzlem/ızgara üç durumu, toast mesajları, WebGL hata
  sayfası.
- Dar ekran düzeni, `(pointer: coarse)` için büyük dokunma hedefleri.
- `main.ts` yeni uygulamaya geçer, `src/legacy/` ve eski varlıklar silinir.
  README ve `CLAUDE.md` güncellenir.

**Bitiş ölçütü:** özellik envanterinin tamamı karşılanıyor; bütün testler hem
web'de (`npm test`, `TEST_PREVIEW=1 npm test`) hem Electron'da geçiyor.

**Geçiş burada biter.** Sonraki işler `docs/yol-haritasi.md` içindeki sırayla
yapılır.
