# drAW3D

Tarayıcıda çalışan **3B geometri ve açınım (net)** uygulaması. Three.js ve TypeScript ile geliştirilmiştir.

made by **mADEMatik** — [madematik.com](https://www.madematik.com)

İlgili proje: [drAW2D](https://github.com/200709078/drAW2D)

## Özellikler

- **3B nesneler**: nokta, doğru, doğru parçası, ışın, açı, düzlem
- **Katı cisimler**: küre, prizma, piramit, silindir, koni
- **Açınım (net) modu**: silindir, koni, prizma ve piramit için 0°–90° arasındaki açınım kaydırıcısı
- **Kenar sayısı**: prizma/piramit için 3–20 arası ayarlanabilir kenar sayısı
- **Düzlem / grid göster-gizle** anahtarı
- **Geri al / yinele** (geçmiş yönetimi)
- **Seçim aracı** ile nesneleri taşıma
- **Yakınlaştırma / döndürme / kaydırma** kontrolleri (orbit)

## Geliştirme

```bash
npm install
npm run dev       # Vite geliştirme sunucusu
npm run build     # tsc + vite build -> dist/
npm run preview   # Üretilen dist/ çıktısını önizleme
```

## Proje yapısı

```
drAW3D/
├── index.html
├── src/
│   ├── main.ts            # Uygulama girişi ve araç/UI bağlama
│   ├── core/              # Camera, Controls, Loop, Renderer, Scene, Resize
│   ├── engine/            # Grid, Lighting, Plane
│   ├── objects/           # Point, Line, LineSegment, Ray, Angle, Plane,
│   │                      # Sphere, Prism, Pyramid, Cylinder, Cone
│   ├── tools/             # Her nesne için *Tool + ToolManager, SelectTool
│   ├── interaction/       # Pointer, Raycaster, en yakın seçilebilir nokta
│   ├── unfold/            # Cone/Cylinder/Prism/PyramidUnfolder (açınım)
│   ├── history/           # HistoryManager
│   ├── ui/                # RightToolbar, CloseToolbar (+ CSS)
│   ├── assets/            # SVG/PNG simgeler
│   └── utils/
├── vite.config.ts         # base: './' (alt dizinde barındırma için)
└── tsconfig.json
```

## Teknoloji

- [Three.js](https://threejs.org/) — 3B sahne ve renderer
- TypeScript
- Vite — geliştirme sunucusu ve derleme
