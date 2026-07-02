// Переменные рендера ТЕКСТА ОТКАЗА кандидату (Воронка 3, гвард №4 п.1).
//
// ИНВАРИАНТ: ни один путь не отправляет кандидату нерендеренный плейсхолдер.
// Все точки, где rejectText уходит кандидату (score-gate applyFailAction,
// stage-completion-handler autoReject, trySyncRejectToHh), рендерят ОДНИМ
// набором переменных — тем же, что предлагают кнопки-плейсхолдеры редактора
// ({{name}}/{{vacancy}}/{{company}}; {{demo_link}} — на всякий случай).
//
// Чистая функция без IO — юнит-тестируется.

export interface RejectVarsInput {
  firstName:    string
  vacancyTitle?: string | null
  companyName?:  string | null
  /** Токен кандидата для {{demo_link}}. Пустой токен → ссылка не собирается. */
  token?:        string | null
  baseUrl:      string
}

export function rejectMessageVars(i: RejectVarsInput): Record<string, string> {
  const vars: Record<string, string> = {
    name:    i.firstName,
    vacancy: i.vacancyTitle ?? "",
    company: i.companyName ?? "",
  }
  if (i.token) vars.demo_link = `${i.baseUrl}/demo/${i.token}`
  return vars
}
