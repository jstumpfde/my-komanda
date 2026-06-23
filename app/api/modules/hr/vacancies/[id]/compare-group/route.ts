import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { AI_SAFETY_PROMPT, checkAiRateLimit, handleAiError } from "@/lib/ai-safety"
import { checkRateLimit } from "@/lib/rate-limit"

// Сравнение кандидатов: AI-группировка свободных текстовых ответов на ОДИН вопрос
// в несколько смысловых групп. Возвращает группы со списком candidateId — фронт
// показывает их чипами в фильтре и фильтрует по ним.
//
// POST body: { question: string, answers: [{ id: string, text: string }] }
// resp: { groups: [{ label: string, ids: string[] }] }

const client = new Anthropic({ baseURL: getClaudeApiUrl() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user: { companyId?: string; id?: string }
  try {
    user = await requireCompany() as { companyId?: string; id?: string }
  } catch (e) {
    if (e instanceof Response) return e
    return apiError("Unauthorized", 401)
  }
  await params // route param не нужен для логики, но держим сигнатуру
  const tenantId = user.companyId || user.id || "default"

  if (!checkRateLimit(`compare-group:${tenantId}`, 20, 60_000)) {
    return apiError("Слишком частые запросы. Подождите несколько секунд.", 429)
  }
  const daily = checkAiRateLimit(tenantId)
  if (daily) return apiError(daily.message, 429)

  let body: { question?: string; answers?: Array<{ id?: string; text?: string }> }
  try { body = await req.json() } catch { return apiError("Некорректный запрос", 400) }

  const question = (body.question || "").toString().slice(0, 500)
  const answers = (Array.isArray(body.answers) ? body.answers : [])
    .filter(a => a && typeof a.id === "string" && typeof a.text === "string" && a.text.trim())
    .slice(0, 200)

  if (answers.length === 0) return apiSuccess({ groups: [] })
  if (!process.env.ANTHROPIC_API_KEY) {
    return apiSuccess({ groups: [{ label: "Все ответы", ids: answers.map(a => a.id as string) }] })
  }

  // Индексный список (1..N) — AI возвращает номера, маппим в id на сервере.
  const numbered = answers.map((a, i) => `${i + 1}. ${(a.text as string).replace(/\s+/g, " ").trim().slice(0, 400)}`).join("\n")

  const prompt = `Вопрос кандидатам: "${question}"

Ответы кандидатов (пронумерованы):
${numbered}

Сгруппируй ответы в 3–6 смысловых групп по сути ответа (например по нишам, диапазонам сумм, типам опыта). Каждый ответ отнеси РОВНО к одной группе. Группы — короткие понятные ярлыки (1–4 слова) на русском.

Верни ТОЛЬКО JSON без markdown:
{"groups":[{"label":"Короткий ярлык","items":[1,4,7]}]}
items — номера ответов из списка выше. Покрой ВСЕ номера от 1 до ${answers.length}.`

  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: `Ты группируешь свободные ответы кандидатов в смысловые кластеры. Отвечай ТОЛЬКО валидным JSON.\n${AI_SAFETY_PROMPT}`,
      messages: [{ role: "user", content: prompt }],
    })
    const text = resp.content[0]?.type === "text" ? resp.content[0].text : ""
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return apiSuccess({ groups: [{ label: "Все ответы", ids: answers.map(a => a.id as string) }] })
    const parsed = JSON.parse(m[0]) as { groups?: Array<{ label?: string; items?: number[] }> }
    const seen = new Set<number>()
    const groups = (parsed.groups || [])
      .map(g => {
        const ids = (Array.isArray(g.items) ? g.items : [])
          .filter(n => Number.isInteger(n) && n >= 1 && n <= answers.length && !seen.has(n))
          .map(n => { seen.add(n); return answers[n - 1].id as string })
        return { label: (g.label || "Группа").toString().slice(0, 60), ids }
      })
      .filter(g => g.ids.length > 0)
    // Непокрытые ответы → отдельная группа.
    const rest = answers.filter((_, i) => !seen.has(i + 1)).map(a => a.id as string)
    if (rest.length) groups.push({ label: "Прочее", ids: rest })
    return apiSuccess({ groups })
  } catch (err) {
    console.error("[compare-group]", handleAiError(err))
    return apiSuccess({ groups: [{ label: "Все ответы", ids: answers.map(a => a.id as string) }] })
  }
}
