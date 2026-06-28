/**
 * Бэкфилл балла по ответам демо (demo_answers_score) для существующих
 * кандидатов, завершивших демо ДО включения авто-расчёта.
 * Запуск на проде: cd /var/www/my-komanda && set -a && . .env && set +a \
 *   && ./node_modules/.bin/tsx scripts/backfill-demo-answers.ts <vacancyId>
 * Идемпотентно: skipIfScored=true (не перезатирает уже посчитанные).
 */
import { and, eq, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates } from "@/lib/db/schema"
import { scoreDemoAnswers } from "@/lib/demo/score-answers"

async function main() {
  const vacancyId = process.argv[2]
  if (!vacancyId) {
    console.error("usage: tsx scripts/backfill-demo-answers.ts <vacancyId>")
    process.exit(1)
  }
  const rows = await db
    .select({ id: candidates.id, name: candidates.name })
    .from(candidates)
    .where(and(eq(candidates.vacancyId, vacancyId), isNotNull(candidates.anketaAnswers)))
  console.log(`Кандидатов с ответами: ${rows.length}`)
  for (const r of rows) {
    try {
      const res = await scoreDemoAnswers({ candidateId: r.id, vacancyId, skipIfScored: true })
      console.log(`  ${r.name}: ${res ? res.score : "null (нет реальных ответов / уже посчитан)"}`)
    } catch (e) {
      console.error(`  ${r.name}: ОШИБКА ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  process.exit(0)
}
main()
