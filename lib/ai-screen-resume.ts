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
import { AI_MODEL_FAST } from "@/lib/ai/models"
import { formatWorkHistory } from "@/lib/hh/extract-resume-fields"

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
    // История занятости (реально занятые должности/компании/срок). Ключевой
    // сигнал релевантности опыта — без него один experienceYears занижает
    // сильных кандидатов. Опционально: если не передана, работаем как раньше.
    workHistory?: {
      position?:    string | null
      company?:     string | null
      industry?:    string | null
      start?:       string | null
      end?:         string | null
      months?:      number | null
      description?: string | null
    }[] | null
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

// Потолок балла для «обеднённого» входа (нет содержательной истории должностей).
// weak-зона: годы стажа + soft-skills сами по себе не дают match.
const THIN_INPUT_SCORE_CAP = 44

/**
 * Есть ли у кандидата содержательная история должностей — то, что вообще может
 * оправдать высокий балл. Backstop к промпту: даже если модель по ошибке
 * завысит балл за «N лет + мягкие навыки», код срежет его до weak, если в
 * резюме нет ни одной реальной должности.
 *
 * «Содержательная» запись = есть непустое название должности, которое НЕ
 * сводится к общему soft-skill/базовому инструменту. Одного experienceYears
 * («15 лет») недостаточно — это не должность.
 */
export function hasSubstantiveRoleHistory(
  resume: ResumeScreenInput["resume"],
): boolean {
  const wh = resume.workHistory ?? []
  for (const w of wh) {
    const pos = (w.position ?? "").trim()
    if (pos.length >= 3) return true // реальная должность указана
    // Должности нет, но есть развёрнутое описание обязанностей — тоже сигнал.
    if ((w.description ?? "").trim().length >= 40) return true
  }
  return false
}

const client = new Anthropic({ baseURL: getClaudeApiUrl() })

