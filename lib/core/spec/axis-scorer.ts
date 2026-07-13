// Осевой скоринг резюме (Портрет, редизайн 02.07.2026).
//
// Зачем: единый холистический балл (screenResume) складывал ВСЕ критерии в одну
// кучу — сильная ось «активные продажи» перекрывала пустые «ниша»/«продукт», и
// генерик-продавец без IT/SaaS получал 72 вместо ~40. Решение Юрия: каждый пункт
// «Подходит» = отдельная ОСЬ. AI оценивает КАЖДУЮ ось изолированно и ТОЛЬКО по
// явному тексту резюме (не домысливая релевантность), веса РАВНЫЕ (100/N). Итог =
// среднее осей минус штрафы «Не подходит», пол = 0 (минуса не бывает).
//
// Модель Haiku 4.5 (как screenResume). Один вызов — JSON с разбивкой по осям
// и штрафам, арифметику (равные веса + пол) считает КОД, а не AI.

import Anthropic from "@anthropic-ai/sdk"
import { AI_SAFETY_PROMPT } from "@/lib/ai-safety"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { addVacancyTokens } from "@/lib/ai/token-usage"
import { logAiCallFailure } from "@/lib/ai/failure-log"
import type { ResumeScreenInput } from "@/lib/ai-screen-resume"
import type { CandidateSpec } from "@/lib/core/spec/types"
import { normalizeMustHave, normalizeNiceToHave, normalizeDealBreakers, dealBreakerPenalty } from "@/lib/core/spec/types"
import { AI_MODEL_FAST } from "@/lib/ai/models"
import { resolveCityUtcOffset } from "@/lib/geo/city-timezones"
import { formatWorkHistory } from "@/lib/hh/extract-resume-fields"

const client = new Anthropic({ baseURL: getClaudeApiUrl() })

/** Одна ось «Подходит»: её метка, синонимы и равный вес (100/N). */
export interface Axis {
  key:      string   // стабильный ключ (индекс)
  label:    string   // основной термин (первая часть до запятой)
  synonyms: string[] // остальные части текста (что ещё считать совпадением)
  weight:   number   // баллов на ось = round(100/N)
}

/** Результат по одной оси. */
export interface AxisScore {
  key:      string
  label:    string
  weight:   number   // выделено баллов
  score:    number   // 0-100, насколько ось закрыта по резюме
  points:   number   // вклад в итог = score/100 * weight
  evidence: string   // почему (цитата/обоснование по резюме)
}

/** Результат по одному штрафу «Не подходит». */
export interface PenaltyScore {
  text:      string
  magnitude: number  // насколько снижает (0-100), 100 = полный стоп
  triggered: boolean // AI прямо видит это в резюме
  applied:   number  // фактически вычтено (0 если не сработал)
  evidence:  string
}

export interface AxisScoreResult {
  score:     number  // ИТОГ 0-100 (среднее осей − штрафы, пол 0)
  base:      number  // до штрафов (сумма points)
  verdict:   "match" | "weak" | "stop"
  summary:   string
  axes:      AxisScore[]
  penalties: PenaltyScore[]
}

/** Разбор текста пункта «label, синоним1, синоним2» на метку + синонимы. */
function splitTermSynonyms(text: string): { label: string; synonyms: string[] } {
  const parts = text.split(",").map(s => s.trim()).filter(Boolean)
  return { label: parts[0] ?? text.trim(), synonyms: parts.slice(1) }
}

/**
 * Оси «Подходит» из Spec. Источник — ТО ЖЕ объединение mustHave+niceToHave, что
 * GoodEditor показывает HR-у как оси с бейджами весов: у спеков, сохранённых до
 * 🟢-редизайна, mustHave непустой, и без него показанные критерии молча выпадали
 * бы из балла.
 *
 * Веса (редизайн 02.07, ручной балл оси):
 *   - у оси с заданным `weight` (только niceToHave) берём его;
 *   - ОСТАВШИЙСЯ бюджет (100 − сумма заданных, не меньше 0) делим ПОРОВНУ между
 *     осями БЕЗ weight (остаток +1 первым таким осям), Σ стремится к 100;
 *   - если weight задан у ВСЕХ осей — используем как есть (движок считает вклад
 *     = score/100 * weight, так что сумма ≠ 100 не ломает арифметику).
 * Если weight нигде не задан — прежнее равное деление (обратная совместимость).
 */
