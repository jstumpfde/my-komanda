import { NextRequest } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { trainingScenarios, trainingSessions } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { awardPoints } from "@/lib/knowledge/achievements"

// Сессия тренировки хранится на сервере. Клиент (страница) сам ходит в
// Claude API (как Ненси, через /api/ai/key) и передаёт сюда пары реплик
// для сохранения в истории. Когда сессия завершается — клиент передаёт
// итоговую оценку (score + evaluation).
//
// GET  /api/modules/knowledge/training/[id]/chat        — активная сессия текущего пользователя (или null)
// POST /api/modules/knowledge/training/[id]/chat
//   body: { action: "start" } — создать новую сессию, вернуть session + scenario
//   body: { action: "append", userMessage, assistantMessage } — добавить реплики
//   body: { action: "complete", score, evaluation } — завершить сессию

interface Message {
  role: "user" | "assistant"
  content: string
  createdAt: string
}

interface AppendBody {
  action: "append"
  userMessage: string
  assistantMessage: string
}

interface CompleteBody {
  action: "complete"
  score: number
  evaluation: {
    criteria: { key: string; label: string; pass: boolean; note: string }[]
    recommendations: string[]
  }
}

interface StartBody {
  action: "start"
}

type ChatBody = StartBody | AppendBody | CompleteBody

async function loadScenario(tenantId: string, scenarioId: string) {
  const [scenario] = await db
    .select()
    .from(trainingScenarios)
    .where(and(eq(trainingScenarios.id, scenarioId), eq(trainingScenarios.tenantId, tenantId)))
    .limit(1)
  return scenario ?? null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id: scenarioId } = await params

    const scenario = await loadScenario(user.companyId, scenarioId)
    if (!scenario) return apiError("Сценарий не найден", 404)

    // Последняя активная сессия пользователя (если была)
    const [active] = await db
      .select()
      .from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.tenantId, user.companyId),
          eq(trainingSessions.scenarioId, scenarioId),
          eq(trainingSessions.userId, user.id),
          eq(trainingSessions.status, "active"),
        ),
      )
      .orderBy(desc(trainingSessions.startedAt))
      .limit(1)

    return apiSuccess({ scenario, session: active ?? null })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id: scenarioId } = await params
    const body = (await req.json()) as ChatBody

    const scenario = await loadScenario(user.companyId, scenarioId)
    if (!scenario) return apiError("Сценарий не найден", 404)

    if (body.action === "start") {
      // Завершить все активные сессии этого пользователя по этому сценарию
      await db
        .update(trainingSessions)
        .set({ status: "abandoned" })
        .where(
          and(
            eq(trainingSessions.tenantId, user.companyId),
            eq(trainingSessions.scenarioId, scenarioId),
            eq(trainingSessions.userId, user.id),
            eq(trainingSessions.status, "active"),
          ),
        )

      const [session] = await db
        .insert(trainingSessions)
        .values({
          tenantId: user.companyId,
          scenarioId,
          userId: user.id,
          messages: [],
          status: "active",
        })
        .returning()

      return apiSuccess({ scenario, session })
    }

    // Для append/complete нужна актуальная активная сессия
    const [session] = await db
      .select()
      .from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.tenantId, user.companyId),
          eq(trainingSessions.scenarioId, scenarioId),
          eq(trainingSessions.userId, user.id),
          eq(trainingSessions.status, "active"),
        ),
      )
      .orderBy(desc(trainingSessions.startedAt))
      .limit(1)

    if (!session) return apiError("Нет активной сессии — начните заново", 400)

    const currentMessages = Array.isArray(session.messages) ? (session.messages as Message[]) : []

    if (body.action === "append") {
      if (!body.userMessage?.trim() || !body.assistantMessage?.trim()) {
        return apiError("userMessage и assistantMessage обязательны", 400)
      }
      const now = new Date().toISOString()
      const next: Message[] = [
        ...currentMessages,
        { role: "user", content: body.userMessage, createdAt: now },
        { role: "assistant", content: body.assistantMessage, createdAt: now },
      ]
      await db
        .update(trainingSessions)
        .set({ messages: next })
        .where(eq(trainingSessions.id, session.id))
      return apiSuccess({ session: { ...session, messages: next } })
    }

    if (body.action === "complete") {
      if (typeof body.score !== "number") return apiError("score обязателен", 400)
      const score = Math.max(0, Math.min(100, Math.round(body.score)))
      await db
        .update(trainingSessions)
        .set({
          status: "completed",
          score,
          evaluation: body.evaluation ?? null,
          completedAt: new Date(),
        })
        .where(eq(trainingSessions.id, session.id))

      // Геймификация: +20 за тренировку, +30 за идеальную оценку (100%)
      try {
        await awardPoints(user.companyId, user.id, "training", session.id, `Тренировка «${scenario.title}»`)
        if (score === 100) {
          await awardPoints(user.companyId, user.id, "test_perfect", session.id, `Идеальная оценка «${scenario.title}»`)
        }
      } catch (err) {
        console.error("[training/chat] award failed", err)
      }

      return apiSuccess({ ok: true })
    }

    return apiError("Неизвестный action", 400)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[training/chat] POST", err)
    return apiError("Internal server error", 500)
  }
}
