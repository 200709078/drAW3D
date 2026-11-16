// Google Play mağaza görsellerini üretir (docs/play/): npm run play:gorseller (önce derler).
// Derlenmiş uygulama (dist/) Vite önizleme sunucusunda açılır, çizimler giriş satırına yazılan komutlarla kurulur.
// Nesne renkleri uygulamada rastgeledir; görseller her seferinde aynı ve okunaklı olsun diye sayfanın Math.random'u
// aşağıdaki renkleri sırayla verecek biçimde değiştirilir (her renk üç çağrı: kırmızı, yeşil, mavi).
import { chromium } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { preview } from 'vite'

const root = path.resolve(import.meta.dirname, '../..')
const out = path.join(root, 'docs/play')
const shots = path.join(out, 'ekran')
mkdirSync(shots, { recursive: true })

// Uygulama kanal başına ⌊rastgele × 256⌋ × 0,75 üretir (0–191).
const COLORS = [[26, 86, 191], [191, 38, 38], [24, 128, 56], [128, 48, 160], [191, 104, 0], [0, 120, 140]]

const DEVICES = {
  telefon: { viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet7: { viewport: { width: 600, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet10: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: false, hasTouch: true },
}

// Sahneler giriş satırına yazılan komutlardır. Telefonda "kartlar" sahnesi alt paneli açık gösterir.
const SCENES = {
  cisimler: ['Küp((0,0,0),(3,0,0))', 'Piramit((5,0,0),(8,0,0),4,5)'],
  acinim: ['Küp((0,0,0),(3,0,0))', 'Açınım(küp1,60)'],
  donel: ['Silindir((0,0,0),(2,0,0),4)', 'Koni((6,0,0),(8,0,0),4)', 'Küre((-5,2,0),2)'],
  kartlar: Object.assign(['Küp((0,0,0),(3,0,0))', 'Piramit((5,0,0),(8,0,0),4,5)'], { panel: true, phoneOnly: true }),
}

const PORT = 4184
const url = `http://127.0.0.1:${PORT}/`
const server = await preview({ root, preview: { host: '127.0.0.1', port: PORT, strictPort: true } })
// WebGL, testlerdeki gibi SwiftShader ile (ekran kartı olmadan da çalışır).
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = await chromium.launch(existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium', args } : { args })

async function scene(device, name) {
  const context = await browser.newContext({ ...DEVICES[device], locale: 'tr-TR' })
  await context.addInitScript((colors) => {
    let call = 0
    Math.random = () => {
      const color = colors[Math.floor(call / 3) % colors.length]
      const value = (color[call % 3] / 0.75 + 0.5) / 256
      call += 1
      return Math.min(value, 0.999)
    }
  }, COLORS)
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('#giris', { state: 'attached' })
  await page.waitForTimeout(800)
  const narrow = DEVICES[device].viewport.width < 700
  // Dar ekranda giriş satırı alt paneldedir: önce paneli aç.
  if (narrow) await page.click('#panelHandle')
  for (const command of SCENES[name]) {
    await page.fill('#giris', command)
    await page.press('#giris', 'Enter')
    await page.waitForTimeout(250)
  }
  // Matematik klavyesi giriş satırına dokununca açılır; görüntüde kapalı olsun.
  const keyboard = page.locator('button[title="Matematik klavyesini kapat"]')
  if (await keyboard.isVisible()) await keyboard.click()
  await page.evaluate(() => (document.activeElement)?.blur())
  // Seçimi bırak: seçili cismin kaydırıcıları (kenar sayısı, açınım) ekranın altını kaplamasın.
  await page.keyboard.press('Escape')
  // Telefonda alt panel kapanır (çizim görünsün); "kartlar" sahnesinde açık kalır.
  if (narrow && !SCENES[name].panel) await page.click('#panelHandle')
  await page.waitForTimeout(1500)
  return { context, page }
}

const save = (page, name) => page.screenshot({ path: path.join(shots, `${name}.png`) })

try {
  for (const device of Object.keys(DEVICES)) {
    const names = Object.keys(SCENES).filter(name => device === 'telefon' || !SCENES[name].phoneOnly)
    for (const [index, name] of names.entries()) {
      const { context, page } = await scene(device, name)
      await save(page, `${device}-${index + 1}-${name}`)
      await context.close()
    }
    console.log(`${device}: tamam`)
  }

  // Öne çıkan görsel (1024×500)
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } })
  const icon = readFileSync(path.join(root, 'public/img/app-icon.png')).toString('base64')
  await page.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
      body { margin: 0; width: 1024px; height: 500px; display: flex; align-items: center; gap: 48px; padding: 0 64px; box-sizing: border-box;
          background: linear-gradient(135deg, #ffffff 0%, #e8f0fe 100%); font-family: "Noto Sans", Arial, sans-serif; color: #202124; }
      img { width: 220px; height: 220px; flex: none; }
      h1 { margin: 0; font-size: 84px; letter-spacing: -1px; }
      h1 span { color: #1a56db; }
      p { margin: 8px 0 0; font-size: 30px; color: #3c4043; }
      ul { display: flex; gap: 12px; margin: 28px 0 0; padding: 0; list-style: none; }
      li { padding: 8px 16px; border-radius: 999px; background: #ffffff; border: 2px solid #c6dafc; font-size: 20px; font-weight: 600; color: #1a56db; }
  </style></head><body>
      <img src="data:image/png;base64,${icon}" alt="">
      <div><h1>dr<span>AW</span>3D</h1><p>3B geometri ve cisim açınımları</p>
      <ul><li>Prizma</li><li>Piramit</li><li>Küre</li><li>Açınım</li></ul></div>
  </body></html>`)
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(out, 'one-cikan-1024x500.png') })
  copyFileSync(path.join(root, 'public/img/app-icon.png'), path.join(out, 'simge-512.png'))
  console.log('öne çıkan görsel ve simge: tamam')
} finally {
  await browser.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
