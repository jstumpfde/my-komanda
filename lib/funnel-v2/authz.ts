// Авторизация записи конфигурации Воронки v2.
//
// Разделение прав (Юрий 26.06 + фикс 13.07):
// - Сами СТАДИИ / config — может читать и писать ЛЮБОЙ пользователь компании
//   (изоляция по companyId — в самом роуте, через eq(vacancies.companyId, …)).
//   Раньше весь роут был owner-only (404 не-владельцу), из-за чего вкладка
//   «Воронка v2» показывалась всем, но сохранение молча падало 404 и работа
//   терялась при релоаде.
// - ВКЛючение рантайма движка (runtimeEnabled: true) — owner-only: движок
//   реально шлёт сообщения кандидатам через cron, поэтому его запуск оставляем
//   за владельцем платформы. Выключение (false) и правку стадий не гейтим.
import { isOwnerEmail } from "@/lib/owner"

/**
 * Разрешено ли применить PUT-обновление Воронки v2 данному пользователю.
 * Гейт срабатывает ТОЛЬКО когда тело запроса явно ВКЛючает рантайм
 * (requestedRuntimeEnabled === true) — тогда требуется owner-email.
 * Во всех остальных случаях (правка config, выключение рантайма,
 * запрос без поля runtimeEnabled) — разрешено любому пользователю компании.
 */
export function canApplyFunnelV2Update(
  email: string | null | undefined,
  requestedRuntimeEnabled: boolean | undefined,
): boolean {
  if (requestedRuntimeEnabled === true) return isOwnerEmail(email)
  return true
}
