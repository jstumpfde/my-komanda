import { NextRequest } from "next/server"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import {
  processSalesMessage,
  type SalesProcessInput,
} from "@/lib/ai/sales-chatbot-processor"
import type { SalesChatbotSettings } from "@/lib/ai/sales-chatbot-settings"

// Группа: Sales — песочница AI чат-бота.
// Принимает сообщение «от клиента» + историю из UI, прогоняет через
// processSalesMessage с dryRun=true и возвращает решение с таймингами.
// Не пишет в БД, не отправляет уведомления, не обращается к Telegram.

interface SandboxBody {
  message: string
  history?: Array<{ role: "user" | "assistant"; content: string }>
  config?: {
    botName?: string
    greeting?: string
    systemPrompt?: string
    settings?: SalesChatbotSettings
  }
  serviceContext?: {
    serviceName?: string
    priceRange?: string
    contextText?: string
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireCompany()

    const body = (await req.json().catch(() => ({}))) as SandboxBody

    // Валидация обязательного поля
    const message =
      typeof body.message === "string" ? body.message.trim() : ""
    if (!message) return apiError("'message' обязателен и не должен быть пустым", 400)

    // Конвертируем history: {role, content} → {role, text} — формат процессора
    const history: SalesProcessInput["history"] = Array.isArray(body.history)
      ? body.history
          .slice(-6)
          .map((h) => ({
            role: h.role === "assistant" ? ("assistant" as const) : ("user" as const),
            text: typeof h.content === "string" ? h.content.slice(0, 4000) : "",
          }))
          .filter((h) => h.text.length > 0)
      : []

    const startedAt = Date.now()

    const result = await processSalesMessage({
      incomingText: message,
      history,
      config: {
        isEnabled: true,
        botName: body.config?.botName ?? null,
        greeting: body.config?.greeting ?? null,
        systemPrompt: body.config?.systemPrompt ?? null,
        settings: body.config?.settings ?? null,
      },
      conversationStatus: "active",
      serviceContext: body.serviceContext,
      dryRun: true,
    })

    const totalMs = Date.now() - startedAt

    return apiSuccess({
      action:            result.action,
      reply:             result.reply ?? null,
      category:          result.category ?? null,
      confidence:        result.confidence ?? null,
      escalationReason:  result.escalationReason ?? null,
      preMessage:        result.preMessage ?? null,
      preMessageDelayMs: result.preMessageDelayMs ?? null,
      replyDelayMs:      result.replyDelayMs ?? null,
      timings: {
        totalMs,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[sales-chatbot-sandbox]", err)
    return apiError(
      err instanceof Error ? err.message : "Internal server error",
      500,
    )
  }
}
