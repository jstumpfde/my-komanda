// Юнит-тесты бейджа-комбинации пройденных демо-блоков («Д1+2») и
// containment-фильтра «прошёл ДN» (14.07, задача 4, корректировка
// владельца v2: семантика «наивысший ДN» снята — читалась как обязательная
// последовательность 1→2→3, а пути кандидатов разные).
// Запуск: pnpm exec tsx --test lib/demo/block-completion.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  extractAllBlockIds,
  buildDemoBlockDefs,
  computeDemoBlockCompletion,
  getCompletedDemoBlockIndexes,
  formatDemoBlockBadge,
  parseDemoBlockFilterValues,
  buildDemoBlockContainmentSpec,
  matchesDemoBlockSelection,
  formatDemoBlockTooltip,
} from "./block-completion"

// Фикстура: 3 демо-блока (упрощённая версия реальной структуры Revoluterra:
// Презентация / Путь менеджера / demo 3-заглушка без блоков).
const DEMO1_LESSONS = [
  { id: "les-1", blocks: [{ id: "blk-1-a" }, { id: "blk-1-b" }, { id: "blk-1-c" }] },
]
const DEMO2_LESSONS = [
  { id: "les-2", blocks: [{ id: "blk-2-a" }, { id: "blk-2-b" }] },
  { id: "les-3", blocks: [{ id: "blk-2-c" }] },
]
const DEMO3_EMPTY_LESSONS: unknown[] = []

function fixtureDefs() {
  return buildDemoBlockDefs([
    { id: "demo-1", title: "Презентация", lessonsJson: DEMO1_LESSONS },
    { id: "demo-2", title: "Путь менеджера", lessonsJson: DEMO2_LESSONS },
    { id: "demo-3", title: "Демо 3", lessonsJson: DEMO3_EMPTY_LESSONS },
  ])
}

function touched(blockIds: string[]) {
  return { blocks: blockIds.map((blockId) => ({ blockId, status: "completed" })) }
}

test("extractAllBlockIds: собирает id всех физических блоков всех уроков", () => {
  assert.deepEqual(extractAllBlockIds(DEMO2_LESSONS), ["blk-2-a", "blk-2-b", "blk-2-c"])
})

test("extractAllBlockIds: не-массив/пусто → []", () => {
  assert.deepEqual(extractAllBlockIds(null), [])
  assert.deepEqual(extractAllBlockIds(undefined), [])
  assert.deepEqual(extractAllBlockIds("not an array"), [])
})

test("buildDemoBlockDefs: нумерует Д1/Д2/Д3 в порядке входного массива (порядок — забота вызывающей SQL ORDER BY sortOrder)", () => {
  const defs = fixtureDefs()
  assert.equal(defs.length, 3)
  assert.equal(defs[0].index, 1)
  assert.equal(defs[0].title, "Презентация")
  assert.equal(defs[1].index, 2)
  assert.equal(defs[2].index, 3)
})

test("buildDemoBlockDefs: пустой title → фолбэк 'Демо N'", () => {
  const defs = buildDemoBlockDefs([{ id: "demo-1", title: "", lessonsJson: DEMO1_LESSONS }])
  assert.equal(defs[0].title, "Демо 1")
})

test("computeDemoBlockCompletion: ничего не пройдено и не открыто → все completed=false, touched=false", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), null, null)
  for (const e of entries) {
    assert.equal(e.completed, false)
    assert.equal(e.touched, false)
    assert.equal(e.score, null)
  }
})

test("computeDemoBlockCompletion: часть 1 пройдена (ключ в demo_block_scores) → completed=true, score проброшен", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 78 } }, null)
  assert.equal(entries[0].completed, true)
  assert.equal(entries[0].score, 78)
  assert.equal(entries[1].completed, false)
})

test("computeDemoBlockCompletion: блок открыт (blockId в прогрессе), но НЕ пройден → completed=false, touched=true", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 78 } }, touched(["blk-2-a"]))
  assert.equal(entries[1].completed, false)
  assert.equal(entries[1].touched, true)
})

test("computeDemoBlockCompletion: некорректный score (NaN) не считается пройденным", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: Number.NaN } }, null)
  assert.equal(entries[0].completed, false)
})

// ── getCompletedDemoBlockIndexes / formatDemoBlockBadge ─────────────────────

test("indexes: ничего не пройдено → [], бейдж null", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), null, null)
  const idx = getCompletedDemoBlockIndexes(entries)
  assert.deepEqual(idx, [])
  assert.equal(formatDemoBlockBadge(idx), null)
})

test("indexes: пройдена только часть 1 → [1], бейдж «Д1»", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 50 } }, null)
  const idx = getCompletedDemoBlockIndexes(entries)
  assert.deepEqual(idx, [1])
  assert.equal(formatDemoBlockBadge(idx), "Д1")
})

test("indexes: пройдена ТОЛЬКО часть 3 (новый путь, минуя 1 и 2) → [3], бейдж «Д3» — НЕ выглядит как последовательность", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-3": { score: 90 } }, null)
  const idx = getCompletedDemoBlockIndexes(entries)
  assert.deepEqual(idx, [3])
  assert.equal(formatDemoBlockBadge(idx), "Д3")
})

test("indexes: части 1 и 2 → [1,2], бейдж «Д1+2»", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 50 }, "demo-2": { score: 70 } }, null)
  const idx = getCompletedDemoBlockIndexes(entries)
  assert.deepEqual(idx, [1, 2])
  assert.equal(formatDemoBlockBadge(idx), "Д1+2")
})

