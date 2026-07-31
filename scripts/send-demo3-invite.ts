/**
 * scripts/send-demo3-invite.ts
 *
 * Адресная кампания «Демо-3» (решение владельца 14.07): пригласить кандидатов,
 * зависших на предыдущих демо-блоках, пройти НОВЫЙ третий блок по прямой
 * ссылке /demo/<token>?block=<id> (параметр ?block= — аддитивная доработка
 * app/api/public/demo/[token]/route.ts, легаси-путь без параметра не тронут).
 *
 * Текст сообщения — ТОЛЬКО из файла --message-file (утверждает владелец,
 * никаких вшитых фраз). Обязательный плейсхолдер {{demo3_link}} скрипт
 * подставляет сам при создании строки очереди (cron рендерит только штатные
 * {{переменные}} — {{имя}}/{{name}} и т.п. остаются на откуп cron'у,
 * см. lib/template-renderer.ts ALIASES).
 *
 * ── Когорты (--cohort) ─────────────────────────────────────────────────────
 *   interview-skipped — кандидаты stage='interview', НЕ завершившие «Демо-2»
 *       (нет ключа блока Д2 в candidates.demo_block_scores — источник правды
 *       прохождения per-блок, см. lib/demo/score-answers.ts). Кандидатов с
 *       бронью интервью (calendar_events type='interview') и со свежим
 *       приглашением на запись (branch='schedule_invite') НЕ исключаем —
 *       решение владельца 14.07 («вернуть всех непрошедших»); в dry-run
 *       печатаем разбивку: с бронью / с приглашением / без ничего. Текст для
 *       этой группы — СВОЙ файл (без обещания «пригласим на интервью»).
 *   demo2 — приглашённые на «Путь менеджера» (override_content_block_id +
 *       second_demo_invited_at, см. lib/messaging/second-demo-invite.ts), не
 *       завершившие СВОЙ приглашённый блок, стадии ДО interview (терминальные
 *       и interview+ исключены — interview-волна идёт отдельной когортой).
 *   all — обе когорты (по построению не пересекаются: demo2 исключает
 *       stage='interview', interview-skipped требует его).
 *
 *   Справочно (НЕ рассылается, только счётчик в dry-run): когорта demo1 —
 *   зависшие на части 1 (stage primary_contact/demo_opened, без override,
 *   не завершили Д1) — владелец её в кампанию 14.07 не включил.
 *
 * ── Обязательные фильтры (все когорты) ─────────────────────────────────────
 *   1. REACHABILITY по hh (инцидент 07.07, перепубликация меняет
 *      vacancies.hh_vacancy_id): шлём ТОЛЬКО тем, чей САМЫЙ СВЕЖИЙ hh_response
 *      (cron берёт именно его — order by created_at desc limit 1,
 *      app/api/cron/follow-up/route.ts) привязан к ТЕКУЩЕЙ публикации
 *      (hh_responses.hh_vacancy_id = vacancies.hh_vacancy_id). Недостижимые —
 *      отдельные цифры в dry-run (no_hh_link / unreachable_old_publication).
 *   2. Исключаем уже открывших (любой физический blockId Д3 в
 *      demo_progress_json.blocks — best-effort) и завершивших Д3 (ключ Д3 в
 *      demo_block_scores — источник правды).
 *   3. ДЕДУП: повторный запуск не шлёт дважды. Маркер — сама строка очереди
 *      branch='demo3_invite' в статусе pending/sending/sent/held (branch не
 *      меняется кроном ни при каком исходе — в отличие от errorMessage,
 *      который затирается при sent). failed/cancelled НЕ блокируют повтор
 *      (доставки не было). touchNumber=998 — доп. маркер волны кампании.
 *   4. Портрет: resume_score >= --min-portrait (дефолт 31, 'off' выключает).
 *      Кандидаты без балла НЕ фильтруются (как родной portrait-gate).
 *   5. auto_processing_stopped / automation_paused — исключаем (кандидат
 *      попросил остановить автоматику); cron это перепроверит на отправке.
 *
 * ── Очередь и отправка ─────────────────────────────────────────────────────
 * Строки — в follow_up_messages, branch='demo3_invite', scheduled_at =
 * adjustToWorkingWindow(now). Cron /api/cron/follow-up обрабатывает ветку как
 * ОДНОРАЗОВОЕ транзакционное касание (isOneOffPostAnketa — доработка этой же
 * ветки кода): без стоп-триггеров дожима, без дневного rate-limit, БЕЗ
 * портрет-гейта дожимов; окно отправки — категория 'invite'
 * (lib/messaging/touch-window.ts, дефолт «круглосуточно»). Мьютекс #61 не
 * мешает при funnel_v2_runtime_enabled=false (скрипт предупреждает, если v2
 * включён — тогда строки будут отложены мьютексом).
 *
 * Запуск (на сервере, из /var/www/my-komanda):
 *   pnpm exec tsx --env-file=.env scripts/send-demo3-invite.ts \
 *     --vacancy=6916db01-a765-4c4e-a652-81475566f95b \
 *     --block=459f58ff-ebdc-4f4d-9344-6c7f25262550 \
 *     --message-file=/root/demo3-invite-interview.txt \
 *     --cohort=interview-skipped [--min-portrait=31|off] [--execute]
 * Без --execute — dry-run: полная сводка, ничего не создаётся.
 */

