/**
 * Абстракция AI-провайдера с tool-use для модуля AI-РОП (порт call-agent
 * lib/ai-provider.ts), адаптирована под платформенные конвенции:
 *
 *  - Anthropic — ПЕРВИЧНЫЙ провайдер (было OpenAI в call-agent). SDK
 *    @anthropic-ai/sdk с baseURL=getClaudeApiUrl() (lib/claude-proxy — обход
 *    геоблока), как lib/ai/client.ts. thinking:{type:"disabled"} ОБЯЗАТЕЛЕН
 *    (Sonnet 5 иначе включает adaptive thinking — см. lib/ai/models.ts).
 *  - OpenAI — fallback ТОЛЬКО при перманентной ошибке Anthropic (квота/auth).
 *    SDK 'openai' не установлен (правило проекта — не добавлять пакеты без
 *    разрешения) → сырой fetch, как lib/ai-rop/transcribe.ts::transcribeWhisper.
 *  - Модели: premium=AI_MODEL_MAIN, fast=AI_MODEL_FAST (lib/ai/models.ts).
 *    modelOverride — per-company (rop_settings.analysisModel): либо голый
 *    id модели Anthropic ("claude-sonnet-5" — без ":", это провайдер по
 *    умолчанию), либо "provider:model" явно.
 *  - После КАЖДОГО вызова: logAiCall (ai_usage_log — денежный учёт по всей
 *    платформе) + recordUsage (rop_usage_events — бюджет-гард модуля).
 */
import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { AI_MODEL_MAIN, AI_MODEL_FAST } from "@/lib/ai/models"
import { logAiCall } from "@/lib/ai/usage-log"
import { checkBudget, recordUsage } from "./budget"
import type { RopUsageKind } from "./types"

export type AiProvider = "anthropic" | "openai"

export interface ToolCallArgs {
  /** Имя tool — совпадает для обоих провайдеров (input_schema / function.parameters). */
  toolName: string
  /** JSON Schema параметров tool. */
  schema: Record<string, unknown>
  system: string
  /** User prompt (динамическая часть — меняется на каждый вызов, транскрипт/контекст сделки). */
  user: string
  /**
   * Статичный контекст, идущий ПЕРЕД user (чек-лист скрипта + глоссарий) — одинаковый
   * для серии звонков одного скрипта/компании. Anthropic: кэшируется отдельным
   * content-блоком (cache_control: ephemeral), экономит input-токены на повторных
   * вызовах с тем же чек-листом. OpenAI: просто склеивается с user (там нет
   * cache_control в этом раритетном fetch-клиенте — кэш прогревается по префиксу сам).
   */
  cacheableContext?: string
  modelTier?: "premium" | "fast"
  maxTokens?: number
  /** Переопределить провайдера на этот вызов (иначе — getActiveProvider()). */
  provider?: AiProvider
  /** companyId — для бюджет-гарда (rop_usage_events) и логирования (ai_usage_log). */
  companyId?: string
  /** rop_calls.id — привязка usage-события к конкретному звонку. */
  callId?: string | null
  /** action для ai_usage_log, напр. 'rop_analyze' | 'rop_detect_product' | 'rop_discrepancy' | 'rop_cluster'. */
  action: string
  /** Per-company переопределение модели (rop_settings.analysisModel): "model" ИЛИ "provider:model". */
  modelOverride?: string | null
}

export interface ToolCallResult<T> {
  result: T
  rawResponseJson: string
  provider: AiProvider
  model: string
  inputTokens: number
  outputTokens: number
}

/** Активный провайдер по умолчанию (ENV AI_ROP_PROVIDER, дефолт — anthropic, платформенный primary). */
export function getActiveProvider(): AiProvider {
  const v = process.env.AI_ROP_PROVIDER?.trim().toLowerCase()
  if (v === "openai") return "openai"
  return "anthropic"
}

const MODEL_MAP: Record<AiProvider, { premium: string; fast: string }> = {
  anthropic: { premium: AI_MODEL_MAIN, fast: AI_MODEL_FAST },
  openai: {
    premium: process.env.OPENAI_MODEL_PREMIUM?.trim() || "gpt-4o",
    fast: process.env.OPENAI_MODEL_FAST?.trim() || "gpt-4o-mini",
  },
}

/**
 * Разбирает modelOverride. "provider:model" → явный провайдер+модель.
 * Голый id модели (без ":") → считаем что это Anthropic-модель (платформенный
 * дефолт), напр. rop_settings.analysisModel="claude-opus-4-8".
 */
