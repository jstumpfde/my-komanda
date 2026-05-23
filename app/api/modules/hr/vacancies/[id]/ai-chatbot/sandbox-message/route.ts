import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { processChatbotMessage, type ChatbotSettings } from "@/lib/ai/chatbot-processor"

// Группа 33: песочница для тестирования AI чат-бота.
// Получает текущее сообщение «от кандидата» + историю (в памяти UI),
// прогоняет через ту же логику processChatbotMessage с dryRun=true и
// возвращает решение, ответ, тайминги — БЕЗ записи в БД и БЕЗ
// отправки в hh.ru.

interface SandboxBody {
  message?:  string
  history?:  Array<{ role: string; content: string }>
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json().catch(() => ({})) as SandboxBody
    const message = typeof body.message === "string" ? body.message.trim() : ""
    if (!message) return apiError("'message' is required", 400)
    if (message.length > 4000) return apiError("Сообщение слишком длинное", 400)

    const [vacancy] = await db
      .select({
        id:                vacancies.id,
        title:             vacancies.title,
        companyId:         vacancies.companyId,
        aiChatbotEnabled:  vacancies.aiChatbotEnabled,
        aiChatbotSettings: vacancies.aiChatbotSettings,
        aiChatbotPrompt:   vacancies.aiChatbotPrompt,
        salaryMin:         vacancies.salaryMin,
        salaryMax:         vacancies.salaryMax,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vacancy) return apiError("Vacancy not found", 404)

    // Без промпта чат-бот не работает — в sandbox это полезно отловить.
    if (!vacancy.aiChatbotPrompt || !vacancy.aiChatbotPrompt.trim()) {
      return apiError("Сначала задайте системный промпт чат-бота", 400)
    }

    // Преобразуем history в формат, который понимает processChatbotMessage
    // (через sandboxHistory). Берём только последние 6 ходов — pre-filter
    // смотрит максимум 3.
    const sandboxHistory = Array.isArray(body.history)
      ? body.history
          .slice(-6)
          .map(h => ({
            role: h.role === "assistant" ? ("assistant" as const) : ("user" as const),
            text: typeof h.content === "string" ? h.content.slice(0, 4000) : "",
          }))
          .filter(h => h.text.length > 0)
      : []

    const result = await processChatbotMessage({
      candidateId:  `sandbox-${user.id ?? "anon"}-${id}`, // фиктивный id
      vacancyId:    id,
      incomingText: message,
      vacancy: {
        id:                vacancy.id,
        title:             vacancy.title,
        companyId:         vacancy.companyId,
        aiChatbotEnabled:  true, // в sandbox считаем что включён
        aiChatbotSettings: vacancy.aiChatbotSettings,
        aiChatbotPrompt:   vacancy.aiChatbotPrompt,
        salaryMin:         vacancy.salaryMin,
        salaryMax:         vacancy.salaryMax,
      },
      dryRun:         true,
      sandboxHistory,
    })

    const settings = (vacancy.aiChatbotSettings ?? {}) as ChatbotSettings

    return apiSuccess({
      action:           result.action,
      reply:            result.reply ?? null,
      preMessage:       result.preMessage ?? null,
      preMessageDelayMs: result.preMessageDelayMs ?? null,
      replyDelayMs:     result.replyDelayMs ?? null,
      category:         result.category ?? null,
      confidence:       result.confidence ?? null,
      escalationReason: result.escalationReason ?? null,
      diagnostics: {
        promptLength:    (vacancy.aiChatbotPrompt ?? "").length,
        triggers:        settings.triggers ?? {},
        responseTiming:  settings.responseTiming ?? {},
        rejectionMessages: settings.rejectionMessages ?? {},
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[sandbox-message]", err)
    return apiError(err instanceof Error ? err.message : "Internal server error", 500)
  }
}
