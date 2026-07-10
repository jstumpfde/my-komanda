// Обработчик входящих сообщений из Авито Мессенджера.
// Вызывается:
//   а) Из webhook-роута (/api/webhooks/avito) — сразу при получении push-события.
//   б) Из cron-эндпоинта (/api/cron/avito-incoming-messages) — для дообработки
//      накопившихся за 15 мин сообщений (компенсация пропущенных webhook'ов).
//
// ─── Архитектура ─────────────────────────────────────────────────────────────
// Авито не использует модель «мы тянем список откликов» как hh. Вместо этого:
//   - Авито шлёт нам push (webhook) при каждом новом сообщении в чате.
//   - chat_id уникален на пару (наш аккаунт ↔ соискатель ↔ объявление).
//   - author_id — Авито-ID соискателя (числовой).
//
// ─── Привязка кандидата ───────────────────────────────────────────────────────
// БД candidates не имеет отдельной колонки avito_chat_id (миграция запланирована
// после подключения реальных credentials). Временно храним chat_id в поле
// candidates.survey_responses как { avitoChatId: "..." }. Discriminator: source='avito'.
//
// При получении webhook:
//   1. Ищем company по avito_integrations.user_id = webhook.toAccount.
//   2. Ищем кандидата по surveyResponses.avitoChatId = chat_id + source='avito'.
//   3. Если не нашли — создаём нового кандидата.
//      Вакансию определяем: первая published-вакансия компании с channelSources='avito'.
//      (До реальной вакансия-привязки в Авито это единственный вариант — если у
//      компании несколько Авито-вакансий, вакансия определится неточно; это
//      решается на этапе vacancy-linkage, не входящем в текущую задачу.)
//   4. Классификация + действия — полная аналогия с hh/scan-incoming:
//      a. Стоп-слова (regex / список) → rejected.
//      b. AI classifyCandidateResponse → rejected / wants_contact / лог.
//      c. AI чат-бот (если включён на вакансии).
//   5. Исходящий ответ — через avitoAdapter.send (getAvitoToken → bearer token).
//
// ⚠️ PENDING_MIGRATION: после регистрации Авито-credentials запустить миграцию
//    0220_candidates_avito_chat_id.sql — добавить candidates.avito_chat_id text,
//    индекс по (avito_chat_id) и перенести данные из survey_responses.
//    Тогда заменить findCandidateByAvitoChatId на прямой eq(candidates.avitoChatId, chatId).

import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { avitoIntegrations, candidates, followUpMessages, vacancies } from "@/lib/db/schema"
import { classifyCandidateResponse } from "@/lib/ai/classify-candidate-response"
import { pauseFollowUpAndEscalate } from "@/lib/followup/pause-and-escalate"
import { decideIncomingMessageAction } from "@/lib/followup/decline-signal"
import { processChatbotMessage } from "@/lib/ai/chatbot-processor"
import { isBlockEnabled } from "@/lib/funnel-builder/runtime"
import { matchStopWordList, matchStopWordWith } from "@/lib/followup/stop-words"
import { getBaselineStopWords } from "@/lib/followup/effective-stop-words"
import { getAvitoToken } from "@/lib/channels/avito"
import { avitoAdapter } from "@/lib/channels/avito"
import { matchFaqReply, resolveStopWordFarewellText, readStopWordStageAction, type FaqEntry, type StopWordStageAction } from "@/lib/auto-responder/match-faq"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { renderTemplate } from "@/lib/template-renderer"

// Группа «Автоответы кандидату» (единый блок в Портрете, descriptionJson.autoResponder).
interface VacancyAutoResponder {
  enabled?:              boolean
  faq?:                  FaqEntry[]
  stopWordFarewellText?: string
  stopWordStageAction?:  StopWordStageAction
}

// ─── Константы ───────────────────────────────────────────────────────────────

const FAREWELL_MESSAGE = "Спасибо за отклик. Желаем удачи!"

// Порог уверенности AI для авто-отказа и решение по intent/confidence —
// см. lib/followup/decline-signal.ts (общее с hh/scan-incoming.ts).

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface StageHistoryEntry {
  from:   string
  to:     string
  at:     string
  reason: string
}

