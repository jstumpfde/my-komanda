/**
 * Здоровье внешних AI/STT-провайдеров (порт call-agent lib/provider-health.ts) —
 * детект перманентных ошибок OpenAI (квота/auth) через дешёвый probe-запрос,
 * баннер на дашборде + Telegram-алерт владельцу платформы при деградации/
 * восстановлении.
 *
 * ВЫБОР ХРАНЕНИЯ (план, п.5): статус провайдера — ПЛАТФОРМЕННЫЙ, не per-company
 * (OpenAI-ключ и Yandex STT — общие для всей инсталляции env-переменные, см.
 * lib/ai-rop/transcribe.ts/analyzer через ai-provider.ts; деградация касается
 * ВСЕХ компаний разом). Простое решение: platform_settings (lib/platform/
 * settings.ts::getPlatformSetting/setPlatformSetting), НЕ rop_settings —
 * несмотря на то, что RopSettingsJson.providerHealth зарезервировано про запас.
 *
 * Алерт — Telegram владельцу платформы. Канал берётся из platform_settings
 * (ключ AI_ROP_ALERT_KEY = {chatId}), НЕ ALERT_TG_* env (план, п.5: платформенные
 * per-tenant секреты не читаем из env внутри lib/ai-rop/*; chat_id платформенного
 * владельца — тоже настройка, не хардкод/env).
 */
import { getPlatformSetting, setPlatformSetting } from "@/lib/platform/settings"
import { sendTelegramAlert } from "@/lib/notifications/telegram"
import type {
  RopProviderHealthHooks,
  RopProviderHealthStatus,
  RopProviderProbeResult,
} from "./types"

const PROVIDER_HEALTH_KEY = "ai_rop_provider_health"
/** platform_settings-ключ с получателем алертов: { chatId: string }. Настраивается в /admin/platform (фаза 5, не эта зона). */
export const AI_ROP_ALERT_KEY = "ai_rop_provider_alert"

interface AlertRecipient {
  chatId?: string
}

/**
 * Дешёвый probe к OpenAI: POST /chat/completions с max_tokens:1 — маленькое
 * тело, ответ (в т.ч. 429 insufficient_quota) приходит целиком, не обрывается
 * как multipart-загрузка аудио (см. transcribe.ts docblock про этот баг).
 */
export async function probeOpenAiHealth(): Promise<RopProviderProbeResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return { ok: false, kind: "auth", message: "OPENAI_API_KEY не задан" }

  const baseURL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "")
  const model = process.env.OPENAI_MODEL_PROBE?.trim() || "gpt-4o-mini"

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      signal: controller.signal,
    })
    const text = await res.text().catch(() => "")

    if (res.status === 200) return { ok: true, kind: "ok", httpStatus: 200 }

    const lower = text.toLowerCase()
    if (res.status === 429 && (lower.includes("insufficient_quota") || lower.includes("exceeded your current quota"))) {
      return { ok: false, kind: "quota", httpStatus: 429, message: text.slice(0, 300) }
    }
    if (res.status === 401) return { ok: false, kind: "auth", httpStatus: 401, message: text.slice(0, 300) }
    return { ok: false, kind: "network", httpStatus: res.status, message: text.slice(0, 300) }
  } catch (e) {
    return { ok: false, kind: "network", message: (e as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

async function sendOwnerAlert(text: string): Promise<void> {
  try {
    const recipient = await getPlatformSetting<AlertRecipient>(AI_ROP_ALERT_KEY)
    if (!recipient?.chatId) return
    await sendTelegramAlert(recipient.chatId, text)
  } catch (e) {
    console.warn("[ai-rop/provider-health] sendOwnerAlert failed:", (e as Error).message)
  }
}

/** Сохранить статус провайдера + алерт ТОЛЬКО на переходе в деградацию (ok→не-ok), не на каждый сбой. */
export async function setProviderHealth(h: RopProviderHealthStatus): Promise<void> {
  const prev = await getProviderHealth()
  await setPlatformSetting(PROVIDER_HEALTH_KEY, h)

  const wasOk = !prev || prev.status === "ok"
  if (h.status !== "ok" && wasOk) {
    const label =
      h.status === "quota" ? "квота/биллинг исчерпаны" : h.status === "auth" ? "ключ недействителен (auth)" : "провайдер недоступен (сеть)"
    await sendOwnerAlert(
      `🔴 AI-РОП: разбор звонков ОСТАНОВЛЕН.\n` +
        `Провайдер «${h.provider}»: ${label}.\n` +
        (h.message ? `${h.message.slice(0, 200)}\n` : "") +
        `Звонки копятся в очереди — пополните баланс / проверьте ключ. Как заработает — придёт «возобновлён».`
    )
  }
}

/** Прочитать статус провайдера. null — если ещё ни разу не записывали. */
export async function getProviderHealth(): Promise<RopProviderHealthStatus | null> {
  return getPlatformSetting<RopProviderHealthStatus>(PROVIDER_HEALTH_KEY)
}

/** Если статус деградировавший — сброс в "ok" + алерт о восстановлении. Вызывается при первой успешной транскрипции/AI-вызове. */
export async function clearProviderHealthIfDegraded(): Promise<void> {
  const current = await getProviderHealth()
  if (current && current.status !== "ok") {
    await setPlatformSetting(PROVIDER_HEALTH_KEY, {
      status: "ok",
      provider: current.provider,
      message: "Провайдер снова доступен",
      detectedAt: new Date().toISOString(),
    } as RopProviderHealthStatus)
    await sendOwnerAlert(`🟢 AI-РОП: провайдер «${current.provider}» снова доступен — разбор звонков возобновлён, очередь разбирается.`)
  }
}

/** Готовый набор колбэков для transcribe.ts/ai-provider.ts (RopProviderHealthHooks из types.ts). */
export const ropProviderHealthHooks: RopProviderHealthHooks = {
  probeOpenAiHealth,
  setProviderHealth,
  clearProviderHealthIfDegraded,
}
