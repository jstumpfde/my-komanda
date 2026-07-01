// Очерёдность исходящих (#37а).
//
// Когда отправка касаний конкурирует за hh-токен, дожим-хвост не должен
// блокировать критичные отправки (офферы/интервью/новые). Порядок приоритета
// групп — редактируемый список (компания-level), НЕ хардкод: код-константа
// DEFAULT_SEND_PRIORITY_ORDER — только дефолт, переопределяемый директором в
// hiring_defaults_json.sendPriorityOrder.
//
// Группа кандидата в очереди определяется по его стадии + типу касания (branch).

export type SendPriorityGroup =
  | "finalists"          // hired / offer / interview — финал важнее всего
  | "passed_first"       // прошли первый этап (гейт «Путь менеджера» и т.п.)
  | "new"                // новые (импорт/инвайт → «Первичный контакт»)
  | "dozhim_opened"      // дожим: открыл, но не дошёл до конца
  | "dozhim_not_opened"  // дожим: не открыл

// Порядок по умолчанию (сверху = уходит первым). «Договорились раз навсегда».
export const DEFAULT_SEND_PRIORITY_ORDER: SendPriorityGroup[] = [
  "finalists",
  "passed_first",
  "new",
  "dozhim_opened",
  "dozhim_not_opened",
]

export const SEND_PRIORITY_LABELS: Record<SendPriorityGroup, string> = {
  finalists:         "Приняты / оффер / интервью",
  passed_first:      "Прошли первый этап",
  new:               "Новые кандидаты",
  dozhim_opened:     "Дожим: открыл, но не завершил",
  dozhim_not_opened: "Дожим: не открыл",
}

export const SEND_PRIORITY_DESCRIPTIONS: Record<SendPriorityGroup, string> = {
  finalists:         "Финальные стадии — самые важные отправки",
  passed_first:      "Успешно прошли гейт первого этапа",
  new:               "Первичный контакт с новыми откликами",
  dozhim_opened:     "Напоминания тем, кто начал, но не закончил",
  dozhim_not_opened: "Напоминания тем, кто ещё не открыл",
}

// Финальные стадии кандидата (нанят / оффер / интервью и поздние стадии
// решения) — им приоритет отправки максимальный. Набор охватывает встречающиеся
// в кодовой базе slug'и разных воронок (legacy + v2).
const FINALIST_STAGES = new Set([
  "hired",
  "offer", "proposal", "negotiation", "won",
  "interview", "interviewed", "phone_interview", "scheduled",
  "decision", "final_decision", "preboarding",
])
// Стадии «новый / первичный контакт».
const NEW_STAGES = new Set(["new", "primary_contact", "primary", "imported"])

// «Дожим по открытому» — ветки, где кандидат уже открыл материал, но не
// завершил (по демо/тесту/воронке v2).
function isDozhimOpenedBranch(branch: string): boolean {
  if (branch === "opened_not_finished") return true
  if (branch === "test_opened_not_submitted") return true
  // Воронка v2: суффикс ветки «открыл» (runtime-executor добавляет branchSuffix).
  if (branch.startsWith("funnelv2:") && branch.includes(":opened")) return true
  return false
}

// Классифицируем pending-касание в группу приоритета по стадии кандидата и branch.
// demoOpened — открыл ли кандидат демо (страховка для legacy-веток без суффикса).
export function classifySendPriority(input: {
  stage: string | null | undefined
  branch: string | null | undefined
  demoOpened?: boolean | null
}): SendPriorityGroup {
  const stage = input.stage ?? "new"
  const branch = input.branch ?? ""

  // 1. Финальные стадии — вне зависимости от типа касания.
  if (FINALIST_STAGES.has(stage)) return "finalists"

  // 2/3. Не-дожимные касания (приглашения/подтверждения/приветствия) — по стадии.
  //     Дожим-ветки классифицируем ниже как dozhim_*.
  const isDozhim =
    branch === "not_opened" ||
    branch === "opened_not_finished" ||
    branch === "test_reminder" ||
    branch === "test_not_opened" ||
    branch === "test_opened_not_submitted" ||
    branch.startsWith("funnelv2:")

  if (!isDozhim) {
    // Приглашения/подтверждения на стадии «новый» — это новые; иначе прошли этап.
    if (NEW_STAGES.has(stage)) return "new"
    return "passed_first"
  }

  // 4/5. Дожим: открыл vs не открыл.
  if (isDozhimOpenedBranch(branch) || input.demoOpened) return "dozhim_opened"
  return "dozhim_not_opened"
}

// Валидируем и нормализуем сохранённый порядок: только известные группы, без
// дублей, недостающие добавляем в хвост в дефолтном порядке. Fail-safe →
// всегда полный набор из 5 групп.
export function normalizeSendPriorityOrder(
  raw: unknown,
): SendPriorityGroup[] {
  const known = new Set<string>(DEFAULT_SEND_PRIORITY_ORDER)
  const out: SendPriorityGroup[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && known.has(item) && !out.includes(item as SendPriorityGroup)) {
        out.push(item as SendPriorityGroup)
      }
    }
  }
  for (const g of DEFAULT_SEND_PRIORITY_ORDER) {
    if (!out.includes(g)) out.push(g)
  }
  return out
}

// Индекс приоритета группы в заданном порядке (меньше = раньше уходит).
export function priorityRank(
  group: SendPriorityGroup,
  order: SendPriorityGroup[],
): number {
  const idx = order.indexOf(group)
  return idx === -1 ? order.length : idx
}