import { and, eq, inArray, isNull } from "drizzle-orm"
import { readFileSync } from "fs"
import { db, pgClient } from "@/lib/db"
import {
  calendarEvents,
  candidates,
  demos,
  followUpCampaigns,
  followUpMessages,
  hhResponses,
  vacancies,
} from "@/lib/db/schema"
import { getSpec } from "@/lib/core/spec/store"
import { adjustToWorkingWindow, type VacancySchedule } from "@/lib/schedule/can-send-now"
import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"

const BRANCH = "demo3_invite"
const TOUCH_NUMBER = 998 // маркер волны кампании (по конвенции last-touch=999)
const DELAY_MS = 100
const LINK_PLACEHOLDER = "{{demo3_link}}"

type Cohort = "interview-skipped" | "demo2"
const ALL_COHORTS: Cohort[] = ["interview-skipped", "demo2"]

// Терминальные/продвинутые стадии для когорты demo2 — тот же набор, что в
// scripts/enqueue-last-touch.ts (канонический порядок — lib/stages.ts;
// легаси-алиасы живы в проде). interview входит: interview-волна — отдельная
// когорта со СВОИМ текстом.
const DEMO2_EXCLUDED_STAGES = new Set<string>([
  "rejected", "hired", "started_work",
  "interview", "reference_check", "decision", "offer_sent",
  "interviewed", "final_decision", "offer", "preboarding", "scheduled",
  "talent_pool",
])

function arg(name: string): string | undefined {
  const pfx = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(pfx))
  return found ? found.slice(pfx.length) : undefined
}
const EXECUTE = process.argv.includes("--execute")
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface CandidateRow {
  id: string
  name: string
  shortId: string | null
  token: string | null
  stage: string | null
  resumeScore: number | null
  autoProcessingStopped: boolean
  automationPaused: boolean
  overrideContentBlockId: string | null
  secondDemoInvitedAt: Date | null
  demoProgressJson: unknown
  demoBlockScores: unknown
}

type ExclusionReason =
  | "d2_completed"
  | "d3_completed"
  | "d3_opened"
  | "already_queued"
  | "low_portrait"
  | "automation_paused"
  | "no_hh_link"
  | "unreachable_old_publication"

const REASON_LABELS: Record<ExclusionReason, string> = {
  d2_completed:                "«Демо-2» уже завершена (ключ блока в demo_block_scores)",
  d3_completed:                "«Демо-3» уже завершена (ключ блока в demo_block_scores)",
  d3_opened:                   "«Демо-3» уже открывал (blockId Д3 в demo_progress_json)",
  already_queued:              "приглашение Демо-3 уже в очереди/отправлено (дедуп branch=demo3_invite)",
  low_portrait:                "Портрет ниже порога",
  automation_paused:           "автоматизация приостановлена (auto_processing_stopped/automation_paused)",
  no_hh_link:                  "нет ни одного hh_response (нечем слать)",
  unreachable_old_publication: "свежайший hh_response — на старой (закрытой) публикации",
}

/** id всех физических блоков lessons_json (для best-effort «открывал Д3»). */
function extractAllBlockIds(lessonsJson: unknown): string[] {
  const ids: string[] = []
  if (!Array.isArray(lessonsJson)) return ids
  for (const lesson of lessonsJson as { blocks?: { id?: string }[] }[]) {
    if (!lesson || !Array.isArray(lesson.blocks)) continue
    for (const b of lesson.blocks) {
      if (b && typeof b.id === "string" && b.id) ids.push(b.id)
    }
  }
  return ids
}

