// Чистые константы/типы «типов доступа» — БЕЗ импорта lib/db, поэтому безопасны
// для КЛИЕНТСКИХ компонентов. Раньше жили в lib/admin/assign-role.ts, но тот
// тянет db (postgres) — импорт его из client-компонента ломал сборку
// (Module not found: fs/net). assign-role.ts реэкспортирует это для сервера.

// Тип доступа, как его выбирает админ в UI. Клиентские роли совпадают со
// значением users.role; партнёрские — это role='partner' + integrators.kind.
export type AccessType =
  | "director"
  | "client"
  | "hr_lead"
  | "hr_manager"
  | "department_head"
  | "observer"
  | "tester_hr"
  | "partner"       // Ген. Партнёр
  | "sub_partner"   // Партнёр
  | "referral"      // Ген. Реферал
  | "sub_referral"  // Реферал

export const CLIENT_ACCESS_TYPES: AccessType[] = [
  "director", "client", "hr_lead", "hr_manager", "department_head", "observer", "tester_hr",
]
export const PARTNER_ACCESS_TYPES: AccessType[] = ["partner", "sub_partner", "referral", "sub_referral"]

export const ALL_ACCESS_TYPES: AccessType[] = [...CLIENT_ACCESS_TYPES, ...PARTNER_ACCESS_TYPES]

export function isAccessType(v: unknown): v is AccessType {
  return typeof v === "string" && (ALL_ACCESS_TYPES as string[]).includes(v)
}

// Маппинг типа доступа → integrators.kind (для партнёрских типов).
export const PARTNER_KIND: Record<string, "partner" | "sub_partner" | "referral" | "sub_referral"> = {
  partner: "partner",
  sub_partner: "sub_partner",
  referral: "referral",
  sub_referral: "sub_referral",
}

// Раскладываем тип доступа в users.role.
export function accessTypeToUserRole(accessType: AccessType): string {
  if ((PARTNER_ACCESS_TYPES as string[]).includes(accessType)) return "partner"
  return accessType
}
