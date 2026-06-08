// Контакты с кандидатом (звонки/видео/встречи) с исходом — для карточки кандидата
// (захват «подошёл/не подошёл + причина») и отчёта по найму (счётчики созвонов).
// Причина «не подошёл» берётся из общей таксономии lib/hr/rejection-reasons.ts.

export const CONTACT_CHANNELS = [
  { id: "call",    label: "Звонок" },
  { id: "video",   label: "Видео / Zoom" },
  { id: "meeting", label: "Встреча" },
  { id: "message", label: "Переписка" },
] as const

export type ContactChannel = (typeof CONTACT_CHANNELS)[number]["id"]

export const CONTACT_OUTCOMES = [
  { id: "fit",     label: "Подошёл" },
  { id: "no_fit",  label: "Не подошёл" },
  { id: "pending", label: "Не определено" },
] as const

export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number]["id"]

export function contactChannelLabel(id: string | null | undefined): string {
  if (!id) return "Контакт"
  return CONTACT_CHANNELS.find((c) => c.id === id)?.label ?? id
}

export function contactOutcomeLabel(id: string | null | undefined): string {
  if (!id) return "—"
  return CONTACT_OUTCOMES.find((o) => o.id === id)?.label ?? id
}
