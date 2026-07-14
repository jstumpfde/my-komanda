/**
 * lib/demo/block-completion.ts
 *
 * Задача 4 (решение владельца, 14.07, на источнике правды из разведки
 * задачи 1 — Revoluterra «12/12 · 1/2»): вместо нотации «прогресс/прогресс ·
 * N/M частей» — бейдж-КОМБИНАЦИЯ пройденных демо-блоков («Д1», «Д3»,
 * «Д1+2», «Д1+2+3»), одинаково работающий для 1/2/3+ демо-блоков.
 * Корректировка владельца 14.07 (v2): первоначальная семантика «номер
 * наивысшего пройденного ДN» снята — с третьим демо-блоком она читалась
 * как обязательная последовательность 1→2→3, а пути кандидатов разные
 * (новые идут сразу на Демо-3). Фильтр — containment «прошёл ДN»
 * (несколько чекбоксов = И), плюс «не проходил ни одного».
 *
 * Источник правды = ТОТ ЖЕ сигнал, который задача 1 прод-разведкой 14.07
 * подтвердила как ЧЕСТНЫЙ: candidates.demo_block_scores (пишет
 * lib/demo/score-answers.ts при первом реальном ответе на скорируемый
 * вопрос demo-блока). Проверено на 260 кандидатах вакансии Revoluterra:
 * 0 расхождений между «есть ключ demo_block_scores» и «реально отвечал на
 * вопросы этого блока». Порядок демо-блоков (Д1/Д2/Д3/...) — тот же порядок,
 * в котором ключи вставляются в demo_block_scores (demos.sort_order ASC,
 * createdAt тай-брейк — см. score-answers.ts orderBy).
 *
 * Почему НЕ «все физические блоки демо отмечены completed» (альтернатива,
 * рассмотренная и отвергнутая 14.07): при пересборке демо в конструкторе
 * (Notion-редактор) id блоков могут поменяться — у ИСТОРИЧЕСКИХ кандидатов
 * demo_progress_json.blocks хранит id СТАРОЙ версии, которые не совпадают с
 * ТЕКУЩИМ demos.lessons_json. Прогон по реальным данным Revoluterra показал:
 * такой подход не находит НИ ОДНОГО «полностью пройденного» демо-блока 1
 * («Презентация») ни у одного кандидата, включая тех, кто гарантированно его
 * прошёл (есть балл в demo_block_scores) — ложноотрицательный результат хуже
 * старой нотации. demo_block_scores устойчив к пересборке демо (пишется по
 * факту ответа, не по совпадению id блока с текущим снапшотом).
 *
 * «touched» (блок открыт, но не пройден) — best-effort подсказка для
 * тултипа, НЕ источник истины для самого номера ДN: любой физический
 * blockId этого демо встречается в demo_progress_json.blocks (в любом
 * статусе). Может быть неточным при пересборке демо — это нормально,
 * используется только для текста «начат» vs «не проходил» в тултипе.
 *
 * Чистые функции, без БД/IO — юнит-тестируются без моков.
 */

interface RawLessonBlock {
  id?: string
}

interface RawLesson {
  blocks?: RawLessonBlock[]
}

/** Извлекает id ВСЕХ физических блоков (любого типа) одного demo.lessons_json. */
export function extractAllBlockIds(lessonsJson: unknown): string[] {
  const ids: string[] = []
  if (!Array.isArray(lessonsJson)) return ids
  for (const lesson of lessonsJson as RawLesson[]) {
    if (!lesson || !Array.isArray(lesson.blocks)) continue
    for (const b of lesson.blocks) {
      if (b && typeof b.id === "string" && b.id) ids.push(b.id)
    }
  }
  return ids
}

/** Один demo-блок вакансии в каноническом порядке прохождения (Д1, Д2, Д3, ...). */
export interface DemoBlockDef {
  demoId: string
  title: string
  /** Порядковый номер, 1-based — то самое «ДN». */
  index: number
  /** Для «touched»-подсказки тултипа (best-effort, см. комментарий модуля). */
  blockIds: string[]
}

