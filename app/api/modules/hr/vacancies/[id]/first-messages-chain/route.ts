// PUT/PATCH /api/modules/hr/vacancies/[id]/first-messages-chain
// Body: { chain: Array<{ enabled: boolean; delaySeconds: number; text: string }> }
// Сохраняет в vacancies.first_messages_chain (#21).
//
// Валидация: максимум 3 элемента, text trimmed до 2000 chars, delaySeconds
// нормализован к ближайшему допустимому значению (15/30/60/180/900/1800/3600).
// Первое сообщение валидируется как и раньше — должно содержать {{demo_link}}
// или {ссылка} (см. /ai-settings PATCH).

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

const ALLOWED_DELAYS = new Set([15, 30, 60, 180, 900, 1800, 3600])
const MAX_LEN = 2000
const DEMO_LINK_RE = /\{\{\s*demo_link\s*\}\}/
const FALLBACK_LINK_RE = /\{\s*ссылка\s*\}/

interface ChainStep {
  enabled:      boolean
  delaySeconds: number
  text:         string
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json().catch(() => ({})) as { chain?: unknown }
    if (!Array.isArray(body.chain)) {
      return apiError("chain must be an array", 400)
    }

    const cleaned: ChainStep[] = []
    for (const raw of body.chain.slice(0, 3)) {
      if (!raw || typeof raw !== "object") continue
      const item = raw as Record<string, unknown>
      const enabled  = item.enabled === true
      const delayRaw = Number(item.delaySeconds)
      const delaySeconds = ALLOWED_DELAYS.has(delayRaw) ? delayRaw : 60
      const text = typeof item.text === "string" ? item.text.slice(0, MAX_LEN) : ""
      cleaned.push({ enabled, delaySeconds, text })
    }

    // Первое сообщение — обязательно должно содержать demo-link, если включено
    // и не пустое. Остальные сообщения — без обязательного плейсхолдера, это
    // не первое касание.
    const first = cleaned[0]
    if (first && first.enabled && first.text.trim().length > 0) {
      if (!DEMO_LINK_RE.test(first.text) && !FALLBACK_LINK_RE.test(first.text)) {
        return apiError(
          "Первое сообщение должно содержать плейсхолдер ссылки на демо ({{demo_link}} или {ссылка})",
          400,
        )
      }
    }

    // Backward compat: дублируем text Сообщения 1 в ai_process_settings.inviteMessage,
    // которое читает синхронная отправка в process-queue.ts. Чтобы старый
    // путь продолжал работать после применения миграции 0121, даже если
    // часть кода ещё не переехала на chain.
    const [existing] = await db
      .select({ aiProcessSettings: vacancies.aiProcessSettings })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    const currentAi = (existing?.aiProcessSettings && typeof existing.aiProcessSettings === "object" && existing.aiProcessSettings !== null)
      ? existing.aiProcessSettings as Record<string, unknown>
      : {}
    const firstText = cleaned[0]?.text?.trim()
    const aiUpdate = firstText
      ? { ...currentAi, inviteMessage: firstText }
      : currentAi

    const [updated] = await db
      .update(vacancies)
      .set({
        firstMessagesChain: cleaned,
        aiProcessSettings:  aiUpdate,
        updatedAt:          new Date(),
      })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id, firstMessagesChain: vacancies.firstMessagesChain })

    if (!updated) return apiError("Vacancy not found", 404)

    return apiSuccess({ ok: true, chain: updated.firstMessagesChain })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