// Входящее сообщение из Авито (результат avitoAdapter.parseInbound).
export interface AvitoInboundMessage {
  channel:   string
  toAccount: string   // user_id нашего аккаунта Авито
  from:      string   // chat_id чата
  fromName?: string   // author_id (строка) соискателя
  text:      string
  raw:       unknown
}

// Результат одного прогона обработчика.
export interface ScanAvitoIncomingResult {
  processed:          number  // обработано пакетов (webhook-сообщений)
  newCandidates:      number  // создано новых кандидатов
  rejectedRegex:      number
  rejectedAi:         number
  wantsContact:       number
  // Инцидент 06.07: decline_requirement + rejection низкой уверенности —
  // дожим на паузу + эскалация HR (не авто-отказ). См. lib/hh/scan-incoming.ts.
  pausedNeedsReview:  number
  errors:             string[]
}

// ─── Вспомогательные ─────────────────────────────────────────────────────────

async function appendStageHistory(
  candidateId: string,
  fromStage:   string,
  toStage:     string,
  reason:      string,
): Promise<void> {
  const entry: StageHistoryEntry = { from: fromStage, to: toStage, at: new Date().toISOString(), reason }
  await db.execute(sql`
    UPDATE candidates
    SET stage_history = COALESCE(stage_history, '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb
    WHERE id = ${candidateId}::uuid
  `)
}

// Отправить сообщение в Авито чат.
// to = "{userId}:{chatId}" — формат адаптера.
async function sendAvitoMessage(
  accessToken: string,
  userId: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  try {
    const result = await avitoAdapter.send(
      { accessToken },
      { to: `${userId}:${chatId}`, text },
    )
    return result.ok === true
  } catch (err) {
    console.warn("[avito/scan-incoming] sendAvitoMessage failed:", err instanceof Error ? err.message : err)
    return false
  }
}

// Применить отказ: обновить stage, automationPaused, stage_history, отменить followup.
async function applyRejection(args: {
  candidateId:      string
  reason:           string
  userId:           string
  chatId:           string
  accessToken:      string
  sendFarewellFlag: boolean
  /** Текст прощального сообщения (если задан — используем вместо FAREWELL_MESSAGE). */
  farewellText?:    string
  /** 'candidate' = отказ по инициативе кандидата (напр. стоп-слово в чате) —
   *  пишем candidates.rejectionInitiator, чтобы отчёт показал «Сам отказ.». */
  initiator?:       "candidate" | "company"
}): Promise<boolean> {
  const { candidateId, reason, userId, chatId, accessToken, sendFarewellFlag, farewellText, initiator } = args

  const [prev] = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  const fromStage = prev?.stage ?? "unknown"

  // Guard: уже rejected — не отправляем второй прощальный.
  if (fromStage === "rejected") return false

  await db.update(candidates).set({
    stage:                       "rejected",
    automationPaused:            true,
    autoProcessingStopped:       true,
    autoProcessingStoppedReason: reason,
    autoProcessingStoppedAt:     new Date(),
    ...(initiator ? { rejectionInitiator: initiator } : {}),
    updatedAt:                   new Date(),
  }).where(eq(candidates.id, candidateId))

  await appendStageHistory(candidateId, fromStage, "rejected", reason)

  // Отменяем pending-касания.
  await db.update(followUpMessages).set({
    status:       "cancelled",
    errorMessage: reason,
  }).where(and(
    eq(followUpMessages.candidateId, candidateId),
    eq(followUpMessages.status, "pending"),
  ))

  if (sendFarewellFlag) {
    return await sendAvitoMessage(accessToken, userId, chatId, farewellText ?? FAREWELL_MESSAGE)
  }
  return false
}

// Применить wants_contact: перевести в primary_contact, поставить паузу.
async function applyWantsContact(candidateId: string): Promise<void> {
  const [prev] = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  const fromStage = prev?.stage ?? "unknown"

  await db.update(candidates).set({
    stage:            "primary_contact",
    automationPaused: true,
    updatedAt:        new Date(),
  }).where(eq(candidates.id, candidateId))

  await appendStageHistory(candidateId, fromStage, "primary_contact", "wants_contact_ai")

  await db.update(followUpMessages).set({
    status:       "cancelled",
    errorMessage: "wants_contact",
  }).where(and(
    eq(followUpMessages.candidateId, candidateId),
    eq(followUpMessages.status, "pending"),
  ))
}

