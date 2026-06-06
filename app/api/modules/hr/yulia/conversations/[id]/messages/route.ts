import { NextRequest } from "next/server"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { yuliaConversations, yuliaMessages } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { runYulia, type YuliaTurn } from "@/lib/ai/yulia/run"

// Группа 28: отправка сообщения от HR в диалог Юлии + получение ответа.
//
// 1. Сохраняем user-message.
// 2. Грузим всю историю + только что сохранённый user-message.
// 3. Зовём Claude Sonnet 4.6 с tools.
// 4. Сохраняем assistant-message с pendingAction (если был tool_use).
// 5. Возвращаем assistant-message клиенту.

const MAX_USER_CONTENT = 4000

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as { content?: unknown }
    const content = typeof body.content === "string" ? body.content.trim() : ""

    if (!content) return apiError("'content' is required", 400)
    if (content.length > MAX_USER_CONTENT) {
      return apiError(`'content' слишком длинный (>${MAX_USER_CONTENT})`, 400)
    }

    const [conv] = await db
      .select()
      .from(yuliaConversations)
      .where(and(
        eq(yuliaConversations.id, id),
        eq(yuliaConversations.userId, user.id as string),
      ))
      .limit(1)
    if (!conv) return apiError("Conversation not found", 404)
    if (conv.status !== "active") {
      return apiError(`Conversation is ${conv.status}`, 409)
    }

    // Сохраняем сообщение пользователя.
    await db.insert(yuliaMessages).values({
      conversationId: id,
      role:           "user",
      content:        content.slice(0, MAX_USER_CONTENT),
    })

    // Грузим всю историю для контекста модели.
    const history = await db
      .select()
      .from(yuliaMessages)
      .where(eq(yuliaMessages.conversationId, id))
      .orderBy(asc(yuliaMessages.createdAt))

    const turns: YuliaTurn[] = history.map(m => ({
      role:    m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }))

    // Вызов модели.
    let aiResp
    try {
      aiResp = await runYulia(turns)
    } catch (err) {
      console.error("[POST yulia/messages] AI call failed:", err)
      // Сохраняем placeholder-ответ чтобы UI не завис без сообщения и HR
      // мог отправить ещё раз.
      const [errMsg] = await db.insert(yuliaMessages).values({
        conversationId: id,
        role:           "assistant",
        content:        "Что-то пошло не так у меня внутри. Попробуй переформулировать или начни диалог заново.",
      }).returning()
      return apiSuccess({
        message: {
          id:             errMsg.id,
          role:           errMsg.role,
          content:        errMsg.content,
          pending_action: null,
          action_status:  null,
          created_at:     errMsg.createdAt,
        },
        error: "ai_failed",
      })
    }

    // Сохраняем assistant-сообщение (+ pending_action если был tool_use).
    const [assistantMsg] = await db.insert(yuliaMessages).values({
      conversationId: id,
      role:           "assistant",
      content:        aiResp.text || "(пустой ответ)",
      pendingAction:  aiResp.pendingAction ?? null,
      actionStatus:   aiResp.pendingAction ? "pending" : null,
    }).returning()

    // updated_at conversation — обновляем чтобы сортировка по последней
    // активности в admin-таблице работала.
    await db.update(yuliaConversations)
      .set({ updatedAt: new Date() })
      .where(eq(yuliaConversations.id, id))

    return apiSuccess({
      message: {
        id:             assistantMsg.id,
        role:           assistantMsg.role,
        content:        assistantMsg.content,
        pending_action: assistantMsg.pendingAction,
        action_status:  assistantMsg.actionStatus,
        created_at:     assistantMsg.createdAt,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST yulia/messages]", err)
    return apiError("Internal server error", 500)
  }
}
