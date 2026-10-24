# drAW3D

Web ve masaüstü için **3B geometri ve açınım (net)** uygulaması. Three.js ve TypeScript ile
geliştirilmiştir; aynı çıktı tarayıcıda ve Electron masaüstü uygulamasında (Linux AppImage/deb,
Windows NSIS) çalışır.

made by **mADEMatik** — [madematik.com](https://www.madematik.com)

İlgili proje: [drAW2D](https://github.com/200709078/drAW2D)

## İndir

Masaüstü uygulamasının son sürümü (bağlantılar her zaman en yeni sürümü indirir):

- **Windows 10/11 (64-bit):** [drAW3D-win-x64.exe](https://github.com/200709078/drAW3D/releases/latest/download/drAW3D-win-x64.exe)
- **Linux DEB (Pardus, Debian, Ubuntu):** [drAW3D-linux-amd64.deb](https://github.com/200709078/drAW3D/releases/latest/download/drAW3D-linux-amd64.deb)
- **Linux AppImage:** [drAW3D-linux-x86_64.AppImage](https://github.com/200709078/drAW3D/releases/latest/download/drAW3D-linux-x86_64.AppImage)

Bütün sürümler, kurulum adımları ve SHA-256 değerleri: [Releases](https://github.com/200709078/drAW3D/releases).

## Özellikler

- **3B nesneler**: nokta, doğru, doğru parçası, ışın, açı (derece etiketiyle), düzlem
- **Katı cisimler**: küre, prizma, piramit, kesik piramit, silindir, koni, kesik koni
- **Düzgün çokyüzlüler**: dörtyüzlü, küp, sekizyüzlü, onikiyüzlü, yirmiyüzlü — bir kenarından
- **Açınım**: çokyüzlülerin yüzleri kenarları etrafında açılır; silindir ve koninin yan
  yüzeyi bükülerek düzleşir. Kaydırıcıyla 0°'den cismin tamamen açıldığı açıya kadar veya
  ▶ düğmesiyle kendiliğinden; küpün 11 farklı açınımından biri seçilir.
- **Açınımı yazdırma**: seçili cismin ağı A4'e gerçek ölçekte (1 birim = 1 cm) SVG, yazdırma
  veya PDF olarak; kesim çizgileri düz, katlama çizgileri kesikli, isteğe bağlı yapıştırma payları.
- **Kesit**: bir cisim veya küre bir düzlemle kesilir; kesit ve alanı düzlemle birlikte değişir.
- **Kenar sayısı**: prizma ve piramit için 3–20; çizerken ve seçiliyken kaydırıcıyla
- **Nesneye bağlı noktalar**: doğru, düzlem, küre, cisimlerin kenar ve yüzleri, açının kolları
  ve yayı üzerinde; nokta yalnızca nesnesi üzerinde kayar ve nesneyi izler. Bütün çizim
  araçları nesne üzerine tıklanınca bağlı nokta kullanır.
- **Taşıma**: serbest nokta yatayda, çift tıklayınca dikeyde; mor yükseklik noktası cismin
  yüksekliğini değiştirir; gri köşe noktaları kilitlidir.
- **Sil, gizle, tümünü göster, geri al / yinele** (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Delete, Escape)
- **Dosya**: `.drw3` belgeleri açma ve kaydetme (Ctrl+O, Ctrl+S), otomatik kayıt (açılışta son
  çalışma geri gelir), görüntüyü PNG olarak kaydetme
- **Yapılar**: orta nokta, kesişim (doğrular, düzlemler, küre; iki düzlem bir doğruda kesişir),
  izdüşüm, dik ve paralel doğru, dik ve paralel düzlem — araç olarak ve komutla
  (`OrtaNokta`, `Kesiştir`, `İzdüşüm`, `DikDoğru`, `ParalelDoğru`, `DikDüzlem`, `ParalelDüzlem`).
- **Görünüm menüsü**: standart, önden, üstten, yandan, izometrik; ortografik kamera; eksenler;
  etiketleme (hiçbiri, noktalar, tümü) ve nokta koordinatları; gizli kenarlar ders kitabındaki
  gibi kesikli.
- **Düzlem / ızgara** göster-gizle, **standart görünüm**
- **Nesne kartları** (drAW2D ile aynı panel): her nesnenin tanımı ve değerleri — uzunluk, düzlem
  denklemi, açı, yarıçap, taban alanı, yüzey alanı, hacim. Kartta gizle/göster, sil, düzenle;
  cisimlerde kenar sayısı ve açınım kaydırıcıları.
- **Görünüm ayarları**: renk, boyut/kalınlık, çizgi stili (düz, kesikli, noktalı), saydamlık,
  etiket, yüzleri ve kenarları ayrı ayrı gösterme.
- **Komut girişi**: `A=(1,2,3)`, `DoğruParçası(A,B)`, `Düzlem(A,B,C)`, `Küre(M,2)`,
  `Prizma(A,B,6,4)`, `Silindir(M,N,5)`, `Küp(A,B)`, `KesikKoni(M,N,4,0.5)`, `Kesit(küp1,p)`,
  `Açınım(prizma1,90)`; yazarken öneriler ve doldurulacak
  şablonlar, yardım penceresi ve matematik klavyesi.
- **Parametreler**: `n=5` bir kaydırıcıdır; `Prizma(A,B,n)`, `(a,0,1)`, `Küre(M,r)` gibi tanımlar
  ona bağlanır ve kaydırıcıyla canlı değişir. Kart düzenlenerek ad ve tanım değiştirilir.
- **Ölçümler**: `Uzunluk`, `Uzaklık` (nokta, doğru, düzlem), `Açı(d, p)` (doğru ve düzlemler
  arasında), `Alan` (taban), `YüzeyAlanı`, `Hacim`; değer kartta ve sahnede yazılır.
- **Gruplu araç çubuğu** (drAW2D ile ortak); dar ekranlarda nesneler ve araçlar alt panelde
- **Dokunmatik**: tek parmak döndürür, iki parmak yakınlaştırır ve kaydırır; çizim araçlarında
  dokunuş nişan alır, parmak kalkınca nokta konur.

## Geliştirme

Node ≥ 22.12 (`.nvmrc`: 22).

```bash
npm ci
npm run dev              # Vite geliştirme sunucusu
npm run build            # tür denetimi + Electron kabuğu + vite build → dist/, dist-electron/
npm test                 # Playwright testleri
npm run electron:dev     # Electron, geliştirme sunucusuyla
npm run test:electron    # derler, uygulamayı file:// ile açıp denetler (grafik oturum gerekir)
npm run dist:linux       # AppImage + deb
npm run dist:win         # NSIS kurulum dosyası
```

Sürüm paketleri GitHub Actions ile üretilir (`.github/workflows/release.yml`): Linux paketleri
Ubuntu'da, Windows `.exe` Windows'ta derlenir ve GitHub sürümüne yüklenir. Yeni sürüm için
`npm version patch` ardından `git push --follow-tags`; mevcut sürümün paketlerini yenilemek için
Actions sekmesinde **Run workflow**. Dosya adlarında sürüm yoktur, böylece
`releases/latest/download/<ad>` bağlantıları değişmez.

## Proje yapısı

```
src/
  main.ts          başlık çubuğunu bağlar, uygulamayı başlatır
  app/             bileşim kökü, kamera, isabet testi, çizim araçları, seçim/taşıma, kartlar
  commands/        giriş dili tablosu, ayrıştırıcı, sayısal ifadeler, komut hazırlığı
  document/        belge ve geçmiş, adlar, yapılar, bağımlılıklar, tanımlar, yeniden tanımlama
  geometry/        vektörler, nesne modelleri, cisim şekilleri, düzgün çokyüzlüler, parçalar,
                   açınım ağları, kesit, ölçümler, yazdırılacak ağ
  rendering/       sahne eşleme, nesne görünümleri, malzemeler, etiketler, kare biriktirici, A4 SVG
  ui/              araç çubuğu, dosya ve görünüm menüleri, yan panel, kartlar, komut girişi,
                   yardım, klavye, toast
  styles/          stiller (toolbar.css ve titlebar.css drAW2D ile ortak)
electron/          masaüstü kabuğu (main + preload)
scripts/           Electron geliştirme, başlatma ve test betikleri
tests/             Playwright testleri
docs/              geçiş planı, yol haritası, özellik envanteri
```

## Teknoloji

- [Three.js](https://threejs.org/) — 3B sahne ve WebGL
- TypeScript (strict), Vite
- [math.js](https://mathjs.org/) 15.2.0 — komutlardaki sayısal ifadeler
- Electron, electron-builder
- Playwright