export function buildAxes(spec: CandidateSpec): Axis[] {
  // mustHave не имеет поля weight → всегда «без веса» (равная доля остатка).
  const rows: { text: string; weight?: number }[] = [
    ...normalizeMustHave(spec.mustHave).map(m => ({ text: m.text })),
    ...normalizeNiceToHave(spec.niceToHave).map(n => ({ text: n.text, weight: n.weight })),
  ]
  const n = rows.length
  if (n === 0) return []

  const hasWeight = (r: { weight?: number }) => typeof r.weight === "number"
  const fixedSum = rows.reduce((s, r) => s + (hasWeight(r) ? (r.weight as number) : 0), 0)
  const freeCount = rows.filter(r => !hasWeight(r)).length
  // Бюджет на оси без weight = остаток 100 − сумма заданных (не меньше 0).
  const budget = Math.max(0, 100 - fixedSum)
  const base = freeCount > 0 ? Math.floor(budget / freeCount) : 0
  const rem = freeCount > 0 ? budget - base * freeCount : 0 // остаток +1 первым свободным осям

  let freeSeen = 0
  return rows.map((r, i) => {
    const { label, synonyms } = splitTermSynonyms(r.text)
    let weight: number
    if (hasWeight(r)) {
      weight = r.weight as number
    } else {
      weight = base + (freeSeen < rem ? 1 : 0)
      freeSeen++
    }
    return { key: String(i), label, synonyms, weight }
  })
}

/** Штрафы «Не подходит» из Spec (с величиной снижения). */
export function buildPenalties(spec: CandidateSpec): { text: string; magnitude: number }[] {
  return normalizeDealBreakers(spec.dealBreakers).map(d => ({
    text: d.text,
    magnitude: dealBreakerPenalty(d),
  }))
}

function workHistoryToText(resume: ResumeScreenInput["resume"]): string {
  return formatWorkHistory(resume.workHistory)
}

const SYSTEM_PROMPT = `Ты — строгий HR-аналитик. Оцени резюме кандидата ПООСЕВО.

ЖЕЛЕЗНЫЕ ПРАВИЛА (нарушение = неверная оценка):
1. Каждую ось оценивай ИЗОЛИРОВАННО и ТОЛЬКО по тому, что ЯВНО написано в резюме. Сильная одна ось НЕ компенсирует пустую другую.
2. НЕ домысливай релевантность, которой в тексте нет. Если из сферы «можно предположить» наличие навыка (напр. лизинг → возможно холодные звонки), но прямо это НЕ написано — считай, что оси НЕТ (score оси низкий).
3. Ось закрыта высоко (70-100) ТОЛЬКО когда в резюме есть конкретное, названное соответствие сути оси (должность/проект/обязанность/продукт/отрасль по теме оси). Общие слова, смежная сфера, «красивое описание» без предметной привязки к оси → 0-40.
4. Совпадение по СМЫСЛУ засчитывается (синонимы к оси перечислены как подсказка), но именно по сути оси, а не по любому упоминанию продаж вообще.
5. score оси — 0-100 (насколько ось закрыта). evidence — короткая ссылка на то, что в резюме это подтверждает, или «в резюме не указано».

ШТРАФЫ «Не подходит»: для каждого — triggered=true ТОЛЬКО если AI прямо видит это в резюме; иначе false. Не додумывай.

Ответ — СТРОГО JSON, без markdown:
{"axes":[{"key":"<key>","score":<0-100>,"evidence":"<кратко>"}],"penalties":[{"text":"<текст>","triggered":<true|false>,"evidence":"<кратко>"}],"summary":"<1-2 предложения по-русски: чего не хватает и за что балл>"}`

