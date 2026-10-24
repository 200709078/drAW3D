import { expect, test, type Page } from '@playwright/test'
import type { GeometryObject } from '../src/geometry/types'

async function open(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  return errors
}

async function type(page: Page, ...commands: string[]): Promise<void> {
  const input = page.locator('#giris')
  for (const command of commands) {
    await input.fill(command)
    await input.press('Enter')
  }
}

const at = (page: Page, x: number, y: number, z: number) => page.evaluate(world => window.drAW3DApp!.toPage(world), { x, y, z })
const view = (page: Page) => page.evaluate(() => window.drAW3DApp!.view())
const objects = (page: Page) => page.evaluate(() => window.drAW3DApp!.objects()) as Promise<GeometryObject[]>
const labelTexts = (page: Page) => page.locator('#sceneLabels .scene-label:not([hidden])').allTextContents()

async function menu(page: Page): Promise<void> {
  if (await page.locator('#viewMenu').isHidden()) await page.locator('#viewMenuButton').click()
  await expect(page.locator('#viewMenu')).toBeVisible()
}

test('görünüm menüsü: önden ve yandan bakış, ortografik kamera; ayarlar sayfa yenilenince kalır', async ({ page }) => {
  const errors = await open(page)
  await menu(page)
  await page.locator('#view-front').click()
  await page.waitForTimeout(100)
  const [origin, up, side] = await Promise.all([at(page, 0, 0, 0), at(page, 0, 5, 0), at(page, 5, 0, 0)])
  expect(up!.x).toBeCloseTo(origin!.x, 1)
  expect(up!.y).toBeLessThan(origin!.y)
  expect(side!.y).toBeCloseTo(origin!.y, 1)
  expect(side!.x).toBeGreaterThan(origin!.x)
  await page.locator('#view-side').click()
  const [origin2, depth] = await Promise.all([at(page, 0, 0, 0), at(page, 0, 0, 5)])
  expect(depth!.y).toBeCloseTo(origin2!.y, 1)
  expect(depth!.x).toBeLessThan(origin2!.x)
  await page.locator('#viewOrthographic').check()
  expect((await view(page)).cameraOrthographic).toBe(true)
  // Orthographic: parallel lines stay parallel; equal steps project to equal distances.
  const [a, b, c] = await Promise.all([at(page, 0, 0, 0), at(page, 0, 0, 10), at(page, 0, 0, -10)])
  expect(Math.abs(b!.x - a!.x)).toBeCloseTo(Math.abs(a!.x - c!.x), 1)
  await page.reload()
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  expect(await view(page)).toMatchObject({ orthographic: true, cameraOrthographic: true })
  await menu(page)
  await expect(page.locator('#viewOrthographic')).toBeChecked()
  await page.locator('#viewOrthographic').uncheck()
  expect((await view(page)).cameraOrthographic).toBe(false)
  expect(errors).toEqual([])
})

test('eksenler adları ve sayılarıyla açılıp kapanır', async ({ page }) => {
  await open(page)
  await expect(page.locator('#sceneLabels .axis-name')).toHaveCount(0)
  await menu(page)
  await page.locator('#viewAxes').check()
  await expect(page.locator('#sceneLabels .axis-name')).toHaveText(['x', 'y', 'z'])
  await expect(page.locator('#sceneLabels .axis-tick', { hasText: /^10$/ })).toHaveCount(3)
  await page.locator('#viewAxes').uncheck()
  await expect(page.locator('#sceneLabels .axis-name')).toHaveCount(0)
})

test('etiketleme: noktalar varsayılan, hiçbiri, tümü; koordinatlar; kartın ayarı genel ayarı geçer', async ({ page }) => {
  await open(page)
  await type(page, 'A=(1,0,2)', 'B=(4,0,2)', 's=DoğruParçası(A,B)')
  await expect.poll(() => labelTexts(page)).toEqual(expect.arrayContaining(['A', 'B']))
  expect(await labelTexts(page)).not.toContain('s')
  await menu(page)
  await page.locator('#viewLabels').selectOption('all')
  await expect.poll(() => labelTexts(page)).toContain('s')
  await page.locator('#viewCoordinates').check()
  await expect.poll(() => labelTexts(page)).toContain('A(1, 0, 2)')
  await page.locator('#viewLabels').selectOption('none')
  await expect.poll(() => labelTexts(page)).toEqual([])
  // The card's label box turns one name back on, whatever the mode.
  const segment = (await objects(page)).find(object => object.name === 's')!
  await page.locator(`[id="${segment.id}-input"]`).click()
  await page.locator(`[id="${segment.id}-style"]`).click()
  await expect(page.locator(`[id="${segment.id}-label"]`)).not.toBeChecked()
  await page.locator(`[id="${segment.id}-label"]`).check()
  await expect.poll(() => labelTexts(page)).toEqual(['s'])
  expect((await objects(page)).find(object => object.name === 's')!.labelVisible).toBe(true)
})

test('gizli kenar ayarı görünüm seçeneğidir, belgeyi değiştirmez', async ({ page }) => {
  await open(page)
  await type(page, 'Prizma((0,0,0),(3,0,0))')
  expect((await view(page)).hiddenEdges).toBe(true)
  await menu(page)
  await page.locator('#viewHiddenEdges').uncheck()
  expect((await view(page)).hiddenEdges).toBe(false)
  await expect(page.locator('#undo')).toBeEnabled()
  await page.locator('#undo').click()
  expect(await objects(page)).toHaveLength(0)
})

test('yapı araçları araç çubuğundan seçilir: orta nokta ve paralel düzlem', async ({ page }) => {
  const errors = await open(page)
  await page.locator('#toolgroup-point').click()
  await page.locator('#tool-midpoint').click()
  await expect(page.locator('#mainToolbar')).toHaveAttribute('data-action', 'midpoint')
  for (const [x, z] of [[0, 0], [4, 2]] as const) {
    const point = await at(page, x, 0, z)
    await page.mouse.click(point!.x, point!.y)
  }
  const midpoint = (await objects(page)).at(-1)!
  expect(midpoint).toMatchObject({ type: 'point', constraint: { type: 'construct', rule: 'midpoint' } })
  await expect(page.locator(`[id="${midpoint.id}-input"]`)).toHaveValue(/^[A-Z]: OrtaNokta\([A-Z], [A-Z]\)$/)
  await type(page, 'p=Düzlem((-3,2,-3),(3,2,-3),(-3,2,3))')
  await page.locator('#toolgroup-plane').click()
  await page.locator('#tool-parallelPlane').click()
  const start = await at(page, 6, 0, 8)
  await page.mouse.click(start!.x, start!.y)
  const onPlane = await at(page, 0, 2, 0)
  await page.mouse.click(onPlane!.x, onPlane!.y)
  expect((await objects(page)).at(-1)).toMatchObject({ type: 'plane', construction: { kind: 'parallel' } })
  expect(errors).toEqual([])
})
