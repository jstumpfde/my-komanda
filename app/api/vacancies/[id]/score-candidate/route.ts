import { NextRequest } from "next/server"
import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import type { Lesson, Block } from "@/lib/course-types"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: getClaudeApiUrl(),
})

interface ScoringDetail {
  question: string
  score: number
  comment: string
}

interface ScoringResult {
  score: number
  summary: string
  details: ScoringDetail[]
}

// Анкета в БД хранится как массив объектов либо в формате legacy { question, answer },
// либо в актуальном { blockId, answer }. Нормализуем в общий вид { question, answer }
// для промпта, разрешая ссылки на blockId через карту блоков из demos.lessonsJson.
interface NormalizedAnswer {
  question: string
  answer: string
}

function buildBlockMap(lessons: unknown): Map<string, Block> {
  const map = new Map<string, Block>()
  if (!Array.isArray(lessons)) return map
  for (const l of lessons as Lesson[]) {
    if (!l || !Array.isArray(l.blocks)) continue
    for (const b of l.blocks) {
      if (b && typeof b.id === "string") map.set(b.id, b)
    }
  }
  return map
}

function blockQuestionText(block: Block | undefined, blockId: string): string {
  if (!block) return blockId
  if (block.taskTitle) return block.taskTitle
  if (block.taskDescription) return block.taskDescription
  if (Array.isArray(block.questions) && block.questions.length > 0) {
    const first = block.questions[0]
    if (first?.text) return first.text
  }
  if (block.content) {
    const stripped = block.content.replace(/<[^>]+>/g, "").trim()
    if (stripped) return stripped.slice(0, 200)
  }
  return blockId
}

function answerToText(ans: unknown, block: Block | undefined): string {
  if (ans == null) return ""
  if (typeof ans === "string") return ans
  if (typeof ans === "number" || typeof ans === "boolean") return String(ans)
  if (Array.isArray(ans)) return ans.map((x) => String(x ?? "")).join(", ")
  if (typeof ans === "object") {
    const obj = ans as Record<string, unknown>
    // Медиа-ответ (video/audio/photo)
    if (typeof obj.url === "string" && typeof obj.mediaType === "string") {
      return `[${String(obj.mediaType)}-ответ${typeof obj.duration === "number" ? `, ${obj.duration} сек` : ""}]`
    }
    // Task-блок: ответ — карта { questionId: value }. Сопоставляем с block.questions.
    const qs = Array.isArray(block?.questions) ? block!.questions : []
    if (qs.length > 0) {
      const lines: string[] = []
      for (const q of qs) {
        const v = obj[q.id]
        if (v == null || v === "") continue
        const valStr = Array.isArray(v) ? v.join(", ") : String(v)
        lines.push(`  ${q.text || q.id}: ${valStr}`)
      }
      if (lines.length > 0) return "\n" + lines.join("\n")
    }
    // Fallback: JSON
    try { return JSON.stringify(obj) } catch { return "" }
  }
  return ""
}

