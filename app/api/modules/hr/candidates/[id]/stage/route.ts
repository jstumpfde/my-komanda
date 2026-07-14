import { NextRequest } from "next/server"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { trySyncStageToHh, trySyncRejectToHh, trySyncInviteToHh } from "@/lib/hh/sync-stage"
import { sendWebhook } from "@/lib/webhooks"
import { sendToBitrix } from "@/lib/bitrix"
import { scheduleInterviewInvite } from "@/lib/messaging/schedule-invite"
import { maybeScheduleDemo3BeforeInterview } from "@/lib/messaging/demo3-before-interview"
import { ALL_STAGE_SLUGS, LEGACY_STAGE_LABELS, type StageSlug } from "@/lib/stages"
import { PORTRAIT_BELOW_THRESHOLD_REASON } from "@/lib/hh/entry-gate"

// Причины «пред. отказа», которые ручное решение HR (перевод стадии) отменяет
// (см. коммент ниже). anketa_gate_failed — гейт анкеты (03.07); входной гейт
// Портрета по resume_score — тот же принцип (06.07, инцидент вакансия 6916).
const CANCELLABLE_PENDING_REASONS: readonly string[] = ["anketa_gate_failed", PORTRAIT_BELOW_THRESHOLD_REASON]

// Валидные значения stage = канонические 19 слугов (lib/stages.ts,
// ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ) + legacy-слуги второй параллельной системы
// статусов (баг B9), которые всё ещё живые в БД и активно пишутся здесь
// и в других роутах (talent_pool, final_decision, demo, pending, preboarding).
// Раньше был захардкожен урезанный legacy-список без части канона (напр.
// без 'scheduled') → кнопка «На интервью» (stage="scheduled") падала 400.
const VALID_STAGES: readonly string[] = [
  ...ALL_STAGE_SLUGS,
  ...Object.keys(LEGACY_STAGE_LABELS),
]
type Stage = StageSlug | keyof typeof LEGACY_STAGE_LABELS

// Стейджи «после приглашения». Если кандидат уже был в одном из них
// и его переводят в primary_contact — это внутренняя ручная корректировка,
// hh-инвайт повторно не отправляем (он уже его получил).
const POST_INVITE_STAGES: ReadonlySet<Stage> = new Set([
  "primary_contact", "demo_opened", "demo", "anketa_filled",
  "decision", "ai_screening", "interview", "final_decision", "hired",
  // B9-фикс 14.07: канонические слаги v2-движка
  "offer_sent", "reference_check",
])