/** Минимальный вход одной строки таблицы demos, уже отсортированной по sortOrder/createdAt. */
export interface DemoRowForBlockDefs {
  id: string
  title: string | null
  lessonsJson: unknown
}

/**
 * Строит определения демо-блоков вакансии (Д1..ДN) из demos-строк,
 * ПЕРЕДАННЫХ УЖЕ в каноническом порядке (сортировка — забота вызывающей
 * стороны/SQL ORDER BY sort_order, created_at — тот же порядок, что и
 * lib/demo/score-answers.ts, чтобы номера ДN совпадали с порядком вставки
 * ключей в demo_block_scores).
 */
export function buildDemoBlockDefs(rows: ReadonlyArray<DemoRowForBlockDefs>): DemoBlockDef[] {
  return rows.map((d, i) => ({
    demoId: d.id,
    title: d.title?.trim() || `Демо ${i + 1}`,
    index: i + 1,
    blockIds: extractAllBlockIds(d.lessonsJson),
  }))
}

interface ProgressBlockEntry {
  blockId?: string
  status?: string
}

interface DemoProgressJsonShape {
  blocks?: ProgressBlockEntry[]
}

/** Любой физический blockId этого demo встречается в demo_progress_json (any статус). */
function isTouched(blockIds: readonly string[], touchedIds: ReadonlySet<string>): boolean {
  return blockIds.some((id) => touchedIds.has(id));
}

/** Минимальная форма одной записи candidates.demo_block_scores. */
export interface DemoBlockScoreEntryLike {
  score?: number
}

/** Прогресс одного demo-блока для конкретного кандидата. */
export interface DemoBlockCompletionEntry {
  demoId: string
  title: string
  index: number
  /** Источник истины: есть запись в demo_block_scores (реально отвечал). */
  completed: boolean
  /** Балл блока, если пройден (demo_block_scores[demoId].score). */
  score: number | null
  /** Best-effort: открывал ли блок вообще (см. комментарий модуля). Для тултипа. */
  touched: boolean
}

/**
 * Прогресс кандидата по каждому демо-блоку вакансии (Д1, Д2, Д3, ...).
 * completed — по demo_block_scores (источник правды, задача 1); touched —
 * best-effort подсказка по demo_progress_json для текста тултипа.
 */
export function computeDemoBlockCompletion(
  defs: ReadonlyArray<DemoBlockDef>,
  demoBlockScores: Record<string, DemoBlockScoreEntryLike> | null | undefined,
  demoProgressJson: DemoProgressJsonShape | null | undefined,
): DemoBlockCompletionEntry[] {
  const scores = demoBlockScores && typeof demoBlockScores === "object" ? demoBlockScores : {}
  const touchedIds = new Set<string>()
  const progressBlocks = demoProgressJson?.blocks
  if (Array.isArray(progressBlocks)) {
    for (const b of progressBlocks) {
      if (b && typeof b.blockId === "string") touchedIds.add(b.blockId)
    }
  }
  return defs.map((d) => {
    const entry = scores[d.demoId]
    const completed = entry != null && typeof entry === "object" && Number.isFinite(Number(entry.score))
    return {
      demoId: d.demoId,
      title: d.title,
      index: d.index,
      completed,
      score: completed ? Number(entry!.score) : null,
      touched: completed || isTouched(d.blockIds, touchedIds),
    }
  })
}

/**
 * Номера (1-based, по возрастанию) ВСЕХ полностью пройденных демо-блоков.
 * Пустой массив = ничего не пройдено (бейдж не рисуется).
 *
 * Корректировка владельца 14.07 (v2): семантика «наивысший ДN» снята —
 * с появлением третьего демо-блока она выглядела как обязательная
 * последовательность 1→2→3, что неверно: пути кандидатов разные (новые
 * идут сразу на Демо-3). Бейдж теперь — КОМБИНАЦИЯ пройденных блоков.
 */
