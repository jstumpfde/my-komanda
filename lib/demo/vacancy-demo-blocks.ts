/**
 * lib/demo/vacancy-demo-blocks.ts
 *
 * Серверный помощник: демо-блоки вакансии для быстрых кнопок «Демо 1»…«Демо N»
 * (см. lib/demo/demo-quick-links.ts). Источник и порядок — ТОТ ЖЕ, что у всех
 * пер-блочных подсчётов и follow-up механизма demo3-before-interview:
 * demos с kind='demo'/'block:%', сортировка sort_order, createdAt.
 *
 * hasContent = у блока есть хотя бы один физический блок в lessons_json
 * (extractAllBlockIds через buildDemoBlockDefs). Пустой демо-блок → кнопка серая.
 */

import { and, eq, like, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { demos } from "@/lib/db/schema"
import { buildDemoBlockDefs } from "@/lib/demo/block-completion"
import type { DemoButtonBlock } from "@/lib/demo/demo-quick-links"

/** Демо-блоки вакансии в каноническом порядке для быстрых кнопок вставки ссылки. */
export async function getVacancyDemoButtonBlocks(vacancyId: string): Promise<DemoButtonBlock[]> {
  const rows = await db
    .select({ id: demos.id, title: demos.title, lessonsJson: demos.lessonsJson })
    .from(demos)
    .where(and(
      eq(demos.vacancyId, vacancyId),
      or(eq(demos.kind, "demo"), like(demos.kind, "block:%")),
    ))
    .orderBy(demos.sortOrder, demos.createdAt)

  return buildDemoBlockDefs(rows).map((d) => ({
    id: d.demoId,
    index: d.index,
    hasContent: d.blockIds.length > 0,
  }))
}
