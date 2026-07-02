// GET/PUT /api/modules/hr/vacancies/[id]/auto-responder
// Единый блок «Автоответы кандидату» (Портрет): FAQ keyword→reply.
// Хранится в vacancies.descriptionJson.autoResponder = { enabled, faq[] }.
// Стоп-слова НЕ дублируются здесь — они остаются в vacancies.stopWordsJson
// и редактируются через .../vacancies/[id]/stop-words (см. соседний роут).
//
// Рантайм: lib/hh/scan-incoming.ts + lib/avito/scan-incoming.ts читают
// autoResponder ДО AI чат-бота — при совпадении FAQ отвечают и не продолжают
// legacy-классификацию этого сообщения (см. lib/auto-responder/match-faq.ts).

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export interface AutoResponderFaqEntry {
  id:       string
  keywords: string[]
  reply:    string
}

// Что делать со стадией кандидата при срабатывании стоп-слова.
// Дефолт 'none' — Юрий 02.07: раньше стоп-слово ВСЕГДА молча кидало в rejected;
// теперь по умолчанию стадию не трогаем вообще (только прощание, если задано).
export const STOP_WORD_STAGE_ACTIONS = ["none", "candidate_declined", "reject"] as const
export type StopWordStageAction = (typeof STOP_WORD_STAGE_ACTIONS)[number]

export interface AutoResponderConfig {
  enabled: boolean
  faq:     AutoResponderFaqEntry[]
  /** Текст прощального сообщения при срабатывании стоп-слова. Пусто →
   *  ничего не отправляем (Юрий 02.07: явный опт-ин, без дефолтного текста). */
  stopWordFarewellText: string
  /** 'none' (дефолт) — стадию НЕ трогаем. 'candidate_declined' — отказ по
   *  инициативе кандидата (rejectionInitiator='candidate', «Сам отказ.» в отчёте).
   *  'reject' — обычный отказ работодателя. */
  stopWordStageAction: StopWordStageAction
}

const DEFAULT_CONFIG: AutoResponderConfig = {
  enabled: false, faq: [], stopWordFarewellText: "", stopWordStageAction: "none",
}

const MAX_FAQ_ENTRIES  = 30
const MAX_KEYWORDS     = 20
const MAX_KEYWORD_LEN  = 100
const MAX_REPLY_LEN    = 2000
const MAX_FAREWELL_LEN = 1000

function readStageAction(v: unknown): StopWordStageAction {
  return (STOP_WORD_STAGE_ACTIONS as readonly string[]).includes(v as string) ? v as StopWordStageAction : "none"
}

function readAutoResponder(descriptionJson: unknown): AutoResponderConfig {
  const dj = (descriptionJson && typeof descriptionJson === "object") ? descriptionJson as Record<string, unknown> : {}
  const raw = (dj.autoResponder && typeof dj.autoResponder === "object") ? dj.autoResponder as Record<string, unknown> : null
  if (!raw) return DEFAULT_CONFIG
  const faq: AutoResponderFaqEntry[] = Array.isArray(raw.faq)
    ? raw.faq
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map(e => ({
          id:       typeof e.id === "string" && e.id ? e.id : cryptoRandomId(),
          keywords: Array.isArray(e.keywords) ? e.keywords.filter((k): k is string => typeof k === "string") : [],
          reply:    typeof e.reply === "string" ? e.reply : "",
        }))
    : []
  return {
    enabled: raw.enabled === true,
    faq,
    stopWordFarewellText: typeof raw.stopWordFarewellText === "string" ? raw.stopWordFarewellText : "",
    stopWordStageAction:  readStageAction(raw.stopWordStageAction),
  }
}

function cryptoRandomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function sanitizeIncoming(body: unknown): AutoResponderConfig {
  const b = (body && typeof body === "object") ? body as Record<string, unknown> : {}
  const enabled = b.enabled === true
  const stopWordFarewellText = typeof b.stopWordFarewellText === "string"
    ? b.stopWordFarewellText.trim().slice(0, MAX_FAREWELL_LEN)
    : ""
  const stopWordStageAction = readStageAction(b.stopWordStageAction)
  const faqRaw = Array.isArray(b.faq) ? b.faq : []
  const faq: AutoResponderFaqEntry[] = faqRaw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .slice(0, MAX_FAQ_ENTRIES)
    .map(e => {
      const keywords = Array.isArray(e.keywords)
        ? e.keywords
            .filter((k): k is string => typeof k === "string")
            .map(k => k.trim())
            .filter(Boolean)
            .slice(0, MAX_KEYWORDS)
            .map(k => k.slice(0, MAX_KEYWORD_LEN))
        : []
      const reply = typeof e.reply === "string" ? e.reply.trim().slice(0, MAX_REPLY_LEN) : ""
      return {
        id: typeof e.id === "string" && e.id ? e.id : cryptoRandomId(),
        keywords,
        reply,
      }
    })
    // Отбрасываем полностью пустые пары (ни ключевых слов, ни ответа) —
    // защита от мусора при случайном «＋ Вопрос» без заполнения.
    .filter(e => e.keywords.length > 0 || e.reply.length > 0)

  return { enabled, faq, stopWordFarewellText, stopWordStageAction }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const [row] = await db
      .select({ descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Vacancy not found", 404)
    return apiSuccess({ autoResponder: readAutoResponder(row.descriptionJson) })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json().catch(() => ({})) as unknown
    const next = sanitizeIncoming(body)

    const [existing] = await db
      .select({ id: vacancies.id, descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!existing) return apiError("Vacancy not found", 404)

    const currentJson = (existing.descriptionJson && typeof existing.descriptionJson === "object" && existing.descriptionJson !== null)
      ? existing.descriptionJson as Record<string, unknown>
      : {}

    const nextJson = { ...currentJson, autoResponder: next }

    const [updated] = await db
      .update(vacancies)
      .set({ descriptionJson: nextJson, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id, descriptionJson: vacancies.descriptionJson })

    if (!updated) return apiError("Vacancy not found", 404)

    return apiSuccess({ autoResponder: readAutoResponder(updated.descriptionJson) })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
