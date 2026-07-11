/**
 * Главный конвейер разбора звонка — порт call-agent lib/pipeline.ts.
 * processCall(callId, companyId): download → transcribe → bitrix context/enrich
 * → выбор скрипта → analyze → save transcript/analysis → reminder →
 * discrepancy(async) → sendCallToBitrix (dry-run!) → spendForCall.
 *
 * Гард токен-биллинга — ПЕРЕД любым AI-вызовом (getBillingStatus.blocked):
 * блокирует без траты AI, помечает failed с понятной причиной.
 */
import path from "path"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropCalls, ropAnalyses, ropManagers, ropSalesScripts, ropTranscripts, type NewRopAnalysis, type NewRopTranscript, type RopCall } from "@/lib/db/schema"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import {
  createBitrixClient,
  downloadRecording,
  entityTypeStringToId,
  formatContactName,
  type BitrixClient,
  type DealContext,
} from "./bitrix"
import { sendCallToBitrix, type AnalysisForCrm, type CallForCrm } from "./bitrix-write"
import { transcribeFile } from "./transcribe"
import { analyzeCall, type CallAnalysis } from "./analyzer"
import { detectProduct, type ProductCandidate } from "./product-detector"
import { detectDiscrepancies } from "./discrepancy-detector"
import { createReminderFromAnalysis } from "./reminders"
import { spendForCall, getBillingStatus } from "./tokens"
import { checkBudget, recordUsage } from "./budget"
import { alreadySentLive, logCrmWrite } from "./crm-log"
import { getRopSettings, getSettingsJson, toBitrixConfig, toSttConfig } from "./settings"
import { ropProviderHealthHooks } from "./provider-health"
import { NoRecordingError, type ChecklistItem, type CallStatus, type RopUsageHooks } from "./types"

const RECORDINGS_ROOT = process.env.ROP_RECORDINGS_DIR
  ? path.resolve(process.env.ROP_RECORDINGS_DIR)
  : path.join(process.cwd(), "storage", "rop-recordings")

export async function setCallStatus(callId: string, status: CallStatus): Promise<void> {
  await db.update(ropCalls).set({ status, updatedAt: new Date() }).where(eq(ropCalls.id, callId))
}

/**
 * Колбэки учёта расхода AI/STT для данного звонка — closures захватывают
 * реальные uuid companyId/callId, а numeric-параметры хука (наследие ca
 * контракта в transcribe.ts, см. её docblock) игнорируются: transcribe.ts
 * использует их только как truthy-гейт (`if (opts.tenantId && ...)`) и как
 * pass-through аргумент, который наш собственный колбэк волен не читать.
 */
function buildUsageHooks(companyId: string, callId: string): RopUsageHooks {
  return {
    recordUsage: async (kind, units) => recordUsage(companyId, kind, units, callId),
    checkBudget: async (kind) => checkBudget(companyId, kind),
  }
}

