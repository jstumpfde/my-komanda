// Юнит-тесты чистых функций «Сторожа найма» (классификация проблем + dedup_key).
// Запуск: pnpm exec tsx --test lib/hiring-watchdog/classify.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  classifyHhToken,
  classifyImportStale,
  classifyStuckQueue,
  classifySendFailures,
  classifyOldPublicationCleanup,
  classifyCronStale,
  classifyAiScoringStuck,
  classifyAiOutageSpike,
  classifyBlindInviteNoScore,
  classifyHhStageMismatch,
  hhTokenDeadDedupKey,
  hhImportStaleDedupKey,
  stuckQueueDedupKey,
  sendFailuresDedupKey,
  cronStaleDedupKey,
  aiScoringStuckDedupKey,
  aiOutageSpikeDedupKey,
  blindInviteNoScoreDedupKey,
  hhStageMismatchDedupKey,
  minutesSince,
  shouldNotifyTelegram,
} from "./classify"

// ─── dedup-ключи стабильны и детерминированы ────────────────────────────────

test("dedup-ключи: детерминированы для одного и того же входа", () => {
  assert.equal(hhTokenDeadDedupKey("company-1"), hhTokenDeadDedupKey("company-1"))
  assert.equal(hhTokenDeadDedupKey("company-1"), "hh_token_dead:company-1")
  assert.equal(stuckQueueDedupKey("vac-1"), "stuck_queue:vac-1")
  assert.equal(sendFailuresDedupKey("company-1"), "send_failures:company-1")
  assert.equal(cronStaleDedupKey("hh-import"), "cron_stale:hh-import")
  assert.equal(aiScoringStuckDedupKey("company-1"), "ai_scoring_stuck:company-1")
  assert.equal(hhImportStaleDedupKey(), "hh_import_stale")
})

test("dedup-ключи: разные компании/вакансии дают разные ключи (не коллизируют)", () => {
  assert.notEqual(hhTokenDeadDedupKey("company-1"), hhTokenDeadDedupKey("company-2"))
  assert.notEqual(stuckQueueDedupKey("vac-1"), stuckQueueDedupKey("vac-2"))
})

// ─── hh-токен ────────────────────────────────────────────────────────────────

test("hh-токен: нет интеграции вовсе → не проблема (компания не подключала hh)", () => {
  assert.equal(classifyHhToken(null), null)
})

test("hh-токен: isActive=true → не проблема", () => {
  assert.equal(classifyHhToken({ isActive: true }), null)
})

test("hh-токен: isActive=false → CRITICAL «hh отключён»", () => {
  const issue = classifyHhToken({ isActive: false })
  assert.ok(issue)
  assert.equal(issue!.severity, "critical")
  assert.match(issue!.title, /hh отключ/i)
})

// ─── импорт откликов ─────────────────────────────────────────────────────────

test("импорт: ни разу успешно не бежал (null) → не алертим (например, свежий деплой)", () => {
  assert.equal(classifyImportStale(null), null)
})

test("импорт: свежий прогон (< порога) → не проблема", () => {
  assert.equal(classifyImportStale(30, 60), null)
})

test("импорт: прогон ровно на пороге → ещё не проблема", () => {
  assert.equal(classifyImportStale(60, 60), null)
})

test("импорт: старше порога → CRITICAL платформенный (companyId=null)", () => {
  const issue = classifyImportStale(90, 60)
  assert.ok(issue)
  assert.equal(issue!.severity, "critical")
  assert.equal(issue!.companyId, null)
  assert.equal(issue!.dedupKey, "hh_import_stale")
})

// ─── застрявшая очередь разбора ──────────────────────────────────────────────

test("застрявшая очередь: 0 застрявших → не проблема", () => {
  assert.equal(classifyStuckQueue("vac-1", "company-1", 0), null)
})

test("застрявшая очередь: есть застрявшие → warning с dedup по вакансии", () => {
  const issue = classifyStuckQueue("vac-1", "company-1", 3)
  assert.ok(issue)
  assert.equal(issue!.severity, "warning")
  assert.equal(issue!.companyId, "company-1")
  assert.equal(issue!.dedupKey, "stuck_queue:vac-1")
  assert.match(issue!.message, /3/)
})

