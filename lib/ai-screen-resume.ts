// AI-скоринг резюме (hh.ru / анкета) ДО прохождения демо.
// В отличие от screenCandidate (lib/ai-screen-candidate.ts, который запускается
// после демо и учитывает ответы кандидата на вопросы), этот скор оценивает
// только данные резюме vs anketa-требования и выставляется при приёме отклика.
//
// Модель: Haiku 4.5 — дешевле и быстрее, объём контента маленький.
// На вход: hh-резюме поля + три ключевых anketa-критерия. На выход: число
// 0..100, verdict (match|weak|stop) и короткое summary. Стоп-фактор → score=0.
import Anthropic from "@anthropic-ai/sdk"
import { AI_SAFETY_PROMPT } from "@/lib/ai-safety"
import { getClaudeApiUrl } from "@/lib/claude-proxy"

export interface ResumeScreenInput {
  resume: {
    name?: string | null
    city?: string | null
    salaryMin?: number | null
    experienceYears?: number | null
    keySkills?: string[] | null
    skills?: string[] | null
    educationLevel?: string | null
    workFormat?: string | null
  }
  vacancy: {
    title: string
    city?: string | null
    aiIdealProfile?: string | null
    aiRequiredHardSkills?: string[] | null
    aiStopFactors?: string[] | null
  }
}

export interface ResumeScreenResult {
  score:   number              // 0..100
  verdict: "match" | "weak" | "stop"
  summary: string              // 1-2 предложения, русский
}

const client = new Anthropic({ baseURL: getClaudeApiUrl() })

const SYSTEM_PROMPT = `Ты — HR-аналитик. Оцени резюме кандидата на соответствие вакансии.

Верни ТОЛЬКО валидный JSON без markdown-обёртки и без пояснений:
{"score": <0-100>, "verdict": "match"|"weak"|"stop", "summary": "<1-2 коротких предложения по-русски>"}

Веса критериев:
- Соответствие hard-навыков из требований — 40%
- Опыт в отрасли / релевантность по годам — 30%
- Зарплатные ожидания vs позиция — 15%
- Локация (город / готовность к удалёнке / релокации) — 15%

Правила:
- Если сработал ХОТЯ БЫ ОДИН стоп-фактор — score=0, verdict="stop", в summary укажи какой именно.
- Иначе: verdict="weak" при score 0-39, verdict="match" при score 40-100.
- Если данных в резюме совсем мало (нет навыков, опыта, города) — score не выше 50, summary: "Недостаточно данных в резюме".
- Не выдумывай факты, которых нет в резюме.` + AI_SAFETY_PROMPT

export async function screenResume(input: ResumeScreenInput): Promise<ResumeScreenResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const { resume: r, vacancy: v } = input

  const userMessage = `ВАКАНСИЯ:
- Должность: ${v.title}
- Город: ${v.city || "—"}
- Идеальный профиль: ${v.aiIdealProfile?.trim() || "—"}
- Hard-навыки (требования): ${v.aiRequiredHardSkills?.join(", ") || "—"}
- Стоп-факторы: ${v.aiStopFactors?.join("; ") || "—"}

КАНДИДАТ:
- Имя: ${r.name || "—"}
- Город: ${r.city || "—"}
- Зарплата от: ${r.salaryMin ?? "—"}
- Опыт (лет): ${r.experienceYears ?? "—"}
- Ключевые навыки (hh): ${r.keySkills?.join(", ") || "—"}
- Навыки: ${r.skills?.join(", ") || "—"}
- Образование: ${r.educationLevel || "—"}
- Формат работы: ${r.workFormat || "—"}`

  let raw = ""
  try {
    const response = await client.messages.create({
      model:       "claude-haiku-4-5-20251001",
      max_tokens:  300,
      temperature: 0,
      system:      SYSTEM_PROMPT,
      messages:    [{ role: "user", content: userMessage }],
    })
    const content = response.content[0]
    if (content.type !== "text") return null
    raw = content.text.trim()
  } catch (err) {
    console.warn("[screen-resume] API call failed:", err instanceof Error ? err.message : err)
    return null
  }

  // Снимаем возможную markdown-обёртку (на случай если Haiku вернёт ```json …```).
  const stripped = raw.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/)
    if (!m) return null
    try { parsed = JSON.parse(m[0]) } catch { return null }
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))))
  if (!Number.isFinite(score)) return null

  const rawVerdict = String(parsed.verdict ?? "").toLowerCase()
  const verdict: ResumeScreenResult["verdict"] =
    rawVerdict === "stop"  ? "stop"  :
    rawVerdict === "match" ? "match" :
    rawVerdict === "weak"  ? "weak"  :
    (score === 0 ? "stop" : score >= 40 ? "match" : "weak")

  // Гарантия совместимости со scoring-инвариантом: stop ⇒ 0.
  const finalScore = verdict === "stop" ? 0 : score

  const summary = typeof parsed.summary === "string"
    ? parsed.summary.trim().slice(0, 280)
    : ""

  return { score: finalScore, verdict, summary }
}
