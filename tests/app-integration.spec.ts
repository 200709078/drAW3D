import { expect, test, type Page } from '@playwright/test'
import type { GeometryObject, PointObject } from '../src/geometry/types'

async function open(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`))
  await page.goto('/')
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  return errors
}

async function at(page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(world => window.drAW3DApp!.toPage(world), { x, y, z })
  if (!point) throw new Error('Nokta kameranın arkasında')
  return point
}

async function clickAt(page: Page, x: number, y: number, z: number): Promise<void> {
  const point = await at(page, x, y, z)
  await page.mouse.click(point.x, point.y)
}

async function chooseTool(page: Page, action: string): Promise<void> {
  await page.evaluate(name => window.drAW3DToolbar!.selectToolByAction(name), action)
}

const objects = (page: Page) => page.evaluate(() => window.drAW3DApp!.objects()) as Promise<GeometryObject[]>
const count = async (page: Page, type: string) => (await objects(page)).filter(object => object.type === type).length
const frames = (page: Page) => page.evaluate(() => window.drAW3DApp!.frames())

async function idleFrames(page: Page): Promise<number> {
  // Wait for damping to settle, then sample.
  let last = -1
  for (let attempt = 0; attempt < 50; attempt++) {
    const now = await frames(page)
    if (now === last) return now
    last = now
    await page.waitForTimeout(150)
  }
  throw new Error('Çizim durmadı')
}

async function buildPrism(page: Page): Promise<void> {
  await chooseTool(page, 'prism')
  await clickAt(page, 0, 0, 0)
  await clickAt(page, 4, 0, 0)
  await expect.poll(() => count(page, 'prism')).toBe(1)
}

test('sayfa kabuğu: gruplu araç çubuğu, simgeler, etkisiz düğmeler, hatasız açılış', async ({ page }) => {
  const errors = await open(page)
  await expect(page).toHaveTitle('drAW3D | mADEMatik')
  await expect(page.locator('#toolGroups .tool-group-button')).toHaveCount(7)
  for (const id of ['undo', 'redo', 'delete', 'hide', 'showAll']) await expect(page.locator(`#${id}`)).toBeDisabled()
  await expect(page.locator('#groundToggle')).toBeEnabled()
  const broken = await page.evaluate(async () => {
    const images = [...document.images]
    const results = await Promise.all(images.map(image => image.decode().then(() => null, () => image.src)))
    return results.filter(Boolean)
  })
  expect(broken).toEqual([])
  await expect(page.locator('#made-signature')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('araç menüsünden prizma seçilir, iki tıklamayla kurulur, geri al ve yinele çalışır', async ({ page }) => {
  const errors = await open(page)
  await page.locator('#toolgroup-solid').click()
  await page.locator('#tool-prism').click()
  await expect(page.locator('#snackTitle')).toHaveText('PRİZMA')
  await expect(page.locator('#mainToolbar')).toHaveAttribute('data-action', 'prism')
  await expect(page.locator('#sideControl')).toBeVisible()
  await page.locator('#sideSlider').fill('6')
  await clickAt(page, 0, 0, 0)
  await clickAt(page, 3, 0, 0)
  await expect(page.locator('#mainToolbar')).toHaveAttribute('data-action', 'select')
  const prism = (await objects(page)).find(object => object.type === 'prism') as { sideCount: number }
  expect(prism.sideCount).toBe(6)
  await expect(page.locator('#undo')).toBeEnabled()
  await page.locator('#undo').click()
  expect(await count(page, 'prism')).toBe(0)
  await page.keyboard.press('Control+y')
  expect(await count(page, 'prism')).toBe(1)
  await page.keyboard.press('Control+z')
  expect(await count(page, 'prism')).toBe(0)
  await page.keyboard.press('Control+Shift+Z')
  expect(await count(page, 'prism')).toBe(1)
  expect(errors).toEqual([])
})

test('cisim seçilince kartında kenar sayısı ve açınım kaydırıcıları çıkar; değişiklikler tek adımda geri alınır', async ({ page }) => {
  await open(page)
  await buildPrism(page)
  await clickAt(page, 2, 2, 0)
  const prismId = (await objects(page)).find(object => object.type === 'prism')!.id
  const card = page.locator(`#objectsContainer [data-id="${prismId}"]`)
  await expect(card).toHaveClass(/is-active/)
  await expect(page.locator('#objectControls')).toBeHidden()
  await expect(page.locator(`[id="${prismId}-labelA"]`)).toHaveText('Kenar')
  await page.locator(`[id="${prismId}-sliderA"]`).fill('7')
  await expect.poll(async () => (await objects(page)).filter(object => object.type === 'point'
    && (object as PointObject).constraint?.type === 'vertex').length).toBe(5 + 6)
  await page.locator(`[id="${prismId}-sliderB"]`).fill('90')
  await expect.poll(async () => ((await objects(page)).find(object => object.type === 'prism') as { unfold: number }).unfold).toBe(90)
  await page.locator('#undo').click()
  const [solid] = (await objects(page)).filter(object => object.type === 'prism') as { unfold: number; sideCount: number }[]
  expect(solid!.unfold).toBe(0)
  expect(solid!.sideCount).toBe(7)
  await page.locator('#undo').click()
  expect(((await objects(page)).find(object => object.type === 'prism') as { sideCount: number }).sideCount).toBe(4)
  // With the panel hidden the same sliders float over the scene.
  await page.locator('#btnCalc').click()
  await expect(page.locator('#rightWrapper')).toHaveClass(/hide/)
  await clickAt(page, 2, 2, 0)
  await expect(page.locator('#objectControls')).toBeVisible()
  await page.locator('#unfoldSlider').fill('45')
  await expect(page.locator('#unfoldValue')).toHaveText('45')
})

test('serbest nokta fareyle sürüklenir; bağlı cisim izler', async ({ page }) => {
  await open(page)
  await buildPrism(page)
  const start = await at(page, 0, 0, 0)
  const end = await at(page, -2, 0, 2)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 })
  await page.mouse.move(end.x, end.y, { steps: 4 })
  await page.mouse.up()
  const a = (await objects(page))[0] as PointObject
  expect(a.position.x).toBeCloseTo(-2, 1)
  expect(a.position.z).toBeCloseTo(2, 1)
  expect(a.position.y).toBe(0)
  const height = (await objects(page)).find(object => object.type === 'point'
    && (object as PointObject).constraint?.type === 'height') as PointObject
  expect(height.position.x).toBeCloseTo(-2, 1)
  await page.keyboard.press('Control+z')
  expect(((await objects(page))[0] as PointObject).position.x).toBeCloseTo(0, 3)
})

