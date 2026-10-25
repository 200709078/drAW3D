import { expect, test, type Browser, type Page } from '@playwright/test'
import { detectDisplay, displayProfile, type DeviceInfo } from '../src/rendering/display'
import type { GeometryObject } from '../src/geometry/types'

const PC: DeviceInfo = { coarse: false, shortSide: 1080, longSide: 1920, devicePixelRatio: 2 }
const PHONE: DeviceInfo = { coarse: true, shortSide: 390, longSide: 844, devicePixelRatio: 3 }
const TABLET: DeviceInfo = { coarse: true, shortSide: 800, longSide: 1280, devicePixelRatio: 2 }
const BOARD: DeviceInfo = { coarse: true, shortSide: 1080, longSide: 1920, devicePixelRatio: 2 }

test.describe('ekran profilleri', () => {
  test('otomatik: dokunmatik küçük ekran telefon/tablet, diğerleri bilgisayar; tahta yalnız önerilir', () => {
    expect(detectDisplay(PC)).toEqual({ kind: 'desktop', boardLikely: false })
    expect(detectDisplay(PHONE)).toEqual({ kind: 'mobile', boardLikely: false })
    expect(detectDisplay(TABLET)).toEqual({ kind: 'mobile', boardLikely: false })
    expect(detectDisplay(BOARD)).toEqual({ kind: 'desktop', boardLikely: true })
  })

  test('bilgisayar bugünkü görünümdür; telefon daha az piksel ve küçük gölge çizer; tahta büyütür', () => {
    expect(displayProfile('auto', PC)).toEqual({
      kind: 'desktop', pixelRatio: 2, shadowMapSize: 2048, uiScale: 1, sceneScale: 1, edgeWidth: 1,
    })
    const phone = displayProfile('auto', PHONE)
    expect(phone).toMatchObject({ kind: 'mobile', pixelRatio: 1.5, shadowMapSize: 1024, uiScale: 1, sceneScale: 1 })
    const board = displayProfile('board', BOARD)
    expect(board).toMatchObject({ kind: 'board', pixelRatio: 1.5, uiScale: 1.4, sceneScale: 1.6 })
    // Edges 2.5 on-screen pixels wide at any drawing resolution.
    expect(board.edgeWidth / board.pixelRatio).toBe(2.5)
    // A chosen kind wins over the guess; the ratio is never above the screen's own.
    expect(displayProfile('desktop', PHONE).kind).toBe('desktop')
    expect(displayProfile('mobile', { ...PC, devicePixelRatio: 1 }).pixelRatio).toBe(1)
  })
})

async function open(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  return errors
}

async function boardPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }, screen: { width: 1920, height: 1080 }, hasTouch: true,
  })
  return context.newPage()
}

const display = (page: Page) => page.evaluate(() => window.drAW3DApp!.display())
const objects = (page: Page) => page.evaluate(() => window.drAW3DApp!.objects()) as Promise<GeometryObject[]>
const at = async (page: Page, x: number, y: number, z: number) =>
  (await page.evaluate(world => window.drAW3DApp!.toPage(world), { x, y, z }))!

async function chooseDisplay(page: Page, mode: string): Promise<void> {
  if (await page.locator('#viewMenu').isHidden()) await page.locator('#viewMenuButton').click()
  await page.locator('#viewDisplay').selectOption(mode)
  await page.keyboard.press('Escape')
}

