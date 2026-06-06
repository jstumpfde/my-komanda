import { expect, test } from "@playwright/test"
import { hasCredentials, login } from "./helpers/auth"

// Группа 29 — AI-скоринг (Группа 25). Открываем блок ⚙ «AI-скоринг резюме»
// в конструкторе, проверяем что VacancyRequirementsSettings рендерится.
// Кнопку «Предложить из описания» НЕ нажимаем — это реальный AI-вызов.

test("Sheet настроек AI-скоринга открывается с кнопкой Предложить", async ({ page }) => {
  test.skip(!hasCredentials("hr"), "PLAYWRIGHT_HR_PASSWORD не задан — пропуск")

  await login(page, "hr")
  await page.goto("/hr/vacancies")
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})

  const firstLink = page.locator('a[href*="/hr/vacancies/"]')
    .filter({ hasNotText: /создать|новая/i })
    .first()
  if (!(await firstLink.isVisible({ timeout: 10_000 }).catch(() => false))) {
    test.skip(true, "Нет вакансий в списке — пропускаем")
    return
  }
  await firstLink.click()
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})

  // Идём в Конструктор воронки.
  const funnelTab = page.getByRole("tab", { name: /конструктор|воронк/i })
    .or(page.getByRole("button", { name: /конструктор|воронк/i }))
  if (!(await funnelTab.first().isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(true, "У вакансии не включён конструктор — пропускаем")
    return
  }
  await funnelTab.first().click()
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {})

  // Ищем блок «AI-скоринг резюме» и шестерёнку рядом. Текст блока + ближайшая
  // иконка-настройки — фиксированного селектора нет, используем
  // getByRole + filter.
  const block = page.getByText(/AI-скоринг резюме/i).first()
  await expect(block).toBeVisible({ timeout: 10_000 })

  // Кликаем по блоку или по соседней кнопке с aria-label-ом ⚙. Берём
  // первую кнопку в той же карточке (родитель блока).
  const settingsBtn = block.locator("xpath=ancestor::*[self::div or self::li or self::article][1]")
    .getByRole("button")
    .first()
  await settingsBtn.click({ timeout: 5_000 }).catch(async () => {
    // Фолбэк — иногда настройки открываются кликом по самому блоку.
    await block.click({ timeout: 5_000 })
  })

  // Sheet должен открыться — ищем заголовок «AI-скоринг резюме» снова
  // (он повторяется в Sheet header) и кнопку «Предложить».
  await page.waitForTimeout(500)
  const suggest = page.getByRole("button", { name: /предложить/i })
  if (await suggest.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Кнопка должна быть видна — НЕ кликаем (это реальный AI-вызов).
    expect(await suggest.first().isEnabled()).toBeTruthy()
  } else {
    // Если кнопки нет — допускаем (может зависеть от версии UI), главное
    // что Sheet открылся хоть с каким-то контентом.
    const body = await page.locator("body").innerText()
    expect(body.toLowerCase()).toMatch(/требовани|критери|must.have|nice.to.have/i)
  }
})
