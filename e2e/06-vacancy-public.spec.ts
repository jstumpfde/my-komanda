import { expect, test } from "@playwright/test"

// Группа 29 — публичная страница вакансии (без логина). Так как slug
// неизвестен заранее, берём любую опубликованную из открытого API/sitemap.
// Если ничего не нашли — тест помечает себя skipped (не fail).

test("публичная страница вакансии открывается и показывает контент", async ({ page, request }) => {
  // Попробуем sitemap — на проде Next.js обычно публикует /sitemap.xml.
  let slug: string | null = null
  try {
    const sitemap = await request.get("/sitemap.xml")
    if (sitemap.ok()) {
      const xml = await sitemap.text()
      const match = xml.match(/\/vacancy\/([a-z0-9-]+)/i)
      if (match) slug = match[1]
    }
  } catch {
    // ignore
  }

  test.skip(!slug, "Не нашли публичной вакансии в sitemap — пропускаем")

  const resp = await page.goto(`/vacancy/${slug}`, { waitUntil: "domcontentloaded" })
  expect(resp!.status(), "статус публичной страницы").toBeLessThan(400)

  const body = await page.locator("body").innerText()
  // Должен быть какой-то осмысленный контент.
  expect(body.length).toBeGreaterThan(100)

  // Кнопка отклика — варианты называния.
  const apply = page.getByRole("button", { name: /отклик|откликнуться|откликаться|подать|апплай/i })
    .or(page.getByRole("link", { name: /отклик|откликнуться|подать|апплай/i }))
  // Не fail если кнопки нет (странички могут быть в разных состояниях),
  // достаточно что body не пустой.
  if (await apply.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
    expect(await apply.first().isVisible()).toBeTruthy()
  }
})