export async function processCall(callId: string, companyId: string, opts?: { scriptProductOverride?: string }): Promise<void> {
  const scriptProductOverride = opts?.scriptProductOverride ?? null

  const [row] = await db
    .select()
    .from(ropCalls)
    .where(and(eq(ropCalls.id, callId), eq(ropCalls.tenantId, companyId)))
    .limit(1)
  if (!row) throw new Error(`Звонок ${callId} не найден (компания ${companyId})`)

  // Гард токен-биллинга: enforce включён и баланс ≤ 0 — не тратим AI, помечаем
  // и выходим. После пополнения можно повторить через «Перезапустить обработку».
  const billing = await getBillingStatus(companyId)
  if (billing.blocked) {
    await db
      .update(ropCalls)
      .set({ error: "Недостаточно токенов — пополните баланс аккаунта" })
      .where(eq(ropCalls.id, callId))
    await setCallStatus(callId, "failed")
    return
  }

  await db.update(ropCalls).set({ attempts: sql`${ropCalls.attempts} + 1` }).where(eq(ropCalls.id, callId))

  const settingsRow = await getRopSettings(companyId)
  const settingsJson = getSettingsJson(settingsRow)
  const bitrixConfig = toBitrixConfig(settingsRow)
  const sttConfig = toSttConfig(settingsRow)

  // Глоссарий компании — нужен РАНО: передаём STT как prompt-подсказку, чтобы
  // распознавание сразу правильно писало имена собственные («Орлинк» вместо
  // «Рынк/Орлинг»).
  const whisperHint = buildSttHint(settingsRow.glossary)

  const interactionType = (row.interactionType ?? "call") as "call" | "chat" | "email" | "meeting"
  const isTextOnly =
    interactionType === "chat" ||
    interactionType === "email" ||
    (interactionType === "meeting" && !row.recordingUrl && !row.recordingPath)

  const client: BitrixClient | null = bitrixConfig ? createBitrixClient(bitrixConfig) : null

  // 0. Если транскрипт уже есть — переанализ, не платим STT заново.
  const [existingTranscript] = await db.select().from(ropTranscripts).where(eq(ropTranscripts.callId, callId)).limit(1)

  // 1. Скачать запись — пропускаем для text-only и если транскрипт уже есть.
  let recordingPath = row.recordingPath
  if (!isTextOnly && !recordingPath && !existingTranscript) {
    if (!client) throw new Error("Bitrix не подключён (rop_settings.bitrixWebhookUrl пуст) — нечего скачивать")
    await setCallStatus(callId, "downloading")

    let recordingUrl = row.recordingUrl
    if (!recordingUrl && row.bitrixActivityId && row.bitrixActivityId !== "0") {
      recordingUrl = await client.resolveRecordingFromActivity(row.bitrixActivityId)
      if (recordingUrl) await db.update(ropCalls).set({ recordingUrl }).where(eq(ropCalls.id, callId))
    }
    if (!recordingUrl) {
      const reason = !row.bitrixActivityId || row.bitrixActivityId === "0" ? "звонок не привязан к Activity" : "не нашли FILES в Activity (запись отсутствует)"
      throw new NoRecordingError(`Нет recording_url: ${reason}`)
    }

    const outDir = path.join(RECORDINGS_ROOT, companyId)
    recordingPath = await downloadRecording(recordingUrl, outDir, String(row.bitrixCallId ?? callId))
    await db.update(ropCalls).set({ recordingPath }).where(eq(ropCalls.id, callId))
  }

  // 2. Получение текста взаимодействия: кэш → content_text (text-only) → STT.
  let t: { text: string; language: string | null; segments: Array<{ start: number; end: number; text: string }>; model: string }
  if (existingTranscript) {
    let segments: Array<{ start: number; end: number; text: string }> = []
    try {
      segments = (existingTranscript.segmentsJson as typeof segments) ?? []
    } catch {
      segments = []
    }
    t = { text: existingTranscript.text, language: existingTranscript.language, segments, model: existingTranscript.model || "cached" }
    console.log(`[ai-rop/pipeline] #${callId} (${interactionType}): используем кэшированный текст (${t.text.length} симв.)`)
  } else if (isTextOnly) {
    const txt = (row.contentText || "").trim()
    if (!txt) throw new Error(`Тип ${interactionType} без content_text — нечего анализировать`)
    t = { text: txt, language: "ru", segments: [], model: "text-only" }
    console.log(`[ai-rop/pipeline] #${callId} (${interactionType}): text-only, ${txt.length} симв., STT пропускаем`)
  } else {
    await setCallStatus(callId, "transcribing")
    if (!recordingPath) throw new Error("recordingPath не найден на этапе транскрипции")
    t = await transcribeFile(recordingPath, sttConfig, {
      tenantId: 1, // truthy-гейт для usage.checkBudget внутри transcribe.ts, см. buildUsageHooks
      callId: 1,
      prompt: whisperHint,
      usage: buildUsageHooks(companyId, callId),
      health: ropProviderHealthHooks,
    })
  }

  // ── Гард «нет полезной речи»: короткие звонки и STT-галлюцинации ──
  {
    const dedupeRepeats = (text: string): string => {
      const seen = new Set<string>()
      const out: string[] = []
      for (const s of text.split(/(?<=[.!?])\s+|\n+/)) {
        const key = s.trim().toLowerCase().replace(/\s+/g, " ")
        if (key.length >= 12) {
          if (seen.has(key)) continue
          seen.add(key)
        }
        out.push(s)
      }
      return out.join(" ").replace(/\s+/g, " ").trim()
    }

    const orig = (t.text || "").trim()
    const origLen = orig.length

    const lowOrig = orig.toLowerCase()
    const phrases = lowOrig.split(/[.!?\n]+|—/).map((s) => s.trim()).filter((s) => s.length > 8)
    const uniq = new Set(phrases)
    const uniqueRatio = phrases.length ? uniq.size / phrases.length : 1
    const uniqueContentLen = [...uniq].join(" ").replace(/[^a-zа-яё0-9]+/gi, " ").replace(/\s+/g, " ").trim().length
    const isRepeatedGarbage = phrases.length >= 6 && uniqueRatio < 0.35 && uniqueContentLen < 120

    const cleaned = dedupeRepeats(orig)
    const low = cleaned.toLowerCase()

    const HALLUCINATIONS = ["продолжение следует", "субтитры", "спасибо за просмотр", "редактор субтитров", "amara.org", "благодарю за внимание"]
    const isHallucination = cleaned.length > 0 && cleaned.length < 60 && HALLUCINATIONS.some((h) => low.includes(h))
    // durationSec-порог применяем только к аудио: у text-only (чат/email) длительность
    // всегда 0 — в оригинале call-agent этот гард молча убивал загруженные переписки.
    const tooShort = cleaned.length < 15 || (!isTextOnly && (row.durationSec ?? 0) < 7)

    if (tooShort || isHallucination || isRepeatedGarbage) {
      await upsertTranscript(callId, { text: t.text, segmentsJson: t.segments, dialogueJson: [], language: t.language, model: t.model })
      await setCallStatus(callId, "no_recording")
      await db
        .update(ropCalls)
        .set({
          error: `Нет речи для анализа: звонок ${row.durationSec ?? 0}с${isHallucination ? " (пустая/тихая запись)" : " (нет осмысленной речи / повтор-мусор STT)"}`,
        })
        .where(eq(ropCalls.id, callId))
      console.log(`[ai-rop/pipeline] #${callId}: пропуск анализа — нет полезной речи (${row.durationSec ?? 0}с, uniqLen=${uniqueContentLen}, ratio=${uniqueRatio.toFixed(2)})`)
      return
    }

    if (cleaned && cleaned.length < origLen) {
      t = { ...t, text: cleaned }
      console.log(`[ai-rop/pipeline] #${callId}: вычищен повтор-мусор STT (${origLen}→${cleaned.length} симв.)`)
    }
  }

  // 3. Контекст сделки/лида.
  await setCallStatus(callId, "analyzing")
  const context: DealContext | null = client
    ? await client.buildCallContext({ bitrixDealId: row.bitrixDealId, bitrixLeadId: row.bitrixLeadId })
    : null
  if (context) {
    await db.update(ropCalls).set({ dealContextJson: context }).where(eq(ropCalls.id, callId))
  }

  // 3.1. Bitrix enrich: имена сделки/лида/контакта + базовый URL портала (мягко — ошибки не валят пайплайн).
  if (client) {
    try {
      const portalUrl = client.getPortalUrl()
      const needDeal = !!row.bitrixDealId && !(context?.kind === "deal" && context.title)
      const needLead = !!row.bitrixLeadId && !(context?.kind === "lead" && context.title)
      const needContact = !!row.bitrixContactId

      const [dealResult, leadResult, contactResult] = await Promise.all([
        needDeal ? client.crmDealGet(row.bitrixDealId!) : Promise.resolve(null),
        needLead ? client.crmLeadGet(row.bitrixLeadId!) : Promise.resolve(null),
        needContact ? client.crmContactGet(row.bitrixContactId!) : Promise.resolve(null),
      ])

      let dealTitle: string | null = null
      if (row.bitrixDealId) dealTitle = context?.kind === "deal" && context.title ? context.title : dealResult?.TITLE ?? null

      let leadTitle: string | null = null
      if (row.bitrixLeadId) {
        leadTitle =
          context?.kind === "lead" && context.title
            ? context.title
            : leadResult
              ? leadResult.TITLE || [leadResult.NAME, leadResult.LAST_NAME].filter(Boolean).join(" ") || null
              : null
      }

      let contactName: string | null = null
      if (row.bitrixContactId && contactResult) contactName = formatContactName(contactResult)

      await db
        .update(ropCalls)
        .set({ bitrixDealTitle: dealTitle, bitrixLeadTitle: leadTitle, bitrixContactName: contactName, bitrixPortalUrl: portalUrl })
        .where(eq(ropCalls.id, callId))
    } catch (e) {
      console.warn(`[ai-rop/pipeline] #${callId} bitrix enrich failed:`, (e as Error).message)
    }
  }

  // 4. Продукт + скрипт (scriptProductOverride пропускает auto-detect).
  const { product, script } = await pickScriptForCall(t.text, row.direction as "in" | "out" | null, {
    companyId,
    callId,
    productOverride: scriptProductOverride ?? undefined,
    managerId: row.managerId ?? undefined,
  })
  if (product) await db.update(ropCalls).set({ detectedProduct: product }).where(eq(ropCalls.id, callId))
  const checklist = script?.checklist || null

  // 5. Анализ.
  const modelOverride = settingsRow.analysisModel ?? undefined
  const { analysis, raw, model } = await analyzeCall({
    transcript: t.text,
    checklist,
    context,
    companyId,
    callId,
    interactionType,
    modelOverride,
    glossary: settingsRow.glossary ?? null,
  })

  // 5.1 Сохраняем транскрипт + диалог.
  await upsertTranscript(callId, {
    text: t.text,
    segmentsJson: t.segments,
    dialogueJson: analysis.dialogue || [],
    language: t.language,
    model: t.model,
  })

  // 6. Сохраняем анализ.
  await upsertAnalysis(callId, analysis, raw, model, product)

  // 6.5. Reminder из next_action / callback_phrase — тихо игнорируем если парсер не распознал.
  try {
    await createReminderFromAnalysis({
      companyId,
      callId,
      bitrixManagerId: row.managerId,
      nextAction: analysis.next_action || "",
      clientName: analysis.client_name,
      clientPhone: row.clientPhone,
      callbackPhrase: analysis.callback_agreed ? analysis.callback_phrase : null,
    })
  } catch (e) {
    console.warn(`[ai-rop/pipeline] reminders auto-create failed for #${callId}:`, (e as Error).message)
  }

  // 6.6. CRM-карточка (Фаза 2) — запускаем async, не ждём.
  if (client) {
    detectDiscrepancies(callId, companyId, client).catch((e) => console.error("[ai-rop/discrepancy]", e))
  }

  // 7. Sync back в Bitrix — пропускаем если dry-run, нет webhook, или у менеджера
  //    выключен перенос анализа в CRM (rop_managers.crmSyncEnabled).
  await setCallStatus(callId, "syncing")

  let crmSyncEnabled = false
  if (row.managerId) {
    try {
      const [mrow] = await db
        .select({ crmSyncEnabled: ropManagers.crmSyncEnabled })
        .from(ropManagers)
        .where(and(eq(ropManagers.tenantId, companyId), eq(ropManagers.bitrixManagerId, row.managerId)))
        .limit(1)
      crmSyncEnabled = mrow?.crmSyncEnabled === true
    } catch (e) {
      console.warn(`[ai-rop/pipeline] #${callId} load crmSyncEnabled failed:`, (e as Error).message)
    }
  }

  if (!client || !bitrixConfig) {
    await db.update(ropCalls).set({ error: "sync skipped: Bitrix не подключён" }).where(eq(ropCalls.id, callId))
    console.log(`[ai-rop/pipeline] #${callId}: sync to Bitrix SKIPPED (Bitrix не подключён)`)
  } else if (!crmSyncEnabled) {
    await db.update(ropCalls).set({ error: "sync skipped: CRM-sync выключен для менеджера" }).where(eq(ropCalls.id, callId))
    console.log(`[ai-rop/pipeline] #${callId}: sync to Bitrix SKIPPED (CRM-sync выключен для менеджера)`)
  } else {
    try {
      const dashboardUrl = `${getAppBaseUrl()}/ai-rop/calls/${callId}`
      // CallForCrm.id/tenantId типизированы как number в bitrix-write.ts (заморожен,
      // фаза 2a, унаследовано от bigint PK оригинала) — реально uuid; на рантайм это
      // не влияет (используются только для интерполяции в строки/объекты, см. crm-log.ts
      // и makeIdempotencyKey — оба работают со строками тождественно числам). Кастуем
      // на границе, см. общий комментарий в interaction-source.ts/crm-log.ts.
      const callForCrm = {
        id: row.id,
        tenantId: row.tenantId,
        bitrixDealId: row.bitrixDealId,
        bitrixLeadId: row.bitrixLeadId,
        bitrixContactId: row.bitrixContactId,
        bitrixActivityId: row.bitrixActivityId,
        clientPhone: row.clientPhone,
        startedAt: row.startedAt ? row.startedAt.toISOString() : null,
        durationSec: row.durationSec,
        direction: row.direction as "in" | "out" | null,
      } as unknown as CallForCrm
      const analysisForCrm: AnalysisForCrm = {
        summary: analysis.summary ?? null,
        sentiment: analysis.sentiment ?? null,
        managerScore: analysis.manager_score ?? null,
        scriptCompliance: analysis.checklist_compliance ?? null,
        nextAction: analysis.next_action ?? null,
        clientName: analysis.client_name ?? null,
        detectedProduct: product ?? null,
        objectionsJson: JSON.stringify(analysis.objections ?? []),
        topicsJson: JSON.stringify(analysis.topics ?? []),
      }

      await sendCallToBitrix({
        client,
        config: bitrixConfig,
        call: callForCrm,
        analysis: analysisForCrm,
        dashboardUrl,
        logWrite: logCrmWrite,
        alreadySent: alreadySentLive,
      })
      await db.update(ropCalls).set({ error: null }).where(eq(ropCalls.id, callId))
    } catch (e) {
      await db.update(ropCalls).set({ error: `sync warning: ${(e as Error).message}` }).where(eq(ropCalls.id, callId))
    }
  }

  await setCallStatus(callId, "done")

  // Списываем 1 токен за разобранный звонок (идемпотентно по callId).
  try {
    await spendForCall(companyId, callId, 1)
  } catch (e) {
    console.warn(`[ai-rop/pipeline] #${callId}: не удалось списать токен: ${(e as Error).message}`)
  }
}

