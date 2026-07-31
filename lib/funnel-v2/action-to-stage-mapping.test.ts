// Юнит-тесты B9-фикса (14.07): action стадии воронки v2 → канонический
// candidates.stage.
//
// Проверяем:
//   1. Валидность на уровне типов/теста — КАЖДЫЙ StageActionType (полный
//      список STAGE_ACTIONS из lib/funnel-v2/types.ts, т.е. все action,
//      доступные в конструкторе воронки) имеет запись в
//      FUNNEL_V2_ACTION_TO_SLUG И её значение — реальный член ALL_STAGE_SLUGS
//      (lib/stages.ts). Раньше это было ДВЕ независимые копии карты, которые
//      разошлись (offer/reference_check/security_check) — этот тест не даёт
//      им разойтись снова.
//   2. mapActionToLegacyStage (lib/funnel-v2/advance-stage.ts, что реально
//      пишется в БД при advanceToNextStage) даёт ТЕ ЖЕ значения, что и
//      канон-карта — единый источник, не два.
//   3. Точечные было→стало проверки для явно упомянутых в задаче маппингов.
//
// Запуск: pnpm exec tsx --test lib/funnel-v2/action-to-stage-mapping.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import { STAGE_ACTIONS } from "./types"
import { mapActionToLegacyStage } from "./advance-stage"
import { FUNNEL_V2_ACTION_TO_SLUG, ALL_STAGE_SLUGS, type StageSlug } from "@/lib/stages"

const ALL_STAGE_SLUGS_SET = new Set<string>(ALL_STAGE_SLUGS)

// ── 1. Каждый action конструктора → валидный канонический StageSlug ─────────

for (const { type, label } of STAGE_ACTIONS) {
  test(`STAGE_ACTIONS: action="${type}" (${label}) имеет запись в FUNNEL_V2_ACTION_TO_SLUG`, () => {
    const slug = FUNNEL_V2_ACTION_TO_SLUG[type]
    assert.notEqual(slug, undefined, `action="${type}" не смаплен ни в один StageSlug`)
  })

  test(`STAGE_ACTIONS: action="${type}" (${label}) мапится в член ALL_STAGE_SLUGS`, () => {
    const slug = FUNNEL_V2_ACTION_TO_SLUG[type]
    if (slug === undefined) return // отдельно уже упало в тесте выше
    assert.ok(
      ALL_STAGE_SLUGS_SET.has(slug),
      `FUNNEL_V2_ACTION_TO_SLUG["${type}"] = "${slug}" — НЕ входит в ALL_STAGE_SLUGS`,
    )
  })
}

test("FUNNEL_V2_ACTION_TO_SLUG: ни одного значения вне ALL_STAGE_SLUGS (полный проход по карте)", () => {
  for (const [action, slug] of Object.entries(FUNNEL_V2_ACTION_TO_SLUG)) {
    assert.ok(ALL_STAGE_SLUGS_SET.has(slug), `action="${action}" → "${slug}" не канонический StageSlug`)
  }
})

// ── 2. mapActionToLegacyStage (write-путь advance-stage.ts) = канон-карта ───
// Единый источник (B9-фикс 14.07): advance-stage.ts импортирует
// FUNNEL_V2_ACTION_TO_SLUG напрямую, поэтому значения обязаны совпасть 1:1
// для каждого action из конструктора.

for (const { type } of STAGE_ACTIONS) {
  test(`mapActionToLegacyStage("${type}") совпадает с FUNNEL_V2_ACTION_TO_SLUG["${type}"]`, () => {
    assert.equal(mapActionToLegacyStage(type), FUNNEL_V2_ACTION_TO_SLUG[type] as StageSlug)
  })
}

test('mapActionToLegacyStage: неизвестный action → null (нет синка, не ломаем legacy-stage)', () => {
  assert.equal(mapActionToLegacyStage("не_существующий_action"), null)
})

// ── 3. Точечные было→стало (задача B9-фикса 14.07) ───────────────────────────

test("было→стало: offer писал 'final_decision' (не канон) → теперь 'offer_sent' (канон)", () => {
  assert.equal(mapActionToLegacyStage("offer"), "offer_sent")
  assert.notEqual(mapActionToLegacyStage("offer"), "final_decision")
})

test("было→стало: reference_check писал 'interview' (терял себя) → теперь 'reference_check' (канон, 1:1)", () => {
  assert.equal(mapActionToLegacyStage("reference_check"), "reference_check")
})

// Ревизия 14.07 (после первичного фикса): рассматривался вариант
// security_check→'decision', но 'decision' в живом легаси-пути
// (app/api/public/demo/[token]/answer/route.ts, F2.B) означает «демо
// пройдено» (РАННЯЯ стадия, см. lib/column-config.ts) — это создало бы
// более грубый рассинхрон, чем баг, который чиним (пост-интервью кандидат
// выглядел бы как «только прошёл демо»). Итог: security_check и
// reference_check оба → 'reference_check' (нет отдельного канон-слага «СБ»;
// docs/architecture/FUNNEL-V2.md сам группирует их в одну стадию «Проверки»).
// Не идеальная дифференциация ДРУГ ОТ ДРУГА, зато обе теперь отличаются от
// 'interview' (был баг) и не создают НОВУЮ семантическую коллизию с 'decision'.
test("было→стало: security_check писал 'interview' → теперь 'reference_check' (отличается от interview, без коллизии с 'decision')", () => {
  assert.equal(mapActionToLegacyStage("security_check"), "reference_check")
  assert.notEqual(mapActionToLegacyStage("security_check"), "interview")
  assert.notEqual(mapActionToLegacyStage("security_check"), "decision")
})

test("не менялось (осознанно, см. комментарий в lib/stages.ts): message/prequalification → primary_contact", () => {
  assert.equal(mapActionToLegacyStage("message"), "primary_contact")
  assert.equal(mapActionToLegacyStage("prequalification"), "primary_contact")
})

test("не менялось: decision → decision, hired → hired, demo → demo_opened, test/task → test_task_sent, interview → interview", () => {
  assert.equal(mapActionToLegacyStage("decision"), "decision")
  assert.equal(mapActionToLegacyStage("hired"), "hired")
  assert.equal(mapActionToLegacyStage("demo"), "demo_opened")
  assert.equal(mapActionToLegacyStage("test"), "test_task_sent")
  assert.equal(mapActionToLegacyStage("task"), "test_task_sent")
  assert.equal(mapActionToLegacyStage("interview"), "interview")
})
