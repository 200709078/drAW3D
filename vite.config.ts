import { defineConfig } from 'vite'

export default defineConfig({
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