test("застрявшая очередь: текст честный — НЕ обещает авто-починку (guard-фикс 07.07)", () => {
  const issue = classifyStuckQueue("vac-1", "company-1", 5)
  assert.ok(issue)
  // Авто-сброс claimed убран (нет claimed_at) — сообщение не должно
  // утверждать, что watchdog что-то починил сам.
  assert.doesNotMatch(issue!.message, /возвращены|автоматически возвращ/i)
  assert.match(issue!.message, /не чинит это автоматически/i)
  assert.match(issue!.message, /ручная проверка/i)
})

// ─── ошибки отправки ─────────────────────────────────────────────────────────

test("отправки: <= порога (5) → не проблема", () => {
  assert.equal(classifySendFailures("vac-1", "company-1", 5, []), null)
})

test("отправки: > порога → warning с разбивкой топ-3 причин", () => {
  const issue = classifySendFailures("vac-1", "company-1", 8, [
    { reason: "no_hh_token", count: 5 },
    { reason: "invalid_vacancy", count: 2 },
    { reason: "hh_send_failed", count: 1 },
  ])
  assert.ok(issue)
  assert.equal(issue!.severity, "warning")
  assert.match(issue!.message, /no_hh_token×5/)
  assert.match(issue!.message, /invalid_vacancy×2/)
})

test("отправки: кастомный порог соблюдается", () => {
  assert.equal(classifySendFailures("vac-1", "company-1", 3, [], 10), null)
  assert.ok(classifySendFailures("vac-1", "company-1", 11, [], 10))
})

// ─── старая публикация (авто-починка) ───────────────────────────────────────

test("старая публикация: 0 отменённых → не создаём info-алерт", () => {
  assert.equal(classifyOldPublicationCleanup("vac-1", "company-1", 0), null)
})

test("старая публикация: N отменённых → info-алерт с числом", () => {
  const issue = classifyOldPublicationCleanup("vac-1", "company-1", 6)
  assert.ok(issue)
  assert.equal(issue!.severity, "info")
  assert.match(issue!.message, /6/)
})

// ─── кроны живы ──────────────────────────────────────────────────────────────

test("крон: нет работы → молчание крона не проблема", () => {
  assert.equal(classifyCronStale("follow-up", 999, 30, false), null)
})

test("крон: есть работа, свежий прогон → не проблема", () => {
  assert.equal(classifyCronStale("follow-up", 10, 30, true), null)
})

test("крон: есть работа, прогона не было вовсе (null) → не алертим (нет базы для сравнения)", () => {
  assert.equal(classifyCronStale("follow-up", null, 30, true), null)
})

test("крон: есть работа, прогон старше порога → CRITICAL платформенный", () => {
  const issue = classifyCronStale("follow-up", 45, 30, true)
  assert.ok(issue)
  assert.equal(issue!.severity, "critical")
  assert.equal(issue!.companyId, null)
  assert.equal(issue!.dedupKey, "cron_stale:follow-up")
})

// ─── follow-up-живость: сценарий «тихий вечер/выходной» (guard-фикс 07.07) ──
// follow-up cron с фикса пишет в cron_runs КАЖДЫЙ прогон, даже когда все
// touches вне рабочего окна и отправок 0. Живость определяется по свежести
// последнего успешного прогона в cron_runs, а не по фактическим отправкам.

test("follow-up ночью: pending-работа есть, отправок нет, но cron_runs свежий → НЕ критикал", () => {
  // canSendNow держит touches в pending вне окна — это норма. Крон бежал
  // 5 мин назад (записал ok-прогон с 0 отправок) → жив, алерта нет.
  assert.equal(classifyCronStale("follow-up", 5, 30, true), null)
})

test("follow-up реально умер: pending-работа есть И cron_runs протух → CRITICAL", () => {
  const issue = classifyCronStale("follow-up", 90, 30, true)
  assert.ok(issue)
  assert.equal(issue!.severity, "critical")
})

test("follow-up: работы нет вовсе → молчание крона не проблема (даже при протухшем прогоне)", () => {
  assert.equal(classifyCronStale("follow-up", 999, 30, false), null)
})

// ─── shouldNotifyTelegram: гонка upsert и severity-фильтр ───────────────────

test("нотификация: critical + алерт реально создан → слать", () => {
  assert.equal(shouldNotifyTelegram("critical", true), true)
})

test("нотификация: insert не произошёл (проигранная гонка / уже открыт) → НЕ слать даже critical", () => {
  assert.equal(shouldNotifyTelegram("critical", false), false)
})

test("нотификация: warning/info в Telegram не идут, даже свежесозданные", () => {
  assert.equal(shouldNotifyTelegram("warning", true), false)
  assert.equal(shouldNotifyTelegram("info", true), false)
})

