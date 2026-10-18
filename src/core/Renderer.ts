import * as THREE from "three"

function canCreateWebGLContext() {
  const canvas = document.createElement("canvas")

  return Boolean(
    canvas.getContext("webgl2") ||
    canvas.getContext("webgl") ||
    canvas.getContext("experimental-webgl")
  )
}

function showWebGLError(message: string) {
  document.body.classList.add("webgl-error-page")
  document.body.innerHTML = `
    <main class="webgl-error" role="alert">
      <h1>GeoMatik3D açılamadı</h1>
      <p>${message}</p>
      <ul>
        <li>GeoMatik3D açık olan diğer sekmeleri kapatıp bu sayfayı yenileyin.</li>
        <li>Tarayıcıyı tamamen kapatıp tekrar açın.</li>
        <li>Chrome/Edge ayarlarında donanım hızlandırmanın açık olduğundan emin olun.</li>
        <li>Hata devam ederse ekran kartı sürücüsünü güncelleyin veya farklı bir tarayıcı deneyin.</li>
      </ul>
    </main>
  `
}

export function createRenderer() {
  if (!canCreateWebGLContext()) {
    showWebGLError("Tarayıcı bu cihazda WebGL başlatamıyor.")
    return null
  }

  let renderer: THREE.WebGLRenderer

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    })
  } catch {
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "default",
      })
    } catch {
      showWebGLError("Tarayıcı WebGL bağlamını oluşturmayı reddetti. Bu genellikle GPU belleği, çok sayıda açık 3D sekme veya geçici tarayıcı engellemesi nedeniyle olur.")
      return null
    }
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true

  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault()
    showWebGLError("WebGL bağlamı kayboldu. Sayfayı yenilemeden önce diğer 3D sekmeleri kapatmanız iyi olur.")
  })

  document.body.appendChild(renderer.domElement)

  return renderer
}
