import { NextRequest, NextResponse } from "next/server"
import { and, count, desc, eq, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  demoTemplates,
  knowledgeArticles,
  knowledgeQuestionLogs,
  notifications,
  users,
} from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"

interface MaterialRef {
  id: string
  name: string
  type: "demo" | "article"
}

const MAX_PER_TYPE = 20
const EXCERPT_LEN = 300

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

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

function demoExcerpt(sections: unknown): string {
  if (!Array.isArray(sections) || sections.length === 0) return ""
  const first = sections[0] as { blocks?: { content?: string }[] }
  if (!Array.isArray(first?.blocks)) return ""
  const joined = first.blocks
    .map((b) => stripHtml(b.content || ""))
    .filter(Boolean)
    .join(" ")
  return joined.slice(0, EXCERPT_LEN)
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

    // Select only the columns we actually need. Audience / review_cycle /
    // valid_until are intentionally excluded — the DB may be out of sync
    // with the schema for those columns.
    let demos: Array<{ id: string; name: string; sections: unknown }> = []
    try {
      demos = await db
        .select({
          id: demoTemplates.id,
          name: demoTemplates.name,
          sections: demoTemplates.sections,
        })
        .from(demoTemplates)
        .where(eq(demoTemplates.tenantId, user.companyId))
        .orderBy(desc(demoTemplates.updatedAt))
        .limit(MAX_PER_TYPE)
    } catch (err) {
      console.error("[ai-search] demo_templates query failed", err)
      // Continue with empty list rather than 500 — the context just gets smaller.
    }

    let articles: Array<{ id: string; title: string; content: string | null }> = []
    try {
      articles = await db
        .select({
          id: knowledgeArticles.id,
          title: knowledgeArticles.title,
          content: knowledgeArticles.content,
        })
        .from(knowledgeArticles)
        .where(and(
          eq(knowledgeArticles.tenantId, user.companyId),
          eq(knowledgeArticles.status, "published"),
        ))
        .orderBy(desc(knowledgeArticles.updatedAt))
        .limit(MAX_PER_TYPE)
    } catch (err) {
      console.error("[ai-search] knowledge_articles query failed", err)
      // Continue with empty list.
    }

    const materialsList: MaterialRef[] = []
    const parts: string[] = []
    let idx = 1

    for (const d of demos) {
      const excerpt = demoExcerpt(d.sections) || "(нет содержания)"
      parts.push(`[${idx}] «${d.name}» (презентация должности)\n${excerpt}`)
      materialsList.push({ id: d.id, name: d.name, type: "demo" })
      idx++
    }

    for (const a of articles) {
      const excerpt = stripHtml(a.content || "").slice(0, EXCERPT_LEN) || "(нет содержания)"
      parts.push(`[${idx}] «${a.title}» (статья)\n${excerpt}`)
      materialsList.push({ id: a.id, name: a.title, type: "article" })
      idx++
    }

    const context = parts.length > 0
      ? parts.join("\n\n")
      : "В базе знаний пока нет материалов."

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

    return NextResponse.json({ context, materialsList })
  } catch (err) {
    console.error("[ai-search] unexpected error", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
