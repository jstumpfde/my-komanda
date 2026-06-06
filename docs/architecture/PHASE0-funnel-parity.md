# PHASE0 — Funnel Builder ↔ Legacy паритет-аудит

Цель: консолидация воронки. Funnel Builder («Конструктор воронки [Beta]») должен
стать единственным источником правды. Сейчас рантайм читает **только legacy-поля**,
а `funnel_config_json` хранит лишь `{ type, order, enabled }` (см.
`lib/funnel-builder/blocks.ts:1-3`, schema `lib/db/schema.ts:429-432`). Этот
документ фиксирует, чего не хватает Builder'у для перехода.

Read-only исследование. Ничего не менялось, кроме этого файла.

---

## 1. Таблица соответствия

Колонки:
- **Legacy-настройка** — функциональная область.
- **Где хранится** — поле в `vacancies` (или связанная таблица) из `lib/db/schema.ts`.
- **Кто читает в рантайме** — `file:line` (cron-пайплайн / скоринг). «—» = только UI/публичная страница.
- **Блок Builder** — есть ли соответствующий тип в `FunnelBlockType` (`blocks.ts:26-43`).
- **UI-настройки блока** — есть ли запись в `BLOCK_SETTINGS_REGISTRY` с `component != null` (`block-settings.tsx:255-341`).
- **Действие для паритета** — что нужно для перехода.

