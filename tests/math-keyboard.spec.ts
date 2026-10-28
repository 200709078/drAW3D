import { expect, test, type Page } from '@playwright/test'

const input = (page: Page) => page.locator('#giris')
const keyboard = (page: Page) => page.locator('#mathKeyboard')
const press = async (page: Page, ...labels: string[]) => {
  for (const label of labels) {
    await keyboard(page).locator('.math-keyboard-page:not([hidden]) .math-key').filter({
      has: page.locator(`xpath=self::*[normalize-space(.)="${label}"]`),
    }).click()
  }
}

// A smart board whose touch frame acts as a mouse: fine primary pointer, many touch points.
test.describe('akıllı tahta', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 20 }))
    await page.goto('/')
    await page.waitForFunction(() => (window.drAW3DApp?.frames() ?? 0) > 0)
  })

  test('giriş alanına dokununca klavye açılır; kapatılınca o alanda kapalı kalır', async ({ page }) => {
    await input(page).click()
    await expect(keyboard(page)).toBeVisible()
    await expect(input(page)).toHaveAttribute('inputmode', 'none')
    await page.locator('#keyboardToggle').click()
    await expect(keyboard(page)).toBeHidden()
    await page.locator('#helpMenuButton').focus()
    await input(page).click()
    await expect(keyboard(page)).toBeHidden()
  })

  test('kart düzenlenirken klavye karta yazar; düzenleme bitince giriş alanına döner', async ({ page }) => {
    await input(page).fill('A=(1,2,3)')
    await input(page).press('Enter')
    const card = page.locator('#objectsContainer .expr-block input').first()
    await card.dblclick()
    await expect(card).not.toHaveAttribute('readonly')
    await expect(keyboard(page)).toBeVisible()
    await card.evaluate((element: HTMLInputElement) => element.setSelectionRange(element.value.indexOf('('), element.value.length))
    await press(page, '(', '3', ',', '4', ',', '5')
    await expect(card).toHaveValue(/\(3,4,5\)$/)
    await press(page, '⏎')
    await expect(card).toHaveAttribute('readonly', '')
    await expect.poll(() => page.evaluate(() => {
      const point = window.drAW3DApp!.objects().find(object => object.name === 'A')
      return point?.type === 'point' ? [point.position.x, point.position.y, point.position.z] : null
    })).toEqual([3, 4, 5])
    await press(page, '7')
    await expect(input(page)).toHaveValue('7')
  })

  test('yardım aramasında klavye arama kutusunun altına taşınır, kapanınca panele döner', async ({ page }) => {
    await page.locator('#helpMenuButton').click()
    const search = page.locator('#helpSearch')
    await expect(search).toBeFocused()
    await expect(page.locator('.help-search + #mathKeyboard')).toBeVisible()
    await page.locator('#keyboardtab-letters').click()
    await press(page, 'k', 'ü', 'r', 'e')
    await expect(search).toHaveValue('küre')
    await page.locator('.help-close').click()
    await page.locator('#keyboardtab-numbers').click()
    await press(page, '7')
    await expect(page.locator('#rightWrapper #mathKeyboard')).toBeVisible()
    await expect(input(page)).toHaveValue('7')
  })
})