export function resolveModel(
  modelOverride: string | null | undefined,
  fallbackProvider: AiProvider,
  fallbackTier: "premium" | "fast"
): { provider: AiProvider; model: string } {
  const raw = (modelOverride ?? "").trim()
  if (raw) {
    const colonIdx = raw.indexOf(":")
    if (colonIdx > 0) {
      const providerStr = raw.slice(0, colonIdx).trim().toLowerCase()
      const modelStr = raw.slice(colonIdx + 1).trim()
      if ((providerStr === "openai" || providerStr === "anthropic") && modelStr) {
        return { provider: providerStr as AiProvider, model: modelStr }
      }
      console.warn(`[ai-rop/ai-provider] невалидный modelOverride: '${raw}', используем дефолт`)
    } else {
      return { provider: "anthropic", model: raw }
    }
  }
  return { provider: fallbackProvider, model: MODEL_MAP[fallbackProvider][fallbackTier] }
}

/**
 * Перманентная ошибка провайдера — квота/биллинг исчерпаны или ключ невалиден.
 * Ретраить на том же провайдере бессмысленно — уходим на запасного.
 */
function isPermanentProviderError(e: unknown): boolean {
  const err = e as { status?: number; message?: string }
  const status = err.status ?? 0
  const msg = (err.message ?? "").toLowerCase()
  return (
    status === 401 ||
    status === 403 ||
    /insufficient_quota|exceeded your current quota|credit balance is too low|billing|invalid_api_key|invalid x-api-key|authentication_error/.test(msg)
  )
}

function usageKindFor(provider: AiProvider): RopUsageKind {
  return provider === "anthropic" ? "anthropic_tokens" : "openai_chat_tokens"
}

/**
 * Вызывает LLM с принудительным tool-use — гарантированный структурированный JSON.
 * Retry: до 3 попыток для 429/529/overloaded, backoff 3s → 9s → 27s (+ jitter).
 * Fallback: перманентная ошибка (квота/биллинг/auth) → переключение на второго
 * провайдера, если у него есть ключ. Budget: checkBudget ДО запроса, recordUsage
 * + logAiCall ПОСЛЕ успешного.
 */
export async function callWithTool<T = unknown>(args: ToolCallArgs): Promise<ToolCallResult<T>> {
  const fallbackProvider = args.provider || getActiveProvider()
  const tier = args.modelTier || "premium"
  const primary = resolveModel(args.modelOverride, fallbackProvider, tier)

  const runOnProvider = async (provider: AiProvider, model: string): Promise<ToolCallResult<T>> => {
    if (args.companyId) {
      await checkBudget(args.companyId, usageKindFor(provider))
    }

    const maxAttempts = 3
    let lastErr: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const out = provider === "anthropic" ? await callAnthropic<T>(args, model) : await callOpenAi<T>(args, model)

        if (args.companyId) {
          const kind = usageKindFor(provider)
          const total = out.inputTokens + out.outputTokens
          await recordUsage(args.companyId, kind, total, args.callId ?? undefined)
          await logAiCall({
            tenantId: args.companyId,
            action: args.action,
            // Голый model id — computeCostUsd матчит его по прайс-таблице;
            // с префиксом "anthropic:" costUsd молча оставался пустым.
            model: out.model,
            inputTokens: out.inputTokens,
            outputTokens: out.outputTokens,
          })
        }
        return out
      } catch (e) {
        lastErr = e
        const err = e as { status?: number; message?: string }
        const status = err.status ?? 0
        const msg = err.message ?? ""
        // Перманентную ошибку не ретраим здесь — уйдём на fallback снаружи.
        if (isPermanentProviderError(e)) throw e
        const isRetryable = status === 429 || status === 529 || /overloaded/i.test(msg) || /rate.?limit/i.test(msg)
        if (!isRetryable || attempt === maxAttempts) throw e
        const baseDelay = 3000 * Math.pow(3, attempt - 1)
        const jitter = Math.floor(Math.random() * 1000)
        const delayMs = baseDelay + jitter
        console.warn(
          `[ai-rop/ai-provider:${provider}] попытка ${attempt}/${maxAttempts} не удалась (${status} ${msg.slice(0, 80)}), retry через ${delayMs}мс`
        )
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
    throw lastErr
  }

  try {
    return await runOnProvider(primary.provider, primary.model)
  } catch (e) {
    if (!isPermanentProviderError(e)) throw e
    const altProvider: AiProvider = primary.provider === "anthropic" ? "openai" : "anthropic"
    const altKeyPresent = altProvider === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY
    if (!altKeyPresent) throw e
    const altModel = MODEL_MAP[altProvider][tier]
    console.warn(`[ai-rop/ai-provider] ${primary.provider} недоступен (квота/биллинг/auth) → fallback на ${altProvider}:${altModel}`)
    return await runOnProvider(altProvider, altModel)
  }
}

// ─── Anthropic implementation ─────────────────────────────