test("indexes: части 1 и 3 (пропущена 2) → [1,3], бейдж «Д1+3»", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 50 }, "demo-3": { score: 70 } }, null)
  assert.equal(formatDemoBlockBadge(getCompletedDemoBlockIndexes(entries)), "Д1+3")
})

test("indexes: все три части → бейдж «Д1+2+3»", () => {
  const entries = computeDemoBlockCompletion(
    fixtureDefs(),
    { "demo-1": { score: 1 }, "demo-2": { score: 2 }, "demo-3": { score: 3 } },
    null,
  )
  assert.equal(formatDemoBlockBadge(getCompletedDemoBlockIndexes(entries)), "Д1+2+3")
})

test("formatDemoBlockBadge: сортирует номера по возрастанию независимо от порядка входа", () => {
  assert.equal(formatDemoBlockBadge([3, 1]), "Д1+3")
})

// ── parseDemoBlockFilterValues ──────────────────────────────────────────────

test("parse: цифры и none разбираются, мусор/дубли игнорируются", () => {
  const sel = parseDemoBlockFilterValues(["2", "none", "1", "abc", "2", "0", "-1"])
  assert.deepEqual(sel.indexes, [1, 2])
  assert.equal(sel.none, true)
})

test("parse: пустой вход → пустой выбор", () => {
  const sel = parseDemoBlockFilterValues([])
  assert.deepEqual(sel.indexes, [])
  assert.equal(sel.none, false)
})

// ── buildDemoBlockContainmentSpec (И-семантика) ─────────────────────────────

test("containment: Д1 → present=[demo-1], absent=[], про Д2/Д3 ничего не утверждается (регрессия v1-семантики «наивысший», которая запрещала бы demo-2/demo-3)", () => {
  const spec = buildDemoBlockContainmentSpec(fixtureDefs(), { indexes: [1], none: false })
  assert.deepEqual(spec.requirePresentDemoIds, ["demo-1"])
  assert.deepEqual(spec.requireAbsentDemoIds, [])
  assert.equal(spec.impossible, false)
})

test("containment: Д1+Д3 (несколько = И) → present=[demo-1,demo-3]", () => {
  const spec = buildDemoBlockContainmentSpec(fixtureDefs(), { indexes: [1, 3], none: false })
  assert.deepEqual(spec.requirePresentDemoIds, ["demo-1", "demo-3"])
  assert.deepEqual(spec.requireAbsentDemoIds, [])
})

test("containment: «не проходил ни одного» → absent=все demo-id вакансии", () => {
  const spec = buildDemoBlockContainmentSpec(fixtureDefs(), { indexes: [], none: true })
  assert.deepEqual(spec.requirePresentDemoIds, [])
  assert.deepEqual(spec.requireAbsentDemoIds, ["demo-1", "demo-2", "demo-3"])
})

test("containment: номер вне диапазона вакансии → impossible=true", () => {
  const spec = buildDemoBlockContainmentSpec(fixtureDefs(), { indexes: [99], none: false })
  assert.equal(spec.impossible, true)
})

test("containment: none + номер — противоречие ловится естественно (тот же id в present и absent)", () => {
  const spec = buildDemoBlockContainmentSpec(fixtureDefs(), { indexes: [1], none: true })
  assert.deepEqual(spec.requirePresentDemoIds, ["demo-1"])
  assert.ok(spec.requireAbsentDemoIds.includes("demo-1"))
})

// ── matchesDemoBlockSelection (JS post-fetch, multi-vacancy ветка) ──────────

test("matches: Д1 выбран, кандидат прошёл [1,2] → true (containment, не точное совпадение)", () => {
  assert.equal(matchesDemoBlockSelection([1, 2], { indexes: [1], none: false }), true)
})

test("matches: Д1+Д2 выбраны (И), кандидат прошёл только [1] → false", () => {
  assert.equal(matchesDemoBlockSelection([1], { indexes: [1, 2], none: false }), false)
})

test("matches: none выбран, кандидат ничего не прошёл → true; прошёл хоть что-то → false", () => {
  assert.equal(matchesDemoBlockSelection([], { indexes: [], none: true }), true)
  assert.equal(matchesDemoBlockSelection([2], { indexes: [], none: true }), false)
})

test("matches: пустой выбор → все проходят", () => {
  assert.equal(matchesDemoBlockSelection([], { indexes: [], none: false }), true)
  assert.equal(matchesDemoBlockSelection([1, 3], { indexes: [], none: false }), true)
})

// ── formatDemoBlockTooltip (построчная детализация) ─────────────────────────

test("tooltip: построчно — название блока, пройден/нет, балл; БЕЗ «часть N из M»", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 72 } }, touched(["blk-2-a"]))
  const text = formatDemoBlockTooltip(entries)
  assert.equal(text, [
    "Д1 «Презентация» — пройден, балл 72",
    "Д2 «Путь менеджера» — начат, не завершён",
    "Д3 «Демо 3» — не проходил",
  ].join("\n"))
  assert.ok(!text.includes("часть"))
})

test("tooltip: все пройдены — каждый со своим баллом", () => {
  const entries = computeDemoBlockCompletion(
    fixtureDefs(),
    { "demo-1": { score: 60 }, "demo-2": { score: 90 }, "demo-3": { score: 40 } },
    null,
  )
  const lines = formatDemoBlockTooltip(entries).split("\n")
  assert.equal(lines.length, 3)
  assert.ok(lines[0].includes("пройден, балл 60"))
  assert.ok(lines[1].includes("пройден, балл 90"))
  assert.ok(lines[2].includes("пройден, балл 40"))
})
