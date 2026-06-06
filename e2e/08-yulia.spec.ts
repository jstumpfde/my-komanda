import { expect, test } from "@playwright/test"
import { hasCredentials, login } from "./helpers/auth"

// Группа 29 — Юлия (AI-помощник из Группы 28). Smoke-режим: открыть диалог,
// убедиться что приветствие появилось. Реальный AI-вызов делаем
// опционально (только если PLAYWRIGHT_ALLOW_AI_CALLS=1) чтобы не жечь
// токены в каждом CI-ране.

test("баннер Юли открывает Dialog и Юля здоровается", async ({ page }) => {
  test.skip(!hasCredentials("hr"), "PLAYWRIGHT_HR_PASSWORD не задан — пропуск")

  await login(page, "hr")
  await page.goto("/hr/vacancies/new")
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})

  const startBtn = page.getByRole("button", { name: /начать диалог/i })
  await expect(startBtn).toBeVisible({ timeout: 10_000 })
  await startBtn.click()

  // Dialog с чатом открыт — ищем заголовок «Юлия».
  await expect(page.getByText(/Юлия/i).first()).toBeVisible({ timeout: 10_000 })

  // Приветственное сообщение приходит мгновенно (захардкожено в API,
  // без AI-вызова). Ждём что в чате уже что-то есть.
  const chatBody = page.locator("text=/Привет|Какую вакансию/i")
  await expect(chatBody.first()).toBeVisible({ timeout: 10_000 })

  // Опциональный AI-ход — только если разрешён.
  test.skip(
    process.env.PLAYWRIGHT_ALLOW_AI_CALLS !== "1",
    "PLAYWRIGHT_ALLOW_AI_CALLS != 1 — пропускаем реальный AI-ход",
  )

  await page.fill("textarea", "Менеджер продаж в Москву, 100к")
  await page.getByRole("button", { name: /отправить|send/i }).click()

  // Ждём ответа Юлии — должен появиться ещё один assistant-bubble в течение 30с.
  await page.waitForTimeout(2_000)
  const messages = page.locator('[class*="bg-muted"], [class*="bg-primary"]')
  await expect.poll(async () => await messages.count(), { timeout: 30_000 }).toBeGreaterThan(2)
})
