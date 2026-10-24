import { startApp } from './app/app'
import { mountTitleBar } from './ui/title-bar'

function start(): void {
  mountTitleBar()
  startApp()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