test('sil, gizle ve tümünü göster; Delete tuşu', async ({ page }) => {
  await open(page)
  await buildPrism(page)
  await chooseTool(page, 'segment')
  await clickAt(page, -4, 0, 4)
  await clickAt(page, -8, 0, 4)
  await clickAt(page, 2, 2, 0)
  await expect(page.locator('#hide')).toBeEnabled()
  await page.locator('#hide').click()
  expect((await objects(page)).filter(object => object.hidden).length).toBeGreaterThan(5)
  await expect(page.locator('#showAll')).toBeEnabled()
  await page.locator('#showAll').click()
  expect((await objects(page)).filter(object => object.hidden)).toHaveLength(0)
  await clickAt(page, 2, 2, 0)
  await page.locator('#delete').click()
  expect(await count(page, 'prism')).toBe(0)
  expect(await count(page, 'point')).toBe(2)
  await clickAt(page, -6, 0, 4)
  expect(await page.evaluate(() => window.drAW3DApp!.selectedId())).not.toBeNull()
  await page.keyboard.press('Delete')
  expect(await count(page, 'segment')).toBe(0)
})

test('zemin düğmesi üç durum arasında döner', async ({ page }) => {
  await open(page)
  const toggle = page.locator('#groundToggle')
  await expect(toggle).toHaveAttribute('title', 'Düzlemi Gizle')
  await toggle.click()
  await expect(toggle).toHaveAttribute('title', 'Izgarayı Gizle')
  expect(await page.evaluate(() => window.drAW3DApp!.groundMode())).toBe('hidePlane')
  await toggle.click()
  await expect(toggle).toHaveAttribute('title', 'Düzlemi ve Izgarayı Göster')
  await toggle.click()
  expect(await page.evaluate(() => window.drAW3DApp!.groundMode())).toBe('showBoth')
})

