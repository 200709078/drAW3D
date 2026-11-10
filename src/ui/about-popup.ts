/**
 * Hakkında: a small window in the help window's style (family rule: every app of the drAW
 * family, awPDF and awCELL has one). It closes with ×, a press outside, Escape or Android's
 * back button (`app.ts` `closeSomething`). Links open in the system browser: the desktop app's
 * window-open handler sends them there, and on Android a navigation to another site leaves the
 * app's WebView for the browser.
 */
export interface AboutPopup {
  readonly isOpen: boolean
  open(): void
  close(): void
}

const isNativeApp = () => (window as { Capacitor?: { isNativePlatform?(): boolean } }).Capacitor?.isNativePlatform?.() === true

export function createAboutPopup(): AboutPopup {
  const popup = document.getElementById('about-popup')!
  const closeButton = document.getElementById('about-close')!
  const version = document.getElementById('about-version')
  if (version) version.textContent = `sürüm ${__APP_VERSION__}`

  let returnFocus: HTMLElement | null = null
  const about: AboutPopup = {
    get isOpen() { return popup.style.display === 'flex' },
    open() {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      popup.style.display = 'flex'
      closeButton.focus()
    },
    close() {
      if (!about.isOpen) return
      popup.style.display = 'none'
      returnFocus?.focus()
    },
  }

  closeButton.addEventListener('click', () => about.close())
  popup.addEventListener('click', event => {
    if (event.target === popup) about.close()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && about.isOpen) {
      event.stopPropagation()
      about.close()
    }
  }, true)
  if (isNativeApp()) {
    for (const link of popup.querySelectorAll<HTMLAnchorElement>('a[href^="https://"]')) {
      link.addEventListener('click', event => {
        event.preventDefault()
        window.location.assign(link.href)
      })
    }
  }
  return about
}
