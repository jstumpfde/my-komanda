// Юнит-тесты бейджа «ДN» (14.07, задача 4 — номер наивысшего пройденного
// демо-блока, замена нотации «12/12 · 1/2»).
// Запуск: pnpm exec tsx --test lib/demo/block-completion.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  extractAllBlockIds,
  buildDemoBlockDefs,
  computeDemoBlockCompletion,
  getHighestCompletedDemoBlockIndex,
  buildDemoBlockFilterSpec,
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
  assert.equal(defs[1].title, "Путь менеджера")
  assert.equal(defs[2].index, 3)
})

test("buildDemoBlockDefs: пустой title → фолбэк 'Демо N'", () => {
  const defs = buildDemoBlockDefs([{ id: "demo-1", title: "", lessonsJson: DEMO1_LESSONS }])
  assert.equal(defs[0].title, "Демо 1")
})

test("computeDemoBlockCompletion: ничего не пройдено и не открыто → все completed=false, touched=false", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), null, null)
  assert.equal(entries.length, 3)
  for (const e of entries) {
    assert.equal(e.completed, false)
    assert.equal(e.touched, false)
    assert.equal(e.score, null)
  }
})

test("computeDemoBlockCompletion: часть 1 пройдена (есть ключ в demo_block_scores) → completed=true, score проброшен", () => {
  const entries = computeDemoBlockCompletion(
    fixtureDefs(),
    { "demo-1": { score: 78 } },
    touched(["blk-1-a", "blk-1-b", "blk-1-c"]),
  )
  assert.equal(entries[0].completed, true)
  assert.equal(entries[0].score, 78)
  assert.equal(entries[1].completed, false)
})

test("computeDemoBlockCompletion: демо ОТКРЫТО (blockId встречается в прогрессе), но НЕ пройдено (нет ключа в demo_block_scores) → completed=false, touched=true", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 78 } }, touched(["blk-2-a"]))
  assert.equal(entries[1].completed, false)
  assert.equal(entries[1].touched, true)
})

test("computeDemoBlockCompletion: обе части пройдены (2 ключа в demo_block_scores) → completed=[true,true]", () => {
  const entries = computeDemoBlockCompletion(
    fixtureDefs(),
    { "demo-1": { score: 60 }, "demo-2": { score: 90 } },
    touched(["blk-1-a", "blk-2-a"]),
  )
  assert.equal(entries[0].completed, true)
  assert.equal(entries[1].completed, true)
})

test("computeDemoBlockCompletion: демо без обязательных вопросов (demo-3, нет ключа) остаётся completed=false", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 60 }, "demo-2": { score: 90 } }, null)
  const demo3 = entries.find((e) => e.demoId === "demo-3")!
  assert.equal(demo3.completed, false)
})

test("computeDemoBlockCompletion: некорректный score (NaN/строка) не считается пройденным", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: Number.NaN } }, null)
  assert.equal(entries[0].completed, false)
})

test("getHighestCompletedDemoBlockIndex: ничего не пройдено → null", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), null, null)
  assert.equal(getHighestCompletedDemoBlockIndex(entries), null)
})

test("getHighestCompletedDemoBlockIndex: пройдена только часть 1 → 1", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 50 } }, null)
  assert.equal(getHighestCompletedDemoBlockIndex(entries), 1)
})

test("getHighestCompletedDemoBlockIndex: пройдены части 1 и 2 → 2 (регрессия бага «12/12 · 1/2»: раньше UI не мог отличить 1 от 2 частей)", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 50 }, "demo-2": { score: 90 } }, null)
  assert.equal(getHighestCompletedDemoBlockIndex(entries), 2)
})

test("getHighestCompletedDemoBlockIndex: пройдена ТОЛЬКО часть 2 (часть 1 пропущена) → берёт наивысший индекс (2)", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-2": { score: 90 } }, null)
  assert.equal(getHighestCompletedDemoBlockIndex(entries), 2)
})

test("formatDemoBlockTooltip: смешанный статус (пройден/начат/не проходил) форматируется читаемо", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 50 } }, touched(["blk-2-a"]))
  assert.equal(formatDemoBlockTooltip(entries), "Д1 ✓ · Д2 начат · Д3 — не проходил")
})

test("formatDemoBlockTooltip: всё пройдено", () => {
  const entries = computeDemoBlockCompletion(fixtureDefs(), { "demo-1": { score: 50 }, "demo-2": { score: 70 } }, null)
  assert.equal(formatDemoBlockTooltip(entries).startsWith("Д1 ✓ · Д2 ✓"), true)
})

test("buildDemoBlockFilterSpec: targetIndex=1 → требует ключ demo-1, запрещает ключи demo-2/demo-3 (иначе highest был бы больше)", () => {
  const spec = buildDemoBlockFilterSpec(fixtureDefs(), 1)
  assert.deepEqual(spec.requirePresentDemoIds, ["demo-1"])
  assert.deepEqual(spec.requireAbsentDemoIds, ["demo-2", "demo-3"])
})

test("buildDemoBlockFilterSpec: targetIndex=3 (последний) → требует ключ demo-3, ничего не запрещает", () => {
  const spec = buildDemoBlockFilterSpec(fixtureDefs(), 3)
  assert.deepEqual(spec.requirePresentDemoIds, ["demo-3"])
  assert.deepEqual(spec.requireAbsentDemoIds, [])
})

test("buildDemoBlockFilterSpec: targetIndex=null (не проходил) → ничего не требует, запрещает ВСЕ demo-id", () => {
  const spec = buildDemoBlockFilterSpec(fixtureDefs(), null)
  assert.deepEqual(spec.requirePresentDemoIds, [])
  assert.deepEqual(spec.requireAbsentDemoIds, ["demo-1", "demo-2", "demo-3"])
})

test("buildDemoBlockFilterSpec: targetIndex вне диапазона → пустая спецификация (вызывающая сторона трактует как заведомо пустой результат)", () => {
  const spec = buildDemoBlockFilterSpec(fixtureDefs(), 99)
  assert.deepEqual(spec.requirePresentDemoIds, [])
  assert.deepEqual(spec.requireAbsentDemoIds, [])
})