test('boşlukta sürüklemek kamerayı döndürür, standart görünüm geri getirir; boşta çizim durur', async ({ page }) => {
  await open(page)
  const origin = await at(page, 3, 0, 0)
  const idle = await idleFrames(page)
  await page.waitForTimeout(300)
  expect(await frames(page)).toBe(idle)
  await page.mouse.move(200, 700)
  await page.mouse.down()
  await page.mouse.move(400, 650, { steps: 8 })
  await page.mouse.up()
  await idleFrames(page)
  const turned = await at(page, 3, 0, 0)
  expect(Math.hypot(turned.x - origin.x, turned.y - origin.y)).toBeGreaterThan(20)
  await page.locator('#standardView').click()
  await idleFrames(page)
  const back = await at(page, 3, 0, 0)
  expect(back.x).toBeCloseTo(origin.x, 0)
  expect(back.y).toBeCloseTo(origin.y, 0)
})

test('Escape yarım çizimi siler ve seçim aracına döner', async ({ page }) => {
  await open(page)
  await chooseTool(page, 'plane')
  await clickAt(page, 0, 0, 0)
  await clickAt(page, 3, 0, 0)
  expect(await count(page, 'point')).toBe(2)
  await page.keyboard.press('Escape')
  expect(await count(page, 'point')).toBe(0)
  await expect(page.locator('#mainToolbar')).toHaveAttribute('data-action', 'select')
})

test('nokta aracı cismin yüzüne bağlı nokta koyar; nokta yüz üzerinde kayar', async ({ page }) => {
  await open(page)
  await buildPrism(page)
  await chooseTool(page, 'point')
  await clickAt(page, 2, 4, -2)
  const onTop = (await objects(page)).at(-1) as PointObject
  expect(onTop.constraint?.type).toBe('on')
  expect(onTop.position.y).toBeCloseTo(4, 6)
  await chooseTool(page, 'select')
  const from = await at(page, onTop.position.x, 4, onTop.position.z)
  const to = await at(page, 3, 4, -1)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  const moved = (await objects(page)).find(object => object.id === onTop.id) as PointObject
  expect(moved.position.y).toBeCloseTo(4, 6)
  expect(moved.position.x).toBeCloseTo(3, 0)
})

test.describe('dar ekran ve dokunma', () => {
  test.use({ viewport: { width: 400, height: 800 }, hasTouch: true })

  test('araçlar alt panelin Araçlar sekmesinde; dokunarak doğru parçası çizilir; iki parmak çizmez', async ({ page }) => {
    const errors = await open(page)
    await expect(page.locator('#toolGroups')).toBeHidden()
    await expect(page.locator('#rightWrapper')).toHaveClass(/hide/)
    await page.locator('#currentTool').click()
    await expect(page.locator('#toolsPanel')).toBeVisible()
    await page.locator('#paneltool-segment').click()
    // The sheet makes way for the scene the tool is used on.
    await expect(page.locator('#rightWrapper')).toHaveClass(/hide/)
    const client = await page.context().newCDPSession(page)
    const touch = async (type: string, points: { x: number; y: number }[]) => {
      await client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, id) => ({ ...point, id })) })
    }
    const first = await at(page, 0, 0, 0)
    const second = await at(page, 3, 0, 0)
    await touch('touchStart', [first])
    await touch('touchEnd', [])
    expect(await count(page, 'point')).toBe(1)
    await touch('touchStart', [{ x: second.x - 30, y: second.y }])
    await touch('touchMove', [second])
    await touch('touchEnd', [])
    const created = await objects(page)
    expect(created.map(object => object.type)).toEqual(['point', 'point', 'segment'])
    expect((created[1] as PointObject).position.x).toBeCloseTo(3, 0)
    await chooseTool(page, 'segment')
    await touch('touchStart', [{ x: 100, y: 500 }])
    await touch('touchStart', [{ x: 100, y: 500 }, { x: 250, y: 500 }])
    await touch('touchMove', [{ x: 80, y: 500 }, { x: 290, y: 500 }])
    await touch('touchEnd', [])
    expect(await count(page, 'point')).toBe(2)
    expect(errors).toEqual([])
  })
})
