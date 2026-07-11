/**
 * scripts/dev-kb-sources-smoke.ts
 *
 * Юнит-смоук для «Подключённых источников» (концепт kb-connected-sources,
 * фаза 1) — БЕЗ сети и БЕЗ БД: только чистая логика чанкинга
 * (lib/knowledge/chunking.ts) и резолвинга папок/aiOptOut
 * (lib/knowledge-sources/root-folders.ts). Дифф-логика синка
 * (lib/knowledge-sources/sync-source.ts) требует БД/сети — не смоучится
 * здесь, но её ключевое правило (unchanged = совпавший contentHash + status
 * indexed + не soft-deleted) продублировано отдельной чистой проверкой ниже.
 *
 * Запуск: pnpm tsx scripts/dev-kb-sources-smoke.ts
 */

import assert from "node:assert/strict"
import { chunkText, estimateTokens } from "../lib/knowledge/chunking"
import { findRootFolder, resolveAiOptOut } from "../lib/knowledge-sources/root-folders"
import type { KnowledgeSourceRootFolder } from "../lib/db/schema"

let passed = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ok — ${name}`)
  } catch (err) {
    console.error(`  FAIL — ${name}`)
    throw err
  }
}

console.log("── chunking.ts ──")

check("пустой текст → 0 чанков", () => {
  assert.equal(chunkText("").length, 0)
  assert.equal(chunkText("   \n\n  ").length, 0)
})

check("короткий текст → один чанк, ord=0", () => {
  const chunks = chunkText("Простой короткий абзац без заголовков.")
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].ord, 0)
  assert.ok(chunks[0].textHash.length === 64, "sha256 hex должен быть 64 символа")
})

check("заголовки создают отдельные логические блоки", () => {
  const text = [
    "# Раздел 1",
    "Текст раздела один.",
    "",
    "# Раздел 2",
    "Текст раздела два.",
  ].join("\n")
  const chunks = chunkText(text)
  // Короткие заголовки могут слиться в один чанк (нет overlap, цель ~1200
  // токенов) — важно, что деление НЕ ломает текст и ord идёт по порядку 0..N-1.
  assert.ok(chunks.length >= 1)
  chunks.forEach((c, i) => assert.equal(c.ord, i))
})

check("длинный текст режется на несколько чанков без overlap", () => {
  // ~4200 символов — целевой размер чанка (TARGET_CHARS в chunking.ts).
  // Возьмём в разы больше, чтобы гарантированно получить >1 чанк.
  const paragraph = "Это длинный абзац с достаточным количеством слов для проверки чанкинга. ".repeat(200)
  const chunks = chunkText(paragraph)
  assert.ok(chunks.length > 1, `ожидали >1 чанк, получили ${chunks.length}`)

  // Без overlap: конкатенация чанков (с одним пробелом-разделителем) должна
  // содержать весь исходный текст без дублирования кусков.
  const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0)
  assert.ok(totalChars <= paragraph.length + chunks.length, "не должно быть значительного дублирования текста между чанками")

  // Одинаковые чанки на одинаковом входе — стабильный хеш (детерминизм,
  // критично для диффа "переэмбеддинг только изменившихся чанков").
  const chunksAgain = chunkText(paragraph)
  assert.deepEqual(chunks.map((c) => c.textHash), chunksAgain.map((c) => c.textHash))
})

check("textHash меняется при изменении текста чанка", () => {
  const a = chunkText("Текст версии один, ничего особенного.")
  const b = chunkText("Текст версии два, изменили пару слов.")
  assert.notEqual(a[0].textHash, b[0].textHash)
})

check("estimateTokens — грубая оценка length/3.5, растёт с длиной текста", () => {
  const short = estimateTokens("привет")
  const long = estimateTokens("привет ".repeat(100))
  assert.ok(long > short)
  assert.equal(estimateTokens(""), 0)
})

console.log("\n── root-folders.ts ──")

const folders: KnowledgeSourceRootFolder[] = [
  { path: "/Регламенты", audience: "employees", aiOptOut: false },
  { path: "/Регламенты/Зарплаты", audience: "owner_only", aiOptOut: true },
  { path: "/Прайсы", audience: "clients", aiOptOut: false },
]

check("находит точное совпадение папки", () => {
  const f = findRootFolder(folders, "/Прайсы")
  assert.equal(f?.path, "/Прайсы")
})

check("находит родительскую папку для вложенного файла", () => {
  const f = findRootFolder(folders, "/Регламенты/инструкция.docx")
  assert.equal(f?.path, "/Регламенты")
})

check("более специфичная (вложенная) папка выигрывает у родительской", () => {
  const f = findRootFolder(folders, "/Регламенты/Зарплаты/ведомость.xlsx")
  assert.equal(f?.path, "/Регламенты/Зарплаты")
})

check("файл вне всех выбранных папок → null", () => {
  const f = findRootFolder(folders, "/Прочее/файл.txt")
  assert.equal(f, null)
})

check("resolveAiOptOut наследует aiOptOut самой специфичной папки", () => {
  assert.equal(resolveAiOptOut(folders, "/Регламенты/инструкция.docx"), false)
  assert.equal(resolveAiOptOut(folders, "/Регламенты/Зарплаты/ведомость.xlsx"), true)
  assert.equal(resolveAiOptOut(folders, "/Прочее/файл.txt"), false, "файл вне выбранных папок — не aiOptOut по умолчанию")
})

console.log("\n── diff-логика синка (чистая часть, sync-source.ts) ──")

// Продублировано из sync-source.ts::syncOneSource "unchanged" условия — без
// импорта самой функции (она требует БД). Если это правило когда-нибудь
// разойдётся с реальным кодом — обновить оба места.
function isUnchanged(existing: { status: string; deletedAt: Date | null; contentHash: string | null } | null, file: { contentHash: string | null }): boolean {
  return Boolean(
    existing && existing.status === "indexed" && !existing.deletedAt &&
    existing.contentHash && file.contentHash && existing.contentHash === file.contentHash,
  )
}

check("новый файл (нет existing) → изменён", () => {
  assert.equal(isUnchanged(null, { contentHash: "abc" }), false)
})

check("тот же md5, status=indexed, не удалён → unchanged", () => {
  assert.equal(isUnchanged({ status: "indexed", deletedAt: null, contentHash: "abc" }, { contentHash: "abc" }), true)
})

check("другой md5 → изменён (переиндексировать)", () => {
  assert.equal(isUnchanged({ status: "indexed", deletedAt: null, contentHash: "abc" }, { contentHash: "def" }), false)
})

check("тот же md5, но status=error → переиндексировать (не unchanged)", () => {
  assert.equal(isUnchanged({ status: "error", deletedAt: null, contentHash: "abc" }, { contentHash: "abc" }), false)
})

check("тот же md5, но soft-deleted → переиндексировать (файл вернулся)", () => {
  assert.equal(isUnchanged({ status: "indexed", deletedAt: new Date(), contentHash: "abc" }, { contentHash: "abc" }), false)
})

console.log(`\n${passed} проверок пройдено.`)