export { PUT as PATCH }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json() as {
      stage?: unknown
      rejectionReasonCategory?: string | null
      rejectionInitiator?: string | null
      rejectionComment?: string | null
      // sendMessage: если false — перевод стадии ТИХИЙ (сообщение не уходит).
      // По умолчанию (undefined/true) — прежнее поведение (обратная совместимость).
      sendMessage?: boolean
      // messageOverride: кастомный текст сообщения вместо шаблона вакансии.
      // Актуален только когда sendMessage !== false.
      messageOverride?: string | null
      // Вид интервью (Звонок|Онлайн|В офис) при переводе в 'interview' —
      // сохраняется кандидату, страница самозаписи покажет календарь вида.
      interviewMode?: "phone" | "zoom" | "office" | null
    }
    const stage = body.stage as Stage | undefined
    // undefined → true (backward-compat: параметр не передан = старое поведение)
    const sendMessage = body.sendMessage !== false

    if (!stage || !VALID_STAGES.includes(stage)) {
      return apiError(
        `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}`,
        400
      )
    }

    // Verify candidate belongs to user's company via vacancy join.
    // Возвращаем previousStage чтобы понять, нужен ли hh-инвайт.
    const [row] = await db
      .select({ candidateId: candidates.id, previousStage: candidates.stage })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!row) {
      return apiError("Candidate not found", 404)
    }

    const stopAutoProcessing = stage === "rejected"

    // Ручное решение HR отменяет отложенный авто-отказ по входным гейтам
    // (anketa_gate_failed / portrait_below_threshold — CANCELLABLE_PENDING_REASONS):
    // человек сам решил, куда двигать кандидата — таймер «предварительного
    // отказа» не должен сработать позже. v2/прочие pending-отказы не трогаем
    // (у них своя механика).
    await db.update(candidates)
      .set({
        pendingRejectionAt:      null,
        pendingRejectionReason:  null,
        pendingRejectionSetAt:   null,
        pendingRejectionMessage: null,
      })
      .where(and(
        eq(candidates.id, id),
        inArray(candidates.pendingRejectionReason, CANCELLABLE_PENDING_REASONS),
      ))

    const [updated] = await db
      .update(candidates)
      .set({
        stage,
        updatedAt: new Date(),
        // Вид интервью: HR выбрал Звонок/Онлайн/В офис — календарь кандидата
        // на /schedule покажет именно этот способ встречи.
        ...(stage === "interview" && (body.interviewMode === "phone" || body.interviewMode === "zoom" || body.interviewMode === "office")
          ? { interviewMode: body.interviewMode }
          : {}),
        // Аудит 10.07: дата события найма — для честных метрик отчёта
        // («Нанято за период» по дате найма, а не дате отклика).
        ...(stage === "hired" ? { hiredAt: new Date() } : {}),
        ...(stopAutoProcessing
          ? {
              autoProcessingStopped: true,
              autoProcessingStoppedReason: "manual_rejection",
              autoProcessingStoppedAt: new Date(),
              // Структурированная причина отказа (для отчёта найма).
              rejectionReasonCategory: body.rejectionReasonCategory ?? null,
              rejectionInitiator: body.rejectionInitiator ?? null,
              rejectionComment: body.rejectionComment ?? null,
              rejectionAt: new Date(),
            }
          : {}),
      })
      // TOCTOU-защита: UPDATE сам скоупим по компании (а не только SELECT выше),
      // чтобы между проверкой и записью нельзя было подменить владельца.
      // У candidates нет company_id — изоляция через вакансию компании.
      .where(and(
        eq(candidates.id, id),
        inArray(
          candidates.vacancyId,
          db.select({ id: vacancies.id }).from(vacancies).where(eq(vacancies.companyId, user.companyId)),
        ),
      ))
      .returning()

    if (!updated) {
      return apiError("Candidate not found", 404)
    }

    // Sync с hh.ru — fire-and-forget, ошибка не блокирует ответ.
    // Ф6: hh-action читается из pipeline вакансии (lib/hh/sync-stage.ts).
    // Дефолтное поведение совпадает со старым (primary_contact = invitation,
    // rejected = discard), но теперь HR может настроить hh-action на любой
    // стадии в табе «Воронка».
    //
    // sendMessage=false → пропускаем hh-sync и schedule_invite полностью.
    // messageOverride → передаём кастомный текст в hh (только для discard/invitation).
    //
    // Защита от повторного invite: если HR двигает кандидата в стадию с
    // hhAction=invitation, а кандидат уже был дальше по воронке —
    // пропускаем sync. Иначе HR-исправление back-to-primary_contact
    // привело бы к повторному hh-приглашению.
    if (sendMessage) {
      const alreadyInvited = stage === "primary_contact"
        && row.previousStage !== null
        && POST_INVITE_STAGES.has(row.previousStage as Stage)
      if (!alreadyInvited) {
        // Если передан messageOverride — используем специализированные функции
        // (они умеют принять готовый текст), иначе — универсальный trySyncStageToHh.
        const override = typeof body.messageOverride === "string" && body.messageOverride.trim().length > 0
          ? body.messageOverride.trim()
          : null
        if (override) {
          // Определяем действие через trySyncStageToHh (пайплайн внутри), но
          // с override-текстом нужны специализированные функции.
          // Для rejected — trySyncRejectToHh поддерживает customMessage.
          // Для invitation — trySyncInviteToHh не поддерживает override пока,
          // поэтому при override на invitation-стадию игнорируем переопределение
          // и падаем обратно на trySyncStageToHh.
          if (stage === "rejected") {
            trySyncRejectToHh(id, override).catch((err) => {
              console.warn(`[stage-route] hh reject (override) failed for ${id}:`, err)
            })
          } else {
            trySyncStageToHh(id, stage).catch((err) => {
              console.warn(`[stage-route] hh sync failed for ${id} (${stage}):`, err)
            })
          }
        } else {
          trySyncStageToHh(id, stage).catch((err) => {
            console.warn(`[stage-route] hh sync failed for ${id} (${stage}):`, err)
          })
        }
      }

      // #3.1: авто-отправка ссылки /schedule/[token] кандидату при входе в стадию
      // интервью. Триггерим только на ПЕРЕХОД в 'interview' (не при повторном
      // сохранении той же стадии) — scheduleInterviewInvite сам идемпотентен
      // (дедуп pending|sent schedule_invite). Канал — hh-чат через cron follow-up.
      if (stage === "interview" && row.previousStage !== "interview") {
        const overrideText = typeof body.messageOverride === "string" && body.messageOverride.trim().length > 0
          ? body.messageOverride.trim()
          : undefined
        void scheduleInterviewInvite({ candidateId: id, vacancyId: updated.vacancyId, messageText: overrideText })
          .catch((err) => console.warn(`[stage-route] schedule invite failed for ${id}:`, err))
        // Мягкое напоминание «пройдите Демо-3 до интервью» (14.07): если у
        // вакансии есть последний скорируемый демо-блок и кандидат его не
        // прошёл — ставим одно напоминание (гейт/дедуп — внутри).
        void maybeScheduleDemo3BeforeInterview({ candidateId: id, vacancyId: updated.vacancyId })
          .catch((err) => console.warn(`[stage-route] demo3 reminder failed for ${id}:`, err))
      }
    } else {
      console.info(`[stage-route] sendMessage=false → тихий перевод ${id} → ${stage}`)
    }

    // Webhooks (hiring_defaults.webhooks): отправляем событие смены этапа во
    // внешнюю систему компании, если HR задал URL и включил событие.
    // Fire-and-forget — таймаут/ошибка не влияют на ответ. Раньше настройки
    // webhooks ни к чему не были подключены (lib/webhooks.ts не вызывался).
    void (async () => {
      try {
        const [company] = await db
          .select({ hd: companies.hiringDefaultsJson })
          .from(companies)
          .where(eq(companies.id, user.companyId))
          .limit(1)
        const wh = (company?.hd as { webhooks?: { url?: string; events?: Record<string, boolean> } } | null)?.webhooks
        if (wh?.url) {
          const events = wh.events || {}
          const payload = { candidateId: id, stage, previousStage: row.previousStage, vacancyId: updated.vacancyId }
          if (events.stage_change) await sendWebhook(wh.url, "stage_change", payload)
          if (stage === "rejected" && events.reject) await sendWebhook(wh.url, "reject", payload)
          if ((stage === "offer" || stage === "hired") && events.offer) await sendWebhook(wh.url, "offer", payload)
        }

        // O4: Битрикс24 — при достижении настроенного этапа создаём лид в CRM.
        // trigger: конкретный этап (напр. 'offer') или 'all'. Без URL — ничего.
        const bx = (company?.hd as { bitrix?: { url?: string; trigger?: string } } | null)?.bitrix
        if (bx?.url && (bx.trigger === "all" || bx.trigger === stage)) {
          const [cand] = await db
            .select({ name: candidates.name, phone: candidates.phone, email: candidates.email, aiScore: candidates.aiScore, vacancyTitle: vacancies.title })
            .from(candidates)
            .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
            .where(eq(candidates.id, id)).limit(1)
          if (cand?.name) {
            await sendToBitrix(bx.url, {
              name: cand.name,
              phone: cand.phone ?? undefined,
              email: cand.email ?? undefined,
              vacancyTitle: cand.vacancyTitle ?? undefined,
              aiScore: cand.aiScore ?? undefined,
            })
          }
        }
      } catch (err) {
        console.warn("[stage-route] webhook/bitrix dispatch failed:", err)
      }
    })()

    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
