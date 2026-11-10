import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  // Hakkında penceresindeki sürüm package.json'dan gelir; elle güncellenmez.
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Aynı çıktı statik web sunucusunda ve Electron file:// altında çalışır.
  base: './',
  // Three.js (~700 kB) ve math.js (~650 kB) ile uygulama tek parça yüklenir.
  build: { chunkSizeWarningLimit: 2048 },
  server: {
    host: '127.0.0.1',
    watch: {
      ignored: ['**/dist-electron/**', '**/release/**', '**/android/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
  },
})
