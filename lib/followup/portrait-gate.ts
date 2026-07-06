// Гейт «не дожимать кандидатов с Портретом (resume_score) ниже N» (drizzle/0259).
// Инцидент 06.07.2026: дожим слал комплиментарный текст «ваш опыт нам подходит»
// кандидату с Портрет-баллом 0. Тексты касаний — шаблоны клиента, их НЕ трогаем;
// вместо этого пропускаем (skip, не cancel) отправку самого касания, если порог
// включён и балл кандидата ниже него. Дефолт ВЫКЛ — legacy-инвариант.
//
// Чистая функция решения — вынесена отдельно от app/api/cron/follow-up/route.ts,
// чтобы юнит-тестировать без БД (см. lib/messaging/dozhim-mutex.ts — тот же паттерн).

export interface PortraitGateCampaign {
  minPortraitScoreEnabled: boolean | null | undefined
  minPortraitScore:        number | null | undefined
}

export type PortraitGateDecision =
  | { skip: false }
  | { skip: true; reason: "low_portrait_score" }

/**
 * @param isDozhimTouch — false для одноразовых транзакционных касаний
 *   (приглашения/подтверждения/тест-инвайты и т.п.) — гейт их не касается.
 *   funnelv2:* branch — это тоже дожим (напоминание про текущую стадию воронки v2).
 * @param resumeScore — candidates.resume_score; null/undefined = кандидат ещё
 *   не оценён — гейт НЕ блокирует (нет данных для сравнения, ведём себя как раньше).
 */
export function decidePortraitGate(
  campaign:      PortraitGateCampaign,
  isDozhimTouch: boolean,
  resumeScore:   number | null | undefined,
): PortraitGateDecision {
  if (!isDozhimTouch) return { skip: false }
  if (!campaign.minPortraitScoreEnabled) return { skip: false }
  if (typeof resumeScore !== "number") return { skip: false }

  const threshold = typeof campaign.minPortraitScore === "number" ? campaign.minPortraitScore : 30
  if (resumeScore < threshold) return { skip: true, reason: "low_portrait_score" }
  return { skip: false }
}
