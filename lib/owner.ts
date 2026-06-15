// Email-гейт «owner-only» экспериментальных фич HR (виды Канбан/Плитки/Воронка
// в карточке вакансии, пункт меню «Календарь»). Пока обкатываются — видны только
// владельцу-полигону, остальным (включая директоров других компаний) скрыты.
export const OWNER_EMAILS = ["j.stumpf@yandex.ru"]

export function isOwnerEmail(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase())
}