/**
 * Осевой скоринг резюме. Возвращает null при отсутствии ANTHROPIC_API_KEY,
 * пустых осях или ошибке AI (вызывающий делает fallback).
 */
export async function scoreResumeByAxes(
  resume: ResumeScreenInput["resume"],
  vacancy: { title: string; city?: string | null },
  spec: CandidateSpec,
  vacancyId?: string | null,
): Promise<AxisScoreResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const axes = buildAxes(spec)
  if (axes.length === 0) return null
  const penalties = buildPenalties(spec)

  const axesBlock = axes
    .map(a => `- key="${a.key}" | ОСЬ: ${a.label}${a.synonyms.length ? ` (синонимы: ${a.synonyms.join(", ")})` : ""}`)
    .join("\n")
  const penaltiesBlock = penalties.length
    ? penalties.map(p => `- ${p.text}`).join("\n")
    : "—"

  const wh = workHistoryToText(resume)
  const userMessage = `ВАКАНСИЯ: ${vacancy.title}${vacancy.city ? ` (${vacancy.city})` : ""}
${spec.idealProfile?.trim() ? `Идеальный профиль: ${spec.idealProfile.trim()}\n` : ""}
ОСИ ОЦЕНКИ (оцени КАЖДУЮ отдельно, только по явному тексту резюме):
${axesBlock}

ПУНКТЫ «НЕ ПОДХОДИТ» (triggered только если прямо видно в резюме):
${penaltiesBlock}

КАНДИДАТ:
- Имя: ${resume.name || "—"}
- Город: ${resume.city || "—"}
- Общий опыт (лет): ${resume.experienceYears ?? "—"}
- Опыт работы (должности, компании, срок — ОСНОВНОЙ сигнал):
${wh || "  (детальная история не указана)"}
- Ключевые навыки: ${resume.keySkills?.join(", ") || "—"}
- Навыки: ${resume.skills?.join(", ") || "—"}
- Образование: ${resume.educationLevel || "—"}
- Профессиональные роли: ${resume.professionalRoles?.join(", ") || "—"}`

  let raw = ""
  try {
    const response = await client.messages.create({
      model:       AI_MODEL_FAST,
      max_tokens:  2000,
      temperature: 0,
      system:      SYSTEM_PROMPT + AI_SAFETY_PROMPT,
      messages:    [{ role: "user", content: userMessage }],
    })
    const content = response.content[0]
    if (content.type !== "text") return null
    void addVacancyTokens(vacancyId, response.usage)
    raw = content.text.trim()
    if (process.env.AXIS_DEBUG) console.error("[axis raw]", raw.slice(0, 900))
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn("[axis-scorer] API call failed:", errMsg)
    // Сторож найма (drizzle/0277): платформенный детектор массового сбоя AI —
    // fire-and-forget, см. lib/ai-screen-resume.ts для того же паттерна.
    void logAiCallFailure({ source: "axis-scorer", errorMessage: errMsg, vacancyId: vacancyId ?? null })
    return null
  }

  const stripped = raw.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()
  let parsed: { axes?: unknown; penalties?: unknown; summary?: unknown }
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/)
    if (!m) { if (process.env.AXIS_DEBUG) console.error("[axis parse] no JSON object in:", stripped.slice(0, 400)); return null }
    try { parsed = JSON.parse(m[0]) } catch { if (process.env.AXIS_DEBUG) console.error("[axis parse] JSON.parse failed:", m[0].slice(0, 400)); return null }
  }

  // ── Сборка осей: код владеет арифметикой (равные веса) ──────────────────────
  const rawAxes = Array.isArray(parsed.axes) ? parsed.axes as Record<string, unknown>[] : []
  const byKey = new Map<string, { score: number; evidence: string }>()
  for (const a of rawAxes) {
    const key = String(a.key ?? "")
    const s = Math.max(0, Math.min(100, Math.round(Number(a.score))))
    if (!byKey.has(key)) byKey.set(key, { score: Number.isFinite(s) ? s : 0, evidence: String(a.evidence ?? "") })
  }
  const axisScores: AxisScore[] = axes.map(ax => {
    const r = byKey.get(ax.key) ?? { score: 0, evidence: "AI не вернул оценку по оси" }
    const points = Math.round((r.score / 100) * ax.weight * 10) / 10
    return { key: ax.key, label: ax.label, weight: ax.weight, score: r.score, points, evidence: r.evidence }
  })
  const base = Math.round(axisScores.reduce((s, a) => s + a.points, 0))

  // ── Штрафы ──────────────────────────────────────────────────────────────────
  const rawPen = Array.isArray(parsed.penalties) ? parsed.penalties as Record<string, unknown>[] : []
  const penScores: PenaltyScore[] = penalties.map(p => {
    // Сопоставляем по тексту (AI возвращает text как есть).
    const hit = rawPen.find(rp => String(rp.text ?? "").trim().toLowerCase() === p.text.trim().toLowerCase())
    const triggered = hit ? Boolean(hit.triggered) : false
    return {
      text: p.text,
      magnitude: p.magnitude,
      triggered,
      applied: triggered ? p.magnitude : 0,
      evidence: hit ? String(hit.evidence ?? "") : "",
    }
  })
  const totalPenalty = penScores.reduce((s, p) => s + p.applied, 0)

  // ── Итог: пол 0, потолок 100 ─────────────────────────────────────────────────
  const score = Math.max(0, Math.min(100, base - totalPenalty))
  const fullStop = penScores.some(p => p.triggered && p.magnitude >= 100)
  const verdict: AxisScoreResult["verdict"] =
    (fullStop || score === 0) ? "stop" : score >= 40 ? "match" : "weak"

  return {
    score,
    base,
    verdict,
    summary: String(parsed.summary ?? "").slice(0, 500),
    axes: axisScores,
    penalties: penScores,
  }
}

