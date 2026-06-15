// Email-гейт «owner-only» экспериментальных фич HR (виды Канбан/Плитки/Воронка
// в карточке вакансии, пункт меню «Календарь»). Пока обкатываются — видны только
// владельцу-полигону, остальным (включая директоров других компаний) скрыты.
export const OWNER_EMAILS = ["j.stumpf@yandex.ru"]

export function isOwnerEmail(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase())
}

// Пользователи с урезанным Рабочим столом: скрыт блок «AI-ассистент» (инсайты)
// и вкладка «Резерв» неактивна. Пока фичи обкатываются — для Ксении Сафроновой
// (оба её аккаунта-директора в Орлинке).
export const RESTRICTED_WORKSPACE_EMAILS = ["k.safronova@orlink.ru", "jstumpf@ya.by"]

export function isRestrictedWorkspace(email?: string | null): boolean {
  return !!email && RESTRICTED_WORKSPACE_EMAILS.includes(email.trim().toLowerCase())
}