function hasBlockScore(demoBlockScores: unknown, demoId: string | null): boolean {
  if (!demoId || !demoBlockScores || typeof demoBlockScores !== "object") return false
  return Object.prototype.hasOwnProperty.call(demoBlockScores as Record<string, unknown>, demoId)
}

function progressTouchesBlockIds(demoProgressJson: unknown, blockIds: ReadonlySet<string>): boolean {
  const blocks = (demoProgressJson as { blocks?: { blockId?: string }[] } | null)?.blocks
  if (!Array.isArray(blocks)) return false
  return blocks.some((b) => b && typeof b.blockId === "string" && blockIds.has(b.blockId))
}

async function main() {
  const vacancyId = arg("vacancy")
  const blockId = arg("block")
  const messageFile = arg("message-file")
  if (!vacancyId || !blockId || !messageFile) {
    console.error(
      "Использование: --vacancy=<uuid> --block=<id блока Демо-3> --message-file=<txt с {{demo3_link}}> " +
      "[--cohort=interview-skipped|demo2|all] [--min-portrait=31|off] [--execute]",
    )
    process.exit(1)
  }

  const cohortArg = arg("cohort") ?? "all"
  let cohorts: Cohort[]
  if (cohortArg === "all") cohorts = ALL_COHORTS
  else if ((ALL_COHORTS as string[]).includes(cohortArg)) cohorts = [cohortArg as Cohort]
  else {
    console.error(`--cohort должен быть одним из: ${ALL_COHORTS.join(", ")}, all`)
    process.exit(1)
  }

  const minPortraitArg = arg("min-portrait") ?? "31"
  const minPortrait: number | null = minPortraitArg === "off" ? null : Number(minPortraitArg)
  if (minPortrait !== null && !Number.isFinite(minPortrait)) {
    console.error("--min-portrait должен быть числом или 'off'")
    process.exit(1)
  }

  // ── Текст владельца ──────────────────────────────────────────────────────
  let template: string
  try {
    template = readFileSync(messageFile, "utf-8").trim()
  } catch (err) {
    console.error(`[send-demo3-invite] не удалось прочитать --message-file=${messageFile}:`, err instanceof Error ? err.message : err)
    process.exit(1)
  }
  if (!template) {
    console.error("[send-demo3-invite] файл текста пуст")
    process.exit(1)
  }
  if (!template.includes(LINK_PLACEHOLDER)) {
    console.error(`[send-demo3-invite] в тексте нет обязательного плейсхолдера ${LINK_PLACEHOLDER}`)
    process.exit(1)
  }

  console.log(`[send-demo3-invite] вакансия=${vacancyId} блок=${blockId} когорты=${cohorts.join(",")} min-portrait=${minPortrait ?? "off"}${EXECUTE ? " — РЕЖИМ EXECUTE" : " — dry-run"}`)

  // ── Вакансия ─────────────────────────────────────────────────────────────
  const [vac] = await db
    .select({
      id:                         vacancies.id,
      companyId:                  vacancies.companyId,
      hhVacancyId:                vacancies.hhVacancyId,
      funnelV2RuntimeEnabled:     vacancies.funnelV2RuntimeEnabled,
      aiChatbotEnabled:           vacancies.aiChatbotEnabled,
      outboundPaused:             vacancies.outboundPaused,
      scheduleEnabled:            vacancies.scheduleEnabled,
      scheduleStart:              vacancies.scheduleStart,
      scheduleEnd:                vacancies.scheduleEnd,
      scheduleTimezone:           vacancies.scheduleTimezone,
      scheduleWorkingDays:        vacancies.scheduleWorkingDays,
      scheduleExcludedHolidayIds: vacancies.scheduleExcludedHolidayIds,
      scheduleCustomHolidays:     vacancies.scheduleCustomHolidays,
      scheduleLunchEnabled:       vacancies.scheduleLunchEnabled,
      scheduleLunchFrom:          vacancies.scheduleLunchFrom,
      scheduleLunchTo:            vacancies.scheduleLunchTo,
      scheduleCountry:            vacancies.scheduleCountry,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!vac) {
    console.error(`[send-demo3-invite] вакансия ${vacancyId} не найдена`)
    process.exit(1)
  }
  if (!vac.hhVacancyId) {
    console.error("[send-demo3-invite] у вакансии нет hh_vacancy_id — hh-канал недоступен, слать нечем")
    process.exit(1)
  }
  if (vac.funnelV2RuntimeEnabled) {
    console.warn("[send-demo3-invite] ВНИМАНИЕ: funnel_v2_runtime_enabled=true — мьютекс #61 будет откладывать legacy-касания (в т.ч. demo3_invite) на +24ч, пока v2 активен.")
  }
  if (vac.aiChatbotEnabled) {
    console.warn("[send-demo3-invite] ВНИМАНИЕ: ai_chatbot_enabled=true — cron ОТМЕНИТ касания (ai_chatbot_active), кроме schedule_invite. Выключите чат-бот или не запускайте кампанию.")
  }
  if (vac.outboundPaused) {
    console.warn("[send-demo3-invite] ВНИМАНИЕ: outbound_paused=true — cron будет откладывать отправку на +6ч до снятия паузы.")
  }

  // ── Блоки вакансии: Демо-3 + резолв Д1/Д2 ────────────────────────────────
  const demoRows = await db
    .select({ id: demos.id, kind: demos.kind, title: demos.title, lessonsJson: demos.lessonsJson, updatedAt: demos.updatedAt })
    .from(demos)
    .where(eq(demos.vacancyId, vacancyId))
    .orderBy(demos.sortOrder, demos.createdAt)
  const demo3 = demoRows.find((d) => d.id === blockId)
  if (!demo3) {
    console.error(`[send-demo3-invite] блок ${blockId} не найден у вакансии ${vacancyId} — проверьте --block (id строки demos)`)
    process.exit(1)
  }
  const demo3BlockIds = new Set(extractAllBlockIds(demo3.lessonsJson))
  console.log(`[send-demo3-invite] блок Демо-3: «${demo3.title}» (${demo3.kind}), физических блоков в уроках: ${demo3BlockIds.size}`)

  // Д1 (часть 1) — как резолвит публичный GET /demo: Портрет
  // resumeThresholds.inviteContentBlockId, иначе свежайший kind='demo'.
  // Д2 (Путь менеджера) — spec.anketaPassInvite.contentBlockId; для
  // конкретного кандидата приоритетен его СВОЙ override_content_block_id.
  const spec = await getSpec(vacancyId).catch(() => null)
  const rt = (spec as { resumeThresholds?: { inviteContentBlockId?: string | null } } | null)?.resumeThresholds
  const ap = (spec as { anketaPassInvite?: { contentBlockId?: string | null } } | null)?.anketaPassInvite
  const legacyDemo = demoRows.filter((d) => d.kind === "demo").sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))[0]
  const demo1Id = rt?.inviteContentBlockId ?? legacyDemo?.id ?? null
  const specDemo2Id = ap?.contentBlockId ?? null
  console.log(`[send-demo3-invite] резолв блоков: Д1=${demo1Id ?? "—"} Д2(Портрет)=${specDemo2Id ?? "—"} Д3=${blockId}`)
  if (demo1Id === blockId || specDemo2Id === blockId) {
    console.warn("[send-demo3-invite] ВНИМАНИЕ: --block совпадает с Д1/Д2 — проверьте id блока Демо-3.")
  }

  // ── Кампания (follow_up_messages.campaign_id NOT NULL) ──────────────────
  const [campaign] = await db
    .select({ id: followUpCampaigns.id })
    .from(followUpCampaigns)
    .where(eq(followUpCampaigns.vacancyId, vacancyId))
    .limit(1)
  let campaignId = campaign?.id ?? null
  if (!campaignId && EXECUTE) {
    // Как ensureCampaign в lib/messaging/second-demo-invite.ts: выключенная
    // кампания-носитель, сами дожимы не включает.
    const [created] = await db
      .insert(followUpCampaigns)
      .values({ vacancyId, preset: "off", enabled: false, stopOnReply: true, stopOnVacancyClosed: true })
      .returning({ id: followUpCampaigns.id })
    campaignId = created?.id ?? null
  }
  if (!campaignId && EXECUTE) {
    console.error("[send-demo3-invite] не удалось получить/создать follow_up_campaigns для вакансии")
    process.exit(1)
  }

  const vacancySchedule: VacancySchedule = {
    scheduleEnabled:            vac.scheduleEnabled,
    scheduleStart:              vac.scheduleStart,
    scheduleEnd:                vac.scheduleEnd,
    scheduleTimezone:           vac.scheduleTimezone,
    scheduleWorkingDays:        vac.scheduleWorkingDays,
    scheduleExcludedHolidayIds: vac.scheduleExcludedHolidayIds,
    scheduleCustomHolidays:     vac.scheduleCustomHolidays,
    scheduleLunchEnabled:       vac.scheduleLunchEnabled,
    scheduleLunchFrom:          vac.scheduleLunchFrom,
    scheduleLunchTo:            vac.scheduleLunchTo,
    scheduleCountry:            vac.scheduleCountry,
  }

  const selectFields = {
    id:                     candidates.id,
    name:                   candidates.name,
    shortId:                candidates.shortId,
    token:                  candidates.token,
    stage:                  candidates.stage,
    resumeScore:            candidates.resumeScore,
    autoProcessingStopped:  candidates.autoProcessingStopped,
    automationPaused:       candidates.automationPaused,
    overrideContentBlockId: candidates.overrideContentBlockId,
    secondDemoInvitedAt:    candidates.secondDemoInvitedAt,
    demoProgressJson:       candidates.demoProgressJson,
    demoBlockScores:        candidates.demoBlockScores,
  }

  // ── Справочно: размер когорты demo1 (в кампанию 14.07 НЕ входит) ─────────
  {
    const demo1Base: CandidateRow[] = await db.select(selectFields).from(candidates).where(and(
      eq(candidates.vacancyId, vacancyId),
      isNull(candidates.deletedAt),
      inArray(candidates.stage, ["primary_contact", "demo_opened"]),
      isNull(candidates.overrideContentBlockId),
    ))
    const notDoneD1 = demo1Base.filter((c) => !hasBlockScore(c.demoBlockScores, demo1Id))
    const ids = notDoneD1.map((c) => c.id)
    const hh = ids.length
      ? await db.select({ localCandidateId: hhResponses.localCandidateId, hhVacancyId: hhResponses.hhVacancyId, createdAt: hhResponses.createdAt })
          .from(hhResponses)
          .where(and(eq(hhResponses.companyId, vac.companyId), inArray(hhResponses.localCandidateId, ids)))
      : []
    const freshest = new Map<string, { hhVacancyId: string | null; createdAt: Date | null }>()
    for (const r of hh) {
      const prev = freshest.get(r.localCandidateId ?? "")
      if (!prev || (r.createdAt && prev.createdAt && r.createdAt > prev.createdAt) || (r.createdAt && !prev.createdAt)) {
        if (r.localCandidateId) freshest.set(r.localCandidateId, { hhVacancyId: r.hhVacancyId, createdAt: r.createdAt })
      }
    }
    const reachable = notDoneD1.filter((c) => freshest.get(c.id)?.hhVacancyId === vac.hhVacancyId)
    const portraitOk = reachable.filter((c) => minPortrait === null || typeof c.resumeScore !== "number" || c.resumeScore >= minPortrait)
    console.log(`\n[send-demo3-invite] СПРАВОЧНО когорта demo1 (НЕ рассылается): база=${demo1Base.length}, не завершили Д1=${notDoneD1.length}, достижимы=${reachable.length}, после портрет-фильтра=${portraitOk.length}`)
  }

  let grandEligible = 0
  let grandCreated = 0

  for (const cohort of cohorts) {
    console.log(`\n[send-demo3-invite] ── когорта ${cohort} ──`)

    // ── База когорты ─────────────────────────────────────────────────────
    let base: CandidateRow[]
    if (cohort === "interview-skipped") {
      base = await db.select(selectFields).from(candidates).where(and(
        eq(candidates.vacancyId, vacancyId),
        isNull(candidates.deletedAt),
        eq(candidates.stage, "interview"),
      ))
    } else {
      // demo2: приглашён на «Путь менеджера», стадия до interview.
      base = (await db.select(selectFields).from(candidates).where(and(
        eq(candidates.vacancyId, vacancyId),
        isNull(candidates.deletedAt),
      ))).filter((c) =>
        c.overrideContentBlockId !== null &&
        c.secondDemoInvitedAt !== null &&
        !DEMO2_EXCLUDED_STAGES.has(c.stage ?? ""),
      )
    }
    if (base.length === 0) {
      console.log("[send-demo3-invite] пустая база — нечего обрабатывать")
      continue
    }

    // Гейт когорты: «не завершил Демо-2». Для interview-skipped блок Д2 —
    // свой override кандидата (если был приглашён) или Д2 из Портрета; для
    // demo2 — всегда свой override (по построению не NULL).
    const inCohort = base.filter((c) => {
      const d2Block = cohort === "demo2"
        ? c.overrideContentBlockId
        : (c.overrideContentBlockId ?? specDemo2Id)
      return !hasBlockScore(c.demoBlockScores, d2Block)
    })
    const d2CompletedCount = base.length - inCohort.length

    const candIds = inCohort.map((c) => c.id)

    // ── Пачкой: hh-достижимость (свежайший отклик), дедуп очереди, брони,
    //    schedule_invite ────────────────────────────────────────────────────
    const hhRows = candIds.length
      ? await db
          .select({ localCandidateId: hhResponses.localCandidateId, hhVacancyId: hhResponses.hhVacancyId, createdAt: hhResponses.createdAt })
          .from(hhResponses)
          .where(and(eq(hhResponses.companyId, vac.companyId), inArray(hhResponses.localCandidateId, candIds)))
      : []
    const freshestHh = new Map<string, { hhVacancyId: string | null; createdAt: Date | null }>()
    for (const r of hhRows) {
      if (!r.localCandidateId) continue
      const prev = freshestHh.get(r.localCandidateId)
      const newer = !prev || (r.createdAt != null && (prev.createdAt == null || r.createdAt > prev.createdAt))
      if (newer) freshestHh.set(r.localCandidateId, { hhVacancyId: r.hhVacancyId, createdAt: r.createdAt })
    }

    const queuedRows = candIds.length
      ? await db
          .select({ candidateId: followUpMessages.candidateId })
          .from(followUpMessages)
          .where(and(
            inArray(followUpMessages.candidateId, candIds),
            eq(followUpMessages.branch, BRANCH),
            inArray(followUpMessages.status, ["pending", "sending", "sent", "held"]),
          ))
      : []
    const alreadyQueuedIds = new Set(queuedRows.map((r) => r.candidateId))

    // Разбивка interview-skipped (информационная, НЕ исключает из рассылки).
    const bookedIds = new Set<string>()
    const schedInviteIds = new Set<string>()
    if (cohort === "interview-skipped" && candIds.length) {
      const now = new Date()
      const bookings = await db
        .select({ candidateId: calendarEvents.candidateId, startAt: calendarEvents.startAt, status: calendarEvents.status })
        .from(calendarEvents)
        .where(and(
          inArray(calendarEvents.candidateId, candIds),
          eq(calendarEvents.type, "interview"),
        ))
      for (const b of bookings) {
        if (b.candidateId && b.status !== "cancelled" && b.startAt && b.startAt >= now) bookedIds.add(b.candidateId)
      }
      const schedRows = await db
        .select({ candidateId: followUpMessages.candidateId })
        .from(followUpMessages)
        .where(and(
          inArray(followUpMessages.candidateId, candIds),
          eq(followUpMessages.branch, "schedule_invite"),
          inArray(followUpMessages.status, ["pending", "sending", "sent"]),
        ))
      for (const r of schedRows) schedInviteIds.add(r.candidateId)
    }

    // ── Классификация ────────────────────────────────────────────────────
    interface Classified { cand: CandidateRow; reasons: ExclusionReason[]; eligible: boolean }
    const classified: Classified[] = []
    const reasonCounts: Record<ExclusionReason, number> = {
      d2_completed: d2CompletedCount, d3_completed: 0, d3_opened: 0, already_queued: 0,
      low_portrait: 0, automation_paused: 0, no_hh_link: 0, unreachable_old_publication: 0,
    }

    for (const cand of inCohort) {
      const reasons: ExclusionReason[] = []

      if (hasBlockScore(cand.demoBlockScores, blockId)) reasons.push("d3_completed")
      else if (progressTouchesBlockIds(cand.demoProgressJson, demo3BlockIds)) reasons.push("d3_opened")

      if (alreadyQueuedIds.has(cand.id)) reasons.push("already_queued")
      if (minPortrait !== null && typeof cand.resumeScore === "number" && cand.resumeScore < minPortrait) {
        reasons.push("low_portrait")
      }
      if (cand.autoProcessingStopped || cand.automationPaused) reasons.push("automation_paused")

      const fresh = freshestHh.get(cand.id)
      if (!fresh) reasons.push("no_hh_link")
      else if (fresh.hhVacancyId !== vac.hhVacancyId) reasons.push("unreachable_old_publication")

      for (const r of reasons) reasonCounts[r]++
      classified.push({ cand, reasons, eligible: reasons.length === 0 })
    }

    const eligible = classified.filter((c) => c.eligible)
    grandEligible += eligible.length

    console.log(`[send-demo3-invite] база=${base.length}, не завершили Д2=${inCohort.length}, ЭЛИГИБЛ=${eligible.length}`)
    for (const [reason, count] of Object.entries(reasonCounts)) {
      if (count > 0) console.log(`  исключено/вне когорты (${REASON_LABELS[reason as ExclusionReason]}): ${count}`)
    }
    if (cohort === "interview-skipped") {
      const withBooking = eligible.filter((c) => bookedIds.has(c.cand.id)).length
      const withInvite = eligible.filter((c) => !bookedIds.has(c.cand.id) && schedInviteIds.has(c.cand.id)).length
      console.log(`  разбивка эligible: с бронью интервью=${withBooking}, с приглашением на запись=${withInvite}, без ничего=${eligible.length - withBooking - withInvite}`)
    }
    if (eligible.length > 0) {
      console.log("[send-demo3-invite] эligible-список:")
      eligible.forEach((c, i) => {
        const marks: string[] = []
        if (bookedIds.has(c.cand.id)) marks.push("бронь")
        else if (schedInviteIds.has(c.cand.id)) marks.push("приглашение на запись")
        console.log(`  ${i + 1}. ${c.cand.id}  #${c.cand.shortId ?? "—"}  ${c.cand.name}  стадия=${c.cand.stage ?? "—"}  Портрет=${c.cand.resumeScore ?? "—"}${marks.length ? `  [${marks.join(", ")}]` : ""}`)
      })
    }

    if (!EXECUTE || eligible.length === 0) continue

    // ── EXECUTE: постановка в очередь ────────────────────────────────────
    for (const c of eligible) {
      try {
        // Длинный token (не short_id): short_id ловит реферальный редирект в
        // /demo/[token]/page.tsx — та же причина, что у second_demo_invite в
        // cron follow-up. ?block= переживает прямую загрузку клиентом.
        const tokenForUrl = c.cand.token ?? c.cand.shortId ?? c.cand.id
        const link = `${getAppBaseUrl()}/demo/${tokenForUrl}?block=${blockId}`
        const messageText = template.split(LINK_PLACEHOLDER).join(link)
        const { adjusted } = adjustToWorkingWindow(new Date(), vacancySchedule)
        await db.insert(followUpMessages).values({
          campaignId:    campaignId!,
          candidateId:   c.cand.id,
          scheduledAt:   adjusted,
          touchNumber:   TOUCH_NUMBER,
          channel:       "hh",
          messageText,
          status:        "pending",
          branch:        BRANCH,
          chainD0:       new Date(),
          chainD0Source: "demo3_invite_campaign",
        })
        grandCreated++
        console.log(`  ✓ ${c.cand.id} (${c.cand.name}) — приглашение Демо-3 поставлено в очередь на ${adjusted.toISOString()}`)
      } catch (err) {
        console.error(`  ✗ ${c.cand.id} — ошибка:`, err instanceof Error ? err.message : err)
      }
      await sleep(DELAY_MS)
    }
  }

  console.log(`\n[send-demo3-invite] ИТОГО эligible=${grandEligible}${EXECUTE ? ` создано=${grandCreated}` : " (dry-run, ничего не создано)"}`)
  console.log("[send-demo3-invite] Повторный запуск безопасен: дедуп по branch=demo3_invite в статусах pending/sending/sent/held.")
}

main()
  .then(async () => { await pgClient.end({ timeout: 5 }); process.exit(0) })
  .catch(async (err) => {
    console.error("[send-demo3-invite] ФАТАЛЬНАЯ ОШИБКА:", err instanceof Error ? err.message : err)
    await pgClient.end({ timeout: 5 }).catch(() => { /* ignore */ })
    process.exit(1)
  })
