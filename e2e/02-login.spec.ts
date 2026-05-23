import { expect, test } from "@playwright/test"
import { hasCredentials, login } from "./helpers/auth"

// Группа 29 — login flow для HR-юзера.

test("HR может залогиниться и попасть в кабинет", async ({ page }) => {
  test.skip(!hasCredentials("hr"), "PLAYWRIGHT_HR_PASSWORD не задан — пропуск")

  await login(page, "hr")

  // Должны попасть в HR-модуль либо общий dashboard.
  expect(page.url()).toMatch(/\/hr|\/dashboard|\/admin/)

  // Какой-то идентификатор юзера должен быть в DOM. Не привязываемся к
  // конкретному селектору — ищем email или ник в видимом тексте.
  const bodyText = await page.locator("body").innerText()
  expect(
    bodyText.includes("tester-hr") || bodyText.toLowerCase().includes("выйти") || bodyText.toLowerCase().includes("logout"),
    "после логина в шапке должен быть какой-то признак авторизации",
  ).toBeTruthy()
})
