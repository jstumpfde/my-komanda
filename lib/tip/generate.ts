// Вызов Claude для генерации отчёта «Типология».
// Переиспользует паттерн платформы (lib/ai/client.ts + lib/ai/models.ts):
// Anthropic SDK с baseURL из getClaudeApiUrl() (proxy для RU), модель из
// центрального реестра, thinking отключён (обязательно для Sonnet 5, иначе
// включается adaptive thinking и жрёт max_tokens), retry с exp backoff.
// Стоимость вызова считается через computeCostUsd (та же формула, что и
// у остальных AI-эндпоинтов платформы).

import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { AI_MODEL_MAIN, computeCostUsd } from "@/lib/ai/models"
import type { TipPrompt } from "./prompt"
import type { TipDepth } from "./contexts"

let _client: Anthropic | null = null
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ baseURL: getClaudeApiUrl() })
  return _client
}

// max_tokens по глубине разбора. Подняты 07.07: с правилами конкретики
// detailed упирался ровно в 6000 и обрезался посреди «Карты развития».
const MAX_TOKENS_BY_DEPTH: Record<TipDepth, number> = {
  short: 3500,
  detailed: 10000,
  full: 16000,
}

function maxTokensForDepth(depth: string): number {
  return MAX_TOKENS_BY_DEPTH[depth as TipDepth] ?? MAX_TOKENS_BY_DEPTH.detailed
}

// Таймаут зависит от глубины: длинные разборы (6–12k токенов вывода) через
// прокси легально идут по несколько минут — 60с хватало только short
// (инцидент 07.07: detailed стабильно падал в tip_ai_timeout_60s).
const TIMEOUT_BY_DEPTH_MS: Record<TipDepth, number> = {
  short: 120_000,
  detailed: 300_000,
  full: 480_000,
}

function timeoutForDepth(depth: string): number {
  return TIMEOUT_BY_DEPTH_MS[depth as TipDepth] ?? TIMEOUT_BY_DEPTH_MS.detailed
}

// Меньше попыток для длинных глубин: worst-case (таймаут × попытки) должен
// оставаться НИЖЕ реапера зависших прогонов (service.ts STALE_RUN_MINUTES=20),
// иначе реапер вернёт прогон на баланс, а живой результат будет отброшен.
const ATTEMPTS_BY_DEPTH: Record<TipDepth, number> = {
  short: 3,
  detailed: 2,
  full: 2,
}

function attemptsForDepth(depth: string): number {
  return ATTEMPTS_BY_DEPTH[depth as TipDepth] ?? 2
}

async function withRetry<T>(fn: () => Promise<T>, timeoutMs: number, attempts = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error(`tip_ai_timeout_${Math.round(timeoutMs / 1000)}s`)), timeoutMs),
        ),
      ])
    } catch (e) {
      last = e
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)))
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

export interface GenerateTipReportParams {
  prompt: TipPrompt
  depth: string
  /** Переопределение модели — по умолчанию AI_MODEL_MAIN (claude-sonnet-5). */
  model?: string
}

export interface TipReportResult {
  markdown: string
  tokensIn: number
  tokensOut: number
  /** null, если модель не найдена в прайс-таблице (не выдумываем цену). */
  costUsd: number | null
  model: string
}

/**
 * Генерирует markdown-отчёт «Типология» через Claude. Не трогает БД —
 * логирование usage/cost делает вызывающий слой (там, где есть доступ к БД).
 */
export async function generateTipReport(params: GenerateTipReportParams): Promise<TipReportResult> {
  const model = params.model ?? AI_MODEL_MAIN
  const maxTokens = maxTokensForDepth(params.depth)

  return withRetry(async () => {
    const resp = await client().messages.create({
      model,
      max_tokens: maxTokens,
      thinking: { type: "disabled" }, // Sonnet 5: без поля включился бы adaptive thinking
      system: params.prompt.system,
      messages: [{ role: "user", content: params.prompt.user }],
    })

    const block = resp.content[0]
    const markdown = block?.type === "text" ? block.text : ""
    const tokensIn = resp.usage.input_tokens
    const tokensOut = resp.usage.output_tokens
    const costUsd = computeCostUsd(model, tokensIn, tokensOut)

    return { markdown, tokensIn, tokensOut, costUsd, model }
  }, timeoutForDepth(params.depth), attemptsForDepth(params.depth))
}
