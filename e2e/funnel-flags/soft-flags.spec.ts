import { expect, test } from "@playwright/test"
import { hasCredentials, login } from "../helpers/auth"

// Эшелон 1 — проверка, что toggle блока воронки реально доходит до бэкенда.
// Уровень API: funnel-config PUT зеркалит enabled блока в
// vacancies.aiProcessSettings.<flag> (dual-write), а именно этот флаг читают
// добавленные в Эшелоне 1 проверки (stop_factors / auto_reply / ai_anketa /
// stop_words). Тест НЕ гоняет полный pipeline кандидата — проверка того, что
// «логика пропускается» при OFF, относится к интеграционным тестам/ручной
// проверке (нужен живой кандидат через process-queue).
//
// ⚠️ НЕ ПРОГНАН: на момент написания PLAYWRIGHT_HR_PASSWORD не задан, поэтому
// селекторы/контракт не валидированы вживую. Когда пароль появится — запустить
// и при необходимости поправить путь к тестовой вакансии.

const FLAG_BY_BLOCK: Record<string, string> = {
  stop_factors_resume:  "stopFactorsEnabled",
  auto_reply_test_task: "testTaskAutoReplyEnabled",
  ai_anketa_score:      "aiAnketaScoreEnabled",
  stop_words_chat:      "stopWordsChatEnabled",
}

test.describe("Funnel soft-flags dual-write", () => {
  test.skip(!hasCredentials("hr"), "PLAYWRIGHT_HR_PASSWORD не задан — пропуск")

  test("OFF блока зеркалится в aiProcessSettings.<flag>=false, ON → true", async ({ page }) => {
    await login(page, "hr")

    // Берём любую вакансию компании.
    const listRes = await page.request.get("/api/modules/hr/vacancies?limit=1")
    expect(listRes.ok()).toBeTruthy()
    const listJson = await listRes.json()
    const vacancy = (listJson.vacancies ?? listJson.data ?? [])[0]
    test.skip(!vacancy?.id, "Нет вакансий для проверки")
    const vacancyId = vacancy.id as string

    // Текущая конфигурация воронки.
    const cfgRes = await page.request.get(`/api/modules/hr/vacancies/${vacancyId}/funnel-config`)
    expect(cfgRes.ok()).toBeTruthy()
    const cfg = await cfgRes.json()
    const blocks: Array<{ type: string; order: number; enabled: boolean }> = cfg.funnelConfigJson.blocks
    const original = blocks.map(b => ({ ...b }))

    for (const [blockType, flag] of Object.entries(FLAG_BY_BLOCK)) {
      // OFF → флаг false.
      const off = blocks.map(b => b.type === blockType ? { ...b, enabled: false } : b)
      const offRes = await page.request.put(`/api/modules/hr/vacancies/${vacancyId}/funnel-config`, { data: { blocks: off } })
      expect(offRes.ok(), `PUT OFF ${blockType}`).toBeTruthy()
      const vOff = await (await page.request.get(`/api/modules/hr/vacancies/${vacancyId}`)).json()
      expect(vOff.aiProcessSettings?.[flag], `${flag} должен быть false при OFF`).toBe(false)

      // ON → флаг true.
      const on = blocks.map(b => b.type === blockType ? { ...b, enabled: true } : b)
      const onRes = await page.request.put(`/api/modules/hr/vacancies/${vacancyId}/funnel-config`, { data: { blocks: on } })
      expect(onRes.ok(), `PUT ON ${blockType}`).toBeTruthy()
      const vOn = await (await page.request.get(`/api/modules/hr/vacancies/${vacancyId}`)).json()
      expect(vOn.aiProcessSettings?.[flag], `${flag} должен быть true при ON`).toBe(true)
    }

    // Восстанавливаем исходную конфигурацию, чтобы не оставлять следов.
    await page.request.put(`/api/modules/hr/vacancies/${vacancyId}/funnel-config`, { data: { blocks: original } })
  })
})
