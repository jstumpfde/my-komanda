// ─── Двусторонний маппинг стадий: платформа ↔ hh negotiation state ───────────
//
// ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ для соответствия «наша стадия воронки ↔ состояние
// отклика на hh». Задача #16/#23 (карта утверждена Юрием).
//
// Наши стадии — StageSlug из lib/stages.ts (это же значение колонки
// candidates.stage). hh-состояния — реальные id коллекций negotiation
// (employer-flow, PUT /negotiations/{action}/{id} и GET-коллекции).
//
// РЕАЛЬНЫЙ набор employer-состояний hh negotiation:
//   response            — новый отклик (наш эквивалент: «Новый», но входящий
//                         пуш в стадию не двигаем — response это ещё не решение)
//   phone_interview     — «Телефонное интервью» / первичный контакт
//   consider            — «Подумать» (тоже первичный контакт; входящий → primary_contact)
//   assessment          — «Тестовое задание»
//   interview           — «Собеседование»
//   discard_by_employer — «Отказ» работодателя
//   discard_by_applicant— кандидат сам отклонил приглашение (ТОЛЬКО входящий сигнал)
//
//   У hh НЕТ отдельных состояний «Оффер» и «Нанят» — поэтому для наших стадий
//   offer_sent/hired исходящего пуша в hh не делаем (map → null).
//
// Где нет соответствия → null («не трогать»): исходящий пуш не отправляем,
// входящий сигнал не двигает нашу стадию.

import type { StageSlug } from "@/lib/stages"

// hh-действие для changeNegotiationState (PUT /negotiations/{action}/{id}).
// Совпадает с сигнатурой lib/hh-api.ts changeNegotiationState.
export type HhOutboundAction = "invitation" | "assessment" | "interview" | "consider" | "discard"

// hh-состояние negotiation (id коллекции). Входящий сигнал берём из
// hhResponses.status (туда import-responses пишет item.state.id).
export type HhNegotiationState =
  | "response"
  | "phone_interview"
  | "consider"
  | "assessment"
  | "interview"
  | "discard_by_employer"
  | "discard_by_applicant"

// ─── ИСХОДЯЩИЙ: наша стадия → действие hh ────────────────────────────────────
//
// Утверждённая карта (наша стадия ↔ hh state):
//   Первичный контакт (primary_contact) → phone_interview  (action="invitation")
//   Тестовое (test_task_sent)           → assessment
//   Собеседование (interview/scheduled) → interview
//   Оффер (offer_sent)                  → нет hh-состояния → null (не пушим)
//   Нанят (hired/started_work)          → нет hh-состояния → null (не пушим)
//   Отказ (rejected)                    → discard_by_employer (action="discard")
//   Остальные (new/demo/анкета/скрининг/…) → null (внутренние, hh не трогаем)
//
// action="invitation" в changeNegotiationState → hh phone_interview.
export function platformStageToHhAction(stage: string | null | undefined): HhOutboundAction | null {
  switch (stage) {
    case "primary_contact":
      return "invitation" // → phone_interview
    case "test_task_sent":
      return "assessment"
    // Собеседование: назначено или прошло — обе двигают hh в interview-коллекцию.
    case "scheduled":
    case "interview":
      return "interview"
    case "rejected":
      return "discard" // → discard_by_employer
    // offer_sent / hired / started_work — у hh нет соответствующего состояния.
    // new / demo_opened / anketa_filled / ai_screening / test_task_done /
    // test_passed / test_failed / internship / reference_check / decision —
    // внутренние стадии, hh-папку не трогаем.
    default:
      return null
  }
}

// Целевое hh-состояние (для отображения/логов) по нашей стадии. null = нет
// соответствия (не пушим). Это «человеко-читаемая» проекция action'а на
// state-id (invitation → phone_interview).
export function platformStageToHhState(stage: string | null | undefined): HhNegotiationState | null {
  const action = platformStageToHhAction(stage)
  if (!action) return null
  switch (action) {
    case "invitation": return "phone_interview"
    case "consider":   return "consider"
    case "assessment": return "assessment"
    case "interview":  return "interview"
    case "discard":    return "discard_by_employer"
  }
}

