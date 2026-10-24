import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'

const executablePath = process.env.DRAW3D_ELECTRON_EXECUTABLE
const launchEnvironment = { ...process.env, DRAW3D_DEV_SERVER_URL: '' }
delete launchEnvironment.ELECTRON_RUN_AS_NODE
const application = await electron.launch({
  ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
  env: launchEnvironment,
  timeout: 30_000,
})

try {
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`))
  await page.waitForLoadState('load')
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const title = `drAW3D v_${version} | mADEMatik`
  assert.equal(await page.title(), title)
  assert.ok(page.url().startsWith('file://'), 'Üretim çıktısı yerel dosyadan açılmalı')

  const preferences = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return window.webContents.getLastWebPreferences()
  })
  assert.equal(preferences.nodeIntegration, false)
  assert.equal(preferences.contextIsolation, true)
  assert.equal(preferences.sandbox, true)

  // Frameless window: the renderer's title bar replaces the system frame.
  const titlebar = page.locator('#titlebar')
  await titlebar.waitFor()
  assert.equal(await titlebar.locator('.titlebar__title').textContent(), title)
  const isMaximized = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())
  const maximizeLabel = maximized => maximized ? 'Geri Yükle' : 'Büyüt'
  const wasMaximized = await isMaximized()
  assert.deepEqual(await titlebar.locator('.titlebar__button').evaluateAll(buttons => buttons.map(button => button.title)),
    ['Küçült', maximizeLabel(wasMaximized), 'Tam Ekran', 'Kapat'])
  const titlebarHeight = (await titlebar.boundingBox()).height
  assert.equal(titlebarHeight, 36)
  assert.equal((await page.locator('#mainToolbar').boundingBox()).y, titlebarHeight, 'Araç çubuğu başlık çubuğunun altında başlamalı')
  const toolbarHeight = (await page.locator('#mainToolbar').boundingBox()).height
  assert.equal((await page.locator('#scene').boundingBox()).y, titlebarHeight + toolbarHeight, 'Sahne araç çubuğunun altında başlamalı')
  const maximizeButton = titlebar.locator('.titlebar__button:nth-child(2)')
  for (const maximized of [!wasMaximized, wasMaximized]) {
    await maximizeButton.click()
    await page.waitForFunction(label => document.querySelector('#titlebar .titlebar__button:nth-child(2)')?.title === label,
      maximizeLabel(maximized))
    assert.equal(await isMaximized(), maximized, 'Büyüt düğmesi pencere durumunu değiştirmeli')
  }

  // WebGL runs (on the GPU or the SwiftShader fallback) and the app draws.
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  assert.equal(await page.locator('.webgl-error').count(), 0, 'WebGL hata sayfası çıkmamalı')
  await page.evaluate(() => window.drAW3DToolbar.selectToolByAction('prism'))
  for (const [x, z] of [[0, 0], [4, 0]]) {
    const point = await page.evaluate(world => window.drAW3DApp.toPage(world), { x, y: 0, z })
    await page.mouse.click(point.x, point.y)
  }
  const types = await page.evaluate(() => window.drAW3DApp.objects().map(object => object.type))
  assert.ok(types.includes('prism'), 'Prizma çizilebilmeli')
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.deepEqual(await page.evaluate(() => Object.keys(window.drAW3DDesktop ?? {})), ['windowControls'])
  assert.equal(await page.evaluate(() => window.drAW3DToolbar?.getActiveTool().action), 'select')

  const failedAssets = await page.evaluate(async () => {
    const results = await Promise.all([...document.images].map(async image => {
      try {
        await image.decode()
        return null
      } catch {
        return image.src
      }
    }))
    return results.filter(Boolean)
  })
  assert.deepEqual(failedAssets, [], 'Simgeler paket içinde bulunmalı')
  assert.deepEqual(errors, [], 'Electron içinde JavaScript veya varlık yükleme hatası olmamalı')
  await page.screenshot({ path: path.join('test-results', 'electron.png') })
  console.log('Electron kontrolü geçti: file:// açılış, başlık çubuğu, WebGL, prizma, araç çubuğu, varlıklar ve renderer yalıtımı.')
} finally {
  await application.close()
}
