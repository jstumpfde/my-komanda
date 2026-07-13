// Юнит-тесты ResumeThresholdsSchema / AnketaPassInviteSchema (Юрий 06.07,
// двойной инцидент сохранения «Портрета» вакансии 6916 + дополнение rejectAction).
// Запуск: pnpm exec tsx --test lib/core/spec/types.test.ts
//
// Покрываем:
//   1. rejectAction ⇄ autoRejectEnabled — легаси-маппинг в обе стороны.
//   2. Число из строки на границе Zod (частый источник бага сохранения):
//      явное значение (в т.ч. 0) НЕ должно откатываться в дефолт схемы.
//   3. Пустое/отсутствующее поле → ПРАВИЛЬНО откатывается в дефолт (когда это
//      действительно ожидаемо — контраст с п.2, чтобы не спутать «баг» с «фичей»).
//   4. anketaPassInvite.failAction — три значения проходят схему без искажений
//      (баг-родственник: UI ранее не распознавал pending_manual).

import { test } from "node:test"
import assert from "node:assert/strict"
import { CandidateSpecSchema, ResumeThresholdsSchema, AnketaPassInviteSchema } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// rejectAction ⇄ autoRejectEnabled (лёгаси-маппинг)
// ─────────────────────────────────────────────────────────────────────────────

test("ResumeThresholdsSchema: rejectAction отсутствует, autoRejectEnabled=false (старый Spec) → rejectAction='none'", () => {
  const parsed = ResumeThresholdsSchema.parse({ autoRejectEnabled: false })
  assert.equal(parsed.rejectAction, "none")
  assert.equal(parsed.autoRejectEnabled, false)
})

test("ResumeThresholdsSchema: rejectAction отсутствует, autoRejectEnabled=true (старый Spec) → rejectAction='pending_rejection' (байт-в-байт)", () => {
  const parsed = ResumeThresholdsSchema.parse({ autoRejectEnabled: true })
  assert.equal(parsed.rejectAction, "pending_rejection")
  assert.equal(parsed.autoRejectEnabled, true)
})

test("ResumeThresholdsSchema: ни rejectAction, ни autoRejectEnabled не заданы → дефолты ('none'/false)", () => {
  const parsed = ResumeThresholdsSchema.parse({})
  assert.equal(parsed.rejectAction, "none")
  assert.equal(parsed.autoRejectEnabled, false)
})

test("ResumeThresholdsSchema: rejectAction='pending_manual' явно задан → autoRejectEnabled ПРОИЗВОДНОЕ = false (не отказ, а ручной разбор)", () => {
  const parsed = ResumeThresholdsSchema.parse({ rejectAction: "pending_manual" })
  assert.equal(parsed.rejectAction, "pending_manual")
  assert.equal(parsed.autoRejectEnabled, false)
})

test("ResumeThresholdsSchema: rejectAction='pending_rejection' явно задан → autoRejectEnabled ПРОИЗВОДНОЕ = true", () => {
  const parsed = ResumeThresholdsSchema.parse({ rejectAction: "pending_rejection" })
  assert.equal(parsed.rejectAction, "pending_rejection")
  assert.equal(parsed.autoRejectEnabled, true)
})

