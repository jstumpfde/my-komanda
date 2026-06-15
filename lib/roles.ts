// Серверно-безопасные роль-хелперы (БЕЗ "use client").
// Раньше жили в lib/auth.tsx ("use client") — из-за чего серверные компоненты
// (напр. app/(admin)/layout.tsx) падали с RSC-ошибкой «client function from server».
// lib/auth.tsx реэкспортирует это для клиента, серверные модули импортируют отсюда.

export type UserRole =
  | "platform_admin"
  | "platform_manager"
  | "admin"          // legacy супер-админ (admin@test.ru) — есть в БД
  | "director"
  | "client"         // legacy роль владельца компании — есть в БД (наравне с director)
  | "hr_lead"
  | "hr_manager"
  | "department_head"
  | "observer"
  | "tester_hr"
  | "employee"
  | "partner"        // внешний партнёр (партнёр/суб-партнёр/реферал — тип в integrators.kind)

export const PLATFORM_ROLES: UserRole[] = ["platform_admin", "platform_manager", "admin"]

// Внешние партнёры — отдельный «Партнёрский кабинет» (/partner). Тип партнёра
// (партнёр/суб-партнёр/реферал) хранится в integrators.kind, а не в роли.
export const PARTNER_ROLES: UserRole[] = ["partner"]
export function isPartnerRole(role: UserRole): boolean {
  return PARTNER_ROLES.includes(role)
}
export const CLIENT_ROLES: UserRole[] = ["director", "client", "hr_lead", "hr_manager", "department_head", "observer", "tester_hr"]

// Владелец компании / уровень директора — полный доступ к компанийским настройкам.
// Включает legacy-роли client/admin (есть в БД, в т.ч. jstumpf.de@gmail.com = client).
export const COMPANY_OWNER_ROLES: UserRole[] = ["platform_admin", "admin", "director", "client"]

export function isPlatformRole(role: UserRole): boolean {
  return PLATFORM_ROLES.includes(role)
}

export function isCompanyOwner(role: UserRole): boolean {
  return COMPANY_OWNER_ROLES.includes(role)
}
