/**
 * Транскрипция аудио — порт call-agent lib/transcribe.ts. 152-ФЗ (трансграничная
 * передача ПДн): сырая речь с произнесёнными телефонами/именами клиента —
 * самый чувствительный канал, замаскировать его нельзя (маскирование текста
 * возможно только ПОСЛЕ расшифровки, см. maskPII в analyzer.ts — фаза 2b).
 *
 * Порядок провайдеров:
 *   1. Yandex SpeechKit (РФ) — ОСНОВНОЙ канал, если sttConfig.yandexApiKey задан.
 *   2. OpenAI Whisper (зарубеж) — ТОЛЬКО запасной, и только если Yandex упал И
 *      sttConfig.allowForeignSttFallback === true (default OFF, из rop_settings).
 *      Если fallback не разрешён — ошибка Yandex пробрасывается дальше (звонок
 *      уходит в retry), а НЕ тихо утекает в Whisper.
 *   3. Если yandexApiKey вообще не задан — сохраняем старое поведение (Whisper
 *      напрямую), но громко логируем риск несоответствия 152-ФЗ.
 *
 * БЫЛО: OpenAI SDK (`openai` npm-пакет). СТАЛО: сырой fetch + FormData —
 * пакет `openai` не установлен в my-komanda и правило проекта запрещает
 * добавлять новые npm-зависимости без явного разрешения Юрия (см.
 * AI-ROP-MODULE-PLAN-2026-07.md, открытый вопрос №1 — там речь про PDF/docx,
 * но тот же принцип применён и здесь: fetch справляется без SDK).
 *
 * БЫЛО: budget.checkBudget/recordUsage и provider-health читались из БД
 * напрямую внутри этого файла. СТАЛО: опциональные колбэки (RopUsageHooks,
 * RopProviderHealthHooks из types.ts) — реальная реализация подключается в
 * фазе 2b (lib/ai-rop/{budget,provider-health}.ts). Если колбэки не переданы —
 * шаги бюджет-гарда/баннера провайдера просто пропускаются (звонок всё равно
 * обрабатывается).
 */
import fs from "fs";
import path from "path";
import { transcribeYandex } from "./transcribe-yandex";
import { ProviderQuotaError, type RopProviderHealthHooks, type RopSttConfig, type RopUsageHooks } from "./types";

const WHISPER_MODEL = "whisper-1"; // у OpenAI это пока самая стабильная транскрипция

const MAX_ATTEMPTS = 4; // 4 попытки = 4 шанса CF Worker запуститься из дружелюбного региона
const BASE_DELAY_MS = 3000; // 3 сек, удваивается на каждой попытке

export interface TranscribeResult {
  text: string;
  language: string | null;
  segments: Array<{ start: number; end: number; text: string }>;
  model: string;
}

export interface TranscribeOptions {
  tenantId?: number;
  callId?: number;
  prompt?: string;
  /** Учёт расхода/бюджет-гард — БД-слой подключается в фазе 2b. */
  usage?: RopUsageHooks;
  /** Баннер статуса AI-провайдера — БД-слой подключается в фазе 2b. */
  health?: RopProviderHealthHooks;
}

export async function transcribeFile(
  filePath: string,
  sttConfig: RopSttConfig,
  opts: TranscribeOptions = {}
): Promise<TranscribeResult> {
  const yandexAvailable = !!sttConfig.yandexApiKey?.trim();

  if (yandexAvailable) {
    try {
      return await transcribeYandex(filePath, sttConfig, {
        tenantId: opts.tenantId,
        callId: opts.callId,
        usage: opts.usage,
      });
    } catch (e) {
      const allowForeign = sttConfig.allowForeignSttFallback;
      if (!allowForeign) {
        console.warn(
          `[ai-rop/transcribe] Yandex недоступен (${(e as Error).message}), foreign-fallback выключен (152-ФЗ) — задача не обработана`
        );
        throw e;
      }
      console.warn(
        `[ai-rop/transcribe] Yandex недоступен (${(e as Error).message}) → fallback на OpenAI Whisper (foreign-fallback разрешён для компании)`
      );
      return await transcribeWhisper(filePath, opts);
    }
  }

  // yandexApiKey не задан вообще — сохраняем текущее поведение (Whisper
  // напрямую), но явно светим риск несоответствия 152-ФЗ в логах.
  console.warn(
    "[ai-rop/transcribe] RopSttConfig.yandexApiKey не задан — аудио уходит напрямую в OpenAI Whisper (зарубеж); риск несоответствия 152-ФЗ (трансграничная передача ПДн)"
  );
  return await transcribeWhisper(filePath, opts);
}

/**
 * OpenAI Whisper через сырой fetch/FormData (без SDK, см. docblock файла).
 * OPENAI_API_KEY/OPENAI_BASE_URL читаются из env напрямую — это платформенный,
 * НЕ per-company уровень (см. план модуля, п.6): один зарубежный fallback-ключ
 * на всю инсталляцию, не настройка конкретной компании.
 */
