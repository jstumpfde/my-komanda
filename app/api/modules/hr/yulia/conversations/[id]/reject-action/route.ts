import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { yuliaConversations, yuliaMessages } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Группа 28: HR отказался от предложенного pending_action. Помечаем сообщение
// rejected и добавляем ассистентское пояснение «Что изменить?», чтобы UI
// плавно вернулся в режим диалога без лишнего вызова модели.

interface RejectBody {
  message_id?: string
  reason?:     string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as RejectBody

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

    let pendingMsg = null
    if (body.message_id) {
      const [m] = await db.select().from(yuliaMessages)
        .where(and(
          eq(yuliaMessages.id, body.message_id),
          eq(yuliaMessages.conversationId, id),
        ))
        .limit(1)
      pendingMsg = m ?? null
    } else {
      const rows = await db.select().from(yuliaMessages)
        .where(eq(yuliaMessages.conversationId, id))
      pendingMsg = rows
        .filter(m => m.actionStatus === "pending" && m.pendingAction)
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0] ?? null
    }

    if (!pendingMsg) {
      return apiError("No pending action to reject", 400)
    }
    if (pendingMsg.actionStatus !== "pending") {
      return apiError(`Action already ${pendingMsg.actionStatus}`, 409)
    }

    await db.update(yuliaMessages)
      .set({ actionStatus: "rejected" })
      .where(eq(yuliaMessages.id, pendingMsg.id))

    // Подсказывающий ответ Юлии — без вызова модели, чтобы экономить и не
    // зависеть от сети в этой ветке.
    const followup = body.reason?.trim()
      ? `Понял. ${body.reason.trim().slice(0, 500)} — продолжаем.`
      : "Понял. Что изменить или дополнить?"

    const [followupMsg] = await db.insert(yuliaMessages).values({
      conversationId: id,
      role:           "assistant",
      content:        followup,
    }).returning()

    await db.update(yuliaConversations)
      .set({ updatedAt: new Date() })
      .where(eq(yuliaConversations.id, id))

    return apiSuccess({
      message: {
        id:             followupMsg.id,
        role:           followupMsg.role,
        content:        followupMsg.content,
        pending_action: null,
        action_status:  null,
        created_at:     followupMsg.createdAt,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
