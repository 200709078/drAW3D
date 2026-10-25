import * as THREE from 'three'

function canCreateWebGLContext(): boolean {
  const canvas = document.createElement('canvas')
  return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
}

export function showWebGLError(message: string): void {
  document.body.classList.add('webgl-error-page')
  const page = document.createElement('main')
  page.className = 'webgl-error'
  page.setAttribute('role', 'alert')
  const title = document.createElement('h1')
  title.textContent = 'drAW3D açılamadı'
  const text = document.createElement('p')
  text.textContent = message
  const tips = document.createElement('ul')
  for (const tip of [
    'drAW3D açık olan diğer sekmeleri kapatıp bu sayfayı yenileyin.',
    'Tarayıcıyı tamamen kapatıp tekrar açın.',
    'Tarayıcı ayarlarında donanım hızlandırmanın açık olduğundan emin olun.',
    'Hata devam ederse ekran kartı sürücüsünü güncelleyin veya farklı bir tarayıcı deneyin.',
  ]) {
    const item = document.createElement('li')
    item.textContent = tip
    tips.append(item)
  }
  page.append(title, text, tips)
  document.getElementById('centerWrapper')?.remove()
  document.body.append(page)
}

/** The WebGL renderer, or null after showing the error page. */
export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer | null {
  if (!canCreateWebGLContext()) {
    showWebGLError('Tarayıcı bu cihazda WebGL başlatamıyor.')
    return null
  }
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  } catch {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    } catch {
      showWebGLError('Tarayıcı WebGL bağlamını oluşturmayı reddetti. Bu genellikle GPU belleği, çok sayıda açık 3B sekme veya geçici bir tarayıcı engellemesi nedeniyle olur.')
      return null
    }
  }
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault()
    showWebGLError('WebGL bağlamı kayboldu. Sayfayı yenilemeden önce diğer 3B sekmeleri kapatmanız iyi olur.')
  })
  return renderer
}
