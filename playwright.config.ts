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
  },
  projects: [
    {
      name: "chromium",
      use:  { ...devices["Desktop Chrome"] },
    },
  ],
})
