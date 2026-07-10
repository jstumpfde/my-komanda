// Слушатель входящих сообщений в hh-чате.
// Используется cron-эндпоинтом /api/cron/hh-incoming-messages каждые 15 мин.
//
// Что делает:
//   1. Тянет до LIMIT откликов (FIFO по last_check_at NULLS FIRST)
//      со status IN ('invited','response') и last_check_at < NOW()-14min OR NULL.
//   2. Для каждого: GET /negotiations/{id}/messages?with_text=true.
//   3. При lastSeenMessageId === null — пропускаем cover letter
//      (первое applicant-сообщение в чате это, как правило, отклик
//      кандидата на вакансию, а не ответ на наше приглашение).
//      Записываем id самого свежего applicant-сообщения как seen,
//      классификацию НЕ запускаем. Следующий прогон сработает только
//      на сообщениях НОВЕЕ cover letter.
//   4. Иначе — берём applicant-сообщения новее last_seen_message_id.
//   5. Двухступенчатая классификация:
//      a. regex по STOP_WORDS с word-boundaries → если совпало, сразу
//         stage='rejected', automationPaused=true, прощальное сообщение,
//         отмена pending touches, запись в stage_history.
//      b. Если стоп-слов нет — classifyCandidateResponse (AI Haiku):
//         rejection → как (a), wants_personal_contact → stage='wants_contact'
//         + automationPaused + stage_history, остальное — только лог.
//   6. Обновляем last_seen_message_id (max id), last_check_at = NOW().

import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { hhResponses, candidates, followUpMessages, hhCandidates, vacancies, companies } from "@/lib/db/schema"
// channelSources — используется ниже для проверки что hh-канал включён на вакансии.
import { getValidToken } from "@/lib/hh-helpers"
import { classifyCandidateResponse } from "@/lib/ai/classify-candidate-response"
import { pauseFollowUpAndEscalate } from "@/lib/followup/pause-and-escalate"
import { decideIncomingMessageAction } from "@/lib/followup/decline-signal"
import { processChatbotMessage } from "@/lib/ai/chatbot-processor"
import { getSpec } from "@/lib/core/spec/store"
import { executeFunnelAction } from "@/lib/ai/funnel-execute"
import { isBlockEnabled } from "@/lib/funnel-builder/runtime"
import { saveCandidatePhoto } from "@/lib/hh/save-candidate-photo"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"
import { matchCallIntentKeyword, renderInsistTemplate } from "@/lib/messaging/call-intent"
import { matchStopWordList, matchStopWordWith } from "@/lib/followup/stop-words"
import { getBaselineStopWords } from "@/lib/followup/effective-stop-words"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import { getCandidateFirstName } from "@/lib/messaging/candidate-name"
import { processPrequalificationAnswer } from "@/lib/prequalification/process-answer"
import { matchFaqReply, resolveStopWordFarewellText, readStopWordStageAction, type FaqEntry, type StopWordStageAction } from "@/lib/auto-responder/match-faq"
import { matchUploadProblemKeyword, DEFAULT_UPLOAD_PROBLEM_REPLY, DEFAULT_UPLOAD_PROBLEM_REPLY_NO_TG } from "@/lib/auto-responder/upload-fallback"
import { buildCandidateDeepLink, generateInviteToken } from "@/lib/telegram/candidate-bot"
import { renderTemplate } from "@/lib/template-renderer"

// Группа «Автоответы кандидату» (единый блок в Портрете, descriptionJson.autoResponder).
interface VacancyAutoResponder {
  enabled?:              boolean
  faq?:                  FaqEntry[]
  stopWordFarewellText?: string
  stopWordStageAction?:  StopWordStageAction
}

// Дефолтные эскалационные шаблоны для callIntent (insist-demo).
// Используются только если у вакансии не задан кастомный массив в
// descriptionJson.automation.callIntent.insistDemoMessages.
const DEFAULT_INSIST_DEMO_MESSAGES: [string, string, string] = [
  "{{name}}, понял что хотите созвониться. Чтобы не тратить ваше и моё время, предлагаю сначала пройти короткую демонстрацию должности — там ответы на 90% типовых вопросов: {{demo_link}}",
  "{{name}}, так как мы сейчас в работе, всё-таки предлагаю сначала ознакомиться с демонстрацией должности и ответить на вопросы. Ваши ответы попадут к нам, и после этого назначим время для звонка: {{demo_link}}",
  "{{name}}, наша система сбора устроена так, что созваниваемся с кандидатом только после прохождения демонстрации должности и ответов на вопросы. Спасибо за понимание! Демонстрация: {{demo_link}}",
]

interface VacancyCallIntent {
  enabled?:            boolean
  mode?:               "slot-and-demo" | "slot-only" | "insist-demo"
  keywords?:           string[]
  insistDemoMessages?: string[]
}

const FAREWELL_MESSAGE = "Спасибо за отклик. Желаем удачи!"

interface StageHistoryEntry {
  from:   string
  to:     string
  at:     string
  reason: string
}

interface HHMsg {
  id?: string
  text?: string | null
  body?: string | null
  content?: string | null
  message?: string | null
  author?: { participant_type?: string; type?: string }
  author_type?: string
  created_at?: string
}

