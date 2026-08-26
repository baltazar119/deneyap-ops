import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

test.describe('Auth akışları', () => {

  test('landing page yüklenebilir', async ({ page }) => {
    await page.goto(BASE)
    await expect(page).toHaveTitle(/DENEYAP/)
    await expect(page.getByText('Giriş Yap')).toBeVisible()
  })

  test('login sayfası yüklenir', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await expect(page.getByRole('heading', { name: /Hoş geldiniz/i })).toBeVisible()
    await expect(page.getByPlaceholder('ornek@email.com')).toBeVisible()
    await expect(page.getByPlaceholder('En az 6 karakter')).toBeVisible()
  })

  test('kayıt modunda KVKK checkbox görünür', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByRole('button', { name: 'Kayıt Ol' }).click()
    await expect(page.getByText('Gizlilik Politikası')).toBeVisible()
    await expect(page.getByText('Kullanım Şartları')).toBeVisible()
    const checkbox = page.getByRole('checkbox')
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()
  })

  test('hatalı giriş bilgileri hata mesajı gösterir', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByPlaceholder('ornek@email.com').fill('yanlis@test.com')
    await page.getByPlaceholder('En az 6 karakter').fill('yanlisSifre123')
    await page.getByRole('button', { name: /Giriş Yap →/ }).click()
    await expect(page.getByText(/hatalı|Invalid|doğrulanmamış/i)).toBeVisible({ timeout: 8000 })
  })

  test('KVKK olmadan kayıt engellenebilir (UI kontrolü)', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByRole('button', { name: 'Kayıt Ol' }).click()

    await page.getByPlaceholder('Adınız Soyadınız').fill('Test Kullanıcı')
    await page.getByPlaceholder('ornek@email.com').fill('test@example.com')
    await page.getByPlaceholder('En az 6 karakter').fill('test1234')

    // Checkbox işaretlenmeden gönder
    await page.getByRole('button', { name: /Hesap Oluştur/ }).click()
    await expect(page.getByText(/Gizlilik Politikası.*kabul/i)).toBeVisible({ timeout: 5000 })
  })

  test('gizlilik politikası sayfası erişilebilir', async ({ page }) => {
    await page.goto(`${BASE}/gizlilik`)
    await expect(page).toHaveTitle(/Gizlilik/)
    await expect(page.getByRole('heading', { name: 'Gizlilik Politikası' })).toBeVisible()
  })

  test('kullanım şartları sayfası erişilebilir', async ({ page }) => {
    await page.goto(`${BASE}/kullanim-sartlari`)
    await expect(page).toHaveTitle(/Kullanım Şartları/)
    await expect(page.getByRole('heading', { name: 'Kullanım Şartları' })).toBeVisible()
  })

  test('çerez banner\'ı görünür ve kapatılabilir', async ({ page }) => {
    // localStorage'ı temizle
    await page.goto(`${BASE}/login`)
    await page.evaluate(() => localStorage.removeItem('deneyap_cookie_consent'))
    await page.reload()

    await expect(page.getByText('zorunlu çerezler')).toBeVisible()
    await page.getByRole('button', { name: 'Anladım' }).click()
    await expect(page.getByText('zorunlu çerezler')).not.toBeVisible()
  })

  test('korumalı sayfa giriş yapmadan erişildiğinde login\'e yönlendirir', async ({ page }) => {
    await page.goto(`${BASE}/workspaces`)
    await expect(page).toHaveURL(/login/)
  })

})
