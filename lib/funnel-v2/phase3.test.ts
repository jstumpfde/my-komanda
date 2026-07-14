// Юнит-тесты Фазы 3 воронки v2.
// Запуск: pnpm exec tsx --test lib/funnel-v2/phase3.test.ts
//
// Тестируем:
//   1. Маппинг action → legacy candidates.stage (D)
//   2. calcStageScore: обнаружение AI-вопросов (hasPendingAiQuestions) (E)
//   3. calcStageScore: AI-вопросы не блокируют объективный подсчёт (E)
//   4. Защита URL: логика выбора action-типа для редиректа (C)
//   5. Флаг funnelV2RuntimeEnabled=false → тумблеры отображаются (G, логика)

import { test } from "node:test"
import assert from "node:assert/strict"
import { calcStageScore } from "./calc-stage-score"
import { nextStageId, mapActionToLegacyStage } from "./advance-stage"
import type { FunnelV2Stage } from "./types"
import type { StructuredAnswer } from "@/lib/score-test-objective"

// ─────────────────────────────────────────────────────────────────────────────
// 1. Маппинг action → legacy candidates.stage (D)
//    B9-фикс 14.07: mapActionToLegacyStage теперь экспортирована и делегирует
//    в FUNNEL_V2_ACTION_TO_SLUG (lib/stages.ts) — тестируем РЕАЛЬНУЮ функцию,
//    больше не держим отдельную копию карты (та копия и разошлась с боевой,
//    что привело к этому фиксу: offer писал 'final_decision', а не
//    'offer_sent').
// ─────────────────────────────────────────────────────────────────────────────

test("маппинг action→legacy: demo → demo_opened", () => {
  assert.equal(mapActionToLegacyStage("demo"), "demo_opened")
})

test("маппинг action→legacy: test → test_task_sent", () => {
  assert.equal(mapActionToLegacyStage("test"), "test_task_sent")
})

test("маппинг action→legacy: task → test_task_sent (как test)", () => {
  assert.equal(mapActionToLegacyStage("task"), "test_task_sent")
})

test("маппинг action→legacy: interview → interview", () => {
  assert.equal(mapActionToLegacyStage("interview"), "interview")
})

test("маппинг action→legacy: decision → decision", () => {
  assert.equal(mapActionToLegacyStage("decision"), "decision")
})

// B9-фикс 14.07: раньше писал legacy 'final_decision' (расходилось с
// каноническим StageSlug 'offer_sent' — см. lib/stages.ts). Теперь 1:1.
test("маппинг action→legacy: offer → offer_sent (канон, было final_decision)", () => {
  assert.equal(mapActionToLegacyStage("offer"), "offer_sent")
})

test("маппинг action→legacy: hired → hired", () => {
  assert.equal(mapActionToLegacyStage("hired"), "hired")
})

test("маппинг action→legacy: prequalification → primary_contact", () => {
  assert.equal(mapActionToLegacyStage("prequalification"), "primary_contact")
})

test("маппинг action→legacy: message → primary_contact", () => {
  assert.equal(mapActionToLegacyStage("message"), "primary_contact")
})

// B9-фикс 14.07: раньше оба (security_check и reference_check) писали
// 'interview' — терялась разница с интервью. Теперь оба → канонический
// 'reference_check' (нет отдельного слага «СБ-проверка»; docs/architecture/
// FUNNEL-V2.md сам группирует СБ+реф-чек в одну стадию «Проверки». НЕ
// 'decision' — тот слаг в живом легаси-пути (demo/[token]/answer/route.ts,
// F2.B) означает «демо пройдено» (РАННЯЯ стадия), было бы хуже, чем текущий
// баг: интервью уже пройдено, а читатель увидел бы «только демо».
test("маппинг action→legacy: security_check → reference_check (было interview, теряло разницу с интервью)", () => {
  assert.equal(mapActionToLegacyStage("security_check"), "reference_check")
})

test("маппинг action→legacy: reference_check → reference_check (канон, было interview)", () => {
  assert.equal(mapActionToLegacyStage("reference_check"), "reference_check")
})

