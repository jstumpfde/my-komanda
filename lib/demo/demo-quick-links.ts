/**
 * lib/demo/demo-quick-links.ts
 *
 * Общий (клиент-безопасный, без БД) помощник для быстрых кнопок-ссылок на
 * демо-блоки вакансии. Используется в двух местах отправки сообщений кандидату:
 *  - диалог «Рассылка через hh» (components/vacancies/hh-broadcast-dialog.tsx)
 *  - чат «Написать кандидату» в карточке (components/candidates/candidate-drawer.tsx)
 *
 * Демо-кнопки строятся ДИНАМИЧЕСКИ по реальным демо-блокам вакансии
 * (demos с kind='demo'/'block:%', порядок sort_order, createdAt — см.
 * lib/demo/vacancy-demo-blocks.ts на сервере). Сколько демо-блоков — столько
 * кнопок «Демо 1»…«Демо N»; при одном блоке — просто «Демо».
 *
 * ЕДИНЫЙ формат ссылки для ВСЕХ демо-кнопок:
 *   {baseUrl}/demo/{ДЛИННЫЙ token кандидата}?block={id строки demos}
 *
 * ВАЖНО: используется ДЛИННЫЙ token кандидата (candidates.token, nanoid),
 * НЕ short_id — short_id в /demo/[token] запускает реферальную логику и уводит
 * посетителя на первое демо (bounce). Тот же формат, что у follow-up механизма
 * lib/messaging/demo3-before-interview.ts (/demo/<token>?block=<demoId>).
 */

/** Один демо-блок вакансии для быстрых кнопок. Приходит с сервера (порядок сохранён). */
export interface DemoButtonBlock {
  /** demos.id → подставляется в ?block=<id>. */
  id: string
  /** Порядковый номер, 1-based («Демо N»). */
  index: number
  /** Есть ли у блока контент (хотя бы один физический блок в lessons_json). */
  hasContent: boolean
}

/** Подпись демо-кнопки: одно демо → «Демо», несколько → «Демо N». */
export function demoButtonLabel(index: number, total: number): string {
  return total <= 1 ? "Демо" : `Демо ${index}`
}

/**
 * Единый формат персональной демо-ссылки кандидата.
 * @param baseUrl — базовый URL приложения (getAppBaseUrl на сервере).
 * @param token — ДЛИННЫЙ token кандидата (не short_id).
 * @param blockId — id строки demos демо-блока.
 */
export function buildDemoLink(baseUrl: string, token: string, blockId: string): string {
  const base = (baseUrl || "").replace(/\/+$/, "")
  return `${base}/demo/${token}?block=${blockId}`
}

/** Готовая демо-кнопка для рендера: тип/подпись/ссылка/дизейбл. */
export interface DemoLinkButton {
  /** Тип ссылки в формате `demo${index}` (для per-кандидат состояния). */
  kind: `demo${number}`
  /** Порядковый номер, 1-based. */
  index: number
  /** Подпись кнопки. */
  label: string
  /** Персональная ссылка кандидата на этот демо-блок. */
  url: string
  /** true = у блока нет контента, кнопка серая (как «Демо 2» раньше). */
  disabled: boolean
}

/**
 * Строит готовые демо-кнопки для одного кандидата: подпись, единая ссылка,
 * дизейбл по отсутствию контента. Порядок = порядок blocks (уже канонический).
 */
export function buildDemoLinkButtons(
  blocks: ReadonlyArray<DemoButtonBlock>,
  token: string,
  baseUrl: string,
): DemoLinkButton[] {
  const total = blocks.length
  return blocks.map((b) => ({
    kind: `demo${b.index}` as `demo${number}`,
    index: b.index,
    label: demoButtonLabel(b.index, total),
    url: buildDemoLink(baseUrl, token, b.id),
    disabled: !b.hasContent,
  }))
}

// ─── Полный набор ссылок воронки (демо + тест + вакансия + интервью) ──────────
//
// Инлайн-чат кандидата (candidate-drawer): ряд «Ссылка:» показывает ВСЕ этапы
// воронки, а не только демо. Правило владельца: пункт показываем ТОЛЬКО если
// этап реально есть у вакансии (нет тест-блока → нет «Тест»; нет hh-ссылки →
// нет «Вакансия»; пустой демо-блок → его «Демо N» серый). Никаких заглушек на
// отсутствующие этапы.

/** Наличие не-демо этапов воронки у вакансии (с сервера, см. vacancy-demo-blocks). */
export interface FunnelLinkExtras {
  /** У вакансии есть активный тест-блок → показываем «Тест» (/test/{token}). */
  hasTest: boolean
  /** Публичная ссылка на вакансию (как «Вакансия» в hh-broadcast). null = скрыть. */
  vacancyUrl: string | null
  /** Доступна самозапись на интервью → показываем «Интервью» (/schedule/{token}). */
  hasSchedule: boolean
}

/** Готовая кнопка ссылки воронки для инлайн-чата. */
export interface FunnelLinkButton {
  /** Идентификатор типа: `demo${N}` | test | vacancy | interview. */
  key: string
  /** Подпись кнопки. */
  label: string
  /** Ссылка для вставки в поле «Написать кандидату». */
  url: string
  /** true = кнопка серая (пустой демо-блок). Тест/Вакансия/Интервью — всегда false. */
  disabled: boolean
}

/**
 * Персональная ссылка кандидата вида {baseUrl}/{path}/{token} (тест — /test,
 * интервью-самозапись — /schedule). ДЛИННЫЙ token (как у демо), обе публичные
 * страницы принимают его напрямую.
 */
export function buildCandidatePathLink(baseUrl: string, path: string, token: string): string {
  const base = (baseUrl || "").replace(/\/+$/, "")
  return `${base}/${path}/${token}`
}

/**
 * Полный набор быстрых ссылок воронки для инлайн-чата: демо-блоки (динамически,
 * пустые — серые) + Тест / Вакансия / Интервью по НАЛИЧИЮ (extras). Отсутствующие
 * этапы не добавляются вовсе (владелец: «если нет — скрываем»).
 */
export function buildFunnelLinkButtons(
  demoBlocks: ReadonlyArray<DemoButtonBlock>,
  extras: FunnelLinkExtras,
  token: string,
  baseUrl: string,
): FunnelLinkButton[] {
  const buttons: FunnelLinkButton[] = buildDemoLinkButtons(demoBlocks, token, baseUrl).map((b) => ({
    key: b.kind,
    label: b.label,
    url: b.url,
    disabled: b.disabled,
  }))
  if (extras.hasTest) {
    buttons.push({ key: "test", label: "Тест", url: buildCandidatePathLink(baseUrl, "test", token), disabled: false })
  }
  if (extras.vacancyUrl) {
    buttons.push({ key: "vacancy", label: "Вакансия", url: extras.vacancyUrl, disabled: false })
  }
  if (extras.hasSchedule) {
    buttons.push({ key: "interview", label: "Интервью", url: buildCandidatePathLink(baseUrl, "schedule", token), disabled: false })
  }
  return buttons
}
