import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import type { GeometryObject } from '../src/geometry/types'

async function open(page: Page, pickers = false): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  // Without the File System Access API the app downloads and uploads, which tests can observe.
  if (!pickers) {
    await page.addInitScript(() => {
      delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
      delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    })
  }
  await page.goto('/')
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  return errors
}

const objects = (page: Page) => page.evaluate(() => window.drAW3DApp!.objects()) as Promise<GeometryObject[]>
const typesOf = async (page: Page) => (await objects(page)).filter(object => object.type !== 'point').map(object => object.type)

async function command(page: Page, ...sources: string[]): Promise<void> {
  const input = page.locator('#giris')
  for (const source of sources) {
    await input.fill(source)
    await input.press('Enter')
  }
}

async function menu(page: Page, item: string): Promise<void> {
  await page.locator('#fileMenuButton').click()
  await expect(page.locator('#fileMenu')).toBeVisible()
  await page.locator(`#${item}`).click()
  await expect(page.locator('#fileMenu')).toBeHidden()
}

test('kaydet, yeni ve aç: .drw3 dosyası belgeyi aynen geri getirir; açmak geri alınabilir', async ({ page }) => {
  const errors = await open(page)
  await command(page, 'Küp((0,0,0),(2,0,0))', 'KesikKoni((5,0,0),(7,0,0),3,0.5)')
  const before = await objects(page)
  const download = page.waitForEvent('download')
  await menu(page, 'fileSave')
  const saved = await download
  expect(saved.suggestedFilename()).toBe('adsız.drw3')
  const file = await saved.path()
  const text = await readFile(file, 'utf8')
  expect(JSON.parse(text)).toMatchObject({ app: 'drAW3D', format: 1, camera: { zoom: 1 } })

  await menu(page, 'fileNew')
  await expect.poll(() => objects(page)).toEqual([])
  await expect(page.locator('#snackContent')).toContainText('Geri Al')

  const chooser = page.waitForEvent('filechooser')
  await menu(page, 'fileOpen')
  await (await chooser).setFiles({ name: 'çalışma.drw3', mimeType: 'application/json', buffer: Buffer.from(text) })
  await expect.poll(() => objects(page)).toEqual(before)
  await expect(page.locator('#snackContent')).toHaveText('çalışma.drw3 açıldı.')
  expect(await page.evaluate(() => window.drAW3DApp!.fileName())).toBe('çalışma.drw3')
  await page.locator('#undo').click()
  await expect.poll(() => objects(page)).toEqual([])

  // A file that is not a drAW3D document leaves the document as it is.
  const wrong = page.waitForEvent('filechooser')
  await page.keyboard.press('Control+o')
  await (await wrong).setFiles({ name: 'başka.drw3', mimeType: 'application/json', buffer: Buffer.from('{"app":"drAW2D"}') })
  await expect(page.locator('#snackContent')).toHaveText('Bu dosya bir drAW3D belgesi değil.')
  expect(await objects(page)).toEqual([])
  expect(errors).toEqual([])
})

test('Ctrl+S açık dosyanın adıyla kaydeder, giriş alanındayken de', async ({ page }) => {
  await open(page)
  await command(page, 'Prizma((0,0,0),(2,0,0))')
  await page.locator('#giris').focus()
  const download = page.waitForEvent('download')
  await page.keyboard.press('Control+s')
  expect((await download).suggestedFilename()).toBe('adsız.drw3')
  await expect(page.locator('#snackContent')).toHaveText('adsız.drw3 kaydedildi.')
})