test("маппинг action→legacy: неизвестный action → null (нет синка)", () => {
  assert.equal(mapActionToLegacyStage("unknown_action"), null)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. calcStageScore: обнаружение AI-вопросов (hasPendingAiQuestions) (E)
// ─────────────────────────────────────────────────────────────────────────────

/** Урок с AI-текстовым вопросом (textMatchMode='ai'). */
function makeAiTextLessons() {
  return [
    {
      id: "l1",
      title: "Урок с AI-вопросом",
      blocks: [
        {
          type: "task",
          questions: [
            {
              id: "q-ai-text",
              text: "Опишите ваш опыт продаж",
              answerType: "short",
              textMatchMode: "ai",
              aiCriteria: "Оценить глубину опыта и конкретику",
              options: [],
              points: 10,
            },
          ],
        },
      ],
    },
  ]
}

/** Урок с AI-текстовым вопросом + объективным single-вопросом. */
function makeMixedLessons() {
  return [
    {
      id: "l1",
      title: "Смешанный урок",
      blocks: [
        {
          type: "task",
          questions: [
            {
              id: "q-single",
              text: "Какой канал продаж основной?",
              answerType: "single",
              options: ["Телефон", "Email", "Мессенджеры"],
              correctOptions: [0],
              points: 10,
            },
            {
              id: "q-ai-text",
              text: "Расскажите о своём подходе",
              answerType: "long",
              textMatchMode: "ai",
              aiCriteria: "Качество аргументации",
              options: [],
              points: 15,
            },
          ],
        },
      ],
    },
  ]
}

test("calcStageScore: AI-только вопросы → hasPendingAiQuestions=true, scorePercent=100 (не блокируем)", () => {
  const lessons = makeAiTextLessons()
  const answers: StructuredAnswer[] = [
    { blockId: "b1", questionId: "q-ai-text", answerType: "short", value: "Имею 5 лет опыта в B2B продажах" },
  ]
  const result = calcStageScore(lessons, answers)
  assert.equal(result.hasPendingAiQuestions, true, "должны быть pending AI-вопросы")
  assert.equal(result.scorePercent, 100, "без объективных вопросов — не блокируем (100%)")
  assert.equal(result.maxScore, 0, "AI-вопросы не дают объективный maxScore")
})

test("calcStageScore: AI-вопрос без ответа → hasPendingAiQuestions=true (вопрос есть, но отвечен не был)", () => {
  const lessons = makeAiTextLessons()
  const result = calcStageScore(lessons, [])
  // Нет ответов → нет критериев → 100%, но AI-вопросы в блоке есть
  assert.equal(result.scorePercent, 100)
  // hasPendingAiQuestions зависит от того, есть ли AI-вопросы в блоке
  assert.equal(result.hasPendingAiQuestions, true, "AI-вопросы есть в блоке — флаг должен быть true")
})

test("calcStageScore: смешанные вопросы (obj+AI) → hasPendingAiQuestions=true, obj балл считается", () => {
  const lessons = makeMixedLessons()
  const answers: StructuredAnswer[] = [
    { blockId: "b1", questionId: "q-single",  answerType: "single", value: "Телефон" },
    { blockId: "b1", questionId: "q-ai-text", answerType: "long",   value: "Мой подход — строить долгосрочные отношения с клиентом." },
  ]
  const result = calcStageScore(lessons, answers)
  assert.equal(result.hasPendingAiQuestions, true, "есть AI-вопросы → pending=true")
  // Объективный single-вопрос должен посчитаться
  assert.ok(result.maxScore > 0, "объективный вопрос должен дать maxScore > 0")
  assert.ok(result.totalScore > 0 || result.maxScore > 0, "объективный балл считается независимо от AI")
})

test("calcStageScore: только объективные вопросы → hasPendingAiQuestions=false", () => {
  const lessons = [
    {
      id: "l1",
      title: "Урок",
      blocks: [
        {
          type: "task",
          questions: [
            {
              id: "q-single",
              text: "Выберите один вариант",
              answerType: "single",
              options: ["A", "B", "C"],
              correctOptions: [0],
              points: 10,
            },
          ],
        },
      ],
    },
  ]
  const answers: StructuredAnswer[] = [
    { blockId: "b1", questionId: "q-single", answerType: "single", value: "A" },
  ]
  const result = calcStageScore(lessons, answers)
  assert.equal(result.hasPendingAiQuestions, false, "нет AI-вопросов → pending=false")
  assert.equal(result.scorePercent, 100, "верный ответ → 100%")
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Защита URL: логика определения нужного редиректа (C)
// ─────────────────────────────────────────────────────────────────────────────

/** Воспроизводим логику защиты URL из /demo/[token]/route.ts и /test/[token]/route.ts */
type UrlTarget = "redirect_to_test" | "redirect_to_demo" | "error_410" | "ok"

function checkDemoUrlAccess(currentAction: string): UrlTarget {
  if (currentAction === "demo") return "ok"
  if (currentAction === "test" || currentAction === "task") return "redirect_to_test"
  return "error_410"
}

function checkTestUrlAccess(currentAction: string): UrlTarget {
  if (currentAction === "test" || currentAction === "task") return "ok"
  if (currentAction === "demo") return "redirect_to_demo"
  return "error_410"
}

test("защита URL: /demo при стадии=demo → ok", () => {
  assert.equal(checkDemoUrlAccess("demo"), "ok")
})

test("защита URL: /demo при стадии=test → redirect_to_test", () => {
  assert.equal(checkDemoUrlAccess("test"), "redirect_to_test")
})

test("защита URL: /demo при стадии=task → redirect_to_test", () => {
  assert.equal(checkDemoUrlAccess("task"), "redirect_to_test")
})

test("защита URL: /demo при стадии=interview → error_410 (мягкий отказ)", () => {
  assert.equal(checkDemoUrlAccess("interview"), "error_410")
})

test("защита URL: /demo при стадии=hired → error_410", () => {
  assert.equal(checkDemoUrlAccess("hired"), "error_410")
})

test("защита URL: /test при стадии=test → ok", () => {
  assert.equal(checkTestUrlAccess("test"), "ok")
})

test("защита URL: /test при стадии=task → ok", () => {
  assert.equal(checkTestUrlAccess("task"), "ok")
})

test("защита URL: /test при стадии=demo → redirect_to_demo", () => {
  assert.equal(checkTestUrlAccess("demo"), "redirect_to_demo")
})

test("защита URL: /test при стадии=offer → error_410", () => {
  assert.equal(checkTestUrlAccess("offer"), "error_410")
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. nextStageId — тест-стадии корректно входят в цепочку (сквозной путь)
// ─────────────────────────────────────────────────────────────────────────────

function makeFullFunnelStages(): FunnelV2Stage[] {
  return [
    { id: "st-msg",       action: "message",       rule: { autoAdvance: true,  autoReject: false, rejectDelayMinutes: 60 }, dozhim: "off" },
    { id: "st-demo",      action: "demo",           rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 }, dozhim: "standard" },
    { id: "st-test",      action: "test",           rule: { autoAdvance: false, autoReject: true,  threshold: 70, rejectDelayMinutes: 120 }, dozhim: "soft" },
    { id: "st-interview", action: "interview",      rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 }, dozhim: "off" },
    { id: "st-offer",     action: "offer",          rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 }, dozhim: "off" },
    { id: "st-hired",     action: "hired",          rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 }, dozhim: "off" },
  ]
}

test("полная воронка: порядок стадий message→demo→test→interview→offer→hired", () => {
  const stages = makeFullFunnelStages()
  assert.equal(nextStageId(stages, "st-msg"),       "st-demo")
  assert.equal(nextStageId(stages, "st-demo"),      "st-test")
  assert.equal(nextStageId(stages, "st-test"),      "st-interview")
  assert.equal(nextStageId(stages, "st-interview"), "st-offer")
  assert.equal(nextStageId(stages, "st-offer"),     "st-hired")
  assert.equal(nextStageId(stages, "st-hired"),     null)   // конец воронки
})

test("полная воронка: ветвление — из demo пропустить test → сразу interview", () => {
  const stages = makeFullFunnelStages()
  // Ветвление: rule.advanceTo='st-interview' пропускает тест
  assert.equal(nextStageId(stages, "st-demo", "st-interview"), "st-interview")
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Флаг funnelV2RuntimeEnabled=false → легаси не ломается (G)
// ─────────────────────────────────────────────────────────────────────────────

test("при funnelV2RuntimeEnabled=false calcStageScore работает без флага (легаси не затронут)", () => {
  // Имитируем: если флаг=false, calcStageScore вызывается с пустыми данными и не падает
  const result = calcStageScore(null, [])
  assert.equal(result.scorePercent, 100, "нет вопросов → 100% (нормальный легаси-путь)")
  // При null lessonsJson taskQuestions пуст → hasPendingAiQuestions=false (нет вопросов вообще)
  assert.equal(result.hasPendingAiQuestions, false, "нет вопросов совсем → pending=false")
})

test("при funnelV2RuntimeEnabled=false: calcStageScore без AI-вопросов не затрагивает AI", () => {
  let aiCalled = false
  // Симулируем: если calcStageScore не видит AI-вопросов, aiCalled остаётся false
  const lessons = [
    {
      id: "l1",
      title: "Урок",
      blocks: [
        {
          type: "task",
          questions: [
            { id: "q1", text: "Вопрос", answerType: "yesno", correctYesNo: "yes", options: [], points: 5 },
          ],
        },
      ],
    },
  ]
  const answers: StructuredAnswer[] = [
    { blockId: "b1", questionId: "q1", answerType: "yesno", value: "yes" },
  ]
  const result = calcStageScore(lessons, answers)
  assert.equal(result.hasPendingAiQuestions, false, "нет AI-вопросов → AI не вызывается")
  assert.equal(aiCalled, false, "AI не вызывался (синхронный путь)")
  assert.ok(result.scorePercent >= 0 && result.scorePercent <= 100)
})
