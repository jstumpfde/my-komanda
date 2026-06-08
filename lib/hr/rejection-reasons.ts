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

// ─── Автоматические причины (auto_processing_stopped_reason) ──────────────────
// Проставляются системой автоматически (AI-скоринг, стоп-факторы, антиспам,
// дедуп). Тянем их в отчёт, чтобы он был полнее без ручного ввода HR.
export const AUTO_REASON_LABELS: Record<string, string> = {
  manual_rejection:              "Ручной отказ",
  below_threshold_manual_review: "Низкий скор — на ручную проверку",
  ai_min_score_below_threshold:  "AI: скор ниже порога",
  ai_rejection:                  "AI-отказ",
  duplicate_of_rejected:         "Дубль ранее отклонённого",
  stop_word_regex:               "Стоп-слово (фильтр)",
  unstable_pattern_in_chat:      "Подозрительное поведение в чате",
  trashed:                       "Перемещён в корзину",
}

// Нормализуем причину к ключу — часть до первого ":" (детали после двоеточия,
// напр. stop_factor:city или duplicate_of_rejected:<bug>, в отчёте схлопываем
// в общую категорию).
export function autoReasonKey(raw: string | null | undefined): string {
  if (!raw) return "unknown"
  return raw.split(":")[0] || "unknown"
}

export function autoReasonLabel(key: string): string {
  if (key === "unknown") return "Не указана"
  if (key === "stop_factor") return "Стоп-фактор"
  if (key === "stop_word") return "Стоп-слово"
  return AUTO_REASON_LABELS[key] ?? key
}
