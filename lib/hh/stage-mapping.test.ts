// Юнит-тесты двустороннего маппинга стадий платформа ↔ hh (#16/#23).
// Запуск: pnpm exec tsx --test lib/hh/stage-mapping.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  platformStageToHhAction,
  platformStageToHhState,
  hhStateToPlatformStage,
  hhStatusStringToHhAction,
  isCandidateInitiatedDiscard,
  hhStateLabel,
} from "./stage-mapping"

test("исходящий: наша стадия → hh-действие (по карте Юрия)", () => {
  assert.equal(platformStageToHhAction("primary_contact"), "invitation")
  assert.equal(platformStageToHhAction("test_task_sent"), "assessment")
  assert.equal(platformStageToHhAction("interview"), "interview")
  assert.equal(platformStageToHhAction("scheduled"), "interview")
  assert.equal(platformStageToHhAction("rejected"), "discard")
})

test("исходящий: оффер/нанят/новый и внутренние → null (у hh нет состояния)", () => {
  assert.equal(platformStageToHhAction("offer_sent"), null)
  assert.equal(platformStageToHhAction("hired"), null)
  assert.equal(platformStageToHhAction("started_work"), null)
  assert.equal(platformStageToHhAction("new"), null)
  assert.equal(platformStageToHhAction("demo_opened"), null)
  assert.equal(platformStageToHhAction("anketa_filled"), null)
  assert.equal(platformStageToHhAction("ai_screening"), null)
  assert.equal(platformStageToHhAction(null), null)
  assert.equal(platformStageToHhAction(undefined), null)
})

test("исходящий: проекция на hh state-id", () => {
  assert.equal(platformStageToHhState("primary_contact"), "phone_interview")
  assert.equal(platformStageToHhState("test_task_sent"), "assessment")
  assert.equal(platformStageToHhState("interview"), "interview")
  assert.equal(platformStageToHhState("rejected"), "discard_by_employer")
  assert.equal(platformStageToHhState("offer_sent"), null)
})

test("входящий: hh-состояние → наша стадия", () => {
  assert.equal(hhStateToPlatformStage("phone_interview"), "primary_contact")
  assert.equal(hhStateToPlatformStage("consider"), "primary_contact")
  assert.equal(hhStateToPlatformStage("assessment"), "test_task_sent")
  assert.equal(hhStateToPlatformStage("interview"), "interview")
  assert.equal(hhStateToPlatformStage("discard_by_employer"), "rejected")
  assert.equal(hhStateToPlatformStage("discard_by_applicant"), "rejected")
})

test("входящий: response и неизвестные → null (не трогать)", () => {
  assert.equal(hhStateToPlatformStage("response"), null)
  assert.equal(hhStateToPlatformStage("invited"), null)
  assert.equal(hhStateToPlatformStage("hidden"), null)
  assert.equal(hhStateToPlatformStage(""), null)
  assert.equal(hhStateToPlatformStage(null), null)
  assert.equal(hhStateToPlatformStage(undefined), null)
})

test("candidate-declined только для discard_by_applicant", () => {
  assert.equal(isCandidateInitiatedDiscard("discard_by_applicant"), true)
  assert.equal(isCandidateInitiatedDiscard("discard_by_employer"), false)
  assert.equal(isCandidateInitiatedDiscard("response"), false)
})

test("двусторонняя согласованность (round-trip для основных стадий)", () => {
  // Стадия → hh-state → обратно в стадию должно давать эквивалент.
  for (const stage of ["primary_contact", "test_task_sent", "interview", "rejected"] as const) {
    const st = platformStageToHhState(stage)
    assert.ok(st, `нет hh-state для ${stage}`)
    const back = hhStateToPlatformStage(st)
    // interview↔interview, test↔test, rejected↔rejected, primary_contact↔primary_contact
    if (stage === "rejected") assert.equal(back, "rejected")
    else assert.equal(back, stage)
  }
})

test("hhStatusStringToHhAction: русские v2-статусы", () => {
  assert.equal(hhStatusStringToHhAction("отказ"), "discard")
  assert.equal(hhStatusStringToHhAction("тестовое задание"), "assessment")
  assert.equal(hhStatusStringToHhAction("интервью"), "interview")
  assert.equal(hhStatusStringToHhAction("первичный контакт"), "invitation")
  assert.equal(hhStatusStringToHhAction("оффер"), null)
  assert.equal(hhStatusStringToHhAction("принят"), null)
  assert.equal(hhStatusStringToHhAction("новый"), null)
  assert.equal(hhStatusStringToHhAction(""), null)
  assert.equal(hhStatusStringToHhAction(null), null)
  // приоритет: отказ важнее интервью
  assert.equal(hhStatusStringToHhAction("отказ после интервью"), "discard")
})

test("ярлыки hh-состояний (read-only показ #16)", () => {
  assert.equal(hhStateLabel("phone_interview"), "Телефонное интервью")
  assert.equal(hhStateLabel("assessment"), "Тестовое задание")
  assert.equal(hhStateLabel("discard_by_applicant"), "Кандидат отказался")
  assert.equal(hhStateLabel("consider"), "Первичный контакт")
  assert.equal(hhStateLabel(null), null)
  // неизвестное — возвращаем как есть (не выдумываем)
  assert.equal(hhStateLabel("weird_state"), "weird_state")
})
