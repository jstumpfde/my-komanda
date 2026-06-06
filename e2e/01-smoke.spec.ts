import { expect, test } from "@playwright/test"

// Группа 29 — smoke: сервер baseURL отвечает (без 5xx). Допускаем 401
// (staging бывает за basic auth) и редиректы на /login — главное что
// сервер живой и не падает в 5xx.

test("baseURL отвечает (без 5xx) на корень", async ({ page, request }) => {
  // Берём raw-ответ через API request — он не следует редиректам в Next.
  const baseURL = test.info().project.use.baseURL ?? "https://new.company24.pro"
  const resp = await request.get(baseURL, { maxRedirects: 0 }).catch(() => null)
  expect(resp, "ответ на /").not.toBeNull()
  const status = resp!.status()
  expect(status, `статус / = ${status}`).toBeLessThan(500)

  // Если корень открывается без редиректа — проверим контент. Иначе тест
  // на этом завершён: сервер ответил без 5xx, smoke passed.
  if (status === 200) {
    await page.goto("/", { waitUntil: "load" })
    // Даём приложению дорендериться (Next + React гидрация).
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
    const bodyText = (await page.locator("body").innerText()).trim()
    expect(bodyText.length, "тело страницы").toBeGreaterThan(20)
  }
})
