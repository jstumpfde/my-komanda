import { expect, test } from "@playwright/test"
import { hasCredentials, login } from "./helpers/auth"

// Группа 29 — список вакансий загружается, виден CTA «Создать».

test("HR видит список вакансий и кнопку Создать", async ({ page }) => {
  test.skip(!hasCredentials("hr"), "PLAYWRIGHT_HR_PASSWORD не задан — пропуск")

  await login(page, "hr")
  await page.goto("/hr/vacancies")
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})

  // Заголовок страницы или таблица — что-нибудь должно быть.
  const body = await page.locator("body").innerText()
  expect(body.toLowerCase()).toMatch(/вакансии|вакансий/i)

  // Кнопка «Создать вакансию» (вариации: «Новая вакансия», «+ Создать»).
  const createButton = page.getByRole("button", { name: /создать|новая|добавить/i })
    .or(page.getByRole("link", { name: /создать|новая|добавить/i }))
  await expect(createButton.first()).toBeVisible({ timeout: 10_000 })
})
