// Единый источник правды по «видам» партнёров (integrators.kind) и их русским
// названиям. Раньше лейблы были продублированы в нескольких UI-файлах
// (app/(partner)/partner/page.tsx, app/(admin)/admin/integrators/page.tsx,
// app/api/admin/roles/route.ts) и расходились. Теперь — только отсюда.
//
// Переименование (решение Юрия 17.06): «Ген.» — верхний уровень иерархии,
// простое имя — нижний (суб-уровень):
//   partner       → «Ген. Партнёр»   (верх партнёрской ветки)
//   sub_partner   → «Партнёр»        (под Ген. Партнёром)
//   referral      → «Ген. Реферал»   (верх реферальной ветки)
//   sub_referral  → «Реферал»        (под Ген. Рефералом) — НОВЫЙ вид
//
// integrators.kind — это text без check-constraint, поэтому новый вид
// sub_referral не требует миграции БД (только прикладной слой).

export type PartnerKind = "partner" | "sub_partner" | "referral" | "sub_referral"

export const PARTNER_KINDS: PartnerKind[] = ["partner", "sub_partner", "referral", "sub_referral"]

export const PARTNER_KIND_LABELS: Record<PartnerKind, string> = {
  partner: "Ген. Партнёр",
  sub_partner: "Партнёр",
  referral: "Ген. Реферал",
  sub_referral: "Реферал",
}

// Короткое описание ветки/уровня — для подсказок и карточек ролей.
export const PARTNER_KIND_DESCRIPTIONS: Record<PartnerKind, string> = {
  partner: "Верхний уровень партнёрской ветки: свои клиенты и суб-партнёры, вход в платформу клиента, комиссия по уровням",
  sub_partner: "Партнёр под Ген. Партнёром: свои клиенты, своя комиссия по уровням",
  referral: "Верхний уровень реферальной ветки: только просмотр финансов своих клиентов",
  sub_referral: "Реферал под Ген. Рефералом: только просмотр финансов своих клиентов",
}

// Какие ветки относятся к «реферальным» (view-only финансы, без входа к клиенту).
export const REFERRAL_KINDS: PartnerKind[] = ["referral", "sub_referral"]

export function partnerKindLabel(kind: string | null | undefined): string {
  if (!kind) return "—"
  return PARTNER_KIND_LABELS[kind as PartnerKind] ?? kind
}

export function isReferralKind(kind: string | null | undefined): boolean {
  return !!kind && (REFERRAL_KINDS as string[]).includes(kind)
}

// Для дропдаунов выбора вида (значение + подпись), в порядке иерархии.
export const PARTNER_KIND_OPTIONS = PARTNER_KINDS.map((k) => ({
  value: k,
  label: PARTNER_KIND_LABELS[k],
  description: PARTNER_KIND_DESCRIPTIONS[k],
}))
