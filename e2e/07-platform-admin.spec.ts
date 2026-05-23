import { expect, test } from "@playwright/test"
import { hasCredentials, login } from "./helpers/auth"

// Группа 29 — /admin/platform доступен для PLATFORM_ADMIN_EMAILS и
// показывает табы. НЕ нажимаем ничего в Emergency.

test("/admin/platform виден директору и содержит ожидаемые табы", async ({ page }) => {
  test.skip(!hasCredentials("director"), "PLAYWRIGHT_DIRECTOR_PASSWORD не задан — пропуск")

  await login(page, "director")
  const resp = await page.goto("/admin/platform")
  // Если юзер не в PLATFORM_ADMIN_EMAILS — будет 404 (так задумано).
  test.skip(
    resp!.status() === 404,
    "director не в PLATFORM_ADMIN_EMAILS — пропускаем (нужно добавить в env)",
  )

  expect(resp!.status(), "статус /admin/platform").toBeLessThan(400)
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})

  const body = await page.locator("body").innerText()

  // Ожидаемые табы: Migrations, Companies, AI vacancies, Templates,
  // Emergency, Logs (+ Yulia из Группы 28).
  const expectedTabs = ["Migrations", "Companies", "AI vacancies", "Templates", "Emergency", "Logs"]
  for (const tab of expectedTabs) {
    expect(body, `таб «${tab}»`).toContain(tab)
  }
})
