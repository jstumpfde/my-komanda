import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { yuliaConversations, yuliaMessages } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import type { CreateVacancyDraftParams } from "@/lib/ai/yulia/prompts"

// Группа 28: подтвердить pending_action из диалога Юлии и выполнить его.
//
// Сейчас поддерживается единственный action — create_vacancy_draft. Зовём
// существующий POST /api/modules/hr/vacancies через внутренний fetch с
// проброшенными cookies, чтобы переиспользовать всю логику создания
// (default template, дефолтные вопросы анкеты, short_code, activity log).

type ActionParams = CreateVacancyDraftParams & { [k: string]: unknown }

interface ConfirmBody {
  message_id?: string
  params?:     ActionParams
}

function buildVacancyPayload(p: ActionParams): Record<string, unknown> {
  const payload: Record<string, unknown> = { title: p.title }
  if (p.city)        payload.city = p.city
  if (p.format)      payload.format = p.format
  if (p.salary_min)  payload.salary_min = p.salary_min
  if (p.salary_max)  payload.salary_max = p.salary_max
  if (p.description) payload.description = p.description

  // Группа 25: structured requirements кладём в description_json.requirements,
  // дальше /api/modules/hr/vacancies/[id]/requirements может их вытащить.
  if (p.requirements) {
    payload.description_json = { requirements: p.requirements }
  }
  return payload
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params
    const body = await req.json().catch(() => ({})) as ConfirmBody

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

    // Достаём pending action либо из конкретного message_id, либо
    // последнее ассистентское сообщение с pending_action.
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

    if (!pendingMsg || !pendingMsg.pendingAction) {
      return apiError("No pending action to confirm", 400)
    }
    if (pendingMsg.actionStatus !== "pending") {
      return apiError(`Action already ${pendingMsg.actionStatus}`, 409)
    }

    const action = pendingMsg.pendingAction
    if (action.type !== "create_vacancy_draft") {
      return apiError(`Unsupported action type: ${action.type}`, 400)
    }

    // HR может прислать отредактированные params в body — используем их
    // если есть, иначе берём из pending_action.
    const finalParams: ActionParams = body.params ?? (action.params as ActionParams)
    if (!finalParams?.title?.trim()) {
      return apiError("Vacancy title is required", 400)
    }

    // Внутренний POST на /api/modules/hr/vacancies с проброшенными cookies.
    const origin = new URL(req.url).origin
    const cookie = req.headers.get("cookie") ?? ""
    const vacancyResp = await fetch(`${origin}/api/modules/hr/vacancies`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify(buildVacancyPayload(finalParams)),
    })

    if (!vacancyResp.ok) {
      const errBody = await vacancyResp.text().catch(() => "")
      console.error("[yulia/confirm-action] vacancy create failed:", vacancyResp.status, errBody)
      return apiError(`Не удалось создать вакансию: ${vacancyResp.status}`, 502)
    }
    const vacancy = await vacancyResp.json() as { id?: string; shortCode?: string; slug?: string }
    if (!vacancy.id) {
      return apiError("Vacancy create returned no id", 502)
    }

    // Обновляем сообщение и диалог.
    await db.update(yuliaMessages)
      .set({ actionStatus: "executed" })
      .where(eq(yuliaMessages.id, pendingMsg.id))

    await db.update(yuliaConversations)
      .set({
        status:            "completed",
        resultingEntityId: vacancy.id,
        updatedAt:         new Date(),
      })
      .where(eq(yuliaConversations.id, id))

    return apiSuccess({
      action_result: {
        vacancy_id: vacancy.id,
        short_code: vacancy.shortCode,
        url:        `/hr/vacancies/${vacancy.id}`,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[POST yulia/confirm-action]", err)
    return apiError("Internal server error", 500)
  }
}