export function getCompletedDemoBlockIndexes(
  entries: ReadonlyArray<DemoBlockCompletionEntry>,
): number[] {
  return entries
    .filter((e) => e.completed)
    .map((e) => e.index)
    .sort((a, b) => a - b)
}

/**
 * Правило владельца (14.07, уточнение): «прошёл демо-часть → полное демо,
 * ЕДИНЫЙ знаменатель». Если у вакансии несколько демо-блоков (Д1/Д2/Д3) и
 * кандидат прошёл хотя бы один демо-блок (есть балл в demo_block_scores),
 * прогресс-бар «Демо» в списке кандидатов показывает N=M с ОДНИМ знаменателем
 * для всех = МАКСИМАЛЬНОЕ число блоков среди демо-блоков вакансии
 * (для Revoluterra = блоки Демо-3 = 20). Т.е. и Алексеева (прошла Д1+Д3), и
 * когорта Д1+2 → 20/20 — единообразно, конец абсурду «32/20» и «19/17»
 * (раньше числитель суммировал completed-блоки по ВСЕМ демо, а знаменатель
 * брался от одного).
 *
 * КОМПРОМИСС для ТЕКУЩИХ вакансий: единый знаменатель специально НЕ меняет
 * привычные клиенту числа при разном наборе пройденных демо (иначе Д1+2 дал бы
 * 17/17, а Д1+3 — 20/20, и клиент бы путался сменой чисел у похожих
 * кандидатов). ПРАВИЛЬНЫЙ подсчёт по реальному числу блоков КАЖДОГО демо — это
 * задача БУДУЩЕЙ модели контента (одно «Демо» + Анкета + Тест как отдельные
 * сущности со своими колонками N/M), см. memory content-model-future-demo-
 * anketa-test. Здесь намеренно оставлен единый максимум.
 *
 * total = макс(blockIds.length) + 1 (виртуальная страница «Анкета», как и в
 * page-based расчёте route.ts).
 *
 * Возвращает null, когда правило НЕ применяется — тогда вызывающая сторона
 * оставляет свой базовый расчёт без изменений:
 *  - у вакансии одно демо (defs.length <= 1): одно-демо/легаси kind='demo'
 *    вакансии НЕ трогаем;
 *  - кандидат не прошёл ни одного демо-блока (completedIndexes пуст): для
 *    «в процессе» прогресс считается базовой формулой (+ клампом в UI);
 *  - у всех демо нет физических блоков (вырожденная вакансия) — не выдумываем
 *    «1/1».
 */
export interface UniformDemoOverride {
  /** Единый знаменатель N/M = макс(blockIds.length среди демо) + 1 (анкета). */
  total: number
  /** Числитель = total (пройденный демо считается завершённым целиком). */
  completed: number
  /** Всегда 100 — демо-часть пройдена. */
  percent: number
}

export function computeUniformDemoOverride(
  defs: ReadonlyArray<Pick<DemoBlockDef, "index" | "blockIds">>,
  completedIndexes: readonly number[],
): UniformDemoOverride | null {
  if (defs.length <= 1) return null
  if (completedIndexes.length === 0) return null
  // Единый знаменатель = максимальное число блоков среди ВСЕХ демо вакансии + 1
  // (анкета), независимо от того, какие именно демо прошёл кандидат.
  const maxTot = Math.max(...defs.map((d) => d.blockIds.length + 1))
  if (maxTot <= 1) return null // все демо без физических блоков — не выдумываем 1/1
  return { total: maxTot, completed: maxTot, percent: 100 }
}

/**
 * Текст бейджа-комбинации: «Д1» / «Д3» / «Д1+2» / «Д1+2+3».
 * null = ничего не пройдено, бейдж не рисуется.
 */
export function formatDemoBlockBadge(indexes: readonly number[]): string | null {
  if (indexes.length === 0) return null
  return "Д" + [...indexes].sort((a, b) => a - b).join("+")
}

