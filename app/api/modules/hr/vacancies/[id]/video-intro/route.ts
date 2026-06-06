import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Группа 27: настройки блока «Видео-визитка» из конструктора воронки.
// Хранятся в vacancies.description_json.videoIntro — расширение jsonb,
// без миграций. Включение/выключение блока — в funnel_config_json.blocks
// (общая логика конструктора).

export interface VideoIntroConfig {
  required?:           boolean
  instruction?:        string
  maxDurationSeconds?: number
  minDurationSeconds?: number
  thankYouText?:       string
}

const DEFAULT_CONFIG: Required<VideoIntroConfig> = {
  required:           false,
  instruction:        "Расскажите о себе за 60 секунд. Кто вы, какой у вас опыт, почему вас заинтересовала эта вакансия.",
  maxDurationSeconds: 60,
  minDurationSeconds: 15,
  thankYouText:       "Спасибо! Ваше видео получено и будет передано HR.",
}

const ALLOWED_MIN  = [10, 15, 20, 30] as const
const ALLOWED_MAX  = [30, 60, 120, 180] as const
const MAX_TEXT_LEN = 1000

function sanitize(input: Record<string, unknown>): Required<VideoIntroConfig> {
  const min = ALLOWED_MIN.includes(input.minDurationSeconds as typeof ALLOWED_MIN[number])
    ? (input.minDurationSeconds as number)
    : DEFAULT_CONFIG.minDurationSeconds
  const max = ALLOWED_MAX.includes(input.maxDurationSeconds as typeof ALLOWED_MAX[number])
    ? (input.maxDurationSeconds as number)
    : DEFAULT_CONFIG.maxDurationSeconds
  return {
    required:           typeof input.required === "boolean" ? input.required : DEFAULT_CONFIG.required,
    instruction:        typeof input.instruction === "string"
      ? input.instruction.slice(0, MAX_TEXT_LEN)
      : DEFAULT_CONFIG.instruction,
    maxDurationSeconds: Math.max(min, max),  // защита от min > max
    minDurationSeconds: min,
    thankYouText:       typeof input.thankYouText === "string"
      ? input.thankYouText.slice(0, MAX_TEXT_LEN)
      : DEFAULT_CONFIG.thankYouText,
  }
}

async function loadVacancy(id: string, companyId: string) {
  const [row] = await db
    .select({ id: vacancies.id, descriptionJson: vacancies.descriptionJson })
    .from(vacancies)
    .where(and(eq(vacancies.id, id), eq(vacancies.companyId, companyId)))
    .limit(1)
  return row
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const row = await loadVacancy(id, user.companyId)
    if (!row) return apiError("Vacancy not found", 404)

    const dj = (row.descriptionJson as Record<string, unknown> | null) ?? {}
    const stored = (dj.videoIntro && typeof dj.videoIntro === "object")
      ? dj.videoIntro as Record<string, unknown>
      : {}
    const config = { ...DEFAULT_CONFIG, ...sanitize(stored) }
    return apiSuccess({ config })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const row = await loadVacancy(id, user.companyId)
    if (!row) return apiError("Vacancy not found", 404)

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const next = sanitize(body)

    const dj = (row.descriptionJson as Record<string, unknown> | null) ?? {}
    const newDj = { ...dj, videoIntro: next }

    await db
      .update(vacancies)
      .set({ descriptionJson: newDj, updatedAt: new Date() })
      .where(eq(vacancies.id, id))

    return apiSuccess({ config: next })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