| Legacy-настройка | Где хранится (schema) | Кто читает в рантайме (file:line) | Блок Builder | UI-настройки в block-settings | Действие для паритета |
|---|---|---|---|---|---|
| AI-скоринг резюме (вкл/выкл) | `aiScoringEnabled` (`schema.ts:385`) | `lib/hh/process-queue.ts:505-572` (через `screenResume`, `lib/ai-screen-resume.ts`) | `ai_resume_score` | да (`AiResumeScoreSettingsWrapped`, обёртка над `VacancyAiProcessSettings` + `VacancyRequirementsSettings`) | Рантайм должен читать `enabled` блока, а не `aiScoringEnabled`. Сейчас dual-write закрывает разрыв. |
| Пороги скоринга v1 (`minScoreLower`/`minScoreUpper`/`midRangeAction`) | `aiProcessSettings` jsonb (`schema.ts:384`) | `process-queue.ts:555-559` (lower), `:558-559` (upper), `:578` (midRangeAction) | `ai_resume_score` (пороги) + `ai_anketa_score` (пороги после анкеты) | да (`VacancyAiProcessSettings`; пороги «после демо» — `PostDemoSettings sections=["thresholds"]`) | Перенести пороги в конфиг блока. Сейчас живут в `aiProcessSettings`. |
| Структурированные требования v2 (`must_have`/`nice_to_have`/`deal_breakers`/`scoring_weights`) | `requirementsJson` (`schema.ts:421`) | `lib/ai-score-candidate-v2.ts:145,152` — вызывается **только** из `app/api/public/demo/[token]/answer/route.ts` и `app/api/vacancies/[id]/score-candidate/route.ts`, **НЕ из process-queue** | `ai_resume_score` (тот же блок) | да (`VacancyRequirementsSettings`) | Уточнить: v2 не участвует в скоринге резюме при импорте (только при ответе на демо/ручном прогоне). Решить, чей это блок. |
| Стоп-факторы по резюме (city/format/age/experience/...) | `stopFactorsJson` (`schema.ts:416`) | `process-queue.ts:480-481` (через `stop-factors-matcher`) + флаг `aiSettings.stopFactorsEnabled` (`:480`) | `stop_factors_resume` | да (`VacancyStopFactorsSettings`) | Рантайм читает `stopFactorsJson` + `aiProcessSettings.stopFactorsEnabled`, а не `enabled` блока. |
| Стоп-слова в чате | `stopWordsJson` (`schema.ts:387-391`) | regex-путь в `scan-incoming.ts:506-518` помечен **disabled** (`P0-14`); стоп-слова сейчас обрабатываются pre-filter'ом AI-чатбота (`scan-incoming.ts:487`) и в followup (`lib/followup/stop-words.ts`, `should-stop.ts`) | `stop_words_chat` | да (`VacancyStopWordsSettings`) | Проверить актуальный путь применения стоп-слов (regex-ветка выключена). |
| Серия первых сообщений (1–3, задержки) | `firstMessagesChain` (`schema.ts:401-404`) | `process-queue.ts:904+` (cumulative задержки из chain) | `first_message` | да (`FirstMessagesChainEditor`) | OK по данным; рантайм читает chain. Нужно завязать на `enabled` блока. |
| Первое сообщение — нерабочее время | `firstMessageOffHoursEnabled/...DelaySeconds/...Text` (`schema.ts:408-410`) | `process-queue.ts:196-200,795-796` | `first_message` (часть того же блока) | частично (в `FirstMessagesChainEditor` есть off-hours поля) | OK. |
| Аварийное повторное сообщение (recovery) | `recoveryMessageEnabled/...Text` (`schema.ts:398-399`) | `scan-incoming.ts:857-859` | **НЕТ блока** | — | Нет отдельного блока. Решить: отдельный блок или часть `first_message`/`dozhim`. |
| Предквалификация (режимы `direct_demo`/`prequal_then_demo`/`prequal_only`) | `aiProcessSettings.prequalificationMode` + `aiProcessSettings.prequalification.{enabled,questions}` (`schema.ts:384`) | `process-queue.ts:567-587,636-655` (`startPrequalification`); ответы — `scan-incoming.ts:527-532` | `prequalification` | да (`VacancyPrequalificationSettings`) | Конфиг лежит внутри `aiProcessSettings`, не в блоке. |
| Демо (превью, режим auto/manual) | `aiProcessSettings` + demos (kind=course) | mode читается в `process-queue.ts` (post-demo ветка) | `demo` | да (`PostDemoSettings sections=["preview"]`) | OK как UI. |
| Финальная анкета — поля | `descriptionJson.anketa.*` + `formFields` в post-demo-settings | публичная страница анкеты | `anketa` | да (`AnketaFullSettingsWrapped`: `PostDemoSettings sections=["formFields"]` + `QuestionEditor`) | OK. |
| Анкета — вопросы | `descriptionJson.anketa.questions` (`schema.ts:1857`) | публичная страница / скоринг анкеты | `anketa` | да (`QuestionEditor`) | OK. |
| AI-скрининг анкеты (пороги green/yellow/red) | `aiProcessSettings`/post-demo (`upperThreshold`/`lowerThreshold`) | post-demo ветка | `ai_anketa_score` | да (`PostDemoSettings sections=["thresholds"]`) | Пороги в `aiProcessSettings`. |
| Автоответ после анкеты + тест. задание (`anketaAutoReply`) | post-demo settings → `anketaAutoReply.{enabled,delaySeconds,text,testTaskUrl,respectSchedule}` (`post-demo-settings.tsx:244-253`) | cron post-demo | `auto_reply_test_task` | да (`PostDemoSettings sections=["anketaAutoReply"]`) | OK как UI. |
| Финальные экраны (после видео / после анкеты) | `descriptionJson.finalScreens` (`final-screens-settings.tsx:4`) | публичные страницы | `thank_you_screen` | да (`FinalScreensSettings`) | OK. |
| Дожим (цепочка касаний А/Б) | таблицы `followUpCampaigns`/`followUpMessages` + `descriptionJson.followupCustomDays` | `lib/followup/switch-branch.ts:78-106`, `should-stop.ts:45`, `process-queue.ts` (постановка касаний), `scan-incoming.ts:968-970` | `dozhim` | да (`DozhimSettingsWrapped` → `VacancyFollowupSettings`) | OK как UI; данные в отдельных таблицах. |
| Дожим по тесту | часть followup / test_task | followup | частично (`dozhim` / `test_task`) | да (косвенно) | Уточнить покрытие. |
| AI чат-бот (Group 22) | `aiChatbotEnabled` (`schema.ts:412`), `aiChatbotSettings` (`:413`), `aiChatbotPrompt` (`:414`); kill-switch `companies.aiChatbotKilled` (`:203`) | `scan-incoming.ts:417-419,443-455`; per-company kill — `companies.aiChatbotKilled` | `ai_chatbot` | да (`AiChatbotSettings`) | Рантайм читает `aiChatbotEnabled`, не `enabled` блока. |
| Response timing (`responseTiming.*`) | `aiChatbotSettings.responseTiming` (`schema.ts:892`, Group 33) | `scan-incoming.ts` (sleep'ы, cap 60с) | `ai_chatbot` (часть) | да (внутри `AiChatbotSettings`) | OK. |
| callIntent (хочет созвониться) + эскалац. шаблоны + FAQ | `descriptionJson.automation.callIntent.*` (`scan-incoming.ts:425-426`), счётчик `callIntentCount` (`schema.ts:873`) | `scan-incoming.ts:538-559` (`matchCallIntentKeyword`, `insistDemoMessages`) | **НЕТ блока** | — | Нет блока. Добавить (или вложить в `ai_chatbot`/`first_message`). |
| Интервью / расписание / нерабочие дни | `scheduleEnabled/scheduleStart/...WorkingDays` (`schema.ts:438-443`) | `lib/schedule/can-send-now.ts` (вызывается из process-queue/scan-incoming) | `interview` | да (`VacancyScheduleSettings`) | OK как UI. |
| Видео-визитка | `descriptionJson.*` (video-intro) | публичная страница | `video_intro` | да (`VideoIntroSettings`) | OK. |
| Тестовое задание (одна ступень) | demos `kind=test` (`testTaskInstructions`); legacy fallback `descriptionJson.testTask` (`test-task-settings.tsx:10,104-106`) | публичная страница теста | `test_task` | да (`TestTaskSettings`) | OK как UI. |
| Реф-чек | reference-check | — | `reference_check` | да (`ReferenceCheckSettings`) | OK как UI. |
| Оффер | offer | — | `offer` | да (`OfferSettings`) | OK как UI. |
| **ТЕСТ (квиз-конструктор, таб «Тест»)** | course/lessons (CourseTab `kind="test"`), скоринг `lib/score-test-objective.ts` | публичные роуты `app/api/public/test/[token]/{answer,submit}`, `candidates/[id]/test-submission` | **НЕТ блока** (см. §2) | — | **Добавить блок «Тест»** в `FunnelBlockType`. |

---

## 2. Пробелы (что добавить в Builder)

### 2.1. Отсутствующий блок «Тест» (квиз)

Подтверждено: блока «Тест» в Builder **НЕТ**.

- `FunnelBlockType` (`blocks.ts:26-43`) содержит `test_task`, но это **другое**: одна
  ступень «задание → ответ → AI-проверка» (`TestTaskSettings`, demos `kind=test`,
  `testTaskInstructions`).
- Квиз-конструктор — это **отдельный верхнеуровневый таб «Тест»** вакансии:
  - `app/(modules)/hr/vacancies/[id]/page.tsx:845` — «таб Тест — клон таба Демонстрация (CourseTab kind="test")».
  - Табы: `page.tsx:2273,2278` (`value="test", label:"Тест"`), контент `page.tsx:2628`.
  - Скоринг ответов: `lib/score-test-objective.ts` (объективная проверка вопросов
    task-блоков), используется в `app/api/public/test/[token]/submit/route.ts`,
    `.../answer/route.ts`, `app/api/modules/hr/candidates/[id]/test-submission/route.ts`,
    `lib/compare/build-comparison.ts`.
- Это полноценный квиз (уроки + вопросы single/multi, штрафы), не покрываемый
  блоком `test_task`.

**Действие:** ввести новый `FunnelBlockType` (напр. `quiz` / `test_quiz`) + запись
в `BLOCK_META` и `BLOCK_SETTINGS_REGISTRY`, переиспользовать CourseTab(kind="test").

### 2.2. Отсутствующие блоки для legacy-функций

- **callIntent** (хочет созвониться) — нет блока. Данные: `descriptionJson.automation.callIntent`,
  читается `scan-incoming.ts:538-559`. Включает эскалац. шаблоны (`insistDemoMessages`) и FAQ.
- **recovery message** (аварийное повторное сообщение) — нет блока. `recoveryMessageEnabled/Text`,
  читается `scan-incoming.ts:857-859`.

### 2.3. Настройки, которые есть в UI, но НЕ хранятся в конфиге блока

Все настройки блоков сейчас сохраняются в **старые** поля (`aiProcessSettings`,
`stopFactorsJson`, `descriptionJson.*`, отдельные таблицы), а `funnelConfigJson`
хранит только `{type,order,enabled}`. Для «единого источника правды» нужно либо
(а) перенести настройки внутрь `funnelConfigJson.blocks[].config`, либо
(б) оставить хранение как есть, но заставить рантайм читать `enabled`/`order` из
`funnelConfigJson` вместо legacy-флагов (`aiChatbotEnabled`, `aiScoringEnabled`,
`aiProcessSettings.stopFactorsEnabled` и т.д.). Сейчас работает dual-write
(CLAUDE.md, Group 22): сохранение конфига HR-ом зеркалит legacy-поля.

---

## 3. Причина пустого Sheet

**Симптом:** панель настроек блока открывается, виден только заголовок +
описание, тело пустое. Ширина не виновата (`sm:max-w-2xl` = 672px, ок).

**Где:** `components/vacancies/funnel-builder.tsx:615-644` (`<Sheet>` →
`<SheetContent>` → IIFE, рендерящий `<Comp .../>`).

**Что проверено (статически):**
- Реестр `BLOCK_SETTINGS_REGISTRY` (`block-settings.tsx:255-341`) — у всех 17 блоков
  `component != null`; все импорты — валидные named-export'ы (проверено).
- `SheetContent` (`components/ui/sheet.tsx:47-80`) корректно рендерит `children`.
- `FunnelBuilder` смонтирован **внутри** `VacancySettingsProvider`
  (`app/(modules)/hr/vacancies/[id]/page.tsx:2923` … `:3484` (FunnelBuilder) … `:3599`),
  поэтому `FunnelBlockSheetSaveFooter` (`funnel-builder.tsx:745-763`) получает контекст.
- Каждый wrapped-компонент имеет fallback-рендер (спиннер/дефолты), а не «ничего».

**Наиболее вероятный диагноз (структурный, требует подтверждения в рантайме):**
контейнер `SheetContent` имеет `className="... overflow-y-auto p-6 flex flex-col"`
(`funnel-builder.tsx:619`), а тело блока обёрнуто в
`<div className="mt-6 flex-1 pb-20">` (`funnel-builder.tsx:632`).
`SheetContent` от Radix уже базово `flex flex-col gap-4 h-full`
(`sheet.tsx:61-63`). Сочетание `flex-1` дочернего блока внутри `flex flex-col`-родителя
**с `overflow-y-auto` на самом родителе** — классический источник «схлопывания»
высоты: при определённом содержимом `flex-1` ребёнок получает `min-height:0`/0-высоту,
и контент визуально исчезает (остаётся только `shrink-0` header). Header — sibling
во фрагменте (`funnel-builder.tsx:628-631`), поэтому он остаётся виден даже когда
тело схлопнулось.

**Рекомендация (для фазы исправления, НЕ сделано):** убрать `flex-1` с тела
(`funnel-builder.tsx:632`) либо перенести `overflow-y-auto` со `SheetContent` на
внутренний контейнер тела, и не смешивать `flex flex-col` (Radix base) с
дополнительным `flex flex-col` + `flex-1` в одном дереве. Подтвердить в браузере
(playwright/preview) на блоке `ai_resume_score`.

> Прим.: статический анализ исчерпан — все компоненты рендерят контент по всем
> веткам. Точную причину нужно подтвердить в рантайме (DevTools: проверить высоту
> `div.flex-1` в Sheet и наличие ошибок в консоли).

---

## 4. Что рантайм читает из legacy (критично для миграции)

Рантайм (cron-пайплайн hh.ru) **никогда не читает** `funnelConfigJson` —
подтверждено: `grep funnelConfigJson|funnel_config_json|normalizeFunnelConfig` по
`lib/hh/`, `lib/prequalification/`, `lib/ai-score-candidate-v2.ts`,
`lib/ai-screen-candidate.ts` — нет совпадений. Источник правды для рантайма —
legacy-поля ниже:

**`lib/hh/process-queue.ts` (приём отклика → первое сообщение → скоринг):**
- `aiProcessSettings` — `:86,95,272` (scoped settings)
- `aiChatbotEnabled` (skip обычного flow) — `:202`
- `stopFactorsJson` + `aiSettings.stopFactorsEnabled` — `:480-481`
- `descriptionJson` — `:517` (automation/прочее), `:968-970` (customDays)
- `recoveryMessageEnabled` / `recoveryMessageText` — `:852-859`
- `firstMessagesChain` (cumulative задержки) — `:904+`
- `firstMessageOffHoursEnabled/Text/DelaySeconds` — `:196-200,795-796`
- пороги: `aiSettings.minScoreLower` — `:555-556`, `minScoreUpper` — `:558-559`,
  `midRangeAction` — `:578`
- предкв: `aiSettings.prequalificationMode` — `:567`, `aiSettings.prequalification.{questions,enabled}` — `:568,585`, запуск — `:636-655`
- AI-скоринг резюме: через `screenResume` (`lib/ai-screen-resume.ts`), вызов — `:505-572`

**`lib/hh/scan-incoming.ts` (входящие сообщения кандидата):**
- `aiChatbotEnabled` / `aiChatbotSettings` / `aiChatbotPrompt` — `:417-419,443-455`
- `descriptionJson.automation.callIntent` — `:425-426`; применение — `:538-559`
- `callIntentCount` — `:411,544,559`
- `prequalificationStatus` (ответы предкв) — `:412,527-532`
- стоп-слова: regex-ветка **выключена** (`:506-518`, P0-14); фактически — pre-filter AI (`:487`)
- `recoveryMessage*` — `:857-859` (та же ветка, что в process-queue)
- followup customDays из `descriptionJson` — `:968-970`

**`lib/followup/` (дожим):**
- `descriptionJson.followupCustomDays` — `switch-branch.ts:84-87`
- `automationPaused`/`autoProcessingStopped` — `should-stop.ts:45`
- касания/кампании — таблицы `followUpCampaigns`/`followUpMessages`

**`lib/ai-score-candidate-v2.ts` (скоринг v2 по `requirementsJson`):**
- `requirementsJson` — `:145,152`; работает только если `must_have` непустой (`:11`)
- вызывается **НЕ из process-queue**, а из `app/api/public/demo/[token]/answer/route.ts`
  и `app/api/vacancies/[id]/score-candidate/route.ts`

**`lib/schedule/can-send-now.ts`:** `scheduleEnabled/Start/End/WorkingDays/Timezone` (`schema.ts:438-443`).

**Вывод для миграции:** чтобы Builder стал источником правды, переключение
рантайма должно затронуть как минимум флаги: `aiChatbotEnabled`,
`aiScoringEnabled`, `aiProcessSettings.stopFactorsEnabled`,
`aiProcessSettings.prequalificationMode`, `recoveryMessageEnabled` — заменив их на
чтение `enabled`/`order` соответствующих блоков из `funnelConfigJson`. Настройки
(тексты, пороги, веса) остаются в legacy-полях либо мигрируют в
`funnelConfigJson.blocks[].config`.
