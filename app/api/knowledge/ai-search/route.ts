import { NextRequest, NextResponse } from "next/server"
import { and, count, eq, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  knowledgeQuestionLogs,
  notifications,
  users,
} from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { retrieveKnowledgeContext } from "@/lib/knowledge/retrieval"
import { checkAiTokenLimit, logAiUsage } from "@/lib/knowledge/token-limits"

// Материалы тенанта — до 20 на фолбэк-тип (recency), как раньше.
const MAX_PER_TYPE = 20

function normalizeQuestion(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
}

const UNANSWERED_THRESHOLD = 3

async function sendTelegramBasic(token: string, chatId: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    })
  } catch (err) {
    console.error("[ai-search] telegram send failed", err)
  }
}

export async function POST(req: NextRequest) {
  // Auth first — returns 401 on failure, not 500.
  let user
  try {
    user = await requireCompany()
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-search] auth failed", err)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Parse question from body — now used for logging.
    let questionText = ""
    let source = "web"
    try {
      const body = await req.json() as { question?: string; source?: string }
      questionText = typeof body.question === "string" ? body.question.trim() : ""
      if (typeof body.source === "string" && body.source) source = body.source
    } catch { /* ignore malformed body */ }

    // ── Лимит AI-токенов: не расходовать эмбеддинги сверх остатка ────────
    const limitCheck = await checkAiTokenLimit(user.companyId)
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.message }, { status: 429 })
    }

    // Ранжирование по релевантности (semantic RAG) с фолбэком на recency —
    // вынесено в lib/knowledge/retrieval.ts, используется также ботами.
    const { context, materialsList, semanticUsed } = await retrieveKnowledgeContext(
      user.companyId,
      questionText,
      { fallbackPerType: MAX_PER_TYPE },
    )

    // Эмбеддинг вопроса тоже тратит токены (OpenAI). Точный usage не пробрасывается
    // из lib/knowledge/embeddings.ts (там нет учёта) — грубая оценка по длине текста
    // для видимости в /knowledge-v2/tokens, не для точного биллинга (это soft cap).
    void logAiUsage({
      tenantId: user.companyId,
      userId: user.id,
      action: "knowledge_ai_search",
      inputTokens: semanticUsed ? Math.ceil(questionText.length / 4) : 0,
      outputTokens: 0,
      model: semanticUsed ? "text-embedding-3-small" : null,
    })

    // ── Log question для агента аудита пробелов ──────────────────────────
    if (questionText) {
      const questionKey = normalizeQuestion(questionText)
      const answered = materialsList.length > 0
      try {
        await db.insert(knowledgeQuestionLogs).values({
          tenantId: user.companyId,
          userId: user.id,
          question: questionText,
          questionKey,
          answered,
          source,
          notified: false,
        })

        // Мгновенная реакция: если этот вопрос задан 3+ раз без ответа
        // и ещё не было уведомления — уведомляем.
        if (!answered && questionKey) {
          const [{ value: unansweredCount } = { value: 0 }] = await db
            .select({ value: count() })
            .from(knowledgeQuestionLogs)
            .where(
              and(
                eq(knowledgeQuestionLogs.tenantId, user.companyId),
                eq(knowledgeQuestionLogs.questionKey, questionKey),
                eq(knowledgeQuestionLogs.answered, false),
              ),
            )

          if (unansweredCount >= UNANSWERED_THRESHOLD) {
            const [{ value: notifiedCount } = { value: 0 }] = await db
              .select({ value: count() })
              .from(knowledgeQuestionLogs)
              .where(
                and(
                  eq(knowledgeQuestionLogs.tenantId, user.companyId),
                  eq(knowledgeQuestionLogs.questionKey, questionKey),
                  eq(knowledgeQuestionLogs.notified, true),
                ),
              )

            if (notifiedCount === 0) {
              // Помечаем все логи этого ключа как notified, чтобы не спамить.
              await db
                .update(knowledgeQuestionLogs)
                .set({ notified: true })
                .where(
                  and(
                    eq(knowledgeQuestionLogs.tenantId, user.companyId),
                    eq(knowledgeQuestionLogs.questionKey, questionKey),
                  ),
                )

              // DB notifications для director + hr_lead
              const recipients = await db
                .select({ id: users.id, telegramChatId: users.telegramChatId })
                .from(users)
                .where(
                  and(
                    eq(users.companyId, user.companyId),
                    or(eq(users.role, "director"), eq(users.role, "hr_lead")),
                  ),
                )

              const title = "Вопрос без ответа — пора дополнить базу знаний"
              const body = `Сотрудники уже ${unansweredCount} раз спросили: «${questionText.slice(0, 120)}». В базе нет подходящего материала.`

              for (const r of recipients) {
                await db.insert(notifications).values({
                  tenantId: user.companyId,
                  userId: r.id,
                  type: "knowledge_gap",
                  title,
                  body,
                  severity: "warning",
                  sourceType: "knowledge_question_log",
                  href: "/knowledge-v2/settings",
                })
              }

              // Telegram — если у компании подключён бот
              const [company] = await db
                .select({ token: companies.telegramBotToken })
                .from(companies)
                .where(eq(companies.id, user.companyId))
                .limit(1)

              if (company?.token) {
                const tgText =
                  `🚨 *${title}*\n\n` +
                  `Запросов: *${unansweredCount}*\n\n` +
                  `«${questionText.slice(0, 200)}»\n\n` +
                  `_Создайте материал в базе знаний, чтобы закрыть этот пробел._`
                for (const r of recipients) {
                  if (r.telegramChatId) {
                    await sendTelegramBasic(company.token, r.telegramChatId, tgText)
                  }
                }
              }
            }
          }
        }
      } catch (logErr) {
        // Логирование не должно ломать основной запрос.
        console.error("[ai-search] log insert failed", logErr)
      }
    }

    return NextResponse.json({ context, materialsList, semanticUsed })
  } catch (err) {
    console.error("[ai-search] unexpected error", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
