import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  // Aynı çıktı statik web sunucusunda ve Electron file:// altında çalışır.
  base: './',
  // Three.js tek başına ~700 kB; uygulama tek parça yüklenir.
  build: { chunkSizeWarningLimit: 1024 },
  server: {
    host: '127.0.0.1',
    watch: {
      ignored: ['**/dist-electron/**', '**/release/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
  },
})