function extractText(m: HHMsg): string {
  const direct = [m.text, m.body, m.content, m.message].find(
    v => typeof v === "string" && v.trim().length > 0,
  )
  return typeof direct === "string" ? direct : ""
}

function extractAuthorType(m: HHMsg): string {
  return m.author_type ?? m.author?.participant_type ?? m.author?.type ?? "unknown"
}

async function fetchNewApplicantMessages(
  accessToken: string,
  hhResponseId: string,
  lastSeenId: string | null,
): Promise<HHMsg[]> {
  // Аудит 10.07: раньше читалась только page=0 (100 сообщений) — в длинном
  // диалоге (>100, например с чат-ботом) новые сообщения кандидата вообще не
  // попадали в выборку, а lastSeenId не находился в странице → возвращались
  // ВСЕ сообщения и старые переобрабатывались. Теперь листаем до конца
  // (потолок 5 страниц = 500 сообщений — диалог длиннее в найме нереален).
  const items: HHMsg[] = []
  for (let page = 0; page < 5; page++) {
    const url = `https://api.hh.ru/negotiations/${hhResponseId}/messages?with_text=true&per_page=100&page=${page}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Company24.pro/1.0",
      },
    })
    if (!res.ok) {
      throw new Error(`hh ${res.status}: ${(await res.text()).slice(0, 100)}`)
    }
    const data = await res.json() as { items?: HHMsg[]; pages?: number }
    const chunk = Array.isArray(data.items) ? data.items : []
    items.push(...chunk)
    const totalPages = typeof data.pages === "number" ? data.pages : 1
    if (page + 1 >= totalPages || chunk.length === 0) break
  }
  // Только applicant-сообщения с непустым текстом, отсортированные по
  // created_at ASC, новее last_seen_id.
  const applicant = items
    .filter(m => extractAuthorType(m) === "applicant" && extractText(m).trim().length > 0)
    .sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0
      const tb = b.created_at ? Date.parse(b.created_at) : 0
      return ta - tb
    })
  if (!lastSeenId) return applicant
  // Берём сообщения после последнего обработанного (по позиции в массиве).
  const idx = applicant.findIndex(m => m.id === lastSeenId)
  if (idx === -1) return applicant // last_seen_id не найден — вернём все
  return applicant.slice(idx + 1)
}

async function sendFarewell(
  accessToken: string,
  hhResponseId: string,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.hh.ru/negotiations/${hhResponseId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Company24.pro/1.0",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ message: text }).toString(),
    })
    return res.ok
  } catch {
    return false
  }
}

// Дописывает запись в stage_history кандидата атомарным jsonb-конкатом:
// SELECT+UPDATE теряли запись при параллельной работе с pending-rejections /
// follow-up (last-write-wins).
async function appendStageHistory(
  candidateId: string,
  fromStage: string,
  toStage: string,
  reason: string,
): Promise<void> {
  const entry: StageHistoryEntry = {
    from:   fromStage,
    to:     toStage,
    at:     new Date().toISOString(),
    reason,
  }
  await db.execute(sql`
    UPDATE candidates
    SET stage_history = COALESCE(stage_history, '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb
    WHERE id = ${candidateId}::uuid
  `)
}

async function applyRejection(args: {
  candidateId: string
  reason: string
  hhResponseId: string
  accessToken: string
  sendFarewellFlag: boolean
  /** Текст прощального сообщения (если задан — используем вместо FAREWELL_MESSAGE). */
  farewellText?: string
  /** 'candidate' = отказ по инициативе кандидата (напр. стоп-слово в чате) —
   *  пишем candidates.rejectionInitiator, чтобы отчёт показал «Сам отказ.».
   *  Переиспользуем существующее поле (см. lib/hh/sync-inbound-stages.ts). */
  initiator?: "candidate" | "company"
}): Promise<boolean> {
  const { candidateId, reason, hhResponseId, accessToken, sendFarewellFlag, farewellText, initiator } = args

  // Текущий стейдж нужен для записи в stage_history.
  const [prev] = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  const fromStage = prev?.stage ?? "unknown"

  // Guard от повторного отказа: если кандидат уже rejected — ничего не делаем и
  // НЕ шлём второе прощальное сообщение (иначе в чате несколько отказов подряд).
  if (fromStage === "rejected") {
    return false
  }

  await db.update(candidates).set({
    stage: "rejected",
    // Аудит 10.07: дата события отказа — по ней отчёт считает «Отказов за период».
    rejectionAt: new Date(),
    automationPaused: true,
    autoProcessingStopped: true,
    autoProcessingStoppedReason: reason,
    autoProcessingStoppedAt: new Date(),
    ...(initiator ? { rejectionInitiator: initiator } : {}),
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidateId))

  await appendStageHistory(candidateId, fromStage, "rejected", reason)

  // Отменяем pending-касания.
  await db.update(followUpMessages).set({
    status: "cancelled",
    errorMessage: reason,
  }).where(and(
    eq(followUpMessages.candidateId, candidateId),
    eq(followUpMessages.status, "pending"),
  ))

  if (sendFarewellFlag) {
    return await sendFarewell(accessToken, hhResponseId, farewellText ?? FAREWELL_MESSAGE)
  }
  return false
}

async function applyWantsContact(candidateId: string): Promise<void> {
  const [prev] = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  const fromStage = prev?.stage ?? "unknown"

  // Ф1: slug "wants_contact" удалён (нет в БД, не в lib/stages.ts).
  // Кандидата возвращаем в primary_contact — HR увидит «AI определил намерение
  // на личный контакт» через stageHistory reason="wants_contact_ai".
  // Поле automationPaused оставляем — уже было в коде до Ф1, отдельная логика.
  await db.update(candidates).set({
    stage: "primary_contact",
    automationPaused: true,
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidateId))

  await appendStageHistory(candidateId, fromStage, "primary_contact", "wants_contact_ai")

  await db.update(followUpMessages).set({
    status: "cancelled",
    errorMessage: "wants_contact",
  }).where(and(
    eq(followUpMessages.candidateId, candidateId),
    eq(followUpMessages.status, "pending"),
  ))
}

export interface ScanIncomingResult {
  scanned:           number
  newMessages:       number
  rejectedRegex:     number
  rejectedAi:        number
  wantsContact:      number
  // Инцидент 06.07: decline_requirement + rejection низкой уверенности —
  // дожим на паузу + эскалация HR (не авто-отказ).
  pausedNeedsReview: number
  errors:            string[]
}

export async function scanIncomingMessages(opts: {
  limit?:         number
  staleMinutes?:  number
} = {}): Promise<ScanIncomingResult> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const staleMinutes = opts.staleMinutes ?? 14
  const staleThreshold = new Date(Date.now() - staleMinutes * 60_000)

  const result: ScanIncomingResult = {
    scanned: 0, newMessages: 0,
    rejectedRegex: 0, rejectedAi: 0, wantsContact: 0,
    pausedNeedsReview: 0,
    errors: [],
  }

  // Берём отклики FIFO по last_check_at NULLS FIRST.
  const responses = await db
    .select()
    .from(hhResponses)
    .where(and(
      inArray(hhResponses.status, ["invited", "response"]),
      or(isNull(hhResponses.lastCheckAt), lt(hhResponses.lastCheckAt, staleThreshold)),
    ))
    .orderBy(sql`${hhResponses.lastCheckAt} ASC NULLS FIRST`, asc(hhResponses.createdAt))
    .limit(limit)

  if (responses.length === 0) return result

  // Группируем по company для одного getValidToken на компанию.
  const tokensByCompany = new Map<string, string | null>()
  async function getToken(companyId: string): Promise<string | null> {
    if (tokensByCompany.has(companyId)) return tokensByCompany.get(companyId) ?? null
    const t = await getValidToken(companyId)
    tokensByCompany.set(companyId, t?.accessToken ?? null)
    return t?.accessToken ?? null
  }

  for (const resp of responses) {
    result.scanned++

    // Аудит 10.07 — атомарный CAS-claim отклика (тот же паттерн, что в
    // process-queue: там это чинило двойное приветствие Петренко). Прогоны
    // крона НАКЛАДЫВАЮТСЯ (паузы чат-бота до 120с/сообщение легко растягивают
    // прогон за интервал), и раньше оба брали один отклик → кандидату уходило
    // два разных ответа. Клеймим сдвигом last_check_at: выигравший прогон
    // работает, проигравший видит 0 обновлённых строк и пропускает. Плата за
    // это: при падении процесса отклик переобработается через staleMinutes
    // (14 мин), а не мгновенно — дубль сообщения кандидату хуже этой задержки.
    const claimed = await db.update(hhResponses)
      .set({ lastCheckAt: new Date() })
      .where(and(
        eq(hhResponses.id, resp.id),
        or(isNull(hhResponses.lastCheckAt), lt(hhResponses.lastCheckAt, staleThreshold)),
      ))
      .returning({ id: hhResponses.id })
    if (claimed.length === 0) {
      result.scanned--
      continue // другой прогон уже забрал этот отклик
    }

    const accessToken = await getToken(resp.companyId)
    if (!accessToken) {
      result.errors.push(`no_token:${resp.companyId}`)
      continue // last_check_at уже сдвинут клеймом — зацикливания нет
    }

    // Аудит 10.07 — per-response изоляция ошибок: раньше детерминированная
    // ошибка на ОДНОМ отклике (prequalification/эскалация без try/catch)
    // валила исключением весь прогон, и т.к. отклик оставался первым в FIFO,
    // обработка входящих ВСЕХ компаний вставала намертво. Теперь ошибка
    // логируется, отклик переобработается через staleMinutes, цикл живёт.
    try {

    let newMsgs: HHMsg[] = []
    try {
      newMsgs = await fetchNewApplicantMessages(accessToken, resp.hhResponseId, resp.lastSeenMessageId ?? null)
    } catch (err) {
      result.errors.push(`fetch:${resp.hhResponseId}:${err instanceof Error ? err.message : "?"}`)
      await db.update(hhResponses).set({ lastCheckAt: new Date() })
        .where(eq(hhResponses.id, resp.id))
      continue
    }

    if (newMsgs.length === 0) {
      await db.update(hhResponses).set({ lastCheckAt: new Date() })
        .where(eq(hhResponses.id, resp.id))
      continue
    }

    // First-run guard: при lastSeenMessageId === null это первый прогон
    // для данного отклика. Самое раннее applicant-сообщение в чате —
    // cover letter (отклик кандидата на вакансию), а не ответ на наше
    // приглашение. Классифицировать его как rejection/wants_contact
    // некорректно: длинный текст резюме часто содержит «не», «нет»
    // в составе других слов или фраз («не имею опыта», «нет проблем»),
    // а Haiku может ошибочно прочитать формальный текст как отказ.
    // Поэтому: записываем id самого свежего applicant-сообщения как
    // seen, ничего не классифицируем, выходим. На следующих прогонах
    // классифицируем только сообщения новее cover letter.
    if (!resp.lastSeenMessageId) {
      const lastId = newMsgs[newMsgs.length - 1].id ?? null
      await db.update(hhResponses).set({
        lastSeenMessageId: lastId,
        lastCheckAt: new Date(),
      }).where(eq(hhResponses.id, resp.id))
      console.info(`[scan-incoming] first-run skip ${resp.hhResponseId}: marked ${newMsgs.length} message(s) as seen, no classification`)
      continue
    }

    result.newMessages += newMsgs.length

    // Ищем привязанного кандидата.
    const candidateId = resp.localCandidateId
    if (!candidateId) {
      // Без линка ничего не делаем (классифицировать некого), просто
      // двигаем last_seen_message_id, чтобы не зациклиться.
      const lastId = newMsgs[newMsgs.length - 1].id ?? resp.lastSeenMessageId ?? null
      await db.update(hhResponses).set({
        lastSeenMessageId: lastId,
        lastCheckAt: new Date(),
      }).where(eq(hhResponses.id, resp.id))
      continue
    }

    // Opportunistic backfill фото: если у кандидата всё ещё внешний hh-URL,
    // пробуем direct fetch (CDN отдаёт серверу 200 пока подпись жива),
    // на failure — fallback через hh API (GET /resumes/{id} даёт свежую
    // подписанную ссылку). Любая ошибка не должна сбивать обработку
    // сообщений — поэтому try/catch и continue.
    try {
      const [cand] = await db
        .select({ photoUrl: candidates.photoUrl })
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .limit(1)
      if (cand?.photoUrl && cand.photoUrl.startsWith("https://img.hhcdn.ru")) {
        let local = await saveCandidatePhoto(candidateId, cand.photoUrl)
        if (!local) {
          // Direct упал → подпись протухла. Берём resume_id из hh_candidates,
          // если нет — достаём через negotiation (там всегда есть resume.id).
          const [link] = await db
            .select({ hhResumeId: hhCandidates.hhResumeId })
            .from(hhCandidates)
            .where(eq(hhCandidates.candidateId, candidateId))
            .limit(1)
          let resumeId: string | undefined = link?.hhResumeId
          if (!resumeId) {
            const negoRes = await fetch(
              `https://api.hh.ru/negotiations/${resp.hhResponseId}`,
              { headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Company24.pro/1.0" } },
            )
            if (negoRes.ok) {
              const nego = (await negoRes.json()) as { resume?: { id?: string } }
              resumeId = typeof nego?.resume?.id === "string" ? nego.resume.id : undefined
            }
          }
          if (resumeId) {
            const resRes = await fetch(
              `https://api.hh.ru/resumes/${resumeId}`,
              { headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Company24.pro/1.0" } },
            )
            if (resRes.ok) {
              const resume = (await resRes.json()) as Record<string, unknown>
              const fresh = extractHhResumeFields(resume)
              if (fresh.photoUrl) {
                local = await saveCandidatePhoto(candidateId, fresh.photoUrl)
              }
            }
          }
        }
        if (local) {
          await db.update(candidates).set({ photoUrl: local }).where(eq(candidates.id, candidateId))
        }
      }
    } catch (err) {
      console.warn("[scan-incoming] photo refresh failed", {
        candidateId, err: err instanceof Error ? err.message : String(err),
      })
    }

    // Грузим callIntent из вакансии (через candidate.vacancyId) — один раз
    // на ответ. Также shortId / title для рендера эскалационных шаблонов.
    const [candVac] = await db
      .select({
        candName:       candidates.name,
        candShortId:    candidates.shortId,
        candToken:      candidates.token,
        candStage:      candidates.stage,
        callIntentCount: candidates.callIntentCount,
        prequalStatus:   candidates.prequalificationStatus,
        vacancyId:      candidates.vacancyId,
        vacancyTitle:   vacancies.title,
        descriptionJson: vacancies.descriptionJson,
        companyId:      vacancies.companyId,
        aiChatbotEnabled:  vacancies.aiChatbotEnabled,
        aiChatbotSettings: vacancies.aiChatbotSettings,
        aiChatbotPrompt:   vacancies.aiChatbotPrompt,
        funnelRuntimeEnabled: vacancies.funnelRuntimeEnabled,
        funnelConfigJson:     vacancies.funnelConfigJson,
        stopWordsJson:        vacancies.stopWordsJson,
        aiProcessSettings:    vacancies.aiProcessSettings,
        channelSources:       vacancies.channelSources,
        portraitScoring:      vacancies.portraitScoring,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(vacancies.id, candidates.vacancyId))
      .where(eq(candidates.id, candidateId))
      .limit(1)

    // Аудит 10.07 — терминальные стадии: уже отклонённый/нанятый кандидат не
    // должен получать ответы бота/FAQ, а его «хочу созвониться» — откатывать
    // стадию назад в primary_contact (раньше ни одного гарда по стадии не
    // было). Сообщения помечаем прочитанными (lastSeen сдвигаем ниже по
    // обычному пути) — просто не реагируем.
    if (candVac?.candStage === "rejected" || candVac?.candStage === "hired") {
      const lastIdTerminal = newMsgs[newMsgs.length - 1].id ?? resp.lastSeenMessageId ?? null
      await db.update(hhResponses).set({
        lastSeenMessageId: lastIdTerminal,
        lastCheckAt: new Date(),
      }).where(eq(hhResponses.id, resp.id))
      console.info(`[scan-incoming] skip terminal-stage candidate=${candidateId} stage=${candVac.candStage}: ${newMsgs.length} msg(s) marked seen, no reaction`)
      continue
    }

    // Бот-уточнение (контур «Портрет»): один раз на кандидата читаем spec-флаг,
    // чтобы Executor мягко уточнял спорное. Только для Портрет-вакансий — иначе
    // лишний запрос; дефолт false → поведение прежнее.
    let botClarifyAmbiguous = false
    if (candVac?.portraitScoring && candVac.vacancyId) {
      try { botClarifyAmbiguous = (await getSpec(candVac.vacancyId))?.botClarifyAmbiguous === true } catch { /* fallback false */ }
    }

    const automation = (candVac?.descriptionJson as { automation?: Record<string, unknown> } | null)?.automation
    const callIntent = (automation?.["callIntent"] as VacancyCallIntent | undefined) ?? {}
    // Аддитивно, гейт по умолчанию ВЫКЛ: единый блок «Автоответы кандидату»
    // (Портрет → autoResponder). Стоп-слова НЕ здесь — остаются в stopWordsJson.
    const autoResponder = (candVac?.descriptionJson as { autoResponder?: VacancyAutoResponder } | null)?.autoResponder

    // Проверка channelSources: hh-канал должен быть включён на вакансии.
    // channelSources по умолчанию = ['hh'], так что для большинства вакансий
    // это no-op. Актуально когда HR явно убрал hh из источников (например,
    // вакансия переведена только на Авито).
    {
      const sources = Array.isArray(candVac?.channelSources) ? candVac.channelSources : ["hh"]
      if (!sources.includes("hh")) {
        console.info(`[scan-incoming] skip hhResponse=${resp.hhResponseId}: hh не в channelSources=${JSON.stringify(sources)}`)
        await db.update(hhResponses).set({ lastCheckAt: new Date() })
          .where(eq(hhResponses.id, resp.id))
        result.scanned-- // не считаем как обработанный — просто пропуск
        continue
      }
    }

    // Обрабатываем сообщения по порядку. Если уже сделали rejection —
    // дальнейшие AI-вызовы пропускаем.
    let rejected = false
    let wantsContact = false
    // Пауза+эскалация тоже прерывает батч: иначе следующее сообщение того же
    // прогона могло авто-отклонить кандидата ПОВЕРХ паузы (guard-major 06.07).
    let paused = false
    // Индекс сообщения, на котором упал AI-классификатор: его и всё после
    // него НЕ помечаем прочитанными — повторим в следующий прогон. Иначе
    // сбой Anthropic (429/503) навсегда терял сообщение кандидата
    // («нет, спасибо» → кандидат продолжал получать дожимы).
    let aiFailedIdx: number | null = null
    for (const [msgIdx, msg] of newMsgs.entries()) {
      const text = extractText(msg).trim()
      if (!text) continue
      if (rejected || wantsContact || paused) break

      const preview = text.slice(0, 120).replace(/\s+/g, " ")

      // Автоответы кандидату (FAQ) — ДО чат-бота. Гейт autoResponder.enabled,
      // по умолчанию ВЫКЛ → поведение не меняется. При совпадении отвечаем
      // и НЕ продолжаем обработку этого сообщения (handled, аналог continue).
      if (autoResponder?.enabled === true) {
        const faqReply = matchFaqReply(text, autoResponder.faq)
        if (faqReply) {
          const { firstName } = await getCandidateFirstName(candidateId)
          const tokenForUrl = candVac?.candShortId ?? candVac?.candToken ?? candidateId
          const demoLink = `${getAppBaseUrl()}/demo/${tokenForUrl}`
          const rendered = renderTemplate(faqReply, {
            name:      firstName,
            vacancy:   candVac?.vacancyTitle ?? "",
            demo_link: demoLink,
          })
          const sentOk = await sendFarewell(accessToken, resp.hhResponseId, rendered)
          console.info(`[scan-incoming] ${candidateId} auto_responder_faq_sent ok=${sentOk} text="${preview}"`)
          // Аудит 10.07: недоставленный ответ (429/5xx hh) не должен «съедать»
          // вопрос кандидата — не двигаем lastSeen дальше этого сообщения,
          // повторим на следующем прогоне (тот же механизм, что при сбое AI).
          if (!sentOk) { aiFailedIdx = msgIdx; break }
          continue
        }
      }

      // Платформенный дефолт (04.07, Юрий): «не могу загрузить видео» —
      // НЕЗАВИСИМО от autoResponder.enabled (это дефолт всей платформы, а не
      // настройка вакансии). Срабатывает, только если HR НЕ покрыл этот кейс
      // своей FAQ-парой выше (чтобы не дублировать ответ). Порядок каналов
      // в тексте — облако первично, Telegram-бот вторично (TG в РФ иногда
      // режется провайдерами). Текст редактируемый — lib/auto-responder/upload-fallback.ts.
      if (matchUploadProblemKeyword(text)) {
        const { firstName } = await getCandidateFirstName(candidateId)
        let tgUploadLink: string | null = null
        try {
          const [companyRow] = await db
            .select({ candidateBotUsername: companies.candidateBotUsername })
            .from(companies)
            .where(eq(companies.id, candVac?.companyId ?? ""))
            .limit(1)
          if (companyRow?.candidateBotUsername) {
            let inviteToken = (await db
              .select({ t: candidates.telegramInviteToken })
              .from(candidates)
              .where(eq(candidates.id, candidateId))
              .limit(1))[0]?.t ?? null
            if (!inviteToken) {
              inviteToken = generateInviteToken()
              await db.update(candidates)
                .set({ telegramInviteToken: inviteToken, updatedAt: new Date() })
                .where(eq(candidates.id, candidateId))
            }
            tgUploadLink = buildCandidateDeepLink(companyRow.candidateBotUsername, inviteToken)
          }
        } catch (err) {
          console.warn(`[scan-incoming] ${candidateId} upload_fallback_tg_link_error`, err)
        }
        const template = tgUploadLink ? DEFAULT_UPLOAD_PROBLEM_REPLY : DEFAULT_UPLOAD_PROBLEM_REPLY_NO_TG
        const rendered = renderTemplate(template, {
          name:           firstName,
          vacancy:        candVac?.vacancyTitle ?? "",
          tg_upload_link: tgUploadLink ?? "",
        })
        const sentOk = await sendFarewell(accessToken, resp.hhResponseId, rendered)
        console.info(`[scan-incoming] ${candidateId} upload_fallback_reply_sent ok=${sentOk} tg=${!!tgUploadLink} text="${preview}"`)
        continue
      }

      // #15 phase 5/6: AI чат-бот. Если у вакансии включён бот И есть промпт —
      // отдаём сообщение ему. processChatbotMessage сам решает: ответить, эскалировать,
      // отклонить или пропустить. handled=true означает «AI взял на себя» —
      // дальше в legacy-классификацию не идём для этого сообщения.
      if (isBlockEnabled(candVac, "ai_chatbot", candVac?.aiChatbotEnabled === true) && (candVac?.aiChatbotPrompt ?? "").trim().length > 0) {
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
              botClarifyAmbiguous,
              stopWordFarewellText: autoResponder?.stopWordFarewellText,
              stopWordStageAction:  autoResponder?.stopWordStageAction,
            },
          })
          if (cb.handled) {
            if (cb.action === "sent" && cb.reply) {
              // Группа 33: уважаем тайминги из processor — преCмесс +
              // задержки. Cap-им суммарную задержку 5 минут, чтобы один
              // кандидат не блокировал scan-incoming.
              if (cb.preMessage && cb.preMessageDelayMs) {
                await sendFarewell(accessToken, resp.hhResponseId, cb.preMessage)
                await new Promise(r => setTimeout(r, Math.min(cb.preMessageDelayMs!, 60_000)))
              }
              if (cb.replyDelayMs && cb.replyDelayMs > 0) {
                await new Promise(r => setTimeout(r, Math.min(cb.replyDelayMs!, 60_000)))
              }
              const ok = await sendFarewell(accessToken, resp.hhResponseId, cb.reply)
              console.info(`[scan-incoming] ${candidateId} ai_chatbot_sent ok=${ok} cat=${cb.category} conf=${cb.confidence?.toFixed(2)} text="${preview}"`)
              // Аудит 10.07: недоставленный ответ бота не должен «съедать»
              // вопрос кандидата — не двигаем lastSeen дальше, повтор на
              // следующем прогоне (processChatbotMessage идемпотентен по
              // истории: перечитает контекст и ответит заново).
              if (!ok) { aiFailedIdx = msgIdx; break }

              // Фаза 2b «бот ведёт» (СПЯЩАЯ): если HR включил autonomy.* у вакансии
              // и движок уверенно рекомендует шаг воронки — исполняем. По умолчанию
              // autonomy выключена → funnelDecision="none" → сюда не входим.
              if (
                cb.funnelDecision &&
                (cb.funnelDecision.action === "request_anketa" || cb.funnelDecision.action === "send_test") &&
                cb.funnelDecision.confidence >= 0.75
              ) {
                const ex = await executeFunnelAction(cb.funnelDecision.action, { candidateId, vacancyId: candVac.vacancyId })
                console.info(`[scan-incoming] ${candidateId} funnel-action ${cb.funnelDecision.action} executed=${ex.executed} detail=${ex.detail}`)
              }
            } else if (cb.action === "escalated") {
              console.info(`[scan-incoming] ${candidateId} ai_chatbot_escalated reason=${cb.escalationReason} cat=${cb.category ?? "-"} text="${preview}"`)
            } else if (cb.action === "rejected") {
              // Группа 30: processor может вернуть reply при отказе
              // (injection / severe_abuse / repeated_abuse / unstable) —
              // отправляем кандидату это сообщение перед закрытием цепочки.
              if (cb.reply) {
                if (cb.replyDelayMs && cb.replyDelayMs > 0) {
                  await new Promise(r => setTimeout(r, Math.min(cb.replyDelayMs!, 60_000)))
                }
                const ok = await sendFarewell(accessToken, resp.hhResponseId, cb.reply)
                console.info(`[scan-incoming] ${candidateId} ai_chatbot_rejected_with_reply ok=${ok} reason=${cb.escalationReason} text="${preview}"`)
              } else {
                console.info(`[scan-incoming] ${candidateId} ai_chatbot_rejected reason=${cb.escalationReason} text="${preview}"`)
              }
              if (cb.escalationReason === "stop_word") {
                rejected = true
                result.rejectedRegex++
              } else if (cb.escalationReason?.startsWith("security_")) {
                // Помечаем что цепочку дальше не продолжаем для этого
                // кандидата в текущей итерации scan-incoming.
                rejected = true
              }
            } else {
              console.info(`[scan-incoming] ${candidateId} ai_chatbot_skipped reason=${cb.escalationReason} text="${preview}"`)
            }
            continue
          }
        } catch (err) {
          console.warn(`[scan-incoming] ${candidateId} ai_chatbot_error fallback_to_legacy:`, err instanceof Error ? err.message : err)
          // fallthrough в legacy-классификацию
        }
      }

      // Шаг 1: стоп-слова чата → жёсткий отказ. Делаем до callIntent.
      // Аудит 10.07: кастомный список вакансии ОБЪЕДИНЯЕТСЯ с платформенным
      // baseline, а не заменяет его (раньше при заданном кастомном — а он
      // задан почти всегда — «не хочу»/«нашел работу» без «ё» не ловились).
      {
        const swFlag = (candVac?.aiProcessSettings as { stopWordsChatEnabled?: boolean } | null)?.stopWordsChatEnabled
        if (isBlockEnabled(candVac, "stop_words_chat", swFlag !== false)) {
          const vacStopWords = (candVac?.stopWordsJson ?? []).filter((s): s is string => typeof s === "string")
          const matched = (vacStopWords.length > 0 && matchStopWordList(text, vacStopWords) !== null)
            || matchStopWordWith(text, await getBaselineStopWords())
          if (matched) {
            // Настраиваемая реакция (Юрий 02.07): дефолт 'none' — стадию НЕ
            // трогаем вообще, реагируем только прощальным сообщением (если
            // текст задан в Портрете → «Автоответы кандидату» → «Стоп-слова»).
            // 'candidate_declined' — отказ по инициативе кандидата
            // (rejectionInitiator='candidate', отчёт покажет «Сам отказ.»).
            // 'reject' — обычный отказ работодателя (как раньше по умолчанию).
            const stageAction = readStopWordStageAction(autoResponder?.stopWordStageAction)
            const farewellText = resolveStopWordFarewellText(autoResponder?.stopWordFarewellText)
            let farewellRendered: string | null = null
            if (farewellText) {
              const { firstName } = await getCandidateFirstName(candidateId)
              farewellRendered = renderTemplate(farewellText, {
                name: firstName, vacancy: candVac?.vacancyTitle ?? "", demo_link: "",
              })
            }

            if (stageAction === "none") {
              const sentOk = farewellRendered
                ? await sendFarewell(accessToken, resp.hhResponseId, farewellRendered)
                : false
              // Стадию НЕ трогаем, но дожимы ставим на паузу (Юрий 02.07: не
              // долбить кандидата, написавшего стоп-слово) — automationPaused + отмена
              // pending-касаний. Решение по стадии остаётся за HR.
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
              console.info(`[scan-incoming] ${candidateId} stop_word_no_stage_change paused farewell_sent=${sentOk} text="${preview}"`)
              continue
            }

            const sent = await applyRejection({
              candidateId,
              reason:          "stop_word_regex",
              hhResponseId:    resp.hhResponseId,
              accessToken,
              sendFarewellFlag: !!farewellRendered,
              farewellText:    farewellRendered ?? undefined,
              initiator:       stageAction === "candidate_declined" ? "candidate" : "company",
            })
            result.rejectedRegex++
            rejected = true
            console.info(`[scan-incoming] ${candidateId} stop_word action=${stageAction} farewell=${sent} text="${preview}"`)
            break
          }
        }
      }

      // Шаг 1.4: Предквалификация (Сессия 9). Если у кандидата идёт опрос —
      // парсим ответ через AI Haiku и обновляем qualification_answers.
      // ВАЖНО: эта ветка ДО callIntent, потому что вопросы предкв тоже
      // могут содержать слова из keywords. Если кандидат на стадии опроса,
      // его ответ — это ответ на наши вопросы, а не запрос звонка.
      if (candVac?.prequalStatus === "pending") {
        const pq = await processPrequalificationAnswer({
          candidateId,
          answerText: text,
        })
        console.info(`[scan-incoming] ${candidateId} prequalification_answer processed=${pq.processed} finalized=${pq.finalized ?? false} verdict=${pq.verdict ?? "-"} text="${preview}"`)
        // Какой бы ни был исход — этот msg уже потрачен на предкв,
        // не пускаем в callIntent / AI rejection.
        continue
      }

      // Шаг 1.5: callIntent — keyword matching на «хочу созвон».
      // Активируется только если у вакансии включён master-тумблер и
      // выбран режим insist-demo (два других — бэклог).
      if (callIntent.enabled && callIntent.mode === "insist-demo") {
        const km = matchCallIntentKeyword(text, callIntent.keywords ?? [])
        if (km.matched) {
          const count = candVac?.callIntentCount ?? 0
          if (count < 3) {
            // Подставляем плейсхолдеры и шлём шаблон №(count+1).
            const customs = Array.isArray(callIntent.insistDemoMessages) ? callIntent.insistDemoMessages : []
            const tpl     = customs[count] ?? DEFAULT_INSIST_DEMO_MESSAGES[count]
            const { firstName } = await getCandidateFirstName(candidateId)
            const tokenForUrl = candVac?.candShortId ?? candVac?.candToken ?? candidateId
            const demoLink = `${getAppBaseUrl()}/demo/${tokenForUrl}`
            const message = renderInsistTemplate(tpl, {
              name:     firstName,
              vacancy:  candVac?.vacancyTitle ?? "",
              demoLink,
            })
            const sentOk = await sendFarewell(accessToken, resp.hhResponseId, message)
            await db.update(candidates)
              .set({ callIntentCount: count + 1, updatedAt: new Date() })
              .where(eq(candidates.id, candidateId))
            console.info(`[scan-incoming] ${candidateId} call_intent_keyword="${km.word}" count=${count + 1} sent=${sentOk} text="${preview}"`)
          } else {
            console.info(`[scan-incoming] ${candidateId} call_intent_keyword="${km.word}" count=${count} (>= 3, silent) text="${preview}"`)
          }
          // Не пропускаем msg через AI — это не отказ, мы уже отреагировали.
          continue
        }
      }

      // Шаг 2: AI.
      let cls
      try {
        cls = await classifyCandidateResponse(text, {
          candidateName: resp.candidateName ?? undefined,
        })
      } catch (err) {
        result.errors.push(`ai:${resp.hhResponseId}:${err instanceof Error ? err.message : "?"}`)
        aiFailedIdx = msgIdx
        break
      }

      // ТЗ-3 Ч.3 / инцидент 06.07: решение «авто-отказ / пауза+эскалация /
      // wants_contact / лог» — чистая функция, юнит-тесты в
      // lib/followup/decline-signal.test.ts (без БД/AI).
      const action = decideIncomingMessageAction(cls.intent, cls.confidence)

      if (action.type === "auto_reject") {
        const sent = await applyRejection({
          candidateId,
          reason: "ai_rejection",
          hhResponseId: resp.hhResponseId,
          accessToken,
          sendFarewellFlag: !!cls.farewellMessage,
        })
        result.rejectedAi++
        rejected = true
        console.info(`[scan-incoming] ${candidateId} ai_rejection_applied conf=${cls.confidence} farewell=${sent} text="${preview}"`)
      } else if (action.type === "pause_and_escalate") {
        // decline_requirement: явный отказ от КОНКРЕТНОГО требования вакансии —
        // не общий отказ, авто-отказывать НЕ должны (осознанно только по
        // стоп-факторам). rejection низкой уверенности: раньше только лог,
        // дожим продолжал идти как ни в чём не бывало — часть инцидента 06.07.
        const esc = await pauseFollowUpAndEscalate({
          candidateId,
          vacancyId: candVac.vacancyId,
          incomingText: text,
          reason: action.reason,
          confidence: cls.confidence,
        })
        result.pausedNeedsReview++
        paused = true
        console.info(`[scan-incoming] ${candidateId} ${action.reason}_paused conf=${cls.confidence} already=${esc.alreadyPaused} notif=${esc.notificationSent} tg=${esc.telegramSent} text="${preview}"`)
      } else if (action.type === "wants_contact") {
        await applyWantsContact(candidateId)
        result.wantsContact++
        wantsContact = true
        console.info(`[scan-incoming] ${candidateId} wants_contact conf=${cls.confidence} text="${preview}"`)
      } else {
        // busy_later / agreement / unclear — только лог, без действий.
        console.info(`[scan-incoming] ${candidateId} ${cls.intent} conf=${cls.confidence} text="${preview}"`)
      }
    }

    // При сбое AI двигаем lastSeen только до последнего успешно
    // обработанного сообщения; упавшее и последующие переобработаются.
    const lastId = aiFailedIdx === null
      ? (newMsgs[newMsgs.length - 1].id ?? resp.lastSeenMessageId ?? null)
      : (aiFailedIdx > 0
          ? (newMsgs[aiFailedIdx - 1].id ?? resp.lastSeenMessageId ?? null)
          : (resp.lastSeenMessageId ?? null))
    await db.update(hhResponses).set({
      lastSeenMessageId: lastId,
      lastCheckAt: new Date(),
    }).where(eq(hhResponses.id, resp.id))
    } catch (err) {
      // lastSeen НЕ двигаем — сообщения этого отклика переобработаются через
      // staleMinutes (last_check_at уже сдвинут клеймом, зацикливания нет).
      result.errors.push(`response:${resp.hhResponseId}:${err instanceof Error ? err.message : "?"}`)
      console.error(`[scan-incoming] response ${resp.hhResponseId} failed, isolated:`, err instanceof Error ? err.message : err)
    }
  }

  return result
}