function normalizeAnswers(raw: unknown, blockMap: Map<string, Block>): NormalizedAnswer[] {
  if (!Array.isArray(raw)) return []
  const out: NormalizedAnswer[] = []
  for (const entry of raw as unknown[]) {
    if (!entry || typeof entry !== "object") continue
    const e = entry as Record<string, unknown>
    // Skip synthetic completion marker
    if (e.blockId === "__complete__") continue
    // Legacy { question, answer }
    if (typeof e.question === "string") {
      const ansText = typeof e.answer === "string" ? e.answer : answerToText(e.answer, undefined)
      if (ansText) out.push({ question: e.question, answer: ansText })
      continue
    }
    // Current { blockId, answer }
    if (typeof e.blockId === "string") {
      const block = blockMap.get(e.blockId)
      const q = blockQuestionText(block, e.blockId)
      const a = answerToText(e.answer, block)
      if (a) out.push({ question: q, answer: a })
    }
  }
  return out
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id: vacancyId } = await params

    const body = await req.json() as { candidateId: string }
    if (!body.candidateId) {
      return apiError("candidateId обязательно", 400)
    }

    const [vacancy] = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        descriptionJson: vacancies.descriptionJson,
      })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Вакансия не найдена", 404)
    }

    const [candidate] = await db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, body.candidateId), eq(candidates.vacancyId, vacancyId)))
      .limit(1)

    if (!candidate) {
      return apiError("Кандидат не найден", 404)
    }

    // Тексты вопросов берём из последней демо-сборки вакансии — у анкетных
    // ответов хранится только blockId, без текста вопроса.
    const [demoRow] = await db
      .select({ lessonsJson: demos.lessonsJson })
      .from(demos)
      .where(eq(demos.vacancyId, vacancyId))
      .orderBy(desc(demos.updatedAt))
      .limit(1)
    const blockMap = buildBlockMap(demoRow?.lessonsJson)

    const descJson = vacancy.descriptionJson as Record<string, unknown> | null
    const anketa = descJson?.anketa as Record<string, unknown> | undefined

    const requirements: string[] = []
    if (anketa?.positionTitle) requirements.push(`Должность: ${anketa.positionTitle}`)
    if (anketa?.requiredSkills) requirements.push(`Требуемые навыки: ${(anketa.requiredSkills as string[]).join(", ")}`)
    if (anketa?.desiredSkills) requirements.push(`Желательные навыки: ${(anketa.desiredSkills as string[]).join(", ")}`)
    if (anketa?.experienceMin) requirements.push(`Минимальный опыт: ${anketa.experienceMin}`)
    if (anketa?.experienceIdeal) requirements.push(`Идеальный опыт: ${anketa.experienceIdeal}`)
    if (anketa?.productDescription) requirements.push(`Продукт: ${anketa.productDescription}`)

    const desiredParams = (anketa?.desiredParams as { id: string; label: string; enabled: boolean; weight: number }[] | undefined)
      ?.filter(p => p.enabled)
      ?.map(p => `${p.label} (вес: ${p.weight}/5)`) || []

    const questions = (anketa?.questions as string[]) || []

    const answers = normalizeAnswers(candidate.anketaAnswers, blockMap)

    const candidateInfo: string[] = []
    if (candidate.experience) candidateInfo.push(`Опыт: ${candidate.experience}`)
    if (candidate.skills?.length) candidateInfo.push(`Навыки: ${candidate.skills.join(", ")}`)
    if (candidate.city) candidateInfo.push(`Город: ${candidate.city}`)

    const prompt = `Ты — AI-рекрутер. Оцени кандидата по шкале 0-100.

ВАКАНСИЯ: ${vacancy.title}
${requirements.length > 0 ? `\nТРЕБОВАНИЯ:\n${requirements.join("\n")}` : ""}
${desiredParams.length > 0 ? `\nЖЕЛАЕМЫЕ ПАРАМЕТРЫ:\n${desiredParams.join("\n")}` : ""}

ДАННЫЕ КАНДИДАТА:
Имя: ${candidate.name}
${candidateInfo.join("\n")}

${answers.length > 0
  ? `ОТВЕТЫ НА КВАЛИФИКАЦИОННЫЕ ВОПРОСЫ:\n${answers.map((a, i) => `${i + 1}. Вопрос: ${a.question}\n   Ответ: ${a.answer}`).join("\n\n")}`
  : questions.length > 0
    ? `КВАЛИФИКАЦИОННЫЕ ВОПРОСЫ (ответы ещё не получены):\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : ""}

КРИТЕРИИ ОЦЕНКИ:
1. Соответствие требованиям вакансии
2. Полнота ответов
3. Конкретность (цифры, факты, примеры)
4. Релевантность опыта

Верни ТОЛЬКО валидный JSON (без markdown):
{
  "score": <число 0-100>,
  "summary": "<резюме оценки, 4-5 предложений>",
  "details": [
    {"question": "<вопрос или критерий>", "score": <0-100>, "comment": "<комментарий>"}
  ]
}`

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    })

    const textBlock = message.content.find(b => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return apiError("Не удалось получить ответ от AI", 500)
    }

    let result: ScoringResult
    try {
      // На случай если модель обернула JSON в текст — выдёргиваем первый { ... }
      const match = textBlock.text.match(/\{[\s\S]*\}/)
      result = JSON.parse(match ? match[0] : textBlock.text) as ScoringResult
    } catch {
      return apiError("Не удалось разобрать ответ AI", 500)
    }

    const [updated] = await db
      .update(candidates)
      .set({
        aiScore: result.score,
        aiSummary: result.summary,
        aiDetails: result.details,
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, body.candidateId))
      .returning()

    return apiSuccess({
      score: result.score,
      summary: result.summary,
      details: result.details,
      candidateId: updated.id,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("AI scoring error:", err)
    return apiError("Ошибка AI-скоринга", 500)
  }
}
