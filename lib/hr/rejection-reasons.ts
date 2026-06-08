// Причины отказа кандидату — единый источник для карточки кандидата (захват)
// и отчёта по найму (разбивка «почему не подошли»). Хранятся в candidates:
// rejectionReasonCategory (id), rejectionInitiator (id), rejectionComment (текст).

export const REJECTION_INITIATORS = [
  { id: "company",   label: "Мы отказали" },
  { id: "candidate", label: "Кандидат сам отказался" },
] as const

export type RejectionInitiator = (typeof REJECTION_INITIATORS)[number]["id"]

export const REJECTION_REASONS = [
  { id: "salary",           label: "Зарплатные ожидания" },
  { id: "experience",       label: "Опыт / квалификация" },
  { id: "location",         label: "Локация / формат работы" },
  { id: "citizenship",      label: "Гражданство / документы" },
  { id: "no_contact",       label: "Не вышел на связь / не явился" },
  { id: "failed_test",      label: "Не прошёл тест" },
  { id: "failed_interview", label: "Не прошёл интервью" },
  { id: "other_offer",      label: "Нашёл другой оффер" },
  { id: "other",            label: "Другое" },
] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]["id"]

export function rejectionReasonLabel(id: string | null | undefined): string {
  if (!id) return "Не указана"
  return REJECTION_REASONS.find((r) => r.id === id)?.label ?? id
}

export function rejectionInitiatorLabel(id: string | null | undefined): string {
  if (!id) return "—"
  return REJECTION_INITIATORS.find((r) => r.id === id)?.label ?? id
}