test('akıllı tahta: büyük dokunmatik ekranda bir kez önerilir; seçilince arayüz büyür, çizim ve dokunma yerinde kalır', async ({ browser }) => {
  test.slow()
  const page = await boardPage(browser)
  const errors = await open(page)
  expect((await display(page)).kind).toBe('desktop')
  await expect(page.locator('#snackContent')).toContainText('Akıllı tahta')
  await page.locator('#viewMenuButton').click()
  await expect(page.locator('#viewDisplay option[value="auto"]')).toHaveText('Otomatik (Bilgisayar)')
  await chooseDisplay(page, 'board')
  expect(await display(page)).toMatchObject({ kind: 'board', uiScale: 1.4, sceneScale: 1.6 })
  expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe('1.4')
  const toolbar = await page.locator('#undo').boundingBox()
  expect(toolbar!.height).toBeGreaterThan(50)

  // The scene ends where the panel starts, on screen.
  const panel = (await page.locator('#rightWrapper').boundingBox())!
  await expect.poll(async () => {
    const viewport = (await page.locator('#viewport').boundingBox())!
    return Math.abs(viewport.x + viewport.width - panel.x)
  }).toBeLessThan(2)
  // Dragging the panel's edge follows the pointer on screen.
  const handle = (await page.locator('.reSizer').boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 - 100, handle.y + handle.height / 2, { steps: 5 })
  await page.mouse.up()
  const wider = (await page.locator('#rightWrapper').boundingBox())!
  expect(wider.width - panel.width).toBeCloseTo(100, -1)
  // The scene's edge follows with a CSS transition.
  await expect.poll(async () => {
    const moved = (await page.locator('#viewport').boundingBox())!
    return Math.abs(moved.x + moved.width - wider.x)
  }).toBeLessThan(2)

  // Touches land on the world points they aim at: a prism from two taps.
  await page.evaluate(() => window.drAW3DToolbar!.selectToolByAction('prism'))
  for (const [x, z] of [[0, 0], [4, 0]] as const) {
    const point = await at(page, x, 0, z)
    await page.touchscreen.tap(point.x, point.y)
  }
  await expect.poll(async () => (await objects(page)).filter(object => object.type === 'prism').length).toBe(1)
  const a = (await objects(page)).find(object => object.name === 'A') as { position: { x: number; z: number } }
  expect(a.position.x).toBeCloseTo(0, 0)
  expect(a.position.z).toBeCloseTo(0, 0)

  // Point labels sit just above their points on screen.
  const label = (await page.locator('#sceneLabels .scene-label', { hasText: /^A$/ }).boundingBox())!
  const anchor = await at(page, 0, 0, 0)
  expect(Math.abs(label.x + label.width / 2 - anchor.x)).toBeLessThan(10)
  expect(anchor.y - (label.y + label.height / 2)).toBeGreaterThan(0)
  expect(anchor.y - (label.y + label.height / 2)).toBeLessThan(60)

  // The choice is kept; the hint is not shown again.
  await page.reload()
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  expect((await display(page)).kind).toBe('board')
  await chooseDisplay(page, 'desktop')
  expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe('')
  expect(errors).toEqual([])
})

test('telefon: otomatik olarak düşük çizim çözünürlüğü ve küçük gölge haritası', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  })
  const page = await context.newPage()
  const errors = await open(page)
  expect(await display(page)).toMatchObject({ kind: 'mobile', pixelRatio: 1.5, shadowMapSize: 1024, uiScale: 1 })
  const canvas = await page.evaluate(() => {
    const element = document.getElementById('scene') as HTMLCanvasElement
    return { buffer: element.width, css: element.getBoundingClientRect().width }
  })
  expect(canvas.buffer / canvas.css).toBeCloseTo(1.5, 1)

  // The standard view shows the same region as on a wide screen: points 17 units to the
  // left and right of the center (across the view) are on the upright phone's screen.
  for (const [x, z] of [[12, -12], [-12, 12]] as const) {
    const point = await at(page, x, 0, z)
    expect(point.x).toBeGreaterThan(0)
    expect(point.x).toBeLessThan(390)
  }

  // The math keyboard keeps one height on every tab, and the input stays above it.
  await page.locator('#btnCalc').click()
  await page.locator('#giris').click()
  await expect(page.locator('#mathKeyboard')).toBeVisible()
  const heights: number[] = []
  for (const tab of ['numbers', 'functions', 'letters', 'commands']) {
    await page.locator(`#keyboardtab-${tab}`).click()
    heights.push((await page.locator('#mathKeyboard').boundingBox())!.height)
  }
  expect(new Set(heights.map(Math.round)).size).toBe(1)
  const input = (await page.locator('#giris').boundingBox())!
  const keyboard = (await page.locator('#mathKeyboard').boundingBox())!
  expect(input.y + input.height).toBeLessThanOrEqual(keyboard.y)
  expect(errors).toEqual([])
})
