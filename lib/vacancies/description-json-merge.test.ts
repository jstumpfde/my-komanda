import { test } from "node:test"
import assert from "node:assert/strict"
import { mergeDescriptionJson, INDEPENDENTLY_MANAGED_KEYS } from "./description-json-merge"

// Баг Юрия 08.07: «Воронка 2 слетает после сохранения». Клиентская копия
// descriptionJson устаревает; общий PUT затирал свежий funnelV2. Мёрдж должен
// (1) сохранять ключи, которых нет во входящем, (2) НИКОГДА не давать входящему
// перезаписать funnelV2 — источник правды по нему в БД (свой owner-роут).

test("сохраняет funnelV2 из БД, даже если анкета его не прислала", () => {
  const dbNow = { anketa: { a: 1 }, funnelV2: { stages: [{ id: "s1" }] } }
  const clientSends = { anketa: { a: 2 } } // клиент сохраняет только анкету
  const merged = mergeDescriptionJson(dbNow, clientSends)
  assert.deepEqual(merged.funnelV2, { stages: [{ id: "s1" }] })
  assert.deepEqual(merged.anketa, { a: 2 })
})

test("свежий funnelV2 из БД НЕ затирается устаревшей копией из payload", () => {
  const dbNow = { anketa: { a: 1 }, funnelV2: { stages: [{ id: "fresh" }] } }
  // клиент прислал { ...устаревший existing, anketa } — с СТАРЫМ funnelV2
  const clientSends = { anketa: { a: 2 }, funnelV2: { stages: [{ id: "STALE" }] } }
  const merged = mergeDescriptionJson(dbNow, clientSends)
  assert.deepEqual(merged.funnelV2, { stages: [{ id: "fresh" }] }, "funnelV2 берётся из БД, не из payload")
})

test("root-merge: ключи вне payload сохраняются", () => {
  const dbNow = { anketa: { a: 1 }, branding: { logo: "x" }, automation: { autoInvite: true } }
  const clientSends = { anketa: { a: 2 } }
  const merged = mergeDescriptionJson(dbNow, clientSends)
  assert.deepEqual(merged.branding, { logo: "x" })
  assert.deepEqual(merged.automation, { autoInvite: true })
  assert.deepEqual(merged.anketa, { a: 2 })
})

test("если в БД funnelV2 ещё нет — payload его тоже не заносит (owner-роут сам создаст)", () => {
  const dbNow = { anketa: { a: 1 } }
  const clientSends = { anketa: { a: 2 }, funnelV2: { stages: [{ id: "x" }] } }
  const merged = mergeDescriptionJson(dbNow, clientSends)
  assert.equal(merged.funnelV2, undefined)
})

test("тот же класс: finalScreens/offer/etc. защищены наравне с funnelV2", () => {
  // Каждый ключ выделенного роута: свежий из БД не затирается устаревшим эхом
  // клиентского снапшота, попавшим в общий payload.
  for (const key of INDEPENDENTLY_MANAGED_KEYS) {
    const dbNow = { anketa: { a: 1 }, [key]: { v: "fresh" } }
    const staleEcho = { anketa: { a: 2 }, [key]: { v: "STALE" } }
    const merged = mergeDescriptionJson(dbNow, staleEcho)
    assert.deepEqual(merged[key], { v: "fresh" }, `${key} должен браться из БД`)
    assert.deepEqual(merged.anketa, { a: 2 }, `anketa должна сохраниться из payload`)
  }
})

test("contentStep НЕ в списке защищённых (сохраняется через общий роут)", () => {
  // contentStep шлётся частичным payload на общий роут — если его «защитить»,
  // его сейв перестанет проходить. Проверяем, что он проходит.
  assert.ok(!(INDEPENDENTLY_MANAGED_KEYS as readonly string[]).includes("contentStep"))
  const merged = mergeDescriptionJson({ contentStep: { mode: "old" } }, { contentStep: { mode: "new" } })
  assert.deepEqual(merged.contentStep, { mode: "new" })
})

test("includeManagedKeys=true: применение шаблона КОПИРУЕТ защищённые секции", () => {
  // handleApplyTemplate осознанно копирует ВСЕ секции шаблона.
  const target = { anketa: { a: 1 }, funnelV2: { stages: [{ id: "old" }] } }
  const template = { anketa: { a: 9 }, funnelV2: { stages: [{ id: "tpl" }] }, finalScreens: { s: 1 } }
  const merged = mergeDescriptionJson(target, template, { includeManagedKeys: true })
  assert.deepEqual(merged.funnelV2, { stages: [{ id: "tpl" }] }, "воронка шаблона копируется")
  assert.deepEqual(merged.finalScreens, { s: 1 }, "финальные экраны шаблона копируются")
  assert.deepEqual(merged.anketa, { a: 9 })
})

test("includeManagedKeys НЕ ставится по умолчанию → обычный сейв защищает", () => {
  const target = { funnelV2: { stages: [{ id: "fresh" }] } }
  const staleEcho = { funnelV2: { stages: [{ id: "STALE" }] } }
  // без opts — как обычный сейв вкладки
  assert.deepEqual(mergeDescriptionJson(target, staleEcho).funnelV2, { stages: [{ id: "fresh" }] })
  // и с явным false
  assert.deepEqual(mergeDescriptionJson(target, staleEcho, { includeManagedKeys: false }).funnelV2, { stages: [{ id: "fresh" }] })
})

test("пустой/невалидный current и incoming не падают", () => {
  assert.deepEqual(mergeDescriptionJson(null, { anketa: 1 }), { anketa: 1 })
  assert.deepEqual(mergeDescriptionJson({ anketa: 1 }, null), { anketa: 1 })
  assert.deepEqual(mergeDescriptionJson(undefined, undefined), {})
})
