/**
 * scripts/regen-grouped-portrait.ts
 *
 * Перегенерация «Портрета» (Candidate Spec) для ОДНОЙ вакансии так, чтобы
 * «Что хотим видеть» (niceToHave) и «Не подходит» (dealBreakers) были не
 * плоским списком гранулярных навыков, а 3-5 СГРУППИРОВАННЫМИ НАПРАВЛЕНИЯМИ.
 *
 * Каждое направление кодируется текстом:
 *   "Заголовок направления, навык1, навык2, навык3"
 * Редактор Портрета (components/vacancies/spec-editor.tsx, GoodEditor) делит
 * текст niceToHave по ЗАПЯТОЙ: parts[0] = заголовок (главный термин, рендерится
 * текстом), parts[1..] = чипы-навыки (removable). Поэтому такой формат
 * автоматически отрисуется как «Заголовок направления + чипы навыков».
 * (dealBreakers рендерятся цельной строкой, без чипов — там просто фразы.)
 *
 * Что делает скрипт:
 *  1. Берёт описание вакансии, зовёт Claude НОВЫМ промптом (см. ниже —
 *     инструкция группировки ВСТРОЕНА в скрипт, чтобы вывод был сгруппирован
 *     независимо от того, задеплоен ли новый prompt-файл на проде).
 *  2. Маппит результат: niceToHave ≤5 направлений (importance "important"),
 *     dealBreakers ≤5 (hard:false — мягко, как applySuggestion).
 *  3. ОЧИЩАЕТ portraitRequiredSkills / portraitNiceSkills / portraitKnockouts
 *     (старые плоские навыки — иначе в UI набегает 14).
 *  4. Сохраняет idealProfile/inviteLetter/resumeThresholds/всё прочее как есть.
 *  5. CandidateSpecSchema.safeParse ПЕРЕД сохранением. saveSpec под валидным uuid.
 *
 * НЕ запускает разбор кандидатов, НЕ трогает auto_processing / v2_runtime /
 * скоринг. Только перезаписывает запись vacancy_specs.
 *
 * Запуск:
 *   pnpm exec tsx scripts/regen-grouped-portrait.ts
 *   pnpm exec tsx scripts/regen-grouped-portrait.ts --dry-run   (не сохранять)
 *
 * Требует env: DATABASE_URL, ANTHROPIC_API_KEY (+ CLAUDE_PROXY_URL опц.).
 */

import { eq } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db, pgClient } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import { getSpec, saveSpec } from "@/lib/core/spec/store"
import { buildSpecFromLegacy } from "@/lib/core/spec/from-legacy"
import { CandidateSpecSchema, type CandidateSpec, type NiceImportance } from "@/lib/core/spec/types"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

// ─── Константы задачи ─────────────────────────────────────────────────────────

const VACANCY_ID = "5ae8f734-b468-46fc-88f9-69ed662879ed"
const USER_ID    = "66c2657b-2cc3-4cd9-91f9-b766349abf0d" // валидный uuid пользователя
const MAX_DIRECTIONS = 5
const MAX_DEAL       = 5

const DRY_RUN = process.argv.slice(2).includes("--dry-run")

// ─── Сборка описания вакансии в текст (как в suggest/route.ts) ────────────────

function descriptionToText(descJson: unknown, fallback: string | null): string {
  if (typeof fallback === "string" && fallback.trim()) return fallback
  if (!descJson || typeof descJson !== "object") return ""
  const obj = descJson as Record<string, unknown>
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.trim()) parts.push(`${k}: ${v}`)
    else if (v && typeof v === "object") {
      try { parts.push(`${k}: ${JSON.stringify(v)}`) } catch { /* ignore */ }
    }
  }
  return parts.join("\n")
}

// ─── Промпт со ВСТРОЕННОЙ инструкцией группировки (deploy-независимо) ──────────

