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
import { addVacancyTokens } from "@/lib/ai/token-usage"

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
    // Доп. поля hh (миграция 0200)
    languages?: string[] | null
    relocationReady?: boolean | null
    professionalRoles?: string[] | null
    citizenshipNames?: string[] | null
  }
  vacancy: {
    title: string
    city?: string | null
    aiIdealProfile?: string | null
    aiRequiredHardSkills?: string[] | null
    aiStopFactors?: string[] | null
    /** «Нежелательно» — снижает балл, но НЕ отказ (мягкие dealBreakers «Портрета»). */
    aiSoftAvoid?: string[] | null
    screeningQuestions?: string[] | null
    aiWeights?: Record<string, string> | null
    // Кастом-критерии HR с уровнем важности. level="required" → обязательный
    // (не соответствует = отказ/балл 0); остальные влияют на балл по весу.
    customCriteria?: { label: string; weight: string }[] | null
  }
}

export interface ResumeScreenResult {
  score:   number              // 0..100
  verdict: "match" | "weak" | "stop"
  summary: string              // 1-2 предложения, русский
}

const client = new Anthropic({ baseURL: getClaudeApiUrl() })

const WEIGHT_AXIS_LABELS: Record<string, string> = {
  industry_experience: "Опыт в отрасли / релевантность по годам",
  specific_skills:     "Соответствие hard-навыков из требований",
  salary_match:        "Зарплатные ожидания vs позиция",
  management:          "Опыт управления",
  education:           "Профильное образование",
}
const WEIGHT_LEVEL_LABELS: Record<string, string> = {
  critical:  "Критично (ключевой критерий — снижает балл сильнее всего)",
  important: "Важно",
  nice:      "Желательно",
}
const DEFAULT_WEIGHTS_SECTION =
  `- Соответствие hard-навыков из требований — 40%
- Опыт в отрасли / релевантность по годам — 30%
- Зарплатные ожидания vs позиция — 15%
- Локация (город / готовность к удалёнке / релокации) — 15%`

function buildWeightsSection(aiWeights?: Record<string, string> | null): string {
  if (!aiWeights || Object.keys(aiWeights).length === 0) return DEFAULT_WEIGHTS_SECTION
  const lines: string[] = []
  for (const [key, level] of Object.entries(aiWeights)) {
    if (level === "irrelevant") continue
    const label = WEIGHT_AXIS_LABELS[key] ?? key
    const levelLabel = WEIGHT_LEVEL_LABELS[level]
    if (!levelLabel) continue
    lines.push(`- ${label}: ${levelLabel}`)
  }
  return lines.length > 0 ? lines.join("\n") : DEFAULT_WEIGHTS_SECTION
}

const SYSTEM_PROMPT_BASE = `Ты — HR-аналитик. Оцени резюме кандидата на соответствие вакансии.

Верни ТОЛЬКО валидный JSON без markdown-обёртки и без пояснений:
{"score": <0-100>, "verdict": "match"|"weak"|"stop", "summary": "<1-2 коротких предложения по-русски>"}

ПРАВИЛА ОБЯЗАТЕЛЬНЫЕ:
- Если сработал ХОТЯ БЫ ОДИН стоп-фактор — score=0, verdict="stop", в summary укажи какой именно.
- Иначе: verdict="weak" при score 0-39, verdict="match" при score 40-100.
- Если данных в резюме совсем мало (нет навыков, опыта, города) — score не выше 50, summary: "Недостаточно данных в резюме".
- Не выдумывай факты, которых нет в резюме.
- Если заданы «Вопросы для скрининга» — учти их при оценке: чем полнее резюме отвечает на них в пользу кандидата, тем выше score; явное несоответствие снижает score. Это НЕ стоп-факторы (балл не обнуляют).
- Если задано «Нежелательно» — каждое совпадение заметно СНИЖАЕТ score, но НЕ обнуляет его и НЕ является стоп-фактором (verdict не "stop" только из-за этого).
- Если заданы «ОБЯЗАТЕЛЬНЫЕ критерии» — кандидат должен соответствовать КАЖДОМУ (оценивай по реальному опыту/проектам/образованию в резюме, а не по формальным словам). Если хотя бы один обязательный критерий НЕ выполнен → score=0, verdict="stop", в summary укажи какой именно.
- «Доп. критерии оценки» влияют на балл по важности (критично > важно > желательно), но НЕ обнуляют score.`

export async function screenResume(input: ResumeScreenInput, vacancyId?: string | null): Promise<ResumeScreenResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const { resume: r, vacancy: v } = input

  // Кастом-критерии HR: обязательные (knockout) и весовые.
  const LEVEL_RU: Record<string, string> = { critical: "критично", important: "важно", nice: "желательно" }
  const cc = (v.customCriteria ?? []).filter(c => c.label?.trim())
  const requiredCC = cc.filter(c => c.weight === "required").map(c => c.label.trim())
  const weightedCC = cc
    .filter(c => c.weight !== "required" && c.weight !== "irrelevant")
    .map(c => `${c.label.trim()} (${LEVEL_RU[c.weight] ?? c.weight})`)

  const userMessage = `ВАКАНСИЯ:
- Должность: ${v.title}
- Город: ${v.city || "—"}
- Идеальный профиль: ${v.aiIdealProfile?.trim() || "—"}
- Hard-навыки (требования): ${v.aiRequiredHardSkills?.join(", ") || "—"}
- Стоп-факторы: ${v.aiStopFactors?.join("; ") || "—"}
- Нежелательно (снижает балл, НЕ отказ): ${v.aiSoftAvoid?.filter(Boolean).join("; ") || "—"}
- Вопросы для скрининга (проверь по резюме, насколько кандидат им соответствует): ${v.screeningQuestions?.filter(Boolean).join(" | ") || "—"}
- ОБЯЗАТЕЛЬНЫЕ критерии (не выполнен хотя бы один → отказ, score=0): ${requiredCC.length ? requiredCC.join(" | ") : "—"}
- Доп. критерии оценки (влияют на балл по важности): ${weightedCC.length ? weightedCC.join(" | ") : "—"}

КАНДИДАТ:
- Имя: ${r.name || "—"}
- Город: ${r.city || "—"}
- Зарплата от: ${r.salaryMin ?? "—"}
- Опыт (лет): ${r.experienceYears ?? "—"}
- Ключевые навыки (hh): ${r.keySkills?.join(", ") || "—"}
- Навыки: ${r.skills?.join(", ") || "—"}
- Образование: ${r.educationLevel || "—"}
- Формат работы: ${r.workFormat || "—"}
- Языки: ${r.languages?.join(", ") || "—"}
- Готовность к переезду: ${r.relocationReady === true ? "да" : r.relocationReady === false ? "нет" : "—"}
- Профессиональные роли: ${r.professionalRoles?.join(", ") || "—"}
- Гражданство: ${r.citizenshipNames?.join(", ") || "—"}`

  const systemPrompt = `${SYSTEM_PROMPT_BASE}

Веса критериев:
${buildWeightsSection(v.aiWeights)}` + AI_SAFETY_PROMPT

  let raw = ""
  try {
    const response = await client.messages.create({
      model:       "claude-haiku-4-5-20251001",
      max_tokens:  300,
      temperature: 0,
      system:      systemPrompt,
      messages:    [{ role: "user", content: userMessage }],
    })
    const content = response.content[0]
    if (content.type !== "text") return null
    void addVacancyTokens(vacancyId, response.usage)
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
