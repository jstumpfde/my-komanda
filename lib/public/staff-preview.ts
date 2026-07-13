// Детект "staff preview" визита на публичную /demo/<shortId> ссылку.
//
// Проблема (13.07, инцидент "кандидаты-призраки"): HR/директор компании
// копирует публичную ссылку демо (свою же — /vacancy/[slug] → «Откликнуться»
// → /demo/<shortId>, либо чужой существующий короткий ID, скопированный
// из списка кандидатов) и открывает её в новом окне/вкладке просто
// посмотреть, как это выглядит кандидату. Если у браузера нет валидной
// куки myk_candidate_uuid ИМЕННО под этого кандидата — /visit создаёт
// новую пустую запись candidates ("Новый кандидат", source~referral).
//
// Фикс: если у запроса есть валидная сессия next-auth ("залогинен в
// платформу") ПРИНАДЛЕЖАЩАЯ той же компании, что и вакансия-владелец
// ссылки — считаем это staff-preview и НЕ создаём кандидата вовсе
// (см. app/api/public/demo/[token]/visit/route.ts).
//
// Платформенный админ (isPlatformAdmin) считается staff для ЛЮБОЙ
// компании — он тоже иногда открывает чужие ссылки для поддержки/аудита,
// и это тоже не должно плодить призраков.

export interface StaffPreviewSessionUser {
  companyId?: string | null
  isPlatformAdmin?: boolean | null
}

export interface StaffPreviewSession {
  user?: StaffPreviewSessionUser | null
}

export function isStaffPreviewVisit(
  session: StaffPreviewSession | null | undefined,
  targetCompanyId: string | null | undefined,
): boolean {
  const user = session?.user
  if (!user) return false
  if (!targetCompanyId) return false
  if (user.isPlatformAdmin) return true
  return Boolean(user.companyId) && user.companyId === targetCompanyId
}