function buildGroupedPrompt(args: {
  vacancyTitle: string
  vacancyIndustry: string | null
  vacancyDescription: string
}): string {
  const { vacancyTitle, vacancyIndustry, vacancyDescription } = args
  return `Ты помощник HR. Прочитай описание вакансии и выдели требования к кандидатам
СГРУППИРОВАННЫМИ НАПРАВЛЕНИЯМИ (не плоским списком гранулярных навыков).

ВАКАНСИЯ: ${vacancyTitle}
ИНДУСТРИЯ: ${vacancyIndustry ?? "не указана"}

ОПИСАНИЕ:
${vacancyDescription}

Верни JSON строго по схеме (без markdown-блоков, без префиксов):
{
  "nice_to_have":  ["..."],
  "deal_breakers": ["..."],
  "ideal_profile": "..."
}

ГЛАВНЫЙ ПРИНЦИП: 3-5 СГРУППИРОВАННЫХ НАПРАВЛЕНИЙ в nice_to_have. Каждое
направление = одна область компетенций, внутри неё — смежные навыки.

ФОРМАТ ПУНКТА nice_to_have (КРИТИЧЕСКИ ВАЖНО для отрисовки чипов в UI):
"Заголовок направления, навык1, навык2, навык3"
— ПЕРВОЕ до первой запятой = короткий заголовок направления (1-3 слова),
  далее через запятую — смежные навыки этого направления (они станут чипами).
Примеры для роли «ассистент маркетолога»:
  "Тексты, SEO-статьи, посты, упаковка продукта, email-рассылки, лендинги"
  "Визуал, картинки, базовый дизайн, AI-генерация изображений"
  "Видео, монтаж роликов, нарезки, субтитры"
  "СММ и продвижение, Telegram, Max, ведение каналов, контент-план"
  "Продажи, работа с возражениями, общение с клиентами"

ПРАВИЛА:
- 3-5 направлений в nice_to_have (не больше 5).
- Заголовок направления — короткий и понятный (Тексты / Визуал / Видео / Продажи).
- Внутри направления — 2-6 смежных навыков, релевантных именно ЭТОЙ вакансии
  (бери из описания, не выдумывай лишнего).
- Длина одного пункта ≤ 180 символов. НЕ дроби одно направление на несколько пунктов.
- deal_breakers — 3-5 что точно НЕ подходит (цельные фразы, заголовок не нужен):
  "Только B2C/розница без B2B-опыта", "Нет опыта в продажах вообще".
- ideal_profile — 1-2 предложения, кто реально нужен (≤ 500 символов).
- НЕ дублируй stop-factors (город/возраст/формат — отдельно).

ВАЖНО: возвращай ТОЛЬКО валидный JSON, без комментариев.`
}

// ─── Парс JSON-ответа модели ──────────────────────────────────────────────────

interface GroupedResult {
  nice_to_have:  string[]
  deal_breakers: string[]
  ideal_profile: string
}

function cleanArray(input: unknown, maxItems: number, maxLen = 200): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const item of input) {
    if (typeof item !== "string") continue
    const t = item.trim()
    if (!t || t.length > maxLen) continue
    out.push(t)
    if (out.length >= maxItems) break
  }
  return out
}

