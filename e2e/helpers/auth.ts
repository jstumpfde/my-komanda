import { type Page } from "@playwright/test"

// Группа 29: helper-ы для тестовых логинов. Пароли в env (не коммитим).
// Юзеры существующие — НЕ создаём новых в smoke-тестах.

export const TEST_USERS = {
  hr: {
    email:    "tester-hr@company24.pro",
    password: process.env.PLAYWRIGHT_HR_PASSWORD || "CHANGE_ME",
  },
  director: {
    email:    "director@company24.pro",
    password: process.env.PLAYWRIGHT_DIRECTOR_PASSWORD || "CHANGE_ME",
  },
} as const

export type TestUser = keyof typeof TEST_USERS

// Залогиниться через стандартную форму /login. Ждём редиректа на любую
// внутреннюю страницу (/hr, /dashboard, /admin). Если сайт изменит route —
// расширить regex.
export async function login(page: Page, user: TestUser): Promise<void> {
  const { email, password } = TEST_USERS[user]

  await page.goto("/login")
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')

  await page.waitForURL(/\/hr|\/dashboard|\/admin/, { timeout: 15_000 })
}

// Проверка что переменные окружения заданы — пропускаем тесты, требующие
// логина, если пароли не подставлены (CI без secrets).
export function hasCredentials(user: TestUser): boolean {
  return TEST_USERS[user].password !== "CHANGE_ME"
}