async function transcribeWhisper(filePath: string, opts: TranscribeOptions = {}): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY не задан");
  if (!fs.existsSync(filePath)) throw new Error(`Файл записи не найден: ${filePath}`);

  // Бюджет-гард: проверяем лимит на минуты Whisper за месяц (колбэк, фаза 2b).
  if (opts.tenantId && opts.usage?.checkBudget) {
    await opts.usage.checkBudget("openai_seconds");
  }

  // OPENAI_BASE_URL — для прокси (Cloudflare Worker) обхода гео-блока РФ.
  const baseURL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const form = new FormData();
      const audioBuffer = fs.readFileSync(filePath);
      form.append("file", new Blob([audioBuffer]), path.basename(filePath));
      form.append("model", WHISPER_MODEL);
      form.append("language", "ru");
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");
      // prompt — контекст-подсказка Whisper (до ~224 токенов): правильные
      // написания названий компании/брендов и термины. Резко улучшает
      // распознавание имён собственных.
      if (opts.prompt) form.append("prompt", opts.prompt.slice(0, 600));

      // timeout — чтобы зависшее соединение через прокси не блокировало
      // обработку навсегда. 120 сек (2 мин): 5 мин — слишком долго держать
      // очередь на одном звонке.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("OpenAI Whisper timeout 120s")), 120_000);
      let res: Response;
      try {
        res = await fetch(`${baseURL}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`OpenAI Whisper HTTP ${res.status}: ${text.slice(0, 200)}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }

      const raw = (await res.json()) as {
        text: string;
        language?: string;
        segments?: Array<{ start: number; end: number; text: string }>;
      };

      // Учёт расхода: длительность аудио = последний segment.end (Whisper
      // verbose_json даёт это). Fallback: размер файла / 16 КБ-в-секунду ≈
      // грубая оценка (если segments пусты).
      if (opts.tenantId && opts.usage?.recordUsage) {
        const lastSegment = raw.segments?.[raw.segments.length - 1];
        const seconds = lastSegment?.end ?? Math.floor(fs.statSync(filePath).size / 16000);
        await opts.usage.recordUsage("openai_seconds", seconds, opts.callId);
      }

      // Успешная транскрипция — провайдер жив. Если баннер «квота/auth» висел,
      // тихо гасим его (в try/catch, чтобы сбой записи не уронил пайплайн).
      try {
        await opts.health?.clearProviderHealthIfDegraded?.();
      } catch {
        // не критично — баннер погаснет при следующем успехе
      }

      return {
        text: raw.text || "",
        language: raw.language ?? null,
        segments: raw.segments ?? [],
        model: WHISPER_MODEL,
      };
    } catch (e) {
      lastError = e;
      const err = e as { status?: number; message?: string; name?: string };
      // Ретраим гео-блок 403, rate-limit 429, 5xx И любые сетевые сбои.
      // КЛЮЧЕВОЕ: при обрыве соединения fetch бросает TypeError/AbortError
      // БЕЗ HTTP-статуса. Раньше это не подпадало под retriable → звонок
      // падал мгновенно, не используя оставшиеся попытки. Теперь любой ответ
      // без статуса считаем сетевым (транзиентным) и повторяем. Auth (401/400)
      // имеют статус — не ретраим.
      const status = err.status ?? 0;
      const msg = (err.message ?? "").toLowerCase();
      const name = (err.name ?? "").toLowerCase();
      const isNetwork =
        status === 0 || // нет HTTP-статуса = сетевой сбой
        msg.includes("connection error") ||
        msg.includes("connection") ||
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("econnreset") ||
        msg.includes("econnrefused") ||
        msg.includes("socket hang up") ||
        name.includes("aborterror") ||
        name.includes("apiconnection");
      const retriable = status === 403 || status === 429 || status >= 500 || isNetwork;

      // Перед тем как окончательно сдаться: если попытки исчерпаны И ошибка
      // сетевая, это может быть НЕ транзиент, а исчерпание квоты OpenAI — он
      // обрывает multipart-загрузку аудио в середине, и мы видим лишь сетевую
      // ошибку без статуса. Делаем дешёвый probe (колбэк opts.health, фаза 2b)
      // и, если это квота/auth, бросаем явную НЕ-retryable ProviderQuotaError.
      // probe вызывается ТОЛЬКО тут (исчерпаны ретраи), не на каждый звонок.
      if (attempt === MAX_ATTEMPTS && isNetwork && opts.health?.probeOpenAiHealth) {
        let probe;
        try {
          probe = await opts.health.probeOpenAiHealth();
        } catch {
          probe = null; // probe сам упал — считаем транзиентом, бросаем исходное
        }
        if (probe?.kind === "quota") {
          await opts.health.setProviderHealth?.({
            status: "quota",
            provider: "openai",
            message: "OpenAI: квота/биллинг исчерпан (429 insufficient_quota)",
            detectedAt: new Date().toISOString(),
          });
          throw new ProviderQuotaError("OpenAI: квота/биллинг исчерпан — пополните баланс", "openai", "quota");
        }
        if (probe?.kind === "auth") {
          await opts.health.setProviderHealth?.({
            status: "auth",
            provider: "openai",
            message: "OpenAI: неверный или отозванный API-ключ (401)",
            detectedAt: new Date().toISOString(),
          });
          throw new ProviderQuotaError("OpenAI: неверный или отозванный API-ключ (401)", "openai", "auth");
        }
        // kind="ok"/"network" — это реальный транзиент: бросаем исходную ошибку как раньше.
      }

      if (!retriable || attempt === MAX_ATTEMPTS) throw e;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 3s, 6s, 12s
      console.warn(
        `[ai-rop/transcribe] attempt ${attempt}/${MAX_ATTEMPTS} failed (${status} ${err.message?.slice(0, 80)}). Retry in ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
