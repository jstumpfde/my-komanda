// #15-phase2..6: единый Claude-клиент для AI-чат-бота.
// Использует SDK + claude-proxy URL (как остальные эндпоинты проекта).
// Retry: 3 попытки с exp backoff, таймаут 30 сек.

import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { AI_MODEL_MAIN, AI_MODEL_FAST } from "@/lib/ai/models"

const HAIKU  = AI_MODEL_FAST
const SONNET = AI_MODEL_MAIN

let _client: Anthropic | null = null
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ baseURL: getClaudeApiUrl() })
  return _client
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("ai_timeout_30s")), 30_000)),
      ])
    } catch (e) {
      last = e
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)))
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

async function call(model: string, prompt: string, system?: string, maxTokens = 1500): Promise<string> {
  return withRetry(async () => {
    const resp = await client().messages.create({
      model,
      max_tokens: maxTokens,
      thinking: { type: "disabled" }, // Sonnet 5: без поля включился бы adaptive (см. lib/ai/models.ts)
      system,
      messages: [{ role: "user", content: prompt }],
    })
    const block = resp.content[0]
    return block?.type === "text" ? block.text : ""
  })
}

export const callClaudeHaiku  = (prompt: string, system?: string, maxTokens = 800)  => call(HAIKU, prompt, system, maxTokens)
export const callClaudeSonnet = (prompt: string, system?: string, maxTokens = 3000) => call(SONNET, prompt, system, maxTokens)

// Вариант с полной историей сообщений (Фаза 1 «бот прозревает») — Executor
// видит предыдущие реплики диалога, а не только текущее сообщение.
export type ChatTurn = { role: "user" | "assistant"; content: string }

async function callMessages(
  model: string, messages: ChatTurn[], system?: string, maxTokens = 1500,
): Promise<string> {
  return withRetry(async () => {
    const resp = await client().messages.create({
      model,
      max_tokens: maxTokens,
      thinking: { type: "disabled" }, // Sonnet 5: без поля включился бы adaptive (см. lib/ai/models.ts)
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })
    const block = resp.content[0]
    return block?.type === "text" ? block.text : ""
  })
}

export const callClaudeSonnetMessages = (messages: ChatTurn[], system?: string, maxTokens = 3000) =>
  callMessages(SONNET, messages, system, maxTokens)

// ── Варианты с возвратом usage (для учёта токенов) ────────────────────────────
// Используются там, где нужно fire-and-forget addVacancyTokens.

export interface WithUsageResult {
  text:  string
  usage: { input_tokens: number; output_tokens: number }
}

async function callWithUsage(model: string, prompt: string, system?: string, maxTokens = 1500): Promise<WithUsageResult> {
  return withRetry(async () => {
    const resp = await client().messages.create({
      model,
      max_tokens: maxTokens,
      thinking: { type: "disabled" }, // Sonnet 5: без поля включился бы adaptive (см. lib/ai/models.ts)
      system,
      messages: [{ role: "user", content: prompt }],
    })
    const block = resp.content[0]
    return {
      text:  block?.type === "text" ? block.text : "",
      usage: { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens },
    }
  })
}

async function callMessagesWithUsage(
  model: string, messages: ChatTurn[], system?: string, maxTokens = 1500,
): Promise<WithUsageResult> {
  return withRetry(async () => {
    const resp = await client().messages.create({
      model,
      max_tokens: maxTokens,
      thinking: { type: "disabled" }, // Sonnet 5: без поля включился бы adaptive (см. lib/ai/models.ts)
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })
    const block = resp.content[0]
    return {
      text:  block?.type === "text" ? block.text : "",
      usage: { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens },
    }
  })
}

export const callClaudeHaikuWithUsage  = (prompt: string, system?: string, maxTokens = 800)  => callWithUsage(HAIKU, prompt, system, maxTokens)
export const callClaudeSonnetMessagesWithUsage = (messages: ChatTurn[], system?: string, maxTokens = 3000) => callMessagesWithUsage(SONNET, messages, system, maxTokens)
