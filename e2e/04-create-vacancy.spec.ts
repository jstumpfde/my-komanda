import { expect, test } from "@playwright/test"
import { hasCredentials, login } from "./helpers/auth"

// Группа 29 — создание вакансии через wizard /hr/vacancies/new.
// Чтобы не плодить мусор, добавляем timestamp в название — Юрий легко найдёт
// и удалит при необходимости. НЕ нажимаем удаление в тесте.

test("HR может создать черновик вакансии через wizard", async ({ page }) => {
  test.skip(!hasCredentials("hr"), "PLAYWRIGHT_HR_PASSWORD не задан — пропуск")

  await login(page, "hr")
  await page.goto("/hr/vacancies/new")
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})

  // Виден баннер Юли — артефакт Группы 28.
  const yuliaBanner = page.getByText(/Юлия|Юля/i).first()
  await expect(yuliaBanner).toBeVisible({ timeout: 10_000 })

  // Минимальное заполнение: title-инпут (первое поле shape: input или
  // [name=title]). Используем уникальный timestamp.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const title = `[e2e ${stamp}] Менеджер B2B продаж`

  // Ищем поле названия — `[name="title"]` если есть, иначе первый видимый input.
  const titleInput = page.locator('input[name="title"], input[name="vacancyTitle"]').first()
    .or(page.locator('input[type="text"]').first())
  await titleInput.waitFor({ state: "visible", timeout: 10_000 })
  await titleInput.fill(title)

  // Этот тест намеренно НЕ доходит до конца wizard'а — он подтверждает только
  // что страница /new рендерится без 5xx, баннер Юли виден и форма принимает
  // ввод. Полный путь создания тестируется отдельно (08-yulia / интеграция).
  expect(await titleInput.inputValue()).toBe(title)
})
