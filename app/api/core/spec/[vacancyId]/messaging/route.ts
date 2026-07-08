/**
 * PATCH /api/core/spec/[vacancyId]/messaging
 *
 * Точечное сохранение блока «Первый контакт» секции «Коммуникации»
 * (components/vacancies/first-contact-settings.tsx): текст приглашения,
 * задержка перед приглашением, текст и параметры нерабочего времени.
 *
 * КОНТЕКСТ: PUT /api/core/spec/[vacancyId] принимает только ПОЛНЫЙ
 * CandidateSpec — клиентский GET→PUT целиком запрещён (класс бага «устаревший
 * снапшот затирает», см. lib/vacancies/description-json-merge.ts). Этот роут —
 * узкий серверный read-merge-write: читает текущий Spec (или legacy, если
 * Spec ещё не материализован), накладывает только переданные поля и пишет
 * назад тем же путём, что и PUT (saveSpec + syncPortraitMessagingToLegacy).
 *
 * Если vacancy_specs ещё нет записи — НЕ материализуем её здесь (не хотим,
 * чтобы первое же сохранение «Коммуникаций» тихо создавало пустой Портрет).
 * Вместо этого синкаем сразу в legacy-поля вакансии; GET /api/core/spec
 * бэкфиллит их обратно при следующем открытии Портрета.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getSpec, saveSpec } from "@/lib/core/spec/store"
import { syncPortraitMessagingToLegacy } from "@/lib/core/spec/sync-messaging"
import { CandidateSpecSchema } from "@/lib/core/spec/types"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"

const ALLOWED_INVITE_DELAYS = new Set([15, 30, 60, 180, 900, 1800, 3600])
const ALLOWED_OFF_HOURS_DELAYS = new Set([0, 15, 30, 60, 180])
const DEMO_LINK_RE = /\{\{\s*demo_link\s*\}\}/
const FALLBACK_LINK_RE = /\{\s*ссылка\s*\}/

function normalizeInviteDelay(v: number): number {
  return ALLOWED_INVITE_DELAYS.has(v) ? v : 180
}
function normalizeOffHoursDelay(v: number): number {
  return ALLOWED_OFF_HOURS_DELAYS.has(v) ? v : 15
}

const BodySchema = z.object({
  inviteLetter:          z.string().max(2000).optional(),
  offHoursLetter:        z.string().max(2000).optional(),
  inviteDelaySeconds:    z.number().optional(),
  offHoursEnabled:       z.boolean().optional(),
  offHoursDelaySeconds:  z.number().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ vacancyId: string }> },
) {
  try {
    const user = await requireCompany()
    const { vacancyId } = await params

    const [row] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!row) return apiError("Вакансия не найдена", 404)

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return apiError("Невалидный JSON", 400)
    }

    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      return apiError(
        `Ошибка валидации: ${firstIssue?.path?.join(".") ?? ""} — ${firstIssue?.message ?? "неверные данные"}`,
        400,
      )
    }
    const patch = parsed.data

    // Приглашение обязано содержать плейсхолдер ссылки — то же правило, что
    // для chain[0] в /api/modules/hr/vacancies/[id]/first-messages-chain.
    if (typeof patch.inviteLetter === "string" && patch.inviteLetter.trim().length > 0) {
      if (!DEMO_LINK_RE.test(patch.inviteLetter) && !FALLBACK_LINK_RE.test(patch.inviteLetter)) {
        return apiError(
          "Текст приглашения должен содержать плейсхолдер ссылки на демо ({{demo_link}} или {ссылка})",
          400,
        )
      }
    }

    const normalizedInviteDelay = typeof patch.inviteDelaySeconds === "number"
      ? normalizeInviteDelay(patch.inviteDelaySeconds)
      : undefined
    const normalizedOffHoursDelay = typeof patch.offHoursDelaySeconds === "number"
      ? normalizeOffHoursDelay(patch.offHoursDelaySeconds)
      : undefined

    const existingSpec = await getSpec(vacancyId)

    if (existingSpec) {
      // Spec уже материализован — точечно мёржим переданные поля и сохраняем
      // тем же путём, что и PUT (saveSpec + syncPortraitMessagingToLegacy).
      const merged = {
        ...existingSpec,
        ...(patch.inviteLetter   !== undefined ? { inviteLetter: patch.inviteLetter }     : {}),
        ...(patch.offHoursLetter !== undefined ? { offHoursLetter: patch.offHoursLetter } : {}),
        resumeThresholds: {
          ...existingSpec.resumeThresholds,
          ...(normalizedInviteDelay    !== undefined ? { inviteDelaySeconds: normalizedInviteDelay }     : {}),
          ...(patch.offHoursEnabled    !== undefined ? { offHoursEnabled: patch.offHoursEnabled }         : {}),
          ...(normalizedOffHoursDelay  !== undefined ? { offHoursDelaySeconds: normalizedOffHoursDelay }  : {}),
        },
      }

      // Safety-net: прогоняем через полную схему (как GET/store делают на
      // чтении) — merged собран из уже валидного existingSpec + точечных
      // патчей известных типов, поэтому парсинг должен пройти всегда, но
      // не полагаемся на это молча.
      const reparsed = CandidateSpecSchema.safeParse(merged)
      if (!reparsed.success) {
        console.warn(`[spec messaging PATCH] merged spec не прошёл валидацию vacancy=${vacancyId}:`,
          JSON.stringify(reparsed.error.issues.map(i => ({ path: i.path.join("."), msg: i.message }))))
        return apiError("Не удалось сохранить — повреждённые данные Портрета", 500)
      }

      await saveSpec(vacancyId, reparsed.data, user.id)
      try {
        await syncPortraitMessagingToLegacy(vacancyId, reparsed.data)
      } catch (syncErr) {
        console.warn("[spec messaging PATCH] syncPortraitMessagingToLegacy failed:", syncErr)
      }

      return apiSuccess({
        inviteLetter:         reparsed.data.inviteLetter,
        offHoursLetter:       reparsed.data.offHoursLetter,
        inviteDelaySeconds:   reparsed.data.resumeThresholds.inviteDelaySeconds,
        offHoursEnabled:      reparsed.data.resumeThresholds.offHoursEnabled,
        offHoursDelaySeconds: reparsed.data.resumeThresholds.offHoursDelaySeconds,
      })
    }

    // Портрет ни разу не сохранялся для этой вакансии — НЕ материализуем
    // vacancy_specs здесь. Собираем синк-payload из переданных значений,
    // подставляя текущие legacy-значения там, где поле не передано (GET
    // /api/core/spec и так бэкфиллит из legacy при следующем открытии).
    const [legacyRow] = await db
      .select({
        aiProcessSettings:                vacancies.aiProcessSettings,
        firstMessagesChain:               vacancies.firstMessagesChain,
        firstMessageOffHoursEnabled:      vacancies.firstMessageOffHoursEnabled,
        firstMessageOffHoursDelaySeconds: vacancies.firstMessageOffHoursDelaySeconds,
        firstMessageOffHoursText:         vacancies.firstMessageOffHoursText,
      })
      .from(vacancies)
      .where(eq(vacancies.id, vacancyId))
      .limit(1)

    const legacyInviteMessage = (legacyRow?.aiProcessSettings as VacancyAiProcessSettings | null)?.inviteMessage ?? ""
    const chain0 = Array.isArray(legacyRow?.firstMessagesChain)
      ? (legacyRow!.firstMessagesChain as Array<{ delaySeconds?: number }>)[0]
      : null

    const syncPayload = {
      inviteLetter:   patch.inviteLetter   !== undefined ? patch.inviteLetter   : legacyInviteMessage,
      offHoursLetter: patch.offHoursLetter !== undefined ? patch.offHoursLetter : (legacyRow?.firstMessageOffHoursText ?? ""),
      resumeThresholds: {
        inviteDelaySeconds:   normalizedInviteDelay   ?? (typeof chain0?.delaySeconds === "number" ? chain0.delaySeconds : 180),
        offHoursEnabled:      patch.offHoursEnabled   ?? (legacyRow?.firstMessageOffHoursEnabled ?? true),
        offHoursDelaySeconds: normalizedOffHoursDelay ?? (legacyRow?.firstMessageOffHoursDelaySeconds ?? 15),
      },
    }

    await syncPortraitMessagingToLegacy(vacancyId, syncPayload)

    return apiSuccess({
      inviteLetter:         syncPayload.inviteLetter,
      offHoursLetter:       syncPayload.offHoursLetter,
      inviteDelaySeconds:   syncPayload.resumeThresholds.inviteDelaySeconds,
      offHoursEnabled:      syncPayload.resumeThresholds.offHoursEnabled,
      offHoursDelaySeconds: syncPayload.resumeThresholds.offHoursDelaySeconds,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Ошибка сервера", 500)
  }
}