// ─── AI-скоринг ──────────────────────────────────────────────────────────────

test("AI-скоринг: <= порога (3) → не проблема", () => {
  assert.equal(classifyAiScoringStuck("company-1", 3), null)
})

test("AI-скоринг: > порога → warning", () => {
  const issue = classifyAiScoringStuck("company-1", 4)
  assert.ok(issue)
  assert.equal(issue!.severity, "warning")
  assert.equal(issue!.companyId, "company-1")
})

// ─── minutesSince ────────────────────────────────────────────────────────────

test("minutesSince: null дата → null", () => {
  assert.equal(minutesSince(null), null)
})

test("minutesSince: считает целые минуты (округление вниз)", () => {
  const now = new Date("2026-07-07T12:00:00Z")
  const past = new Date("2026-07-07T11:29:30Z") // 30.5 мин назад
  assert.equal(minutesSince(past, now), 30)
})

test("minutesSince: ровно 0 минут для текущего момента", () => {
  const now = new Date("2026-07-07T12:00:00Z")
  assert.equal(minutesSince(now, now), 0)
})

// ─── AI outage spike (13.07 — детектор массового сбоя AI-вызовов) ──────────

test("AI outage: dedup-ключ платформенный, стабильный, без временного бакета", () => {
  assert.equal(aiOutageSpikeDedupKey(), "ai_outage_spike")
  assert.equal(aiOutageSpikeDedupKey(), aiOutageSpikeDedupKey())
})

test("AI outage: < порога (5) → не проблема", () => {
  assert.equal(classifyAiOutageSpike(4, 15, 5), null)
})

test("AI outage: ровно на пороге → CRITICAL платформенный", () => {
  const issue = classifyAiOutageSpike(5, 15, 5)
  assert.ok(issue)
  assert.equal(issue!.severity, "critical")
  assert.equal(issue!.companyId, null)
  assert.equal(issue!.dedupKey, "ai_outage_spike")
})

test("AI outage: сообщение содержит число сбоев, окно и наводку на причину", () => {
  const issue = classifyAiOutageSpike(9, 15, 5)
  assert.ok(issue)
  assert.match(issue!.message, /9/)
  assert.match(issue!.message, /15/)
  assert.match(issue!.message, /Anthropic/i)
})

test("AI outage: дефолтный порог = 5", () => {
  assert.equal(classifyAiOutageSpike(4, 15), null)
  assert.ok(classifyAiOutageSpike(5, 15))
})

// ─── Слепой инвайт без resume_score (13.07) ─────────────────────────────────

test("слепой инвайт: dedup-ключ платформенный, стабильный", () => {
  assert.equal(blindInviteNoScoreDedupKey(), "blind_invite_no_score")
})

test("слепой инвайт: < порога (5) → не проблема", () => {
  assert.equal(classifyBlindInviteNoScore(4, 5), null)
})

test("слепой инвайт: ровно на пороге → CRITICAL платформенный", () => {
  const issue = classifyBlindInviteNoScore(5, 5)
  assert.ok(issue)
  assert.equal(issue!.severity, "critical")
  assert.equal(issue!.companyId, null)
  assert.equal(issue!.dedupKey, "blind_invite_no_score")
  assert.match(issue!.message, /5/)
})

// ─── Сверка «наша стадия vs реальная hh-папка» (13.07) ──────────────────────

test("hh-сверка: dedup-ключ по кандидату (не по компании/вакансии)", () => {
  assert.equal(hhStageMismatchDedupKey("cand-1"), "hh_stage_mismatch:cand-1")
  assert.notEqual(hhStageMismatchDedupKey("cand-1"), hhStageMismatchDedupKey("cand-2"))
})

test("hh-сверка: ожидание совпадает с реальностью → не проблема", () => {
  assert.equal(
    classifyHhStageMismatch("cand-1", "company-1", "vac-1", "phone_interview", "phone_interview"),
    null,
  )
})

test("hh-сверка: расхождение (инцидент 13.07 — stale inviteHhStage=consider) → CRITICAL", () => {
  const issue = classifyHhStageMismatch("cand-1", "company-1", "vac-1", "phone_interview", "consider")
  assert.ok(issue)
  assert.equal(issue!.severity, "critical")
  assert.equal(issue!.companyId, "company-1")
  assert.equal(issue!.dedupKey, "hh_stage_mismatch:cand-1")
  assert.match(issue!.message, /phone_interview/)
  assert.match(issue!.message, /consider/)
})
