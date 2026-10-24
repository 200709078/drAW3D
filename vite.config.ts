import { defineConfig } from 'vite'

export default defineConfig({
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
