// Group 14 — Phase 2.
//
// Идемпотентный runner для «миграций настроек». В отличие от обычных SQL
// миграций (drizzle/*.sql), эти меняют не схему, а данные/настройки: например,
// дополнить дефолтные стоп-слова у всех вакансий или сбросить кеш AI-промптов.
//
// Каждая миграция имеет уникальный id и применяется один раз — runner перед
// apply() проверяет журнал platform_settings_migrations. Если запись есть —
// миграция пропускается. Если нет — apply() выполняется и в журнал
// записывается id, описание, affectedCount и (опционально) данные для отката.

import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformSettingsMigrations, platformSettings } from "@/lib/db/schema"
import { DRIP_TEMPLATES_SEED } from "@/lib/funnel-v2/dozhim-templates"
import { DRIP_TEMPLATES_KEY } from "@/lib/platform/settings"

type Db = typeof db

interface ApplyResult {
  affectedCount: number
  rollbackData?: unknown
}

export interface SettingsMigration {
  id: string
  description: string
  apply: (db: Db) => Promise<ApplyResult>
  rollback?: (db: Db, rollbackData: unknown) => Promise<void>
}

// Список миграций. Добавлять новые — В КОНЕЦ. Не переименовывать id
// применённой миграции — будет считаться непримененной и попробует
// запуститься повторно.
export const SETTINGS_MIGRATIONS: SettingsMigration[] = [
  {
    id: "2026-05-22-example-add-stop-word",
    description: "Add 'спасибо за общение' to vacancies that don't already have it",
    apply: async (db) => {
      const result = await db.execute(sql`
        UPDATE vacancies
        SET stop_words_json = stop_words_json || '["спасибо за общение"]'::jsonb
        WHERE NOT (stop_words_json ? 'спасибо за общение')
        RETURNING id
      `)
      return { affectedCount: result.length }
    },
  },
  {
    // Материализуем платформенный эталон drip-шаблонов дожима в
    // platform_settings['drip_templates'] из кода-сида — чтобы запись
    // существовала и была видна/правима в /admin/platform/drip-templates.
    // Идемпотентно: если запись уже есть (админ мог отредактировать), НЕ трогаем.
    id: "2026-06-29-seed-drip-templates",
    description: "Seed platform drip_templates from code seed (only if absent — preserves admin edits)",
    apply: async (db) => {
      const [existing] = await db
        .select({ key: platformSettings.key })
        .from(platformSettings)
        .where(eq(platformSettings.key, DRIP_TEMPLATES_KEY))
        .limit(1)
      if (existing) return { affectedCount: 0 }
      await db.insert(platformSettings).values({
        key:       DRIP_TEMPLATES_KEY,
        value:     DRIP_TEMPLATES_SEED,
        updatedAt: new Date(),
      })
      return { affectedCount: 1 }
    },
  },
]

export interface RunMigrationsReport {
  applied: string[]
  skipped: string[]
  failed: { id: string; error: string }[]
}

export async function runPendingMigrations(
  createdBy?: string,
): Promise<RunMigrationsReport> {
  const applied: string[] = []
  const skipped: string[] = []
  const failed: { id: string; error: string }[] = []

  for (const migration of SETTINGS_MIGRATIONS) {
    const existing = await db.query.platformSettingsMigrations.findFirst({
      where: eq(platformSettingsMigrations.id, migration.id),
    })

    if (existing) {
      skipped.push(migration.id)
      continue
    }

    try {
      const result = await migration.apply(db)
      await db.insert(platformSettingsMigrations).values({
        id:            migration.id,
        description:   migration.description,
        appliedAt:     new Date(),
        affectedCount: result.affectedCount,
        rollbackData:  result.rollbackData ?? null,
        createdBy:     createdBy ?? null,
      })
      applied.push(migration.id)
    } catch (err) {
      failed.push({
        id:    migration.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { applied, skipped, failed }
}

// Helper для /admin/platform UI: вернуть список всех миграций
// со статусом применения.
export interface MigrationStatus {
  id: string
  description: string
  appliedAt: Date | null
  affectedCount: number
}

export async function listMigrationsWithStatus(): Promise<MigrationStatus[]> {
  const appliedRows = await db.select({
    id:            platformSettingsMigrations.id,
    appliedAt:     platformSettingsMigrations.appliedAt,
    affectedCount: platformSettingsMigrations.affectedCount,
  }).from(platformSettingsMigrations)

  const appliedMap = new Map(appliedRows.map(r => [r.id, r]))

  return SETTINGS_MIGRATIONS.map(m => {
    const row = appliedMap.get(m.id)
    return {
      id:            m.id,
      description:   m.description,
      appliedAt:     row?.appliedAt ?? null,
      affectedCount: row?.affectedCount ?? 0,
    }
  })
}