let _anthropicClient: Anthropic | null = null
function anthropicClient(): Anthropic {
  if (!_anthropicClient) _anthropicClient = new Anthropic({ baseURL: getClaudeApiUrl(), timeout: 90_000 })
  return _anthropicClient
}

async function callAnthropic<T>(args: ToolCallArgs, model: string): Promise<ToolCallResult<T>> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY не задан")
  const client = anthropicClient()

  // Prompt caching: tool-schema и system-промпт одинаковы на КАЖДОМ вызове
  // (не зависят от звонка) — помечаем их cache_control:ephemeral, чтобы Anthropic
  // закэшировал префикс запроса и второй/третий/... вызов подряд платил меньше
  // за input вместо полной цены (порог кэша — 1024-4096 токенов префикса в
  // зависимости от модели; если текста меньше, кэш просто не создастся).
  const tool: Anthropic.Tool = {
    name: args.toolName,
    description: "Сохранить структурированный результат",
    input_schema: args.schema as Anthropic.Tool["input_schema"],
    cache_control: { type: "ephemeral" },
  }

  // cacheableContext (чек-лист + глоссарий) — отдельный кэшируемый блок ПЕРЕД
  // динамическим user-текстом (транскрипт/контекст сделки меняются на каждый звонок).
  const userContent: Anthropic.MessageParam["content"] = args.cacheableContext
    ? [
        { type: "text", text: args.cacheableContext, cache_control: { type: "ephemeral" } },
        { type: "text", text: args.user },
      ]
    : args.user

  const msg = await client.messages.create({
    model,
    max_tokens: args.maxTokens ?? 4000,
    thinking: { type: "disabled" }, // Sonnet 5: без поля включился бы adaptive thinking
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    tools: [tool],
    tool_choice: { type: "tool", name: args.toolName },
    messages: [{ role: "user", content: userContent }],
  })

  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === args.toolName
  )
  if (!toolUse) throw new Error(`Anthropic не вызвал tool ${args.toolName}`)

  // Диагностика prompt-caching — видно в логах, создался ли кэш и сколько
  // input-токенов пришло из кэша (cache_read) вместо полной цены.
  const usage = msg.usage as unknown as {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  if (usage?.cache_creation_input_tokens || usage?.cache_read_input_tokens) {
    console.log(
      `[ai-rop/ai-provider:anthropic] prompt-cache: created=${usage.cache_creation_input_tokens ?? 0} read=${usage.cache_read_input_tokens ?? 0} input=${usage.input_tokens ?? 0}`
    )
  }

  return {
    result: toolUse.input as T,
    rawResponseJson: JSON.stringify(toolUse.input),
    provider: "anthropic",
    model,
    inputTokens: msg.usage?.input_tokens ?? 0,
    outputTokens: msg.usage?.output_tokens ?? 0,
  }
}

// ─── OpenAI implementation (сырой fetch, без SDK) ────────────────────────────

async function callOpenAi<T>(args: ToolCallArgs, model: string): Promise<ToolCallResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY не задан")
  const baseURL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "")

  // OpenAI не даёт явный cache_control API в этом сыром fetch-клиенте — просто
  // склеиваем cacheableContext (чек-лист+глоссарий) с user-текстом, поведение
  // как раньше (без regressions); кэш прогревается автоматически по префиксу.
  const openAiUser = args.cacheableContext ? `${args.cacheableContext}\n\n${args.user}` : args.user

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("OpenAI timeout 90s")), 90_000)
  let res: Response
  try {
    res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: args.maxTokens ?? 4000,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: openAiUser },
        ],
        tools: [
          {
            type: "function",
            function: { name: args.toolName, description: "Сохранить структурированный результат", parameters: args.schema },
          },
        ],
        tool_choice: { type: "function", function: { name: args.toolName } },
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const err = new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 300)}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }

  const data = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string
      message?: { tool_calls?: Array<{ type: string; function: { name: string; arguments: string } }> }
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const choice = data.choices?.[0]
  const toolCall = choice?.message?.tool_calls?.[0]
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== args.toolName) {
    throw new Error(`OpenAI не вызвал tool ${args.toolName}`)
  }

  let parsed: T
  try {
    parsed = JSON.parse(toolCall.function.arguments) as T
  } catch (e) {
    const hint =
      choice?.finish_reason === "length"
        ? "Ответ обрезан по лимиту max_tokens — увеличьте maxTokens в callWithTool"
        : "Возможно модель вернула битый JSON — попробуйте retry"
    throw new Error(
      `OpenAI вернул невалидный JSON в tool ${args.toolName} (finish_reason=${choice?.finish_reason}). ${hint}. ${(e as Error).message}`
    )
  }

  return {
    result: parsed,
    rawResponseJson: toolCall.function.arguments,
    provider: "openai",
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  }
}
