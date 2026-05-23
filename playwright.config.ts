import { defineConfig, devices } from "@playwright/test"

// Группа 29: smoke-tests против staging (по умолчанию) или production.
// Параллелизм выключен — тесты бьют общую боевую БД, лучше последовательно.

export default defineConfig({
  testDir:       "./e2e",
  fullyParallel: false,
  retries:       1,
  workers:       1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
  ],
  use: {
    baseURL:    process.env.PLAYWRIGHT_BASE_URL ?? "https://new.company24.pro",
    trace:      "retain-on-failure",
    screenshot: "only-on-failure",
    video:      "retain-on-failure",
    // Staging бывает за basic-auth (HTTP 401). Если задан
    // PLAYWRIGHT_HTTP_USER/PASSWORD — Playwright автоматически добавит
    // Authorization header ко всем запросам.
    httpCredentials: process.env.PLAYWRIGHT_HTTP_USER
      ? {
          username: process.env.PLAYWRIGHT_HTTP_USER,
          password: process.env.PLAYWRIGHT_HTTP_PASSWORD ?? "",
        }
      : undefined,
  },
  projects: [
    {
      name: "chromium",
      use:  { ...devices["Desktop Chrome"] },
    },
  ],
})
