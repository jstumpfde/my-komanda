// Окно отправки по ТИПУ касания (#36).
//
// Раньше окно отправки (расписание вакансии) применялось ко ВСЕМ касаниям
// одинаково — приглашения/подтверждения ждали утра вместе с дожимами.
// Теперь у каждого ТИПА касания есть переключатель «круглосуточно / по окну»
// (2 состояния, НЕ окно на каждое сообщение):
//   - "always" — окно НЕ применяется, шлём в любое время суток.
//   - "window" — соблюдаем рабочее окно вакансии (canSendNow / расписание).
//
// НЕ хардкод: режим настраивается на уровне компании
// (hiring_defaults_json.messageWindows[category]); код-константы
// (DEFAULT_TOUCH_WINDOWS) — только дефолты, переопределяемые директором.

// Категории касаний. Транзакционные — реакция на действие кандидата/HR
// (приглашение, подтверждение, благодарность), проактивные — дожим/follow-up,
// который мы инициируем сами.
export type TouchCategory =
  // Транзакционные (дефолт — круглосуточно):
  | "invite"            // приглашения: 2-я часть демо, ссылка на тест, запись на интервью
  | "confirmation"      // подтверждение/напоминание (анкета, тест, интервью)
  | "thank_you"         // благодарность / автоответ после действия
  | "welcome"           // серия первых сообщений (приветствие, off-hours)
  // Проактивные (дефолт — по окну вакансии):
  | "dozhim"            // дожим / follow-up касания

export type TouchWindowMode = "always" | "window"

// Режим окна по умолчанию для каждой категории (переопределяется компанией).
// Транзакционные — круглосуточно; проактивные (дожим) — по окну вакансии.
export const DEFAULT_TOUCH_WINDOWS: Record<TouchCategory, TouchWindowMode> = {
  invite:       "always",
  confirmation: "always",
  thank_you:    "always",
  welcome:      "always",
  dozhim:       "window",
}

// Человекочитаемые ярлыки категорий для UI.
export const TOUCH_CATEGORY_LABELS: Record<TouchCategory, string> = {
  invite:       "Приглашения (тест, 2-я часть демо, запись на интервью)",
  confirmation: "Подтверждения и напоминания (анкета, тест, интервью)",
  thank_you:    "Благодарности и автоответы",
  welcome:      "Первые сообщения (приветствие)",
  dozhim:       "Дожимы (follow-up касания)",
}

// Порядок отображения категорий в UI.
export const TOUCH_CATEGORY_ORDER: TouchCategory[] = [
  "invite",
  "confirmation",
  "thank_you",
  "welcome",
  "dozhim",
]

// Маппинг branch → категория касания. Всё, что явно не перечислено (обычная
// цепочка дожима campaign-касаний и все ветки funnelv2:*), — это "dozhim".
export function branchToTouchCategory(branch: string | null | undefined): TouchCategory {
  const b = branch ?? ""
  switch (b) {
    // Приглашения
    case "second_demo_invite":
    case "test_invite":
    case "schedule_invite":
    case "demo3_invite": // адресная кампания «Демо-3» (scripts/send-demo3-invite.ts)
      return "invite"
    // Подтверждения / напоминания
    case "anketa_confirmation":
      return "confirmation"
    // Благодарности / автоответы после действия
    case "anketa_auto_reply":
    case "test_after_message":
      return "thank_you"
    // Первые сообщения (приветственная серия)
    case "first_msg_2":
    case "first_msg_3":
    case "first_msg_offhours":
      return "welcome"
    // Дожимы по тесту
    case "test_reminder":
    case "test_not_opened":
    case "test_opened_not_submitted":
      return "dozhim"
    default:
      // funnelv2:<stageId>, legacy campaign-касания (not_opened/opened_not_finished)
      // и всё прочее — обычный дожим.
      return "dozhim"
  }
}

// Тип входного конфига (кусок hiring_defaults_json.messageWindows).
export type MessageWindowsConfig = Partial<Record<TouchCategory, TouchWindowMode>>

// Эффективный режим окна для касания: компания-настройка → дефолт категории.
export function resolveTouchWindowMode(
  branch: string | null | undefined,
  config: MessageWindowsConfig | null | undefined,
): TouchWindowMode {
  const category = branchToTouchCategory(branch)
  const fromCompany = config?.[category]
  if (fromCompany === "always" || fromCompany === "window") return fromCompany
  return DEFAULT_TOUCH_WINDOWS[category]
}

// Эффективная карта режимов всех категорий (для UI: показать что реально применяется).
export function resolveAllTouchWindowModes(
  config: MessageWindowsConfig | null | undefined,
): Record<TouchCategory, TouchWindowMode> {
  const out = { ...DEFAULT_TOUCH_WINDOWS }
  for (const cat of TOUCH_CATEGORY_ORDER) {
    const v = config?.[cat]
    if (v === "always" || v === "window") out[cat] = v
  }
  return out
}

// ── Очерёдность ПО ТИПУ СООБЩЕНИЯ (07.07, скрин Юрия) ──────────────────────
//
// Помимо очерёдности групп кандидатов (#37а, lib/messaging/send-priority.ts),
// внутри одной группы касания можно упорядочить по ТИПУ сообщения: сверху —
// уходит первым при конкуренции за отправку. Иерархия сортировки (см. cron
// follow-up): 1) группа кандидата (finalists/passed_first/...) — главный ключ
// («раз навсегда», решение Юрия 30.06), 2) порядок категорий сообщений —
// дополнительный ключ ВНУТРИ группы, 3) scheduledAt.
//
// Company-level, hiring_defaults_json.messageCategoryOrder — тот же уровень
// хранения, что и messageWindows/sendPriorityOrder этого экрана. Код-константа
// DEFAULT_MESSAGE_CATEGORY_ORDER — только дефолт, переопределяемый директором.

// Порядок категорий по умолчанию (сверху = уходит первым).
export const DEFAULT_MESSAGE_CATEGORY_ORDER: TouchCategory[] = [
  "invite",
  "confirmation",
  "thank_you",
  "welcome",
  "dozhim",
]

// Валидируем и нормализуем сохранённый порядок категорий: только известные
// категории, без дублей, недостающие добавляем в хвост в дефолтном порядке.
// Fail-safe → всегда полный набор из 5 категорий (симметрично
// normalizeSendPriorityOrder в lib/messaging/send-priority.ts).
export function normalizeMessageCategoryOrder(raw: unknown): TouchCategory[] {
  const known = new Set<string>(DEFAULT_MESSAGE_CATEGORY_ORDER)
  const out: TouchCategory[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && known.has(item) && !out.includes(item as TouchCategory)) {
        out.push(item as TouchCategory)
      }
    }
  }
  for (const cat of DEFAULT_MESSAGE_CATEGORY_ORDER) {
    if (!out.includes(cat)) out.push(cat)
  }
  return out
}

// Индекс приоритета категории в заданном порядке (меньше = раньше уходит).
// Неизвестная категория (не должна встречаться после normalize) — в конец.
export function categoryPriorityRank(
  category: TouchCategory,
  order: TouchCategory[],
): number {
  const idx = order.indexOf(category)
  return idx === -1 ? order.length : idx
}
