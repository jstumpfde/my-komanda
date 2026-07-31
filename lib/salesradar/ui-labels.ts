// SalesRadar — общие UI-подписи для экранов «Сделки»/«Контрагенты»
// (app/(modules)/ai-rop/deals, app/(modules)/ai-rop/counterparties).
// Отдельно от lib/ai-rop/pii-mask и rollup.ts — тут только текст/иконки для
// рендера, никакой бизнес-логики. Раздел A/D плана SalesRadar (что показываем
// в MVP).
export const CONNECTOR_KIND_LABELS: Record<string, string> = {
  imap: "Почта",
  telegram_bot: "Telegram",
  telegram_user: "Telegram",
  whatsapp_agg: "WhatsApp",
  vk: "VK",
  avito: "Авито",
  bitrix: "Bitrix24",
}

export function connectorKindLabel(kind: string | null | undefined): string {
  if (!kind) return "Канал"
  return CONNECTOR_KIND_LABELS[kind] ?? kind
}

export const COUNTERPARTY_KIND_LABELS: Record<string, string> = {
  client: "Клиент",
  supplier: "Поставщик",
  partner: "Партнёр",
  internal: "Внутренний",
  unknown: "Не определён",
}

export function counterpartyKindLabel(kind: string | null | undefined): string {
  if (!kind) return COUNTERPARTY_KIND_LABELS.unknown
  return COUNTERPARTY_KIND_LABELS[kind] ?? kind
}

export const DEAL_STATUS_LABELS: Record<string, string> = {
  open: "Открыта",
  won: "Выиграна",
  lost: "Проиграна",
  stale: "Затихла",
  merged: "Объединена",
}

export function dealStatusLabel(status: string | null | undefined): string {
  if (!status) return "—"
  return DEAL_STATUS_LABELS[status] ?? status
}

export const DEAL_FACT_KIND_LABELS: Record<string, string> = {
  promise: "Обещано",
  missed: "Упущено",
  improvement: "Можно лучше",
  risk: "Риск",
  agreement: "Договорённость",
  requirement: "Требование клиента",
}

export function dealFactKindLabel(kind: string | null | undefined): string {
  if (!kind) return "Заметка"
  return DEAL_FACT_KIND_LABELS[kind] ?? kind
}

export const ATTRIBUTION_METHOD_LABELS: Record<string, string> = {
  crm_explicit: "из CRM",
  sticky: "по инерции переписки",
  heuristic_single_open: "единственная открытая сделка",
  ai: "определил ИИ",
  manual: "вручную",
}

export function attributionMethodLabel(method: string | null | undefined): string {
  if (!method) return "—"
  return ATTRIBUTION_METHOD_LABELS[method] ?? method
}

/** «Мягкая» привязка ИИ — низкая уверенность или метод 'ai' (см. задачу Ф1, п.2). */
export function isSoftAiLink(confidence: number | null | undefined, method: string | null | undefined): boolean {
  if (method === "ai") return true
  if (typeof confidence === "number" && confidence < 0.5) return true
  return false
}