/** prompt-подсказка для STT из глоссария компании (контекст, точнее распознаёт имена собственные). */
function buildSttHint(glossary?: string | null): string | undefined {
  const g = (glossary || "").trim()
  if (!g) return undefined
  const flat = g.replace(/\s*\n+\s*/g, ", ").slice(0, 500)
  return `Деловой разговор менеджера по продажам. Правильные названия компаний, брендов и терминов: ${flat}.`
}

async function upsertTranscript(
  callId: string,
  data: Omit<NewRopTranscript, "callId" | "createdAt">
): Promise<void> {
  await db
    .insert(ropTranscripts)
    .values({ callId, ...data })
    .onConflictDoUpdate({
      target: ropTranscripts.callId,
      set: { ...data, createdAt: new Date() },
    })
}

async function upsertAnalysis(
  callId: string,
  analysis: CallAnalysis,
  raw: string,
  model: string,
  detectedProduct: string | null
): Promise<void> {
  const values: Omit<NewRopAnalysis, "callId" | "createdAt"> = {
    summary: analysis.summary,
    sentiment: analysis.sentiment,
    managerScore: analysis.manager_score,
    scriptCompliance: analysis.checklist_compliance,
    nextAction: analysis.next_action,
    objectionsJson: analysis.objections ?? [],
    topicsJson: analysis.topics ?? [],
    checklistScoresJson: analysis.checklist_scores ?? [],
    clientName: analysis.client_name ?? null,
    detectedProduct,
    rawJson: safeParseJson(raw),
    model,
    coachingTipsJson: analysis.coaching_tips ?? [],
    callStage: analysis.call_stage ?? "cold",
    ropNotesJson: analysis.rop_notes ?? [],
    callbackAgreed: analysis.callback_agreed ?? false,
    callbackPhrase: analysis.callback_agreed ? analysis.callback_phrase ?? null : null,
  }
  await db
    .insert(ropAnalyses)
    .values({ callId, ...values })
    .onConflictDoUpdate({ target: ropAnalyses.callId, set: { ...values, createdAt: new Date() } })
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

interface ResolvedScript {
  id: string
  name: string
  product: string | null
  direction: string
  checklist: ChecklistItem[] | null
  keyPhrases: string[]
}

function parseKeyPhrases(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
}

async function loadActiveScripts(companyId: string): Promise<ResolvedScript[]> {
  const rows = await db
    .select()
    .from(ropSalesScripts)
    .where(and(eq(ropSalesScripts.tenantId, companyId), eq(ropSalesScripts.isActive, true)))
  return rows.map((r) => {
    const checklist = Array.isArray(r.checklistJson) && (r.checklistJson as unknown[]).length > 0 ? (r.checklistJson as ChecklistItem[]) : null
    return {
      id: r.id,
      name: r.name,
      product: r.product,
      direction: r.direction || "all",
      checklist,
      keyPhrases: parseKeyPhrases(r.keyPhrases),
    }
  })
}

/**
 * Определяет продукт по транскрипту и выбирает подходящий скрипт. Приоритет:
 *  1. Точное совпадение product + direction
 *  2. Общий (без product) + direction
 *  3. Любой общий
 *  4. Любой активный (fallback)
 *
 * productOverride — принудительно задать продукт без auto-detect. managerId —
 * если за менеджером закреплён default_product, он передаётся в detectProduct
 * как приоритетная подсказка (bias) и fallback если AI не уверен.
 */
async function pickScriptForCall(
  transcript: string,
  callDirection: "in" | "out" | null,
  opts: { companyId: string; callId?: string; productOverride?: string; managerId?: string } = { companyId: "" }
): Promise<{ product: string | null; script: ResolvedScript | null }> {
  const scripts = await loadActiveScripts(opts.companyId)
  if (scripts.length === 0) return { product: null, script: null }

  let product: string | null = null

  if (opts.productOverride) {
    product = opts.productOverride
    console.log(`[ai-rop/pipeline] productOverride="${product}" — auto-detect пропущен`)
  } else {
    let managerDefaultProduct: string | null = null
    if (opts.managerId) {
      try {
        const [mrow] = await db
          .select({ defaultProduct: ropManagers.defaultProduct })
          .from(ropManagers)
          .where(and(eq(ropManagers.tenantId, opts.companyId), eq(ropManagers.bitrixManagerId, opts.managerId)))
          .limit(1)
        managerDefaultProduct = mrow?.defaultProduct ?? null
      } catch (e) {
        console.warn("[ai-rop/pipeline] load manager default_product failed:", (e as Error).message)
      }
    }

    const productCodes = [...new Set(scripts.map((s) => s.product).filter((p): p is string => !!p))]
    const candidates: ProductCandidate[] = productCodes.map((code) => {
      const keywords = [...new Set(scripts.filter((s) => s.product === code).flatMap((s) => s.keyPhrases))]
      return { code, name: code, keywords }
    })

    if (candidates.length > 1) {
      try {
        product = await detectProduct(transcript, candidates, { companyId: opts.companyId, callId: opts.callId, hintProduct: managerDefaultProduct })
      } catch (e) {
        console.warn("[ai-rop/pipeline] detectProduct failed:", (e as Error).message)
      }
    } else if (candidates.length === 1) {
      product = candidates[0].code
    }

    if (!product && managerDefaultProduct && candidates.some((c) => c.code.toLowerCase() === managerDefaultProduct!.toLowerCase())) {
      product = candidates.find((c) => c.code.toLowerCase() === managerDefaultProduct!.toLowerCase())!.code
      console.log(`[ai-rop/pipeline] detect unsure → fallback to manager default_product="${product}"`)
    }
  }

  const directionMatches = (s: ResolvedScript) => s.direction === "all" || s.direction === callDirection
  if (product) {
    const exact = scripts.find((s) => s.product === product && directionMatches(s))
    if (exact) return { product, script: exact }
  }
  const generalWithDir = scripts.find((s) => !s.product && directionMatches(s))
  if (generalWithDir) return { product, script: generalWithDir }
  const anyGeneral = scripts.find((s) => !s.product)
  if (anyGeneral) return { product, script: anyGeneral }
  return { product, script: scripts[0] }
}

export type { RopCall }