function parseModelJson(text: string): GroupedResult {
  // Снимаем возможные ```json … ``` обёртки и берём первый {...}
  let s = text.trim()
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
  const start = s.indexOf("{")
  const end   = s.lastIndexOf("}")
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  const obj = JSON.parse(s) as Record<string, unknown>
  return {
    nice_to_have:  cleanArray(obj.nice_to_have, MAX_DIRECTIONS, 180),
    deal_breakers: cleanArray(obj.deal_breakers, MAX_DEAL, 200),
    ideal_profile: typeof obj.ideal_profile === "string" ? obj.ideal_profile.slice(0, 500) : "",
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[regen-grouped-portrait] вакансия ${VACANCY_ID}${DRY_RUN ? " (DRY-RUN)" : ""}`)

  const [vacancy] = await db
    .select({
      id:              vacancies.id,
      title:           vacancies.title,
      description:     vacancies.description,
      descriptionJson: vacancies.descriptionJson,
      companyId:       vacancies.companyId,
    })
    .from(vacancies)
    .where(eq(vacancies.id, VACANCY_ID))
    .limit(1)
  if (!vacancy) { throw new Error("Вакансия не найдена") }

  const [company] = await db
    .select({ industry: companies.industry })
    .from(companies)
    .where(eq(companies.id, vacancy.companyId))
    .limit(1)

  const descText = descriptionToText(vacancy.descriptionJson, vacancy.description)
  if (!descText.trim()) { throw new Error("Описание вакансии пустое — нечего анализировать") }

  // Текущий Spec (сохраняем всё, что не трогаем). Если записи нет — строим из legacy,
  // чтобы не потерять пороги/письма.
  const currentSpec: CandidateSpec =
    (await getSpec(VACANCY_ID)) ?? buildSpecFromLegacy({
      requirementsJson:  null,
      descriptionJson:   (vacancy.descriptionJson ?? null) as Record<string, unknown> | null,
      aiProcessSettings: null,
      stopFactorsJson:   null,
      postDemoSettings:  null,
    })

  console.log(`[before] niceToHave=${currentSpec.niceToHave.length} dealBreakers=${currentSpec.dealBreakers.length} ` +
    `portraitRequiredSkills=${currentSpec.portraitRequiredSkills.length} ` +
    `portraitNiceSkills=${currentSpec.portraitNiceSkills.length} ` +
    `portraitKnockouts=${currentSpec.portraitKnockouts.length}`)

  // ── Генерация ──────────────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: getClaudeApiUrl() })
  const prompt = buildGroupedPrompt({
    vacancyTitle:       vacancy.title,
    vacancyIndustry:    company?.industry ?? null,
    vacancyDescription: descText,
  })
  const message = await anthropic.messages.create({
    model:      AI_MODEL_MAIN,
    thinking: { type: "disabled" },
    max_tokens: 1200,
    messages:    [{ role: "user", content: prompt }],
  })
  const rawText = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
  const result = parseModelJson(rawText)

  if (result.nice_to_have.length === 0) {
    throw new Error("Модель вернула пустой nice_to_have — прервано (Spec не тронут)")
  }

  // ── Маппинг в Spec ──────────────────────────────────────────────────────────
  const niceToHave = result.nice_to_have
    .slice(0, MAX_DIRECTIONS)
    .map(text => ({ text, importance: "important" as NiceImportance }))
  const dealBreakers = result.deal_breakers
    .slice(0, MAX_DEAL)
    .map(text => ({ text, hard: false }))

  const nextSpec: CandidateSpec = {
    ...currentSpec,
    // Контур «Портрет»: 🟢 не отсеивает → mustHave пуст.
    mustHave:     [],
    niceToHave,
    dealBreakers,
    idealProfile: result.ideal_profile || currentSpec.idealProfile,
    // Очищаем старые плоские навыки — иначе в UI набегает 14.
    portraitRequiredSkills: [],
    portraitNiceSkills:     [],
    portraitKnockouts:      [],
    // Всё прочее (resumeThresholds, anketaThresholds, inviteLetter,
    // rejectLetter, offHoursLetter, stopFactors, scoringWeights, customCriteria,
    // botClarifyAmbiguous, weightMode, version, …) — как есть из currentSpec.
  }

  // ── Валидация ПЕРЕД сохранением ─────────────────────────────────────────────
  const parsed = CandidateSpecSchema.safeParse(nextSpec)
  if (!parsed.success) {
    console.error("[safeParse] FAILED:", JSON.stringify(parsed.error.flatten(), null, 2))
    throw new Error("CandidateSpecSchema.safeParse не прошёл — Spec НЕ сохранён")
  }
  const validSpec = parsed.data

  // ── Лог итоговых направлений ────────────────────────────────────────────────
  console.log("\n=== ИТОГОВЫЕ НАПРАВЛЕНИЯ (niceToHave) ===")
  validSpec.niceToHave.forEach((n, i) => {
    const text = typeof n === "string" ? n : n.text
    const parts = text.split(",").map(s => s.trim()).filter(Boolean)
    const head  = parts[0] ?? text
    const chips = parts.slice(1)
    console.log(`  ${i + 1}. [${head}] чипы: ${chips.length ? chips.join(" · ") : "—"}`)
  })
  console.log("\n=== НЕ ПОДХОДИТ (dealBreakers) ===")
  validSpec.dealBreakers.forEach((d, i) => {
    const text = typeof d === "string" ? d : d.text
    console.log(`  ${i + 1}. ${text}`)
  })

  const niceCount = validSpec.niceToHave.length
  const dealCount = validSpec.dealBreakers.length
  console.log(`\n[after] niceToHave=${niceCount} (≤10: ${niceCount <= 10 ? "OK" : "FAIL"}) ` +
    `dealBreakers=${dealCount} (≤10: ${dealCount <= 10 ? "OK" : "FAIL"}) ` +
    `portrait*Skills/Knockouts очищены: ` +
    `${validSpec.portraitRequiredSkills.length + validSpec.portraitNiceSkills.length + validSpec.portraitKnockouts.length === 0 ? "OK" : "FAIL"}`)

  if (niceCount > 10 || dealCount > 10) {
    throw new Error("Превышен лимит 10 — Spec НЕ сохранён")
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] saveSpec пропущен. Разбор кандидатов НЕ запускался.")
    return
  }

  await saveSpec(VACANCY_ID, validSpec, USER_ID)
  console.log("\n[saved] vacancy_specs обновлён. Разбор кандидатов НЕ запускался " +
    "(auto_processing/v2_runtime/скоринг не тронуты).")
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[regen-grouped-portrait] ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ })
    process.exit(1)
  })