/** Разобранный выбор фильтра «Демо: пройденные блоки». */
export interface DemoBlockFilterSelection {
  /** Выбранные номера блоков (1-based). Несколько = И (containment). */
  indexes: number[]
  /** Чекбокс «Не проходил ни одного». */
  none: boolean
}

/** Разбирает значения query-параметра demoBlock ("1","2","3","none"; мусор игнорируется). */
export function parseDemoBlockFilterValues(values: readonly string[]): DemoBlockFilterSelection {
  const indexes: number[] = []
  let none = false
  for (const v of values) {
    if (v === "none") { none = true; continue }
    const n = Number.parseInt(v, 10)
    if (Number.isInteger(n) && n >= 1 && !indexes.includes(n)) indexes.push(n)
  }
  return { indexes: indexes.sort((a, b) => a - b), none }
}

/** SQL-нейтральная спецификация containment-фильтра «прошёл ДN» (И-семантика). */
export interface DemoBlockContainmentSpec {
  /** demoId, чьи ключи ДОЛЖНЫ быть в demo_block_scores (каждый выбранный ДN). */
  requirePresentDemoIds: string[]
  /** demoId, чьи ключи НЕ должны быть там («не проходил ни одного» → все блоки вакансии). */
  requireAbsentDemoIds: string[]
  /** true = выбран номер, которого нет у вакансии → заведомо пустой результат. */
  impossible: boolean
}

/**
 * Containment-семантика (корректировка владельца 14.07 v2): «прошёл ДN» —
 * каждый выбранный номер требует НАЛИЧИЯ своего ключа в demo_block_scores;
 * про остальные блоки ничего не утверждается (в отличие от снятой
 * «наивысший»-семантики, которая запрещала более высокие номера).
 * «Не проходил ни одного» требует ОТСУТСТВИЯ всех ключей. Комбинация
 * «none» + номера противоречива — тот же demoId попадёт и в present, и в
 * absent → SQL честно вернёт пусто (отдельно не отлавливаем).
 */
export function buildDemoBlockContainmentSpec(
  defs: ReadonlyArray<Pick<DemoBlockDef, "demoId" | "index">>,
  selection: DemoBlockFilterSelection,
): DemoBlockContainmentSpec {
  const requirePresentDemoIds: string[] = []
  let impossible = false
  for (const idx of selection.indexes) {
    const def = defs.find((d) => d.index === idx)
    if (!def) { impossible = true; continue }
    requirePresentDemoIds.push(def.demoId)
  }
  return {
    requirePresentDemoIds,
    requireAbsentDemoIds: selection.none ? defs.map((d) => d.demoId) : [],
    impossible,
  }
}

/**
 * JS-проверка того же containment-фильтра по уже посчитанным индексам
 * кандидата — для multi-vacancy ветки (post-fetch), где один SQL WHERE
 * невозможен (у каждой вакансии свои demo-id).
 */
export function matchesDemoBlockSelection(
  completedIndexes: readonly number[],
  selection: DemoBlockFilterSelection,
): boolean {
  if (selection.none && completedIndexes.length > 0) return false
  return selection.indexes.every((idx) => completedIndexes.includes(idx))
}

/**
 * Тултип бейджа: ПОСТРОЧНАЯ детализация по каждому блоку — название,
 * пройден/нет, балл ответов (корректировка владельца 14.07 v2; прежние
 * форматы «Сдана часть N из M» и «Д1 ✓ · Д2 …» сняты — читались как
 * обязательная последовательность). Рендерить с whitespace-pre-line.
 */
export function formatDemoBlockTooltip(entries: ReadonlyArray<DemoBlockCompletionEntry>): string {
  return entries
    .map((e) => {
      const head = `Д${e.index} «${e.title}»`
      if (e.completed) return `${head} — пройден${e.score != null ? `, балл ${e.score}` : ""}`
      if (e.touched) return `${head} — начат, не завершён`
      return `${head} — не проходил`
    })
    .join("\n")
}
