// ФЗ-152: срок хранения персональных данных отказанных кандидатов.
// Настройка компании — companies.hiring_defaults_json->>'dataRetention'.
// По истечении срока крон /api/cron/data-retention обезличивает кандидата:
// вычищает ПДн (имя/контакты/резюме/анкеты/фото), сохраняя агрегаты для
// статистики найма (стадия, числовые скоринги, категория/инициатор отказа).
//
// Значения enum совпадают с UI (components/hiring-settings/service-section.tsx):
//   immediate | 7days | 30days | 3months | 6months | 12months | never
// «never» и неизвестное/пустое → null (крон компанию не трогает).

import { unlink } from "fs/promises"
import { uploadsDir } from "@/lib/uploads-path"

export type DataRetentionSetting =
  | "immediate" | "7days" | "30days" | "3months" | "6months" | "12months" | "never"

/** Срок хранения в днях. null = не удалять (never/неизвестно). */
export function retentionDays(setting: string | null | undefined): number | null {
  switch (setting) {
    case "immediate": return 0
    case "7days":     return 7
    case "30days":    return 30
    case "3months":   return 90
    case "6months":   return 180
    case "12months":  return 365
    // «never», null, пусто, любое неизвестное значение — НЕ удаляем.
    // Важно: неустановленную настройку трактуем как never (а НЕ как UI-дефолт
    // 6months), чтобы крон не обезличивал данные у компаний, которые сознательно
    // ничего не выбирали.
    default:          return null
  }
}

// Заглушка имени после обезличивания (видно в отчётах/списках вместо ФИО).
export const ERASED_NAME = "Удалён"

// Поля кандидата, которые обнуляются/сбрасываются при обезличивании.
// Сохраняем НЕ-персональные агрегаты: stage, resumeScore/aiScore* (числа),
// rejectionReasonCategory/rejectionInitiator, createdAt/updatedAt, id/vacancyId.
export function buildErasureSet(now: Date): Record<string, unknown> {
  return {
    name: ERASED_NAME,
    firstNameOverride: null,
    phone: null,
    email: null,
    city: null,
    birthDate: null,
    photoUrl: null,
    experience: null,
    educationLevel: null,
    industry: null,
    workFormat: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    skills: [],
    keySkills: [],
    languages: [],
    driverLicenses: [],
    citizenshipNames: [],
    workTicketNames: [],
    professionalRoles: [],
    // Текстовые/ответные блобы — содержат ПДн (ответы, комментарии, транскрипты).
    aiSummary: null,
    aiDetails: null,
    anketaAnswers: null,
    surveyResponses: null,
    demoProgressJson: null,
    demoAnswersDetails: null,
    demoBlockScores: null,
    rubricDetails: null,
    stageHistory: [],
    rejectionComment: null,
    // Telegram-переписка кандидата.
    telegramChatId: null,
    telegramUsername: null,
    telegramInviteToken: null,
    tgMessages: [],
    personalDataErasedAt: now,
  }
}

/**
 * Собирает локальные (/uploads) файлы кандидата для физического удаления с диска.
 * Внешние URL (hh CDN и т.п.) игнорируются. Возвращает абсолютные пути.
 */
export function collectLocalUploadFiles(row: {
  photoUrl?: string | null
  demoProgressJson?: unknown
  surveyResponses?: unknown
}): string[] {
  const paths = new Set<string>()
  const add = (val: unknown) => {
    if (typeof val !== "string") return
    // Нас интересуют только наши локальные загрузки: /uploads/<rel>
    const m = val.match(/\/uploads\/(.+)$/)
    if (m && m[1] && !m[1].includes("..")) paths.add(uploadsDir(m[1]))
  }
  add(row.photoUrl)
  // Рекурсивно ищем строки-ссылки на /uploads внутри jsonb-блобов (видео-визитки,
  // вложения анкет и т.п.).
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return
    if (typeof v === "string") { add(v); return }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return }
    if (typeof v === "object") { for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1) }
  }
  walk(row.demoProgressJson, 0)
  walk(row.surveyResponses, 0)
  return [...paths]
}

/** Удаляет файлы best-effort (отсутствующие/чужие игнорируются). Возвращает счётчик. */
export async function deleteLocalFiles(paths: string[]): Promise<number> {
  let deleted = 0
  for (const p of paths) {
    try { await unlink(p); deleted++ } catch { /* нет файла / нет прав — пропускаем */ }
  }
  return deleted
}