// ─── Поиск компании по Авито user_id ─────────────────────────────────────────

export async function findCompanyByAvitoUserId(
  toAccount: string,
): Promise<{ companyId: string; avitoUserId: string } | null> {
  const [row] = await db
    .select({
      companyId: avitoIntegrations.companyId,
      userId:    avitoIntegrations.userId,
      isEnabled: avitoIntegrations.isEnabled,
      isActive:  avitoIntegrations.isActive,
    })
    .from(avitoIntegrations)
    .where(eq(avitoIntegrations.userId, toAccount))
    .limit(1)

  if (!row) return null
  if (!row.isEnabled || !row.isActive) return null
  return { companyId: row.companyId, avitoUserId: row.userId ?? toAccount }
}

// ─── Поиск/создание кандидата по chat_id ──────────────────────────────────────
//
// ⚠️ PENDING_MIGRATION: до добавления колонки candidates.avito_chat_id
//    используем surveyResponses JSONB как временное хранилище внешнего ID.
//    Запрос через @> медленнее индексного, но приемлем при малом числе
//    Авито-кандидатов на начальном этапе.

async function findCandidateByAvitoChatId(
  companyId: string,
  chatId:    string,
): Promise<string | null> {
  // Ищем кандидата у любой вакансии компании с совпадающим avitoChatId в surveyResponses.
  const rows = await db.execute(sql`
    SELECT c.id
    FROM candidates c
    INNER JOIN vacancies v ON v.id = c.vacancy_id
    WHERE v.company_id = ${companyId}::uuid
      AND c.source = 'avito'
      AND c.survey_responses @> ${JSON.stringify({ avitoChatId: chatId })}::jsonb
      AND c.deleted_at IS NULL
    LIMIT 1
  `) as Array<{ id: string }>

  return rows[0]?.id ?? null
}

// Найти подходящую вакансию для нового Авито-кандидата.
// Берём первую опубликованную вакансию с channelSources containing 'avito'.
// ⚠️ До реальной vacancy-linkage в Авито — только эвристика.
async function findAvitoVacancyForCompany(companyId: string): Promise<string | null> {
  const rows = await db
    .select({ id: vacancies.id })
    .from(vacancies)
    .where(and(
      eq(vacancies.companyId, companyId),
      inArray(vacancies.status, ["published", "active"]),
      sql`channel_sources @> '["avito"]'::jsonb`,
    ))
    .limit(1)

  return rows[0]?.id ?? null
}

// Создать нового кандидата из Авито.
async function createAvitoCandidateIfNeeded(args: {
  companyId:  string
  chatId:     string
  authorId?:  string
  senderName?: string
}): Promise<string | null> {
  const { companyId, chatId, authorId, senderName } = args

  const vacancyId = await findAvitoVacancyForCompany(companyId)
  if (!vacancyId) {
    console.warn(`[avito/scan-incoming] нет Авито-вакансии у компании ${companyId} — кандидат не создаётся`)
    return null
  }

  // Генерируем token для demo-ссылки.
  const token = (await import("crypto")).randomBytes(9).toString("base64url")

  const name = senderName
    ? `Авито: ${senderName}`
    : authorId
    ? `Авито-кандидат #${authorId}`
    : `Авито-кандидат`

  const [inserted] = await db.insert(candidates).values({
    vacancyId,
    name,
    token,
    source:          "avito",
    stage:           "new",
    // Временное хранилище avitoChatId — до миграции 0220.
    // После миграции заменить на candidates.avitoChatId = chatId.
    surveyResponses: { avitoChatId: chatId, avitoAuthorId: authorId ?? null } as Record<string, unknown>,
    createdAt:       new Date(),
    updatedAt:       new Date(),
  }).returning({ id: candidates.id })

  console.info(`[avito/scan-incoming] создан кандидат id=${inserted?.id} chatId=${chatId} vacancyId=${vacancyId}`)
  return inserted?.id ?? null
}

// ─── Главный обработчик одного сообщения ──────────────────────────────────────