const WEIGHT_AXIS_LABELS: Record<string, string> = {
  industry_experience: "Опыт в отрасли / релевантность по годам",
  specific_skills:     "Соответствие hard-навыков из требований",
  salary_match:        "Зарплатные ожидания vs позиция",
  management:          "Опыт управления",
  education:           "Профильное образование",
  // #7: остальные 5 из 9 осей Spec.scoringWeights (lib/core/spec/resume-input.ts
  // маппит их сюда) — раньше не имели меток и терялись по факту (не передавались
  // вовсе), хотя HR настраивал их вес в «Портрете».
  tenure_stability:    "Стабильность (средний срок работы на местах)",
  results_in_numbers:  "Результаты в цифрах (измеримые достижения)",
  soft_skills_fit:     "Соответствие soft-skills",
  company_size_match:  "Соответствие масштаба компаний",
  location_readiness:  "Локация / готовность к удалёнке-релокации",
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

const SYSTEM_PROMPT_BASE = `Ты — опытный HR-аналитик. Оцени, насколько кандидат по резюме подходит под вакансию. Оценивай СОДЕРЖАТЕЛЬНО: смотри на реальный опыт (должности, отрасль, срок, обязанности), а не только на формальный список навыков.

Верни ТОЛЬКО валидный JSON без markdown-обёртки и без пояснений:
{"score": <0-100>, "verdict": "match"|"weak"|"stop", "summary": "<1-2 коротких предложения по-русски>"}

КАК ОЦЕНИВАТЬ ОПЫТ (баллы даёт РЕЛЕВАНТНОСТЬ, а не сам факт стажа):
- Опирайся в первую очередь на «Опыт работы» (должности + компании + отрасль + срок + обязанности). Высокий балл заслуживает только СОДЕРЖАТЕЛЬНО РЕЛЕВАНТНАЯ история: конкретные должности в тему вакансии, подтверждённые обязанностями/достижениями/отраслью.
- «X лет опыта» сам по себе НИЧЕГО не говорит о соответствии. Годы стажа ≠ match. Если у кандидата указан только общий стаж («15 лет») без перечня релевантных должностей и обязанностей — это НЕ основание для высокого балла.
- Если должности кандидата близки к вакансии по смыслу (даже названы иначе) и подтверждены сроком/обязанностями — это сильное совпадение. Пример: для вакансии в продажах «Руководитель развития партнёрской сети», «Ведущий менеджер по ключевым клиентам» с описанием задач по продажам/клиентам — профильный релевантный опыт, оценивай высоко.
- Общие soft-skills («Обучаемость», «Коммуникабельность», «Ответственность») и базовые инструменты («1С», «MS Office») — это НЕ релевантный опыт и сами по себе балл почти не поднимают.
- Не путай общий стаж с релевантным: 10 лет не по профилю ≠ 10 лет по профилю. Считай именно релевантные роли/годы.
- «Идеальный профиль» — ориентир соответствия. Совпадение по сути (роли/отрасль/масштаб задач) важнее совпадения по ключевым словам.

ШКАЛА (калибровка 0-100, применяй строго):
- 85-100 — сильное соответствие: подробная профильная история (конкретные релевантные должности + обязанности/достижения в тему) + ключевые требования закрыты.
- 70-84 — хорошее соответствие: есть ЯВНО РЕЛЕВАНТНЫЕ должности с описанием задач в нужной сфере, часть требований закрыта, мелкие пробелы.
- 55-69 — умеренное: частично релевантный опыт ИЛИ смежная сфера с подтверждающими деталями, заметные пробелы.
- 40-54 — слабое, но не отказ: есть какой-то опыт, но релевантность слабая/не подтверждена деталями.
- 0-39 — не подходит по сути ИЛИ релевантность не подтверждается содержанием резюме (verdict="weak").
ГЛАВНОЕ ОГРАНИЧЕНИЕ на 70+: балл 70 и выше допустим ТОЛЬКО когда в «Опыте работы» есть конкретные релевантные должности/обязанности в тему вакансии. Нельзя ставить 70+ за «N лет стажа» + общие soft-skills без релевантных ролей — потолок таких резюме 44 (verdict="weak"). В summary кратко назови релевантную роль(и), из-за которой поставлен высокий балл; если назвать нечего — балл не может быть 70+.

ПРАВИЛА ОБЯЗАТЕЛЬНЫЕ:
- Если сработал ХОТЯ БЫ ОДИН стоп-фактор — score=0, verdict="stop", в summary укажи какой именно.
- Иначе: verdict="weak" при score 0-39, verdict="match" при score 40-100.
- Не выдумывай факты, которых нет в резюме. Если чего-то нет в резюме — это пробел, оценивай по тому, что ЕСТЬ, и НЕ додумывай релевантность, которой в тексте нет.
- Если «Опыт работы» пуст или состоит только из общего стажа без перечня релевантных должностей/обязанностей — это скудный вход: score не выше 44, verdict="weak", summary: "Недостаточно данных о релевантном опыте". Наличие ТОЛЬКО soft-skills/базовых инструментов этот потолок НЕ снимает — его снимает только содержательная релевантная история должностей.
- Если заданы «Вопросы для скрининга» — учти их при оценке: чем полнее резюме отвечает на них в пользу кандидата, тем выше score; явное несоответствие снижает score. Это НЕ стоп-факторы (балл не обнуляют).
- Если задано «Нежелательно» — каждое совпадение заметно СНИЖАЕТ score, но НЕ обнуляет его и НЕ является стоп-фактором (verdict не "stop" только из-за этого).
- Если заданы «ОБЯЗАТЕЛЬНЫЕ критерии» — кандидат должен соответствовать КАЖДОМУ (оценивай по реальному опыту/проектам/образованию в резюме, а не по формальным словам). Если хотя бы один обязательный критерий НЕ выполнен → score=0, verdict="stop", в summary укажи какой именно.
- «Веса критериев» задают приоритеты: критично > важно > желательно. Критичные оси сильнее двигают балл (и вверх при совпадении, и вниз при пробеле); «желательные» — лёгкий бонус, их отсутствие балл почти не снижает.
- «Доп. критерии оценки» влияют на балл по важности (критично > важно > желательно), но НЕ обнуляют score.`

export async function screenResume(input: ResumeScreenInput, vacancyId?: string | null): Promise<ResumeScreenResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const { resume: r, vacancy: v } = input

  // История занятости → компактный текст для промпта. Именно она даёт скореру
  // релевантность опыта (роль/отрасль/срок), а не голый experienceYears.
  const workHistoryText = formatWorkHistory(r.workHistory)

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
- Общий опыт (лет): ${r.experienceYears ?? "—"}
- Опыт работы (должности, компании, срок — ОСНОВНОЙ сигнал релевантности):
${workHistoryText || "  (детальная история не указана)"}
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
      model:       AI_MODEL_FAST,
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

  // Backstop к калибровке: без содержательной истории должностей (только годы
  // стажа + soft-skills, либо пустой опыт) высокий балл невозможен — режем до
  // weak-потолка. Стоп-вердикт (score=0) не трогаем.
  // ВАЖНО (predeploy-guard 02.07): бэкстоп применяем ТОЛЬКО когда workHistory
  // РЕАЛЬНО передан вызывающим (live-скан process-queue). Если workHistory ===
  // undefined — данных о должностях у вызова нет (ручная переоценка rescore,
  // mock-импорт): резать до 44 нельзя, иначе обнулим реальные баллы. Отличаем
  // «нет данных» (undefined → не режем) от «пустая история» ([] → режем).
  let effVerdict = verdict
  let effScore = score
  if (effVerdict !== "stop" && effScore > THIN_INPUT_SCORE_CAP && r.workHistory !== undefined && !hasSubstantiveRoleHistory(r)) {
    effScore = THIN_INPUT_SCORE_CAP
    effVerdict = "weak"
  }

  // Гарантия совместимости со scoring-инвариантом: stop ⇒ 0.
  const finalScore = effVerdict === "stop" ? 0 : effScore

  const summary = typeof parsed.summary === "string"
    ? parsed.summary.trim().slice(0, 280)
    : ""

  return { score: finalScore, verdict: effVerdict, summary }
}
