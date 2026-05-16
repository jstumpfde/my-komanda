// Стандартная воронка кандидатов — 9 стадий в каноническом порядке.
// Источник правды: lib/stages.ts PLATFORM_STAGES. Дублируется здесь компактно
// (slug/title/color/sort_order/flags), чтобы SQL-seed работал без рантайм-импорта
// тяжёлого модуля.
//
// Используется:
//   - при создании компании (POST/PUT /api/companies)
//   - при создании первой вакансии (POST /api/modules/hr/vacancies — legacy
//     fallback, идемпотентен через WHERE NOT EXISTS)
//   - в drizzle/0104_funnel_stages_backfill.sql — бэкфил для существующих
//     компаний

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export const DEFAULT_FUNNEL_STAGES: Array<{
  slug: string
  title: string
  color: string
  sortOrder: number
  isTerminal: boolean
  isDefault: boolean
}> = [
  { slug: "new",             title: "Новый",             color: "#94a3b8", sortOrder: 0, isTerminal: false, isDefault: true  },
  { slug: "primary_contact", title: "Первичный контакт", color: "#60a5fa", sortOrder: 1, isTerminal: false, isDefault: false },
  { slug: "demo_opened",     title: "Демо открыто",      color: "#6366f1", sortOrder: 2, isTerminal: false, isDefault: false },
  { slug: "anketa_filled",   title: "Анкета заполнена",  color: "#fb923c", sortOrder: 3, isTerminal: false, isDefault: false },
  { slug: "ai_screening",    title: "AI-скрининг",       color: "#06b6d4", sortOrder: 4, isTerminal: false, isDefault: false },
  { slug: "decision",        title: "Демо пройдено",     color: "#f59e0b", sortOrder: 5, isTerminal: false, isDefault: false },
  { slug: "interview",       title: "Собеседование",     color: "#8b5cf6", sortOrder: 6, isTerminal: false, isDefault: false },
  { slug: "hired",           title: "Нанят",             color: "#22c55e", sortOrder: 7, isTerminal: true,  isDefault: false },
  { slug: "rejected",        title: "Отказ",             color: "#ef4444", sortOrder: 8, isTerminal: true,  isDefault: false },
]

/**
 * Идемпотентно создаёт 9 стандартных стадий воронки для компании.
 * Если стадия с таким slug уже существует у компании — пропускается.
 * Best-effort: ошибка не пробрасывается (например, отсутствие таблицы), чтобы
 * вызов из критичных путей (создание компании) не падал из-за конфигурации.
 */
export async function seedDefaultFunnelStages(companyId: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO funnel_stages (id, company_id, slug, title, color, sort_order, is_terminal, is_default, created_at, updated_at)
      SELECT gen_random_uuid(), ${companyId}::uuid, slug, title, color, sort_order, is_terminal, is_default, NOW(), NOW()
      FROM (VALUES
        ('new',             'Новый',             '#94a3b8', 0, false, true),
        ('primary_contact', 'Первичный контакт', '#60a5fa', 1, false, false),
        ('demo_opened',     'Демо открыто',      '#6366f1', 2, false, false),
        ('anketa_filled',   'Анкета заполнена',  '#fb923c', 3, false, false),
        ('ai_screening',    'AI-скрининг',       '#06b6d4', 4, false, false),
        ('decision',        'Демо пройдено',     '#f59e0b', 5, false, false),
        ('interview',       'Собеседование',     '#8b5cf6', 6, false, false),
        ('hired',           'Нанят',             '#22c55e', 7, true,  false),
        ('rejected',        'Отказ',             '#ef4444', 8, true,  false)
      ) AS t(slug, title, color, sort_order, is_terminal, is_default)
      WHERE NOT EXISTS (
        SELECT 1 FROM funnel_stages fs
        WHERE fs.company_id = ${companyId}::uuid AND fs.slug = t.slug
      )
    `)
  } catch (e) {
    console.warn("[seedDefaultFunnelStages] skipped:", e instanceof Error ? e.message : e)
  }
}