test('otomatik kayıt: sayfa yenilenince son çalışma geri gelir; geçmişi oradan başlar', async ({ page }) => {
  // Two reloads with software WebGL take a while when every worker is busy.
  test.slow()
  await open(page)
  await command(page, 'Küp((0,0,0),(2,0,0))', 'Hacim(küp1)')
  const before = await objects(page)
  await page.waitForFunction(() => (localStorage.getItem('drAW3D.autosave') ?? '').includes('küp1'))
  await page.reload()
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  expect(await objects(page)).toEqual(before)
  await expect(page.locator('#snackContent')).toContainText('geri yüklendi')
  await expect(page.locator('#undo')).toBeDisabled()
  // A new document is kept too: after the next reload the scene stays empty.
  await menu(page, 'fileNew')
  await page.waitForFunction(() => !(localStorage.getItem('drAW3D.autosave') ?? '').includes('küp1'))
  await page.reload()
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  expect(await objects(page)).toEqual([])
})

test('görüntü PNG olarak kaydedilir', async ({ page }) => {
  const errors = await open(page)
  await command(page, 'Prizma((0,0,0),(2,0,0))')
  const download = page.waitForEvent('download')
  await menu(page, 'fileImage')
  const image = await download
  expect(image.suggestedFilename()).toBe('drAW3D.png')
  const bytes = await readFile(await image.path())
  expect([...bytes.subarray(1, 4)].map(code => String.fromCharCode(code)).join('')).toBe('PNG')
  expect(errors).toEqual([])
})

test('seçili cismin açınımı gerçek ölçekte SVG olarak kaydedilir; seçim yoksa söylenir', async ({ page }) => {
  test.slow()
  await open(page)
  // A command selects what it builds.
  await command(page, 'Küre((10,0,0),1)')
  await menu(page, 'netSvg')
  await expect(page.locator('#snackContent')).toHaveText('Kürenin düzlem açınımı yoktur.')
  await command(page, 'Küp((0,0,0),(3,0,0))')
  // An empty spot of the scene clears the selection.
  const box = (await page.locator('#scene').boundingBox())!
  await page.mouse.click(box.x + 8, box.y + 8)
  await menu(page, 'netSvg')
  await expect(page.locator('#snackContent')).toHaveText('Önce açınımı çıkarılacak cismi seçiniz.')
  const cube = (await objects(page)).find(object => object.type === 'regular')!
  await page.locator(`#objectsContainer [data-id="${cube.id}"] .expr-block`).first().click()
  await page.locator('#fileMenuButton').click()
  await page.locator('#netTabs').uncheck()
  const download = page.waitForEvent('download')
  await page.locator('#netSvg').click()
  const svg = await download
  expect(svg.suggestedFilename()).toBe('küp1-açınım.svg')
  const text = await readFile(await svg.path(), 'utf8')
  expect(text).toContain('width="210mm" height="297mm"')
  expect(text).toContain('Ölçek 1:1')
  expect(text).not.toContain('yapıştırma payı')
  // The tab choice is remembered.
  await page.reload()
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  await page.locator('#fileMenuButton').click()
  await expect(page.locator('#netTabs')).not.toBeChecked()
})

test('kartın oynat düğmesi açınımı sonuna kadar açar ve geri kapatır; her oynatma tek geçmiş adımıdır', async ({ page }) => {
  await open(page)
  await command(page, 'Küp((0,0,0),(2,0,0))')
  const cube = (await objects(page)).find(object => object.type === 'regular')!
  await page.locator(`#objectsContainer [data-id="${cube.id}"] .expr-block`).first().click()
  const play = page.locator(`[id="${cube.id}-play"]`)
  await expect(play).toBeVisible()
  const unfold = async () => ((await objects(page)).find(object => object.id === cube.id) as { unfold: number }).unfold
  await play.click()
  await expect(play).toHaveText('⏸')
  await expect.poll(unfold, { timeout: 10000 }).toBe(90)
  await expect(play).toHaveText('▶')
  await play.click()
  await expect.poll(unfold, { timeout: 10000 }).toBe(0)
  await page.locator('#undo').click()
  expect(await unfold()).toBe(90)
  await page.locator('#undo').click()
  expect(await unfold()).toBe(0)
  expect(await typesOf(page)).toEqual(['regular', 'segment'])
})