/**
 * Мягкий штраф «Часовой пояс» (Юрий 03-04.07): применяется ПОСЛЕ расчёта
 * резюме-балла (осевого или холистического) — снижает score, но НЕ отказ.
 *
 * Город кандидата резолвится через resolveCityUtcOffset(); неизвестный город
 * (null) → штраф НЕ применяется (fail-open, как в задаче). Возвращает исходный
 * score, если фактор выключен, город неизвестен, или разница в пределах нормы.
 *
 * Если передан `breakdown` (AxisScoreResult, только режим "axes") — штраф
 * дописывается туда отдельной записью в penalties[], чтобы «почему» на
 * карточке кандидата объясняло вычтенные баллы (аналог dealBreaker-штрафа).
 */
export function applyTimezonePenalty(
  score: number,
  candidateCity: string | null | undefined,
  spec: CandidateSpec,
  breakdown?: AxisScoreResult | null,
): { score: number; breakdown: AxisScoreResult | null; applied: boolean; diffHours?: number } {
  const tz = spec.stopFactors?.timezone
  if (!tz?.enabled) return { score, breakdown: breakdown ?? null, applied: false }

  const candidateOffset = resolveCityUtcOffset(candidateCity)
  if (candidateOffset == null) return { score, breakdown: breakdown ?? null, applied: false }

  const diffHours = Math.abs(candidateOffset - tz.baseUtcOffset)
  if (diffHours <= tz.maxDiffHours) return { score, breakdown: breakdown ?? null, applied: false }

  const penalty = Math.max(0, Math.min(100, tz.penalty))
  const nextScore = Math.max(0, score - penalty)

  const sign = candidateOffset > tz.baseUtcOffset ? "+" : "−"
  const penaltyEntry: PenaltyScore = {
    text:      "Часовой пояс",
    magnitude: penalty,
    triggered: true,
    applied:   penalty,
    evidence:  `${sign}${diffHours} ч от вашего пояса (UTC+${tz.baseUtcOffset}) → −${penalty}`,
  }

  const nextBreakdown: AxisScoreResult | null = breakdown
    ? { ...breakdown, score: nextScore, penalties: [...breakdown.penalties, penaltyEntry] }
    : null

  return { score: nextScore, breakdown: nextBreakdown, applied: true, diffHours }
}
