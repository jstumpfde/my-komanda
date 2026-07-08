/**
 * lib/core/spec/sync-messaging.ts
 *
 * Вынесено из app/api/core/spec/[vacancyId]/route.ts (08.07, консолидация
 * секции «Коммуникации») — route-файлы Next не должны экспортировать ничего
 * кроме HTTP-хендлеров, а функция теперь нужна ещё и в PATCH .../messaging.
 * Поведение и комментарии — байт-в-байт как было в route.ts.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import type { VacancyAiProcessSettings } from "@/lib/db/schema"

/**
 * ВСЕГДА-включённый синк МЕССЕДЖИНГА Портрета (текст приглашения + задержка +
 * нерабочее время) в legacy — НЕ за флагом SPEC_MIRROR_TO_LEGACY, потому что это
 * напрямую влияет на сообщения живым кандидатам и обязано быть единым во всех
 * местах (Портрет / таб «Коммуникации» / крон). Пишет:
 *   - aiProcessSettings.inviteMessage      ← inviteLetter (читает крон)
 *   - firstMessagesChain[0].text/delay     ← inviteLetter / inviteDelaySeconds (редактор цепочки)
 *   - first_message_off_hours_enabled/_delay_seconds/_text ← off-hours поля Портрета
 * Пустые тексты НЕ затирают существующие.
 */
export async function syncPortraitMessagingToLegacy(
  vacancyId: string,
  spec: {
    inviteLetter: string
    offHoursLetter: string
    resumeThresholds: { inviteDelaySeconds: number; offHoursEnabled: boolean; offHoursDelaySeconds: number }
  },
): Promise<void> {
  const text = spec.inviteLetter?.trim()
  const offText = spec.offHoursLetter?.trim()
  const rt = spec.resumeThresholds

  const [cur] = await db
    .select({
      aiProcessSettings:  vacancies.aiProcessSettings,
      firstMessagesChain: vacancies.firstMessagesChain,
    })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  if (!cur) return

  const updateSet: Record<string, unknown> = {}

  // Текст приглашения → inviteMessage (крон).
  if (text) {
    updateSet.aiProcessSettings = {
      ...((cur.aiProcessSettings ?? {}) as VacancyAiProcessSettings),
      inviteMessage: text,
    }
  }

  // Цепочка первых сообщений: шаг 1 — текст + задержка. Если цепочки нет —
  // создаём минимальную, чтобы задержка/текст из Портрета реально применялись.
  const chain = cur.firstMessagesChain
  if (Array.isArray(chain) && chain.length > 0) {
    updateSet.firstMessagesChain = (chain as Array<Record<string, unknown>>).map(
      (m, i) => (i === 0 ? { ...m, ...(text ? { text } : {}), delaySeconds: rt.inviteDelaySeconds } : m),
    )
  } else if (text) {
    updateSet.firstMessagesChain = [{ enabled: true, delaySeconds: rt.inviteDelaySeconds, text }]
  }

  // Нерабочее время → vacancy-колонки. enabled/delay — всегда (тумблеры),
  // текст — только непустой (не затираем существующий).
  updateSet.firstMessageOffHoursEnabled = rt.offHoursEnabled
  updateSet.firstMessageOffHoursDelaySeconds = rt.offHoursDelaySeconds
  if (offText) updateSet.firstMessageOffHoursText = offText

  await db.update(vacancies).set(updateSet).where(eq(vacancies.id, vacancyId))
}