test("ResumeThresholdsSchema: rejectAction задан явно ПОБЕЖДАЕТ противоречащий старый autoRejectEnabled в том же объекте", () => {
  // Форма на всякий случай — реальный UI шлёт только rejectAction, но схема
  // должна быть устойчива, если где-то остался старый autoRejectEnabled=true
  // вместе с новым явным rejectAction="none" (напр. смешанный payload).
  const parsed = ResumeThresholdsSchema.parse({ rejectAction: "none", autoRejectEnabled: true })
  assert.equal(parsed.rejectAction, "none")
  assert.equal(parsed.autoRejectEnabled, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Число из строки / явное значение НЕ откатывается в дефолт (баг сохранения)
// ─────────────────────────────────────────────────────────────────────────────

test("ResumeThresholdsSchema: explicit lowerThreshold=25 сохраняется как есть (не 0, не дефолт 40)", () => {
  const parsed = ResumeThresholdsSchema.parse({ lowerThreshold: 25 })
  assert.equal(parsed.lowerThreshold, 25)
})

test("ResumeThresholdsSchema: explicit upperThreshold=25 сохраняется как есть (не откатывается на дефолт 40)", () => {
  const parsed = ResumeThresholdsSchema.parse({ upperThreshold: 25 })
  assert.equal(parsed.upperThreshold, 25)
})

test("ResumeThresholdsSchema: explicit rejectionDelayMinutes=30 сохраняется как есть (не 60 — регресс вакансии 6916)", () => {
  const parsed = ResumeThresholdsSchema.parse({ rejectionDelayMinutes: 30 })
  assert.equal(parsed.rejectionDelayMinutes, 30)
})

test("ResumeThresholdsSchema: explicit lowerThreshold=0 — валидное значение, НЕ путается с 'отсутствует'", () => {
  const parsed = ResumeThresholdsSchema.parse({ lowerThreshold: 0 })
  assert.equal(parsed.lowerThreshold, 0)
})

test("ResumeThresholdsSchema: поле отсутствует (undefined) → законно откатывается в дефолт схемы", () => {
  const parsed = ResumeThresholdsSchema.parse({ lowerThreshold: 25 })
  // upperThreshold не передан вовсе → дефолт 40, а НЕ 25 (не должен «утечь»
  // из соседнего поля — регрессия ровно такого рода вызвала инцидент 6916).
  assert.equal(parsed.upperThreshold, 40)
})

test("CandidateSpecSchema: JSON.stringify роняет undefined-поле resumeThresholds.rejectionDelayMinutes → сервер видит его отсутствующим и подставляет дефолт (демонстрация корня бага, зафиксировано осознанно)", () => {
  const payloadWithUndefined = {
    resumeThresholds: {
      lowerThreshold: 25,
      rejectionDelayMinutes: undefined, // напр. пришло из непровалидированного чтения старой записи
    },
  }
  const roundTripped = JSON.parse(JSON.stringify(payloadWithUndefined))
  const parsed = CandidateSpecSchema.parse(roundTripped)
  // Документируем ИМЕННО этот механизм — почему клиентский фикс (явная коэрсия
  // перед JSON.stringify в spec-editor.tsx save()) необходим: без неё сервер
  // подставит дефолт 60 вместо того, что реально стояло/вводилось.
  assert.equal(parsed.resumeThresholds.rejectionDelayMinutes, 60)
  assert.equal(parsed.resumeThresholds.lowerThreshold, 25)
})

// ─────────────────────────────────────────────────────────────────────────────
// anketaPassInvite.failAction — три сценария проходят схему без искажений
// (баг-родственник: UI ранее не распознавал "pending_manual", схлопывал в "none")
// ─────────────────────────────────────────────────────────────────────────────

test("AnketaPassInviteSchema: failAction='none' проходит как есть", () => {
  const parsed = AnketaPassInviteSchema.parse({ failAction: "none" })
  assert.equal(parsed.failAction, "none")
})

test("AnketaPassInviteSchema: failAction='pending_manual' проходит как есть (не откатывается на 'none')", () => {
  const parsed = AnketaPassInviteSchema.parse({ failAction: "pending_manual" })
  assert.equal(parsed.failAction, "pending_manual")
})

test("AnketaPassInviteSchema: failAction='pending_rejection' проходит как есть", () => {
  const parsed = AnketaPassInviteSchema.parse({ failAction: "pending_rejection" })
  assert.equal(parsed.failAction, "pending_rejection")
})

test("AnketaPassInviteSchema: failAction отсутствует → дефолт 'none' (легаси-спеки без поля)", () => {
  const parsed = AnketaPassInviteSchema.parse({})
  assert.equal(parsed.failAction, "none")
})

test("AnketaPassInviteSchema: невалидное значение failAction → safeParse падает (Zod enum), НЕ тихо подменяется на 'none'", () => {
  const result = AnketaPassInviteSchema.safeParse({ failAction: "something_else" })
  assert.equal(result.success, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// inviteHhStage: фикс инцидента 13.07 — "consider" удалён из допустимых значений
// ─────────────────────────────────────────────────────────────────────────────

test("CandidateSpecSchema: inviteHhStage не принимает устаревшее значение 'consider' (фикс инцидента 13.07 — consider='Подумать' на hh, не 'Первичный контакт')", () => {
  const raw = {
    resumeThresholds: {
      inviteHhStage: "consider",
    },
  }
  const result = CandidateSpecSchema.safeParse(raw)
  assert.equal(result.success, false)
})

test("CandidateSpecSchema: inviteHhStage по умолчанию — phone_interview", () => {
  const parsed = CandidateSpecSchema.parse({})
  assert.equal(parsed.resumeThresholds.inviteHhStage, "phone_interview")
})

test("CandidateSpecSchema: inviteHhStage принимает interview и assessment (легитимные альтернативы)", () => {
  const parsedInterview = CandidateSpecSchema.parse({ resumeThresholds: { inviteHhStage: "interview" } })
  assert.equal(parsedInterview.resumeThresholds.inviteHhStage, "interview")
  const parsedAssessment = CandidateSpecSchema.parse({ resumeThresholds: { inviteHhStage: "assessment" } })
  assert.equal(parsedAssessment.resumeThresholds.inviteHhStage, "assessment")
})
