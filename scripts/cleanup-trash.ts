/**
 * cleanup-trash.ts
 *
 * Авто-очистка корзины вакансий: безвозвратно удаляет записи из таблицы
 * `vacancies`, которые находятся в Корзине дольше 7 дней
 * (deletedAt IS NOT NULL AND deletedAt < NOW() - INTERVAL '7 days').
 *
 * Запуск: pnpm cleanup-trash
 *
 * Соответствует Корзине 2.0 — bulk-операции уже в UI/API; здесь — фоновая
 * автоматическая очистка по времени (предполагается запуск из cron / pm2).
 */

import { and, isNotNull, lt, sql } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"

async function main() {
  const startTime = Date.now()
  const startedAt = new Date().toISOString()
  console.log(`[${startedAt}] cleanup-trash: запуск автоматической очистки корзины вакансий (старше 7 дней)`)

  try {
    const deleted = await db
      .delete(vacancies)
      .where(
        and(
          isNotNull(vacancies.deletedAt),
          lt(vacancies.deletedAt, sql`NOW() - INTERVAL '7 days'`),
        ),
      )
      .returning({ id: vacancies.id, title: vacancies.title })

    const elapsedMs = Date.now() - startTime

    if (deleted.length === 0) {
      console.log(`[${new Date().toISOString()}] Корзина пуста, нечего удалять`)
    } else {
      for (const row of deleted) {
        console.log(`  - удалена вакансия id=${row.id} title=${JSON.stringify(row.title)}`)
      }
      const ids = deleted.map((r) => r.id)
      console.log(`[${new Date().toISOString()}] Удалено ${deleted.length} вакансий: [${ids.join(", ")}]`)
    }

    console.log(`[${new Date().toISOString()}] cleanup-trash: готово. Удалено: ${deleted.length}. Время выполнения: ${elapsedMs} мс`)

    // Закрываем postgres-пул (drizzle-orm/postgres-js использует postgres),
    // иначе скрипт повиснет с открытыми соединениями.
    await pgClient.end({ timeout: 5 })
    process.exit(0)
  } catch (err) {
    console.error(`[${new Date().toISOString()}] cleanup-trash: ошибка при очистке корзины:`, err)
    try {
      await pgClient.end({ timeout: 5 })
    } catch {
      // ignore — главное чтобы скрипт упал с ненулевым кодом
    }
    process.exit(1)
  }
}

main()