// ─── ВХОДЯЩИЙ: hh-состояние → наша стадия ────────────────────────────────────
//
//   phone_interview / consider → primary_contact
//   assessment                 → test_task_sent
//   interview                  → interview
//   discard_by_employer        → rejected (мы отказали; initiator=company)
//   discard_by_applicant       → rejected (кандидат сам; initiator=candidate)
//   response                   → null (новый отклик — не двигаем нашу стадию;
//                                fallback «оставить предыдущий»)
//
// Возвращаем StageSlug либо null («не трогать» — оставить нашу стадию как есть).
export function hhStateToPlatformStage(hhState: string | null | undefined): StageSlug | null {
  switch (hhState) {
    case "phone_interview":
    case "consider":
      return "primary_contact"
    case "assessment":
      return "test_task_sent"
    case "interview":
      return "interview"
    case "discard_by_employer":
    case "discard_by_applicant":
      return "rejected"
    // response / invited / orphaned / claimed / hidden / прочее — не двигаем.
    default:
      return null
  }
}

// ─── Русский статус hh-воронки v2 (stage.hhStatus) → действие hh ─────────────
//
// В конструкторе воронки v2 у стадии есть свободное поле hhStatus — строка из
// STAGE_STATUSES (lib/funnel-v2/types.ts): «первичный контакт» / «интервью» /
// «тестовое задание» / «оффер» / «принят» / «отказ» / «новый».
// Сводим эту строку к нашей стадии (StageSlug), а её — к hh-действию, чтобы
// исходящий пуш v2 шёл через ту же утверждённую карту, что и легаси-путь.
// Возврат null = «не менять hh-папку» (текст всё равно уходит отдельным
// сообщением — это делает вызывающий код).
export function hhStatusStringToHhAction(status?: string | null): HhOutboundAction | null {
  const t = (status ?? "").toLowerCase().trim()
  if (!t) return null
  // Порядок проверок важен: «тестовое» и «отказ» — самые специфичные.
  if (t.includes("отказ")) return platformStageToHhAction("rejected")
  if (t.includes("тест")) return platformStageToHhAction("test_task_sent")
  if (t.includes("интервью") || t.includes("собес")) return platformStageToHhAction("interview")
  if (t.includes("первичн") || t.includes("контакт")) return platformStageToHhAction("primary_contact")
  // оффер / принят / новый — нет hh-состояния → null (не двигаем hh-папку).
  return null
}

// Признак «отказ инициирован кандидатом» — только discard_by_applicant.
// Используется входящим синком для проставления rejectionInitiator=candidate.
export function isCandidateInitiatedDiscard(hhState: string | null | undefined): boolean {
  return hhState === "discard_by_applicant"
}

// ─── Русские ярлыки hh-состояний (для read-only показа на карточке #16) ──────
//
// Это метки СТАДИЙ hh-воронки (папок отклика), а не настраиваемый контент —
// фиксированный словарь состояний API hh. Показываем как есть.
// Согласовано с существующим UI-словарём в
// app/api/modules/hr/candidates/[id]/channel-stage/route.ts (HH_STAGE_LABELS),
// чтобы не расходились метки на карточке и в синке/логах.
export const HH_STATE_LABELS: Record<string, string> = {
  response:             "Отклик",
  phone_interview:      "Телефонное интервью",
  consider:             "Первичный контакт",
  assessment:           "Тестовое задание",
  interview:            "Собеседование",
  discard:              "Отказ",
  discard_by_employer:  "Отказ работодателя",
  discard_by_applicant: "Кандидат отказался",
  // Локальные/технические статусы hhResponses.status, встречающиеся в БД:
  invited:              "Приглашён",
  hidden:               "Скрыт",
  orphaned:             "Без вакансии",
  claimed:              "В обработке",
}

// Ярлык hh-состояния для UI. Неизвестное — возвращаем как есть (не выдумываем).
export function hhStateLabel(hhState: string | null | undefined): string | null {
  if (!hhState) return null
  return HH_STATE_LABELS[hhState] ?? hhState
}
