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
import { hhResponses, candidates, followUpMessages, hhCandidates } from "@/lib/db/schema"
import { getValidToken } from "@/lib/hh-helpers"
import { STOP_WORDS } from "@/lib/followup/should-stop"
import { classifyCandidateResponse } from "@/lib/ai/classify-candidate-response"
import { saveCandidatePhoto } from "@/lib/hh/save-candidate-photo"
import { extractHhResumeFields } from "@/lib/hh/extract-resume-fields"

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

// Word-boundaries регекс по стоп-словам. Раньше использовался
// .includes(w), что давало false positives на substring'ах: «интернет»
// содержит «нет», «внеплановый» содержит «не», и т.п. После инцидента
// 04.05.2026 (19 кандидатов ошибочно в rejected) — только полные слова
// или точные многословные фразы, ограниченные whitespace.
function matchStopWord(text: string): boolean {
  // Нормализация: вся пунктуация → пробел, схлопываем пробелы.
  const norm = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!norm) return false
  for (const w of STOP_WORDS) {
    // Внутренние пробелы фразы становятся \s+ для устойчивости к множественным пробелам.
    const escaped = w.toLowerCase().replace(/\s+/g, "\\s+")
    const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "u")
    if (re.test(norm)) return true
  }
  return false
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

// Дописывает запись в stage_history кандидата. Делается одним
// SELECT+UPDATE — гонок при последовательной обработке cron'ом нет.
async function appendStageHistory(
  candidateId: string,
  fromStage: string,
  toStage: string,
  reason: string,
): Promise<void> {
  const [row] = await db
    .select({ stageHistory: candidates.stageHistory })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  const history = (row?.stageHistory as StageHistoryEntry[] | null) ?? []
  const entry: StageHistoryEntry = {
    from:   fromStage,
    to:     toStage,
    at:     new Date().toISOString(),
    reason,
  }
  await db
    .update(candidates)
    .set({ stageHistory: [...history, entry] })
    .where(eq(candidates.id, candidateId))
}

async function applyRejection(args: {
  candidateId: string
  reason: string
  hhResponseId: string
  accessToken: string
  sendFarewellFlag: boolean
}): Promise<boolean> {
  const { candidateId, reason, hhResponseId, accessToken, sendFarewellFlag } = args

  // Текущий стейдж нужен для записи в stage_history.
  const [prev] = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1)
  const fromStage = prev?.stage ?? "unknown"

  await db.update(candidates).set({
    stage: "rejected",
    automationPaused: true,
    autoProcessingStopped: true,
    autoProcessingStoppedReason: reason,
    autoProcessingStoppedAt: new Date(),
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
    return await sendFarewell(accessToken, hhResponseId, FAREWELL_MESSAGE)
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

    // Обрабатываем сообщения по порядку. Если уже сделали rejection —
    // дальнейшие AI-вызовы пропускаем.
    let rejected = false
    let wantsContact = false
    for (const msg of newMsgs) {
      const text = extractText(msg).trim()
      if (!text) continue
      if (rejected || wantsContact) break

      const preview = text.slice(0, 120).replace(/\s+/g, " ")

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
        console.info(`[scan-incoming] ${candidateId} regex_stop_word farewell=${sent} text="${preview}"`)
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
        console.info(`[scan-incoming] ${candidateId} ai_rejection conf=${cls.confidence} farewell=${sent} text="${preview}"`)
      } else if (cls.intent === "wants_personal_contact") {
        await applyWantsContact(candidateId)
        result.wantsContact++
        wantsContact = true
        console.info(`[scan-incoming] ${candidateId} wants_contact conf=${cls.confidence} text="${preview}"`)
      } else {
        // busy_later / agreement / unclear — только лог, без действий.
        console.info(`[scan-incoming] ${candidateId} ${cls.intent} conf=${cls.confidence} text="${preview}"`)
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
