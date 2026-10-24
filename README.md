# drAW3D

Web ve masaüstü için **3B geometri ve açınım (net)** uygulaması. Three.js ve TypeScript ile
geliştirilmiştir; aynı çıktı tarayıcıda ve Electron masaüstü uygulamasında (Linux AppImage/deb,
Windows NSIS) çalışır.

made by **mADEMatik** — [madematik.com](https://www.madematik.com)

İlgili proje: [drAW2D](https://github.com/200709078/drAW2D)

## Özellikler

- **3B nesneler**: nokta, doğru, doğru parçası, ışın, açı (derece etiketiyle), düzlem
- **Katı cisimler**: küre, prizma, piramit, silindir, koni
- **Açınım**: prizma ve piramidin yüzleri kenarları etrafında açılır; silindir ve koninin yan
  yüzeyi bükülerek düzleşir. Kaydırıcıyla 0°'den cismin tamamen açıldığı açıya kadar.
- **Kenar sayısı**: prizma ve piramit için 3–20; çizerken ve seçiliyken kaydırıcıyla
- **Nesneye bağlı noktalar**: doğru, düzlem, küre, cisimlerin kenar ve yüzleri, açının kolları
  ve yayı üzerinde; nokta yalnızca nesnesi üzerinde kayar ve nesneyi izler. Bütün çizim
  araçları nesne üzerine tıklanınca bağlı nokta kullanır.
- **Taşıma**: serbest nokta yatayda, çift tıklayınca dikeyde; mor yükseklik noktası cismin
  yüksekliğini değiştirir; gri köşe noktaları kilitlidir.
- **Sil, gizle, tümünü göster, geri al / yinele** (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Delete, Escape)
- **Düzlem / ızgara** göster-gizle, **standart görünüm**
- **Gruplu araç çubuğu** (drAW2D ile ortak); dar ekranlarda araçlar alttan açılan panelde
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

## Proje yapısı

```
src/
  main.ts          başlık çubuğunu bağlar, uygulamayı başlatır
  app/             bileşim kökü, kamera, isabet testi, çizim araçları, seçim/taşıma
  document/        belge ve geçmiş, adlar, yapılar, bağımlılıklar, silme/gizleme
  geometry/        vektörler, nesne modelleri, cisim şekilleri, parçalar, açınım (Three.js'siz)
  rendering/       sahne eşleme, nesne görünümleri, malzemeler, etiketler, kare biriktirici
  ui/              araç çubuğu, başlık çubuğu, toast, cisim denetimleri
  styles/          stiller (toolbar.css ve titlebar.css drAW2D ile ortak)
electron/          masaüstü kabuğu (main + preload)
scripts/           Electron geliştirme, başlatma ve test betikleri
tests/             Playwright testleri
docs/              geçiş planı, yol haritası, özellik envanteri
```

## Teknoloji

- [Three.js](https://threejs.org/) — 3B sahne ve WebGL
- TypeScript (strict), Vite
- Electron, electron-builder
- Playwright