export async function processAvitoInbound(
  msg:    AvitoInboundMessage,
  result: ScanAvitoIncomingResult,
): Promise<void> {
  const { toAccount, from: chatId, fromName: authorId, text } = msg

  // 1. Найти компанию.
  const company = await findCompanyByAvitoUserId(toAccount)
  if (!company) {
    console.warn(`[avito/scan-incoming] компания не найдена для toAccount=${toAccount}`)
    result.errors.push(`no_company:${toAccount}`)
    return
  }
  const { companyId, avitoUserId } = company

  // 2. Найти кандидата по chat_id или создать нового.
  let candidateId = await findCandidateByAvitoChatId(companyId, chatId)
  if (!candidateId) {
    candidateId = await createAvitoCandidateIfNeeded({
      companyId,
      chatId,
      authorId,
      senderName: authorId,
    })
    if (candidateId) result.newCandidates++
  }
  if (!candidateId) {
    result.errors.push(`no_candidate:${chatId}`)
    return
  }

  // 3. Загрузить данные вакансии и кандидата (всё за один JOIN).
  const [candVac] = await db
    .select({
      vacancyId:            candidates.vacancyId,
      vacancyTitle:         vacancies.title,
      companyId:            vacancies.companyId,
      channelSources:       vacancies.channelSources,
      aiChatbotEnabled:     vacancies.aiChatbotEnabled,
      aiChatbotSettings:    vacancies.aiChatbotSettings,
      aiChatbotPrompt:      vacancies.aiChatbotPrompt,
      funnelRuntimeEnabled: vacancies.funnelRuntimeEnabled,
      funnelConfigJson:     vacancies.funnelConfigJson,
      stopWordsJson:        vacancies.stopWordsJson,
      aiProcessSettings:    vacancies.aiProcessSettings,
      descriptionJson:      vacancies.descriptionJson,
    })
    .from(candidates)
    .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
    .where(eq(candidates.id, candidateId))
    .limit(1)

  if (!candVac) {
    result.errors.push(`no_vac_data:${candidateId}`)
    return
  }

  // 4. Проверка channelSources: вакансия должна принимать Авито-отклики.
  const sources = Array.isArray(candVac.channelSources) ? candVac.channelSources : ["hh"]
  if (!sources.includes("avito")) {
    console.info(`[avito/scan-incoming] vacancy ${candVac.vacancyId} не принимает Авито (channelSources=${JSON.stringify(sources)})`)
    return
  }

  // 5. Получить access_token для ответов.
  const accessToken = await getAvitoToken(companyId)
  if (!accessToken) {
    result.errors.push(`no_token:${companyId}`)
    return
  }

  const preview = text.slice(0, 120).replace(/\s+/g, " ")

  const autoResponder = (candVac.descriptionJson as { autoResponder?: VacancyAutoResponder } | null)?.autoResponder

  // 5b. Автоответы кандидату (FAQ) — ДО чат-бота. Гейт autoResponder.enabled,
  // по умолчанию ВЫКЛ → поведение не меняется. При совпадении отвечаем и
  // не продолжаем обработку этого сообщения (аналог handled/continue).
  if (autoResponder?.enabled === true) {
    const faqReply = matchFaqReply(text, autoResponder.faq)
    if (faqReply) {
      const { firstName } = await getCandidateFirstName(candidateId)
      const rendered = renderTemplate(faqReply, {
        name:      firstName,
        vacancy:   candVac.vacancyTitle ?? "",
        demo_link: "",
      })
      const sentOk = await sendAvitoMessage(accessToken, avitoUserId, chatId, rendered)
      console.info(`[avito/scan-incoming] ${candidateId} auto_responder_faq_sent ok=${sentOk} text="${preview}"`)
      return
    }
  }

  // 6. AI чат-бот (если включён и есть промпт).
  const chatbotEnabled = isBlockEnabled(candVac, "ai_chatbot", candVac.aiChatbotEnabled === true)
  const chatbotHasPrompt = (candVac.aiChatbotPrompt ?? "").trim().length > 0

  if (chatbotEnabled && chatbotHasPrompt) {
    try {
      const cb = await processChatbotMessage({
        candidateId,
        vacancyId:    candVac.vacancyId,
        incomingText: text,
        vacancy: {
          id:                candVac.vacancyId,
          title:             candVac.vacancyTitle ?? "",
          companyId:         candVac.companyId,
          aiChatbotEnabled:  candVac.aiChatbotEnabled,
          aiChatbotSettings: candVac.aiChatbotSettings,
          aiChatbotPrompt:   candVac.aiChatbotPrompt,
          stopWordsJson:     candVac.stopWordsJson,
          stopWordFarewellText: autoResponder?.stopWordFarewellText,
          stopWordStageAction:  autoResponder?.stopWordStageAction,
        },
      })
      if (cb.handled) {
        if (cb.action === "sent" && cb.reply) {
          if (cb.preMessage && cb.preMessageDelayMs) {
            await sendAvitoMessage(accessToken, avitoUserId, chatId, cb.preMessage)
            await new Promise(r => setTimeout(r, Math.min(cb.preMessageDelayMs!, 60_000)))
          }
          if (cb.replyDelayMs && cb.replyDelayMs > 0) {
            await new Promise(r => setTimeout(r, Math.min(cb.replyDelayMs!, 60_000)))
          }
          const ok = await sendAvitoMessage(accessToken, avitoUserId, chatId, cb.reply)
          console.info(`[avito/scan-incoming] ${candidateId} ai_chatbot_sent ok=${ok} cat=${cb.category} conf=${cb.confidence?.toFixed(2)} text="${preview}"`)
        } else if (cb.action === "rejected") {
          if (cb.reply) {
            if (cb.replyDelayMs && cb.replyDelayMs > 0) {
              await new Promise(r => setTimeout(r, Math.min(cb.replyDelayMs!, 60_000)))
            }
            await sendAvitoMessage(accessToken, avitoUserId, chatId, cb.reply)
          }
          if (cb.escalationReason === "stop_word") result.rejectedRegex++
          console.info(`[avito/scan-incoming] ${candidateId} ai_chatbot_rejected reason=${cb.escalationReason} text="${preview}"`)
        } else {
          console.info(`[avito/scan-incoming] ${candidateId} ai_chatbot_${cb.action} reason=${cb.escalationReason} text="${preview}"`)
        }
        return // AI взял ответственность — legacy классификация не нужна
      }
    } catch (err) {
      console.warn(`[avito/scan-incoming] ${candidateId} ai_chatbot_error, fallback:`, err instanceof Error ? err.message : err)
      // fallthrough в legacy-классификацию
    }
  }

  // 7. Стоп-слова чата. Аудит 10.07: кастомный список ОБЪЕДИНЯЕТСЯ с
  // платформенным baseline, не заменяет его (см. hh/scan-incoming.ts).
  {
    const swFlag = (candVac.aiProcessSettings as { stopWordsChatEnabled?: boolean } | null)?.stopWordsChatEnabled
    if (isBlockEnabled(candVac, "stop_words_chat", swFlag !== false)) {
      const vacStopWords = (candVac.stopWordsJson ?? []).filter((s): s is string => typeof s === "string")
      const matched = (vacStopWords.length > 0 && matchStopWordList(text, vacStopWords) !== null)
        || matchStopWordWith(text, await getBaselineStopWords())
      if (matched) {
        // Настраиваемая реакция (Юрий 02.07): дефолт 'none' — стадию НЕ трогаем,
        // реагируем только прощальным сообщением (если текст задан). См.
        // подробный комментарий в hh/scan-incoming.ts (аналогичная логика).
        const stageAction = readStopWordStageAction(autoResponder?.stopWordStageAction)
        const farewellText = resolveStopWordFarewellText(autoResponder?.stopWordFarewellText)
        let farewellRendered: string | null = null
        if (farewellText) {
          const { firstName } = await getCandidateFirstName(candidateId)
          farewellRendered = renderTemplate(farewellText, {
            name: firstName, vacancy: candVac.vacancyTitle ?? "", demo_link: "",
          })
        }

        if (stageAction === "none") {
          const sentOk = farewellRendered
            ? await sendAvitoMessage(accessToken, avitoUserId, chatId, farewellRendered)
            : false
          // Стадию НЕ трогаем, но дожимы на паузу (Юрий 02.07) — automationPaused
          // + отмена pending-касаний. Решение по стадии остаётся за HR.
          await db.update(candidates).set({
            automationPaused:            true,
            autoProcessingStopped:       true,
            autoProcessingStoppedReason: "stop_word_no_stage",
            autoProcessingStoppedAt:     new Date(),
            updatedAt:                   new Date(),
          }).where(eq(candidates.id, candidateId))
          await db.update(followUpMessages).set({
            status: "cancelled", errorMessage: "stop_word_no_stage",
          }).where(and(
            eq(followUpMessages.candidateId, candidateId),
            eq(followUpMessages.status, "pending"),
          ))
          console.info(`[avito/scan-incoming] ${candidateId} stop_word_no_stage_change paused farewell_sent=${sentOk} text="${preview}"`)
          return
        }

        const sent = await applyRejection({
          candidateId,
          reason:           "stop_word_regex",
          userId:           avitoUserId,
          chatId,
          accessToken,
          sendFarewellFlag: !!farewellRendered,
          farewellText:     farewellRendered ?? undefined,
          initiator:        stageAction === "candidate_declined" ? "candidate" : "company",
        })
        result.rejectedRegex++
        console.info(`[avito/scan-incoming] ${candidateId} stop_word action=${stageAction} farewell=${sent} text="${preview}"`)
        return
      }
    }
  }

  // 8. AI классификация (fallback).
  let cls
  try {
    cls = await classifyCandidateResponse(text, {})
  } catch (err) {
    result.errors.push(`ai:${chatId}:${err instanceof Error ? err.message : "?"}`)
    return
  }

  // Решение — та же чистая функция, что и в lib/hh/scan-incoming.ts (юнит-тесты
  // в lib/followup/decline-signal.test.ts).
  const action = decideIncomingMessageAction(cls.intent, cls.confidence)

  if (action.type === "auto_reject") {
    const sent = await applyRejection({
      candidateId,
      reason:           "ai_rejection",
      userId:           avitoUserId,
      chatId,
      accessToken,
      sendFarewellFlag: !!cls.farewellMessage,
    })
    result.rejectedAi++
    console.info(`[avito/scan-incoming] ${candidateId} ai_rejection conf=${cls.confidence} farewell=${sent} text="${preview}"`)
  } else if (action.type === "pause_and_escalate") {
    // decline_requirement (см. lib/hh/scan-incoming.ts, инцидент 06.07) —
    // отказ от конкретного требования вакансии: НЕ авто-отказ, только пауза
    // дожима + эскалация HR. rejection низкой уверенности — та же защита.
    const esc = await pauseFollowUpAndEscalate({
      candidateId,
      vacancyId:    candVac.vacancyId,
      incomingText: text,
      reason:       action.reason,
      confidence:   cls.confidence,
    })
    result.pausedNeedsReview++
    console.info(`[avito/scan-incoming] ${candidateId} ${action.reason}_paused conf=${cls.confidence} already=${esc.alreadyPaused} notif=${esc.notificationSent} tg=${esc.telegramSent} text="${preview}"`)
  } else if (action.type === "wants_contact") {
    await applyWantsContact(candidateId)
    result.wantsContact++
    console.info(`[avito/scan-incoming] ${candidateId} wants_contact conf=${cls.confidence} text="${preview}"`)
  } else {
    console.info(`[avito/scan-incoming] ${candidateId} ${cls.intent} conf=${cls.confidence} text="${preview}"`)
  }
}

// ─── Пакетный обработчик (для cron) ──────────────────────────────────────────

export async function scanAvitoIncomingMessages(
  messages: AvitoInboundMessage[],
): Promise<ScanAvitoIncomingResult> {
  const result: ScanAvitoIncomingResult = {
    processed: 0, newCandidates: 0,
    rejectedRegex: 0, rejectedAi: 0, wantsContact: 0,
    pausedNeedsReview: 0,
    errors: [],
  }

  for (const msg of messages) {
    if (!msg.text?.trim()) continue
    result.processed++
    try {
      await processAvitoInbound(msg, result)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error("[avito/scan-incoming] необработанная ошибка:", errMsg)
      result.errors.push(`unexpected:${msg.from}:${errMsg.slice(0, 100)}`)
    }
  }

  return result
}
