import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { yuliaConversations, yuliaMessages } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

// Группа 28: создание нового диалога с Юлией.
// Контекст по умолчанию — vacancy_creation. Первое assistant-сообщение
// захардкожено, чтобы не делать лишний вызов модели и Юлия сразу спросила
// «Какую вакансию создаём?».

const FIRST_GREETING =
  "Привет! Какую вакансию создаём? Скажи название должности и пару слов о позиции."

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json().catch(() => ({})) as { context_type?: string }
    const contextType = body.context_type === "vacancy_creation" || !body.context_type
      ? "vacancy_creation"
      : body.context_type

    const [conv] = await db.insert(yuliaConversations).values({
      userId:      user.id as string,
      companyId:   user.companyId,
      contextType,
      state:       {},
      status:      "active",
    }).returning()

    const [firstMsg] = await db.insert(yuliaMessages).values({
      conversationId: conv.id,
      role:           "assistant",
      content:        FIRST_GREETING,
    }).returning()

    return apiSuccess({
      conversation_id: conv.id,
      message: {
        id:         firstMsg.id,
        role:       firstMsg.role,
        content:    firstMsg.content,
        created_at: firstMsg.createdAt,
      },
    }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST /api/modules/hr/yulia/conversations]", err)
    return apiError("Internal server error", 500)
  }
}
