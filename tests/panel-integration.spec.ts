import { expect, test, type Page } from '@playwright/test'
import type { GeometryObject, PolyhedronObject } from '../src/geometry/types'

async function open(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  return errors
}

const objects = (page: Page) => page.evaluate(() => window.drAW3DApp!.objects()) as Promise<GeometryObject[]>
const named = async <T extends GeometryObject>(page: Page, name: string) => (await objects(page)).find(object => object.name === name) as T

async function type(page: Page, ...commands: string[]): Promise<void> {
  const input = page.locator('#giris')
  for (const command of commands) {
    await input.fill(command)
    await input.press('Enter')
  }
}

/** A card by object name; IDs start with digits, so attribute selectors are used. */
async function card(page: Page, name: string) {
  const object = await named(page, name)
  return { id: object.id, root: page.locator(`#objectsContainer [data-id="${object.id}"]`), part: (suffix: string) => page.locator(`[id="${object.id}-${suffix}"]`) }
}

test('komutlar kart oluşturur, en yeni üstte; hatalı komut bildirilir ve belge değişmez', async ({ page }) => {
  const errors = await open(page)
  await type(page, 'A=(0,0,0)', 'B=(3,0,0)', 's=DoğruParçası(A,B)')
  await expect(page.locator('#objectsContainer > div')).toHaveCount(3)
  await expect(page.locator('#objectsContainer > div').first().locator('.expr-block input')).toHaveValue('s: DoğruParçası(A, B)')
  await expect(page.locator('#objectsContainer > div').first().locator('.expr-block output')).toHaveText('Uzunluk = 3')
  await type(page, 'DoğruParçası(A, Z)')
  await expect(page.locator('#snackContent')).toHaveText('Bilinmeyen ad: Z')
  expect(await objects(page)).toHaveLength(3)
  await page.locator('#undo').click()
  await expect(page.locator('#objectsContainer > div')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('şablon önerisi yer tutucuyu seçer; doldurulmamış şablon gönderilmez', async ({ page }) => {
  await open(page)
  const input = page.locator('#giris')
  await input.click()
  await input.pressSequentially('Pri')
  await expect(page.locator('#commandSuggestions')).toBeVisible()
  await input.press('Enter')
  await expect(input).toHaveValue('Prizma(<Nokta>, <Nokta>, <Kenar Sayısı>, <Yükseklik>)')
  expect(await input.evaluate((element: HTMLInputElement) => element.value.slice(element.selectionStart!, element.selectionEnd!))).toBe('<Nokta>')
  await input.press('Enter')
  await expect(page.locator('#snackContent')).toHaveText('Şablondaki <Nokta> alanını doldurun.')
  expect(await objects(page)).toHaveLength(0)
  await input.fill('Prizma((0,0,0),(2,0,0),6)')
  await input.press('Enter')
  expect((await named<PolyhedronObject>(page, 'prizma1')).sideCount).toBe(6)
})

test('yardım penceresi komut dilinden üretilir; örnek girişe yazılır', async ({ page }) => {
  await open(page)
  await page.locator('#helpMenuButton').click()
  await expect(page.locator('#help-popup')).toBeVisible()
  await page.locator('#helpSearch').fill('hacim')
  await page.locator('code.example', { hasText: 'Hacim(silindir1)' }).click()
  await expect(page.locator('#help-popup')).toBeHidden()
  await expect(page.locator('#giris')).toHaveValue('Hacim(silindir1)')
})

test('matematik klavyesi imlece yazar ve ⏎ gönderir', async ({ page }) => {
  await open(page)
  await page.locator('#keyboardToggle').click()
  await expect(page.locator('#mathKeyboard')).toBeVisible()
  const keyboard = page.locator('#mathKeyboard .math-keyboard-page:not([hidden])')
  for (const key of ['A', '=', '(', '1', ',', '2', ',', '3']) await keyboard.getByRole('button', { name: key, exact: true }).click()
  await expect(page.locator('#giris')).toHaveValue('A=(1,2,3)')
  await page.locator('#mathKeyboard .math-key[title="Gönder"]').first().click()
  const point = await named(page, 'A')
  expect(point).toMatchObject({ type: 'point', position: { x: 1, y: 2, z: 3 } })
})

test('kart seçimi sahneyle eşleşir; karttan düzenleme nesneyi yerinde değiştirir', async ({ page }) => {
  await open(page)
  await type(page, 'A=(0,0,0)', 'B=(3,0,0)', 's=DoğruParçası(A,B)')
  const segment = await card(page, 's')
  await segment.part('input').click()
  expect(await page.evaluate(() => window.drAW3DApp!.selectedId())).toBe(segment.id)
  await expect(segment.root).toHaveClass(/is-active/)
  await segment.part('edit').click()
  await expect(segment.part('input')).toHaveValue('s: DoğruParçası(A, B)')
  await segment.part('input').fill('s: Işın(A, B)')
  await segment.part('input').press('Enter')
  await expect(segment.part('input')).toHaveValue('s: Işın(A, B)')
  expect((await named(page, 's')).type).toBe('ray')
  // An invalid definition keeps the card in editing and changes nothing.
  await segment.part('edit').click()
  await segment.part('input').fill('s: Düzlem(A,B,(0,0,1))')
  await segment.part('input').press('Enter')
  await expect(page.locator('#snackContent')).toHaveText('Tanım aynı türde bir nesne üretmelidir.')
  await expect(segment.root).toHaveClass(/is-editing/)
  expect((await named(page, 's')).type).toBe('ray')
})

test('parametre kaydırıcısı ona bağlı prizmayı ve köşe noktalarını değiştirir; tek adımda geri alınır', async ({ page }) => {
  await open(page)
  await type(page, 'n=4', 'Prizma((0,0,0),(2,0,0),n)')
  const parameter = await card(page, 'n')
  await expect(parameter.part('sliderA')).toBeVisible()
  await parameter.part('sliderA').fill('5')
  expect((await named<PolyhedronObject>(page, 'prizma1')).sideCount).toBe(5)
  const vertices = async () => (await objects(page)).filter(object => object.type === 'point'
    && object.constraint?.type === 'vertex' && object.geometryValid !== false).length
  expect(await vertices()).toBe(3 + 4)
  await page.locator('#undo').click()
  expect((await named<PolyhedronObject>(page, 'prizma1')).sideCount).toBe(4)
  // Bounds are edited on the selected card.
  await parameter.part('input').click()
  await parameter.part('max').fill('12')
  await parameter.part('max').press('Enter')
  expect(await named(page, 'n')).toMatchObject({ max: 12 })
})

test('görünüm ayarları: renk, saydamlık, yüzler, kenar çizgisi, etiket', async ({ page }) => {
  await open(page)
  await type(page, 'Prizma((0,0,0),(2,0,0))')
  const prism = await card(page, 'prizma1')
  await prism.part('input').click()
  await prism.part('style').click()
  await expect(prism.part('settings')).toBeVisible()
  await expect(prism.part('size')).toBeHidden()
  await prism.part('color').fill('#123456')
  await prism.part('opacity').fill('0.3')
  await prism.part('faces').uncheck()
  await prism.part('lineStyle').selectOption('dashed')
  await prism.part('label').check()
  expect(await named(page, 'prizma1')).toMatchObject({
    color: '#123456', opacity: 0.3, facesHidden: true, lineStyle: 'dashed', labelVisible: true,
  })
  await expect(page.locator('#sceneLabels .scene-label', { hasText: /^prizma1$/ })).toHaveCount(1)
  await page.locator('#undo').click()
  expect((await named(page, 'prizma1')).labelVisible).toBeUndefined()
})

test('kartın renk düğmesi gizler/gösterir, çöp kutusu siler; ölçümler sahnede yazılır', async ({ page }) => {
  await open(page)
  await type(page, 'A=(0,0,0)', 'p=Düzlem((0,2,0),(1,2,0),(0,2,1))', 'Uzaklık(A,p)', 'Küre((5,0,0),2)', 'Hacim(küre1)')
  await expect(page.locator('#sceneLabels .scene-label', { hasText: 'uzaklık1 = 2' })).toHaveCount(1)
  await expect(page.locator('#sceneLabels .scene-label', { hasText: 'hacim1 = 33.51' })).toHaveCount(1)
  const plane = await card(page, 'p')
  await plane.part('visibility').click()
  expect((await named(page, 'p')).hidden).toBe(true)
  await expect(plane.part('visibility')).toHaveAttribute('title', 'Göster')
  await plane.part('visibility').click()
  expect((await named(page, 'p')).hidden).toBeUndefined()
  await plane.part('remove').click()
  // The distance measure goes with the plane.
  expect((await objects(page)).map(object => object.name)).not.toContain('uzaklık1')
  await expect(page.locator('#sceneLabels .scene-label', { hasText: 'uzaklık1' })).toHaveCount(0)
})

test('sahnede seçilen cismin kartı öne gelir', async ({ page }) => {
  await open(page)
  await type(page, 'Prizma((0,0,0),(4,0,0))')
  for (let index = 0; index < 12; index++) await type(page, `(${index}, 0, 10)`)
  const prism = await card(page, 'prizma1')
  const point = await page.evaluate(() => window.drAW3DApp!.toPage({ x: 2, y: 2, z: 0 }))
  await page.mouse.click(point!.x, point!.y)
  await expect(prism.root).toHaveClass(/is-active/)
  await expect(prism.root).toBeInViewport()
})

test('klavyenin ⇧ tuşu bir harfi ya da kilitliyken bütün harfleri büyük yazar', async ({ page }) => {
  await open(page)
  await page.locator('#keyboardToggle').click()
  await page.locator('#keyboardtab-letters').click()
  const keyboard = page.locator('#mathKeyboard .math-keyboard-page:not([hidden])')
  const press = async (...labels: string[]) => {
    for (const label of labels) await keyboard.getByRole('button', { name: label, exact: true }).click()
  }
  const shift = keyboard.getByRole('button', { name: 'Büyük/Küçük harf' })
  await shift.click()
  await expect(shift).toHaveAttribute('aria-pressed', 'true')
  await press('İ', 'a')
  await expect(page.locator('#giris')).toHaveValue('İa')
  await expect(shift).toHaveAttribute('aria-pressed', 'false')
  await shift.click()
  await shift.click()
  await press('I', 'Ş')
  await expect(page.locator('#giris')).toHaveValue('İaIŞ')
  await shift.click()
  await press('ı')
  await expect(page.locator('#giris')).toHaveValue('İaIŞı')
})
