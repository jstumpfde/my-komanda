/**
 * migrate-templates.ts
 *
 * Миграция устаревших полей шаблонов сообщений в descriptionJson.automation.
 *
 *   automation.rejectTemplate  →  automation.messageTemplates.soft_reject
 *   automation.inviteTemplate  →  automation.messageTemplates.demo_invite
 *
 * Логика на каждую вакансию:
 *  - Если automation.rejectTemplate непустой и messageTemplates.soft_reject пуст / отсутствует
 *    → копируем значение в messageTemplates.soft_reject.
 *  - Аналогично для inviteTemplate → messageTemplates.demo_invite.
 *  - Если в messageTemplates.* уже есть значение — НЕ перезатираем (новое поле — источник истины).
 *  - Старые поля automation.rejectTemplate / inviteTemplate ОСТАВЛЯЕМ как есть (orphan-данные),
 *    чтобы можно было откатить при необходимости. В UI они уже не редактируются и в PATCH
 *    не пишутся (см. components/vacancies/automation-settings.tsx,
 *    app/api/modules/hr/vacancies/[id]/route.ts).
 *
 * Запуск ВРУЧНУЮ после ревью:
 *   pnpm tsx scripts/migrate-templates.ts          # dry-run, только показывает что бы изменилось
 *   pnpm tsx scripts/migrate-templates.ts --apply  # применить изменения
 *
 * Скрипт идемпотентен: повторный запуск ничего лишнего не сделает.
 */

import { eq, isNotNull } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"

interface PlannedChange {
  vacancyId: string
  title: string | null
  /** Новое значение messageTemplates целиком (то, что запишем в БД при apply). */
  nextMessageTemplates: Record<string, string>
  copiedRefusal: boolean
  copiedInvite: boolean
}

async function main() {
  const apply = process.argv.includes("--apply")
  const startedAt = new Date().toISOString()
  console.log(`[${startedAt}] migrate-templates: ${apply ? "APPLY" : "DRY-RUN"} mode`)

  try {
    // Читаем все вакансии с непустым descriptionJson — фильтр по JSON-ключам делаем в JS.
    const rows = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        descriptionJson: vacancies.descriptionJson,
      })
      .from(vacancies)
      .where(isNotNull(vacancies.descriptionJson))

    const planned: PlannedChange[] = []

    for (const row of rows) {
      const dj = row.descriptionJson
      if (!dj || typeof dj !== "object") continue
      const djObj = dj as Record<string, unknown>
      const automation = djObj.automation
      if (!automation || typeof automation !== "object") continue
      const aut = automation as Record<string, unknown>

      const oldReject = typeof aut.rejectTemplate === "string" ? (aut.rejectTemplate as string).trim() : ""
      const oldInvite = typeof aut.inviteTemplate === "string" ? (aut.inviteTemplate as string).trim() : ""
      if (!oldReject && !oldInvite) continue

      const messageTemplatesRaw = aut.messageTemplates
      const messageTemplates: Record<string, string> =
        messageTemplatesRaw && typeof messageTemplatesRaw === "object"
          ? { ...(messageTemplatesRaw as Record<string, string>) }
          : {}

      const existingReject = (messageTemplates.soft_reject ?? "").trim()
      const existingInvite = (messageTemplates.demo_invite ?? "").trim()

      const copiedRefusal = !!oldReject && !existingReject
      const copiedInvite  = !!oldInvite && !existingInvite
      if (!copiedRefusal && !copiedInvite) continue

      if (copiedRefusal) messageTemplates.soft_reject = oldReject
      if (copiedInvite)  messageTemplates.demo_invite = oldInvite

      planned.push({
        vacancyId: row.id,
        title: row.title,
        nextMessageTemplates: messageTemplates,
        copiedRefusal,
        copiedInvite,
      })
    }

    console.log(`Просмотрено вакансий: ${rows.length}`)
    console.log(`К миграции: ${planned.length}`)
    for (const p of planned) {
      const flags = [p.copiedRefusal ? "soft_reject" : null, p.copiedInvite ? "demo_invite" : null].filter(Boolean).join(", ")
      console.log(`  - ${p.vacancyId}  «${p.title ?? "(без названия)"}»  →  ${flags}`)
    }

    if (!apply) {
      console.log("\nDry-run завершён. Запусти с --apply, чтобы применить.")
      await pgClient.end({ timeout: 5 })
      process.exit(0)
    }

    // ── apply: per-row UPDATE с фильтром по id, чтобы не задеть остальные вакансии ──
    let applied = 0
    for (const p of planned) {
      const [current] = await db
        .select({ descriptionJson: vacancies.descriptionJson })
        .from(vacancies)
        .where(eq(vacancies.id, p.vacancyId))
        .limit(1)
      if (!current || !current.descriptionJson || typeof current.descriptionJson !== "object") continue
      const djObj = current.descriptionJson as Record<string, unknown>
      const automation = (djObj.automation && typeof djObj.automation === "object")
        ? djObj.automation as Record<string, unknown>
        : {}
      const nextAutomation = { ...automation, messageTemplates: p.nextMessageTemplates }
      const nextDj = { ...djObj, automation: nextAutomation }
      await db
        .update(vacancies)
        .set({ descriptionJson: nextDj, updatedAt: new Date() })
        .where(eq(vacancies.id, p.vacancyId))
      applied++
    }
    console.log(`Применено: ${applied}`)

    await pgClient.end({ timeout: 5 })
    process.exit(0)
  } catch (err) {
    console.error("migrate-templates: ошибка:", err)
    try { await pgClient.end({ timeout: 5 }) } catch {}
    process.exit(1)
  }
}

main()
