import { NextRequest } from "next/server"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { yuliaConversations, yuliaMessages } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Группа 28: чтение всего диалога Юлии (conversation + все сообщения по
// возрастанию created_at). Доступен только владельцу — компания должна
// совпадать, юзер в пределах своей компании может читать только свои
// диалоги.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [conv] = await db
      .select()
      .from(yuliaConversations)
      .where(and(
        eq(yuliaConversations.id, id),
        eq(yuliaConversations.userId, user.id as string),
      ))
      .limit(1)

    if (!conv) return apiError("Conversation not found", 404)

    const messages = await db
      .select()
      .from(yuliaMessages)
      .where(eq(yuliaMessages.conversationId, id))
      .orderBy(asc(yuliaMessages.createdAt))

    return apiSuccess({
      conversation: {
        id:                  conv.id,
        context_type:        conv.contextType,
        status:              conv.status,
        state:               conv.state,
        resulting_entity_id: conv.resultingEntityId,
        created_at:          conv.createdAt,
        updated_at:          conv.updatedAt,
      },
      messages: messages.map(m => ({
        id:             m.id,
        role:           m.role,
        content:        m.content,
        pending_action: m.pendingAction,
        action_status:  m.actionStatus,
        created_at:     m.createdAt,
      })),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
