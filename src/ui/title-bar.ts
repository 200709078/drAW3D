const ICONS = {
  minimize: '<path d="M1 6h10"/>',
  maximize: '<rect x="1.5" y="1.5" width="9" height="9" rx="1"/>',
  restore: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/>'
    + '<path d="M8.5 3.5v-1a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1"/>',
  close: '<path d="M2 2l8 8"/><path d="M10 2l-8 8"/>',
  fullscreen: '<path d="M3.5 1.5H2.5a1 1 0 0 0-1 1v1M10.5 3.5v-1a1 1 0 0 0-1-1h-1'
    + 'M1.5 8.5v1a1 1 0 0 0 1 1h1M8.5 10.5h1a1 1 0 0 0 1-1v-1"/>',
  exitFullscreen: '<path d="M3.5 1.5v1a1 1 0 0 1-1 1h-1M10.5 3.5h-1a1 1 0 0 1-1-1v-1'
    + 'M1.5 8.5h1a1 1 0 0 1 1 1v1M8.5 10.5v-1a1 1 0 0 1 1-1h1"/>',
} as const

type IconName = keyof typeof ICONS

function setIcon(button: HTMLButtonElement, icon: IconName, label: string): void {
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" stroke="currentColor"'
    + ` stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon]}</svg>`
  button.title = label
  button.setAttribute('aria-label', label)
}

function windowButton(icon: IconName, label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `titlebar__button ${extraClass}`.trim()
  setIcon(button, icon, label)
  button.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  return button
}

/**
 * The desktop window is frameless; this bar provides the title and window buttons,
 * styled like the drAW desktop app. Browsers keep their own chrome, so nothing is added there.
 */
export function mountTitleBar(): void {
  const controls = window.drAW3DDesktop?.windowControls
  if (!controls) return

  const title = `drAW3D v_${__APP_VERSION__} | mADEMatik`
  document.title = title
  document.body.classList.add('has-custom-titlebar')

  const bar = document.createElement('div')
  bar.className = 'titlebar'
  bar.id = 'titlebar'

  const drag = document.createElement('div')
  drag.className = 'titlebar__drag'
  drag.title = title
  drag.addEventListener('dblclick', () => controls.toggleMaximize())

  const icon = document.createElement('img')
  icon.className = 'titlebar__icon'
  icon.src = './img/app-icon.png'
  icon.alt = ''
  icon.draggable = false

  const text = document.createElement('span')
  text.className = 'titlebar__title'
  text.textContent = title
  drag.append(icon, text)

  const maximize = windowButton('maximize', 'Büyüt', () => controls.toggleMaximize())
  const fullscreen = windowButton('fullscreen', 'Tam Ekran', () => controls.toggleFullscreen())
  const buttons = document.createElement('div')
  buttons.className = 'titlebar__controls'
  buttons.append(
    windowButton('minimize', 'Küçült', () => controls.minimize()),
    maximize,
    fullscreen,
    windowButton('close', 'Kapat', () => controls.close(), 'titlebar__button--close'),
  )
  bar.append(drag, buttons)
  document.body.prepend(bar)

  let isFullscreen = false
  const showMaximized = (maximized: boolean) => setIcon(maximize, maximized ? 'restore' : 'maximize', maximized ? 'Geri Yükle' : 'Büyüt')
  const showFullscreen = (enabled: boolean) => {
    isFullscreen = enabled
    document.body.classList.toggle('is-fullscreen', enabled)
    setIcon(fullscreen, enabled ? 'exitFullscreen' : 'fullscreen', enabled ? 'Tam Ekrandan Çık' : 'Tam Ekran')
  }
  controls.onMaximizeChanged(showMaximized)
  controls.onFullscreenChanged(showFullscreen)
  void controls.isMaximized().then(showMaximized).catch(() => undefined)
  void controls.isFullscreen().then(showFullscreen).catch(() => undefined)

  // F11 is handled by the main process; Escape additionally leaves full screen.
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isFullscreen) controls.setFullscreen(false)
  })
}
