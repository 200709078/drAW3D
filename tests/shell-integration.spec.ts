import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

const menuState = (page: Page) => page.evaluate(() => ({
  more: !document.querySelector<HTMLElement>('.more-menu-wrapper')!.hidden,
  overflowing: [...document.querySelectorAll<HTMLElement>('#mainToolbar button')]
    .filter(button => button.offsetParent !== null && !button.closest('.tool-menu, .file-menu, .view-menu'))
    .some(button => button.getBoundingClientRect().right > window.innerWidth + 1),
}))

test.describe('☰ menüsü', () => {
  for (const [width, height, more] of [[1600, 900, false], [839, 343, true], [390, 844, true]] as const) {
    test(`${width}×${height}: çubuk taşmaz; ☰ yalnız gerekince`, async ({ browser }) => {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900, isMobile: width < 900 })
      await page.goto('/')
      await expect(page.locator('#mainToolbar')).toBeVisible()
      await expect.poll(() => menuState(page)).toEqual({ more, overflowing: false })
      await page.close()
    })
  }

  test('yatay telefonda: ☰ / ✕, işlemler adlarıyla (devre dışı olan soluk), gruplar yerinde açılır', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 839, height: 343 }, hasTouch: true, isMobile: true })
    await page.goto('/')
    const button = page.locator('#moreMenuButton')
    const menu = page.locator('#moreMenu')
    await expect(button).toHaveAttribute('aria-label', 'Diğer Araçlar')
    await button.tap()
    await expect(menu).toBeVisible()
    await expect(button).toHaveAttribute('aria-label', 'Menüyü Kapat')
    // Durumu anlatan başlık değil, düğmenin adı; seçim yokken Sil devre dışı.
    await expect(menu.getByRole('menuitem', { name: 'Sil' })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'Yardım' })).toBeEnabled()
    const groups = menu.locator('.more-menu-group')
    await expect(groups.first()).toHaveAttribute('aria-expanded', 'false')
    await groups.first().tap()
    await expect(groups.first()).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await page.close()
  })
})

test.describe('telefonda alt panel', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('ok yok; panel tutamacıyla ya da sekmeyle açılıp kapanır', async ({ page }) => {
    await page.goto('/')
    const wrapper = page.locator('#rightWrapper')
    const handle = page.locator('#panelHandle')
    await expect(page.locator('#btnCalc')).toBeHidden()
    await expect(wrapper).toHaveClass(/\bhide\b/)
    expect((await handle.boundingBox())!.y).toBeGreaterThan(844 - 70)
    await handle.tap()
    await expect(wrapper).not.toHaveClass(/\bhide\b/)
    await page.waitForTimeout(450)
    await handle.tap()
    await expect(wrapper).toHaveClass(/\bhide\b/)
    await page.locator('#tabTools').tap()
    await expect(wrapper).not.toHaveClass(/\bhide\b/)
    await expect(page.locator('#toolsPanel')).toBeVisible()
  })

  test('Dosya menüsü telefonda kısayol göstermez', async ({ page }) => {
    await page.goto('/')
    await page.locator('#fileMenuButton').tap()
    await expect(page.locator('#fileOpen')).toBeVisible()
    await expect(page.locator('#fileOpen kbd')).toBeHidden()
  })
})

test('Dosya menüsünün sonunda Yardım ve Hakkında; Hakkında küçük pencerede, F1 Yardım açar, Esc kapatır', async ({ page }) => {
  await page.goto('/')
  await page.locator('#fileMenuButton').click()
  await expect(page.locator('#fileOpen kbd')).toHaveText('Ctrl+O')
  const items = page.locator('#fileMenu .menu-item')
  await expect(items.nth(-2)).toHaveId('fileHelp')
  await expect(items.nth(-1)).toHaveId('fileAbout')
  await page.locator('#fileAbout').click()
  const about = page.locator('#about-popup')
  await expect(about).toBeVisible()
  await expect(page.locator('#about-version')).toHaveText(`sürüm ${version}`)
  await expect(about.getByRole('link', { name: /Linux/ })).toHaveAttribute('href', 'https://madematik.com/projelerim/draw3d#indirmeler')
  await expect(about).toContainText('İletişim')
  await page.keyboard.press('Escape')
  await expect(about).toBeHidden()

  const help = page.locator('#help-popup')
  await page.locator('#scene').click({ position: { x: 300, y: 300 } })
  await page.keyboard.press('F1')
  await expect(help).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(help).toBeHidden()
})
