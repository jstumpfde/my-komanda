import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Группа 27: настройки блока «Видео-визитка» из конструктора воронки.
// Хранятся в vacancies.description_json.videoIntro — расширение jsonb,
// без миграций. Включение/выключение блока — в funnel_config_json.blocks
// (общая логика конструктора).
//
// F4: Режим «Видео-интервью» — массив questions (1–5 вопросов).
// Если questions.length > 0, кандидат проходит вопросы по одному с прогрессом.
// Если questions пуст/отсутствует — старое поведение (одна визитка).

export interface VideoIntroQuestion {
  text:               string  // текст вопроса
  maxDurationSeconds: number  // макс. длительность ответа
}

export interface VideoIntroConfig {
  required?:           boolean
  instruction?:        string
  maxDurationSeconds?: number
  minDurationSeconds?: number
  thankYouText?:       string
  // F4: список вопросов для режима «Видео-интервью».
  // Если пуст — старый режим (одна визитка).
  questions?:          VideoIntroQuestion[]
}

const DEFAULT_CONFIG = {
  required:           false as boolean,
  instruction:        "Расскажите о себе за 60 секунд. Кто вы, какой у вас опыт, почему вас заинтересовала эта вакансия.",
  maxDurationSeconds: 60 as number,
  minDurationSeconds: 15 as number,
  thankYouText:       "Спасибо! Ваше видео получено и будет передано HR.",
  questions:          [] as VideoIntroQuestion[],
}

const ALLOWED_MIN   = [10, 15, 20, 30] as const
const ALLOWED_MAX   = [30, 60, 120, 180] as const
const ALLOWED_Q_MAX = [15, 30, 60, 90, 120, 180] as const
const MAX_TEXT_LEN  = 1000
const MAX_QUESTIONS = 5

function sanitizeQuestion(q: unknown): VideoIntroQuestion | null {
  if (!q || typeof q !== "object") return null
  const o = q as Record<string, unknown>
  const text = typeof o.text === "string" ? o.text.trim().slice(0, MAX_TEXT_LEN) : ""
  if (!text) return null
  const maxDurationSeconds = ALLOWED_Q_MAX.includes(o.maxDurationSeconds as typeof ALLOWED_Q_MAX[number])
    ? (o.maxDurationSeconds as number)
    : 60
  return { text, maxDurationSeconds }
}

function sanitize(input: Record<string, unknown>): typeof DEFAULT_CONFIG {
  const min = ALLOWED_MIN.includes(input.minDurationSeconds as typeof ALLOWED_MIN[number])
    ? (input.minDurationSeconds as number)
    : DEFAULT_CONFIG.minDurationSeconds
  const max = ALLOWED_MAX.includes(input.maxDurationSeconds as typeof ALLOWED_MAX[number])
    ? (input.maxDurationSeconds as number)
    : DEFAULT_CONFIG.maxDurationSeconds

  const rawQuestions = Array.isArray(input.questions) ? input.questions : []
  const questions: VideoIntroQuestion[] = rawQuestions
    .slice(0, MAX_QUESTIONS)
    .map(sanitizeQuestion)
    .filter((q): q is VideoIntroQuestion => q !== null)

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
    questions,
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
