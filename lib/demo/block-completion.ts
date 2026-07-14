/**
 * lib/demo/block-completion.ts
 *
 * Задача 4 (решение владельца, 14.07, на источнике правды из разведки
 * задачи 1 — Revoluterra «12/12 · 1/2»): вместо нотации «прогресс/прогресс ·
 * N/M частей» — бейдж «ДN» (номер НАИВЫСШЕГО пройденного демо-блока
 * вакансии), одинаково работающий для 1/2/3+ демо-блоков.
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
 * Номер (1-based) НАИВЫСШЕГО пройденного демо-блока — значение бейджа «ДN».
 * null, если кандидат не прошёл ни один демо-блок (бейдж не рисуется /
 * нейтральное «—»).
 */
export function getHighestCompletedDemoBlockIndex(
  entries: ReadonlyArray<DemoBlockCompletionEntry>,
): number | null {
  let highest: number | null = null
  for (const e of entries) {
    if (e.completed && (highest === null || e.index > highest)) highest = e.index
  }
  return highest
}

/** SQL-нейтральная спецификация фильтра «Демо: ДN / не проходил». */
export interface DemoBlockFilterSpec {
  /** demoId, чьи ключи ДОЛЖНЫ быть в demo_block_scores (обычно 0 или 1 штука — сам ДN). */
  requirePresentDemoIds: string[]
  /** demoId, чьи ключи НЕ должны быть в demo_block_scores (более высокие ДN — иначе highest был бы больше). */
  requireAbsentDemoIds: string[]
}

/**
 * Строит спецификацию фильтра «Демо: ДN» (targetIndex — 1-based номер) или
 * «не проходил» (targetIndex=null, требует отсутствия ЛЮБОГО ключа). Пустая
 * спецификация ({requirePresentDemoIds:[], requireAbsentDemoIds:[]}) при
 * targetIndex вне диапазона defs — вызывающая сторона должна трактовать её
 * как заведомо пустой результат (индекса не существует у этой вакансии).
 */
export function buildDemoBlockFilterSpec(
  defs: ReadonlyArray<Pick<DemoBlockDef, "demoId" | "index">>,
  targetIndex: number | null,
): DemoBlockFilterSpec {
  if (targetIndex === null) {
    return { requirePresentDemoIds: [], requireAbsentDemoIds: defs.map((d) => d.demoId) }
  }
  const target = defs.find((d) => d.index === targetIndex)
  if (!target) return { requirePresentDemoIds: [], requireAbsentDemoIds: [] }
  return {
    requirePresentDemoIds: [target.demoId],
    requireAbsentDemoIds: defs.filter((d) => d.index > targetIndex).map((d) => d.demoId),
  }
}

/**
 * Текст тултипа бейджа «ДN»: «Д1 ✓ · Д2 начат · Д3 — не проходил».
 */
export function formatDemoBlockTooltip(entries: ReadonlyArray<DemoBlockCompletionEntry>): string {
  return entries
    .map((e) => {
      const label = `Д${e.index}`
      if (e.completed) return `${label} ✓`
      if (e.touched) return `${label} начат`
      return `${label} — не проходил`
    })
    .join(" · ")
}
