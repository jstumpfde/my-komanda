// Слушатель входящих сообщений в hh-чате.
// Используется cron-эндпоинтом /api/cron/hh-incoming-messages каждые 15 мин.
//
// Что делает:
//   1. Тянет до LIMIT откликов (FIFO по last_check_at NULLS FIRST)
//      со status IN ('invited','response') и last_check_at < NOW()-14min OR NULL.
//   2. Для каждого: GET /negotiations/{id}/messages?with_text=true.
//   3. Берёт applicant-сообщения новее last_seen_message_id.
//   4. Двухступенчатая классификация:
//      a. regex по STOP_WORDS → если совпало, сразу stage='rejected',
//         automationPaused=true, отправляем прощальное сообщение,
//         отменяем pending touches.
//      b. Если стоп-слов нет — вызываем classifyCandidateResponse (AI):
//         rejection → как (a) выше, wants_personal_contact → stage='wants_contact'
//         + automationPaused, остальное — лог.
//   5. Обновляем last_seen_message_id (max id), last_check_at = NOW().

import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { hhResponses, candidates, followUpMessages } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import { STOP_WORDS } from "@/lib/followup/should-stop"
import { classifyCandidateResponse } from "@/lib/ai/classify-candidate-response"
import { logAiAction } from "@/lib/ai-audit"

const FAREWELL_MESSAGE = "Спасибо за отклик. Желаем удачи!"

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

function matchStopWord(text: string): boolean {
  const lower = text.toLowerCase()
  return STOP_WORDS.some(w => lower.includes(w))
}

async function fetchNewApplicantMessages(
  accessToken: string,
  hhResponseId: string,
  lastSeenId: string | null,
): Promise<HHMsg[]> {
  const url = `https://api.hh.ru/negotiations/${hhResponseId}/messages?with_text=true&per_page=100&page=0`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "Company24.pro/1.0",
    },
  })
  if (!res.ok) {
    throw new Error(`hh ${res.status}: ${(await res.text()).slice(0, 100)}`)
  }
  const data = await res.json() as { items?: HHMsg[] }
  const items = Array.isArray(data.items) ? data.items : []
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

async function applyRejection(args: {
  candidateId: string
  reason: string
  hhResponseId: string
  accessToken: string
  sendFarewellFlag: boolean
}): Promise<boolean> {
  const { candidateId, reason, hhResponseId, accessToken, sendFarewellFlag } = args
  await db.update(candidates).set({
    stage: "rejected",
    automationPaused: true,
    autoProcessingStopped: true,
    autoProcessingStoppedReason: reason,
    autoProcessingStoppedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidateId))

  // Отменяем pending-касания.
  await db.update(followUpMessages).set({
    status: "cancelled",
    errorMessage: reason,
  }).where(and(
    eq(followUpMessages.candidateId, candidateId),
    eq(followUpMessages.status, "pending"),
  ))

  if (sendFarewellFlag) {
    return await sendFarewell(accessToken, hhResponseId, FAREWELL_MESSAGE)
  }
  return false
}

async function applyWantsContact(candidateId: string): Promise<void> {
  await db.update(candidates).set({
    stage: "wants_contact",
    automationPaused: true,
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidateId))

  await db.update(followUpMessages).set({
    status: "cancelled",
    errorMessage: "wants_contact",
  }).where(and(
    eq(followUpMessages.candidateId, candidateId),
    eq(followUpMessages.status, "pending"),
  ))
}

export interface ScanIncomingResult {
  scanned:        number
  newMessages:    number
  rejectedRegex:  number
  rejectedAi:     number
  wantsContact:   number
  errors:         string[]
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
    const accessToken = await getToken(resp.companyId)
    if (!accessToken) {
      result.errors.push(`no_token:${resp.companyId}`)
      // Пишем last_check_at чтобы не зацикливаться на этой компании.
      await db.update(hhResponses).set({ lastCheckAt: new Date() })
        .where(eq(hhResponses.id, resp.id))
      continue
    }

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

    // Обрабатываем сообщения по порядку. Если уже сделали rejection —
    // дальнейшие AI-вызовы пропускаем.
    let rejected = false
    let wantsContact = false
    for (const msg of newMsgs) {
      const text = extractText(msg).trim()
      if (!text) continue
      if (rejected || wantsContact) break

      // Шаг 1: regex.
      if (matchStopWord(text)) {
        const sent = await applyRejection({
          candidateId,
          reason: "stop_word_regex",
          hhResponseId: resp.hhResponseId,
          accessToken,
          sendFarewellFlag: true,
        })
        result.rejectedRegex++
        rejected = true
        await logAiAction({
          tenantId:      resp.companyId,
          action:        "classify_incoming",
          candidateId,
          inputSummary:  text.slice(0, 200),
          outputSummary: `regex_stop_word; farewell_sent=${sent}`,
        }).catch(() => {})
        break
      }

      // Шаг 2: AI.
      let cls
      try {
        cls = await classifyCandidateResponse(text, {
          candidateName: resp.candidateName ?? undefined,
        })
      } catch (err) {
        result.errors.push(`ai:${resp.hhResponseId}:${err instanceof Error ? err.message : "?"}`)
        continue
      }

      if (cls.intent === "rejection") {
        const sent = await applyRejection({
          candidateId,
          reason: "ai_rejection",
          hhResponseId: resp.hhResponseId,
          accessToken,
          sendFarewellFlag: !!cls.farewellMessage,
        })
        result.rejectedAi++
        rejected = true
        await logAiAction({
          tenantId:      resp.companyId,
          action:        "classify_incoming",
          candidateId,
          inputSummary:  text.slice(0, 200),
          outputSummary: `ai_rejection conf=${cls.confidence} farewell_sent=${sent}`,
        }).catch(() => {})
      } else if (cls.intent === "wants_personal_contact") {
        await applyWantsContact(candidateId)
        result.wantsContact++
        wantsContact = true
        await logAiAction({
          tenantId:      resp.companyId,
          action:        "classify_incoming",
          candidateId,
          inputSummary:  text.slice(0, 200),
          outputSummary: `wants_contact conf=${cls.confidence}`,
        }).catch(() => {})
      } else {
        // busy_later / agreement / unclear — только лог, без действий.
        await logAiAction({
          tenantId:      resp.companyId,
          action:        "classify_incoming",
          candidateId,
          inputSummary:  text.slice(0, 200),
          outputSummary: `${cls.intent} conf=${cls.confidence}`,
        }).catch(() => {})
      }
    }

    const lastId = newMsgs[newMsgs.length - 1].id ?? resp.lastSeenMessageId ?? null
    await db.update(hhResponses).set({
      lastSeenMessageId: lastId,
      lastCheckAt: new Date(),
    }).where(eq(hhResponses.id, resp.id))
  }

  return result
}
