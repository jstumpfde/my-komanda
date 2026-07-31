# Нативный перенос функционала Портрета в Воронку v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать Стадии 1 и Стадии 2 конструктора «Воронка v2», а также общему слою «Коммуникации», собственные редактируемые поля (задержка/нерабочее время/тексты Стадии 1; пороги/переход/плашка/письмо/экран Стадии 2; TG-уведомления и «горячий кандидат»), заменив вчерашнее read-only чтение из Портрета — при этом Портрет остаётся нетронутым источником модели скоринга.

**Architecture:** Аддитивно. Новые поля живут в `vacancy.descriptionJson.funnelV2` (без миграции БД): `funnelV2.stage1`, `funnelV2.stage2`, `funnelV2.communications`. Рантайм читает нативные поля ТОЛЬКО когда включён движок v2 (`vacancies.funnel_v2_runtime_enabled = true`); при выключенном движке — легаси-путь читает Портрет (`getSpec()`) как раньше. При первом открытии конструктора нативные поля один раз предзаполняются копией текущих значений Портрета, дальше живут независимо.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM (Postgres, `descriptionJson` jsonb), React + shadcn/ui + Tailwind, zod (в Портрете), `node:test` + `tsx` для юнит-тестов.

---

## Ключевые архитектурные решения (принято на этапе плана — сверить с Юрием)

1. **Где хранить Стадию 1.** Дизайн предлагал класть per-stage поля в `FunnelV2Stage.rule`. Но после работы 13.07 Стадия 1 «= Портрет» БОЛЬШЕ НЕ является элементом `stages[]` (её отдельная стадия удалена; она рендерится тонкой врезкой `PortraitStageCard`). Поэтому вешать поля не на что — Стадия 1 хранится на уровне конфига: `funnelV2.stage1`. Аналогично Стадия 2 хранится как `funnelV2.stage2` (гейт «переход на 2-ю часть» срабатывает на сабмите анкеты демо, а не привязан к конкретному id стадии — хранение на уровне конфига упрощает рантайм-резолв и не хрупко к перестановке стадий).

2. **Что из Стадии 1 реально переносится (полностью проводится в рантайм).** Задержка первого сообщения (`inviteDelaySeconds`), нерабочее время (`offHoursEnabled` / `offHoursDelaySeconds` / `offHoursText`), текст авто-отказа (`rejectLetter`) и задержка отказа (`rejectionDelayMinutes`) — это ровно те поведения, которые дизайн в разделе «Рантайм» называет переносимыми. **Пороги отбора по баллу (upper/lower/rejectAction/autoInvite), текст приглашения и hh-стадия при приглашении в Стадию 1 НЕ дублируются нативно** и остаются в Портрете, потому что: (а) это часть модели скоринга резюме, которую дизайн явно оставляет в Портрете («стадии продолжают ссылаться на балл, который считает Портрет»); (б) текст приглашения и hh-статус первого контакта УЖЕ являются нативными полями (перенесены 13.07 в `messages`/`hhStatus` первой реальной стадии «Демонстрация»). Дублировать их →半-проводная UI (память `wire-ui-elements-fully`). Врезка `PortraitStageCard` продолжает показывать пороги/авто-приглашение read-only со ссылкой «Открыть Портрет».

3. **Стоп-слова и частые вопросы (FAQ).** Они УЖЕ живут вне Портрета и работают во всех режимах (компонент `AutoResponderSettings` + `vacancies.stop_words_json` + роут `/auto-responder`; комментарий в `spec-editor.tsx:3053` подтверждает «работает независимо от режима»). Чтобы не плодить дубль-хранилище, секция «Коммуникации воронки v2» **переиспользует существующий `<AutoResponderSettings>`** для стоп-слов/FAQ, а нативные поля `funnelV2.communications` добавляются ТОЛЬКО для двух настроек, которые сегодня привязаны к Портрету: TG-уведомления о подходящих кандидатах и «горячий кандидат стынет».

4. **Где физически показывать UI коммуникаций.** Внутри `FunnelV2Builder` (новая сворачиваемая карточка «Коммуникации воронки» под списком стадий), а НЕ во вкладке «Коммуникации». Причины: хранилище `funnelV2.communications` колокализовано с конфигом, который билдер уже персистит одним debounced-PUT; дизайн формулирует это как «нативную часть конструктора»; вкладка «Коммуникации» перегружена легаси-путём и смешение v2/легаси там путало бы.

5. **Где делать предзаполнение из Портрета.** На фронте, при первом рендере билдера (он и так грузит и spec, и config). Если `funnelV2.stage1/stage2/communications` ещё нет — заполняем копией значений Портрета и СРАЗУ персистим снапшот (один PUT), чтобы зафиксировать независимость с момента открытия. Бэкенд GET не трогаем (иначе связали бы роут v2 со spec и мутировали бы на каждом GET до первого сейва).

---

## File Structure

**Создаётся:**
- `lib/funnel-v2/native-config.ts` — чистый слой резолва нативной конфигурации: дефолты, `resolveStage1()`, `resolveEffectiveAnketaPassInvite()`, `resolveTgAlerts()`, `resolveHotCandidate()`, `prefillNativeFromSpec()`. Без DB-импортов — тестируется изолированно.
- `lib/funnel-v2/native-config.test.ts` — юнит-тесты резолверов и предзаполнения.

**Модифицируется:**
- `lib/funnel-v2/types.ts` — интерфейсы `FunnelV2Stage1`/`FunnelV2Stage2`/`FunnelV2Communications`, расширение `FunnelV2Config`, нормализация в `normalizeFunnelV2`.
- `components/vacancies/funnel-v2-builder.tsx` — редактируемые панели Стадии 1 и Стадии 2, секция «Коммуникации воронки», предзаполнение при загрузке.
- `lib/hh/process-queue.ts` — на v2-пути читать задержку/нерабочее-время/текст-отказа/задержку-отказа из нативных полей.
- `lib/funnel-v2/first-message-timing.ts` — не меняем сигнатуру; передаём в неё нативные значения (см. Task 9).
- `lib/messaging/second-demo-invite.ts` — гейт Стадии 2 читает нативный конфиг через резолвер.
- `app/api/public/demo/[token]/answer/route.ts` и `app/api/public/demo/[token]/route.ts` — экраны/переход Стадии 2 из нативного конфига.
- `lib/telegram/candidate-alert.ts` — TG-уведомления из нативного конфига при v2.
- `lib/demo/hot-candidate-alert.ts` — «горячий кандидат» из нативного конфига при v2.

---

## ЧАСТЬ 1 — Типы и данные

### Task 1: Типы нативных полей в `FunnelV2Config`

**Files:**
- Modify: `lib/funnel-v2/types.ts` (после `interface FunnelV2Stage { … }`, перед `export interface FunnelV2Config`)

- [ ] **Step 1: Добавить три интерфейса и расширить `FunnelV2Config`**

В `lib/funnel-v2/types.ts` найти блок:

```ts
export interface FunnelV2Config {
  enabled: boolean
  stages: FunnelV2Stage[]   // стадии 2…N (стадия 1 = Портрет, рендерится отдельно)
}
```

Заменить его на:

```ts
// ── Нативные поля Стадии 1 «Отклик → приглашение» (перенос из Портрета, 14.07) ──
// Стадия 1 = Портрет и НЕ входит в stages[] (её отдельная стадия убрана 13.07),
// поэтому её поведенческие поля живут на уровне конфига. Здесь — ТОЛЬКО те
// поведения, что дизайн переносит в рантайм: задержка первого сообщения,
// нерабочее время, текст авто-отказа и задержка отказа. Пороги/авто-приглашение
// по баллу и текст приглашения остаются в Портрете (модель скоринга) / в
// сообщениях первой реальной стадии. Все поля опциональны: отсутствие = «ещё не
// настроено нативно» (рантайм берёт дефолт; UI предзаполнит из Портрета один раз).
export interface FunnelV2Stage1 {
  /** Задержка «человеческой» паузы перед первым сообщением, сек. */
  inviteDelaySeconds?: number
  /** Слать ли мягкое подтверждение в нерабочее время (иначе откладываем до утра). */
  offHoursEnabled?: boolean
  /** Пауза перед мягким подтверждением в нерабочее время, сек. */
  offHoursDelaySeconds?: number
  /** Текст мягкого подтверждения в нерабочее время. Пусто → дефолт компании. */
  offHoursText?: string
  /** Текст письма авто-отказа по баллу резюме. Пусто → дефолт вакансии/платформы. */
  rejectLetter?: string
  /** Задержка авто-отказа, минуты. */
  rejectionDelayMinutes?: number
}

// ── Нативные поля Стадии 2 «Демо 1-я часть → переход на 2-ю часть» ──────────────
// Зеркало spec.anketaPassInvite (Портрет). Гейт срабатывает на сабмите анкеты
// демо; хранится на уровне конфига (не в конкретной стадии), т.к. триггер не
// привязан к id стадии. При включённом движке v2 рантайм читает эти поля вместо
// spec.anketaPassInvite (см. lib/funnel-v2/native-config.ts).
export interface FunnelV2Stage2 {
  /** Включён ли переход на 2-ю часть. */
  enabled?: boolean
  /** Порог объективного балла (вопросы-выбора), 0–100. */
  passThreshold?: number
  /** Порог AI-оценки ответов анкеты, 0–100 (ИЛИ-гейт с passThreshold). */
  aiEvalThreshold?: number
  /** Как переводить: seamless / message / both. */
  transferMode?: "seamless" | "message" | "both"
  /** id контент-блока «2-я часть» (demos.id). null = боевой блок. */
  contentBlockId?: string | null
  /** Плашка-поздравление сверху блока 2 (для прошедших). */
  passScreenTitle?: string
  passScreenText?: string
  /** Текст письма-приглашения на 2-ю часть + задержка перед отправкой, сек. */
  messageText?: string
  delaySeconds?: number
  /** Экран «Спасибо» для НЕ прошедших гейт. */
  failScreenTitle?: string
  failScreenText?: string
  /** Действие с не прошедшим гейт: none / pending_manual / pending_rejection. */
  failAction?: "none" | "pending_manual" | "pending_rejection"
  /** Задержка авто-отказа не прошедших, минуты. */
  failRejectDelayMinutes?: number
}

// ── Коммуникации воронки v2 (общий слой, не per-stage) ─────────────────────────
// ТОЛЬКО настройки, сегодня привязанные к Портрету: TG-уведомления о подходящих
// кандидатах и «горячий кандидат стынет». Стоп-слова и FAQ здесь НЕ хранятся —
// они уже режимо-независимы (AutoResponderSettings + vacancies.stop_words_json),
// секция коммуникаций переиспользует их существующий редактор.
export interface FunnelV2Communications {
  /** Telegram: подходящие кандидаты в канал компании. */
  tgAlerts?: {
    enabled: boolean
    minResumeScore: number | null
    minAnswersScore: number | null
    onGatePassed: boolean
  }
  /** «Горячий кандидат стынет»: высокий балл, открыл демо, 0 блоков. */
  hotCandidate?: {
    enabled: boolean
    threshold: number
    staleAfterHours: number
  }
}

export interface FunnelV2Config {
  enabled: boolean
  stages: FunnelV2Stage[]   // стадии 2…N (стадия 1 = Портрет, рендерится отдельно)
  /** Нативные поля Стадии 1 (перенос из Портрета). undefined = ещё не настроено. */
  stage1?: FunnelV2Stage1
  /** Нативные поля Стадии 2 (переход на 2-ю часть). undefined = ещё не настроено. */
  stage2?: FunnelV2Stage2
  /** Коммуникации (TG-уведомления, горячий кандидат). undefined = ещё не настроено. */
  communications?: FunnelV2Communications
}
```

- [ ] **Step 2: tsc-проверка затронутого файла**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "funnel-v2/types" | head`
Expected: пусто (нет ошибок в types.ts).

- [ ] **Step 3: Commit**

```bash
git add lib/funnel-v2/types.ts
git commit -m "feat(funnel-v2): типы нативных полей Стадии 1/2 и коммуникаций"
```

---

### Task 2: Нормализация нативных полей в `normalizeFunnelV2`

**Files:**
- Modify: `lib/funnel-v2/types.ts` (функция `normalizeFunnelV2`, ~строки 299–333)
- Test: `lib/funnel-v2/native-config.test.ts` (создаётся в Task 4; тест нормализации добавим туда же в Step 1 этого таска через отдельный временный файл — см. ниже)

- [ ] **Step 1: Написать падающий тест нормализации**

Создать `lib/funnel-v2/normalize-native.test.ts`:

```ts
// Юнит-тесты нормализации нативных полей funnelV2 (stage1/stage2/communications).
// Запуск: pnpm exec tsx --test lib/funnel-v2/normalize-native.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeFunnelV2 } from "./types"

test("stage1/stage2/communications отсутствуют → остаются undefined (легаси-конфиг)", () => {
  const c = normalizeFunnelV2({ enabled: true, stages: [] })
  assert.equal(c.stage1, undefined)
  assert.equal(c.stage2, undefined)
  assert.equal(c.communications, undefined)
})

test("stage1 нормализуется: валидные поля проходят, мусор отбрасывается", () => {
  const c = normalizeFunnelV2({
    enabled: true, stages: [],
    stage1: { inviteDelaySeconds: 60, offHoursEnabled: false, offHoursDelaySeconds: 30, offHoursText: "вечер", rejectLetter: "отказ", rejectionDelayMinutes: 120, bogus: 1 },
  })
  assert.deepEqual(c.stage1, { inviteDelaySeconds: 60, offHoursEnabled: false, offHoursDelaySeconds: 30, offHoursText: "вечер", rejectLetter: "отказ", rejectionDelayMinutes: 120 })
})

test("stage2 нормализуется и клампит пороги 0..100", () => {
  const c = normalizeFunnelV2({
    enabled: true, stages: [],
    stage2: { enabled: true, passThreshold: 150, aiEvalThreshold: -5, transferMode: "seamless", contentBlockId: "b1", messageText: "m", delaySeconds: 900, failAction: "pending_rejection", failRejectDelayMinutes: 60 },
  })
  assert.equal(c.stage2?.passThreshold, 100)
  assert.equal(c.stage2?.aiEvalThreshold, 0)
  assert.equal(c.stage2?.transferMode, "seamless")
  assert.equal(c.stage2?.contentBlockId, "b1")
  assert.equal(c.stage2?.failAction, "pending_rejection")
})

test("communications нормализуется", () => {
  const c = normalizeFunnelV2({
    enabled: true, stages: [],
    communications: {
      tgAlerts: { enabled: true, minResumeScore: 70, minAnswersScore: null, onGatePassed: true },
      hotCandidate: { enabled: true, threshold: 80, staleAfterHours: 4 },
    },
  })
  assert.equal(c.communications?.tgAlerts?.enabled, true)
  assert.equal(c.communications?.tgAlerts?.minResumeScore, 70)
  assert.equal(c.communications?.hotCandidate?.threshold, 80)
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm exec tsx --test lib/funnel-v2/normalize-native.test.ts`
Expected: FAIL (нормализация ещё не сохраняет stage1/stage2/communications — они `undefined`).

- [ ] **Step 3: Реализовать нормализацию**

В `lib/funnel-v2/types.ts`, в функции `normalizeFunnelV2`, найти финальный `return { enabled: …, stages: … }`. Перед `return` добавить хелперы и включить поля в результат. Заменить весь `return`-блок:

```ts
  return {
    enabled: r.enabled === true,
    stages: stages.map((s) => {
      const st = s as FunnelV2Stage
      return {
        ...st,
        color: STAGE_COLORS.includes(st.color as StageColor) ? st.color : undefined,
        negative: st.negative === true ? true : undefined,
        terminal: st.terminal === true ? true : undefined,
        enabled: st.enabled === false ? false : undefined,
        rejectText: typeof st.rejectText === "string" ? st.rejectText : undefined,
        farewellText: typeof st.farewellText === "string" ? st.farewellText : undefined,
        messages: Array.isArray(st.messages) ? st.messages.filter((m): m is string => typeof m === "string") : undefined,
        avitoStatus: typeof st.avitoStatus === "string" ? st.avitoStatus : undefined,
        rule: {
          autoAdvance: st.rule?.autoAdvance === true,
          autoReject: st.rule?.autoReject === true,
          threshold: typeof st.rule?.threshold === "number" ? st.rule.threshold : undefined,
          objThreshold: typeof st.rule?.objThreshold === "number" ? st.rule.objThreshold : undefined,
          rejectDelayMinutes: typeof st.rule?.rejectDelayMinutes === "number" ? st.rule.rejectDelayMinutes : DEFAULT_REJECT_DELAY_MIN,
          passCriteria: typeof st.rule?.passCriteria === "string" ? st.rule.passCriteria : undefined,
          advanceTo: typeof st.rule?.advanceTo === "string" ? st.rule.advanceTo : undefined,
          rejectText: typeof st.rule?.rejectText === "string" ? st.rule.rejectText : undefined,
          scoreGate: normalizeScoreGate(st.rule?.scoreGate),
        },
        dozhim: (["off", "soft", "standard", "strong"] as DozhimPreset[]).includes(st.dozhim) ? st.dozhim : "standard",
      }
    }),
    stage1: normalizeStage1(r.stage1),
    stage2: normalizeStage2(r.stage2),
    communications: normalizeCommunications(r.communications),
  }
}

// ── Нормализация нативных полей (терпимо к мусору; отсутствие → undefined) ──────
const clamp100 = (n: unknown): number | undefined =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined
const posInt = (n: unknown): number | undefined =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : undefined
const str = (s: unknown): string | undefined => (typeof s === "string" ? s : undefined)

function normalizeStage1(raw: unknown): FunnelV2Stage1 | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const s = raw as Record<string, unknown>
  const out: FunnelV2Stage1 = {}
  if (posInt(s.inviteDelaySeconds) !== undefined) out.inviteDelaySeconds = posInt(s.inviteDelaySeconds)
  if (typeof s.offHoursEnabled === "boolean") out.offHoursEnabled = s.offHoursEnabled
  if (posInt(s.offHoursDelaySeconds) !== undefined) out.offHoursDelaySeconds = posInt(s.offHoursDelaySeconds)
  if (str(s.offHoursText) !== undefined) out.offHoursText = str(s.offHoursText)
  if (str(s.rejectLetter) !== undefined) out.rejectLetter = str(s.rejectLetter)
  if (posInt(s.rejectionDelayMinutes) !== undefined) out.rejectionDelayMinutes = posInt(s.rejectionDelayMinutes)
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizeStage2(raw: unknown): FunnelV2Stage2 | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const s = raw as Record<string, unknown>
  const out: FunnelV2Stage2 = {}
  if (typeof s.enabled === "boolean") out.enabled = s.enabled
  if (clamp100(s.passThreshold) !== undefined) out.passThreshold = clamp100(s.passThreshold)
  if (clamp100(s.aiEvalThreshold) !== undefined) out.aiEvalThreshold = clamp100(s.aiEvalThreshold)
  if (s.transferMode === "seamless" || s.transferMode === "message" || s.transferMode === "both") out.transferMode = s.transferMode
  if (typeof s.contentBlockId === "string") out.contentBlockId = s.contentBlockId
  else if (s.contentBlockId === null) out.contentBlockId = null
  if (str(s.passScreenTitle) !== undefined) out.passScreenTitle = str(s.passScreenTitle)
  if (str(s.passScreenText) !== undefined) out.passScreenText = str(s.passScreenText)
  if (str(s.messageText) !== undefined) out.messageText = str(s.messageText)
  if (posInt(s.delaySeconds) !== undefined) out.delaySeconds = posInt(s.delaySeconds)
  if (str(s.failScreenTitle) !== undefined) out.failScreenTitle = str(s.failScreenTitle)
  if (str(s.failScreenText) !== undefined) out.failScreenText = str(s.failScreenText)
  if (s.failAction === "none" || s.failAction === "pending_manual" || s.failAction === "pending_rejection") out.failAction = s.failAction
  if (posInt(s.failRejectDelayMinutes) !== undefined) out.failRejectDelayMinutes = posInt(s.failRejectDelayMinutes)
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizeCommunications(raw: unknown): FunnelV2Communications | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const c = raw as Record<string, unknown>
  const out: FunnelV2Communications = {}
  if (c.tgAlerts && typeof c.tgAlerts === "object") {
    const t = c.tgAlerts as Record<string, unknown>
    out.tgAlerts = {
      enabled: t.enabled === true,
      minResumeScore: clamp100(t.minResumeScore) ?? null,
      minAnswersScore: clamp100(t.minAnswersScore) ?? null,
      onGatePassed: t.onGatePassed !== false,
    }
  }
  if (c.hotCandidate && typeof c.hotCandidate === "object") {
    const h = c.hotCandidate as Record<string, unknown>
    out.hotCandidate = {
      enabled: h.enabled === true,
      threshold: clamp100(h.threshold) ?? 70,
      staleAfterHours: typeof h.staleAfterHours === "number" && Number.isFinite(h.staleAfterHours)
        ? Math.max(1, Math.min(72, Math.round(h.staleAfterHours))) : 3,
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}
```

> Примечание: интерфейсы `FunnelV2Stage1`/`FunnelV2Stage2`/`FunnelV2Communications` уже объявлены в Task 1 выше по файлу — новые функции их видят.

- [ ] **Step 4: Запустить тест — зелёный**

Run: `pnpm exec tsx --test lib/funnel-v2/normalize-native.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add lib/funnel-v2/types.ts lib/funnel-v2/normalize-native.test.ts
git commit -m "feat(funnel-v2): нормализация нативных полей stage1/stage2/communications"
```

---

### Task 3: Резолверы и предзаполнение (`native-config.ts`) — часть 1: Стадия 1 и предзаполнение

**Files:**
- Create: `lib/funnel-v2/native-config.ts`
- Test: `lib/funnel-v2/native-config.test.ts`

- [ ] **Step 1: Написать падающий тест резолвера Стадии 1 и предзаполнения**

Создать `lib/funnel-v2/native-config.test.ts`:

```ts
// Юнит-тесты чистого слоя native-config (резолв + предзаполнение из Портрета).
// Запуск: pnpm exec tsx --test lib/funnel-v2/native-config.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  resolveStage1, prefillNativeFromSpec,
  DEFAULT_STAGE1_INVITE_DELAY, DEFAULT_STAGE1_OFF_HOURS_DELAY, DEFAULT_STAGE1_REJECT_DELAY_MIN,
} from "./native-config"
import { normalizeFunnelV2 } from "./types"

test("resolveStage1: пустой конфиг → дефолты", () => {
  const s1 = resolveStage1(normalizeFunnelV2({ enabled: true, stages: [] }))
  assert.equal(s1.inviteDelaySeconds, DEFAULT_STAGE1_INVITE_DELAY)
  assert.equal(s1.offHoursEnabled, true)
  assert.equal(s1.offHoursDelaySeconds, DEFAULT_STAGE1_OFF_HOURS_DELAY)
  assert.equal(s1.offHoursText, "")
  assert.equal(s1.rejectLetter, "")
  assert.equal(s1.rejectionDelayMinutes, DEFAULT_STAGE1_REJECT_DELAY_MIN)
})

test("resolveStage1: нативные значения побеждают дефолты", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage1: { inviteDelaySeconds: 30, offHoursEnabled: false, offHoursText: "ночь", rejectionDelayMinutes: 5 } })
  const s1 = resolveStage1(cfg)
  assert.equal(s1.inviteDelaySeconds, 30)
  assert.equal(s1.offHoursEnabled, false)
  assert.equal(s1.offHoursText, "ночь")
  assert.equal(s1.rejectionDelayMinutes, 5)
})

test("prefillNativeFromSpec: заполняет отсутствующие блоки из Портрета", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [] })
  const spec = {
    resumeThresholds: { inviteDelaySeconds: 45, offHoursEnabled: false, offHoursDelaySeconds: 20, rejectionDelayMinutes: 90 },
    offHoursLetter: "добрый вечер", rejectLetter: "к сожалению",
    anketaPassInvite: { enabled: true, passThreshold: 40, aiEvalThreshold: 50, transferMode: "both", contentBlockId: "b2", messageText: "письмо", delaySeconds: 600, passScreenTitle: "Молодец", passScreenText: "Дальше", failScreenTitle: "", failScreenText: "", failAction: "none", failRejectDelayMinutes: 60 },
    tgCandidateAlerts: { enabled: true, minResumeScore: 70, minAnswersScore: null, onGatePassed: true },
    hotCandidateAlert: { enabled: true, threshold: 80, staleAfterHours: 4 },
  }
  const { changed, config } = prefillNativeFromSpec(cfg, spec)
  assert.equal(changed, true)
  assert.equal(config.stage1?.inviteDelaySeconds, 45)
  assert.equal(config.stage1?.offHoursEnabled, false)
  assert.equal(config.stage1?.offHoursText, "добрый вечер")
  assert.equal(config.stage1?.rejectLetter, "к сожалению")
  assert.equal(config.stage2?.passThreshold, 40)
  assert.equal(config.stage2?.contentBlockId, "b2")
  assert.equal(config.communications?.tgAlerts?.minResumeScore, 70)
  assert.equal(config.communications?.hotCandidate?.threshold, 80)
})

test("prefillNativeFromSpec: не перетирает уже сохранённые нативные блоки", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage1: { inviteDelaySeconds: 15 } })
  const spec = { resumeThresholds: { inviteDelaySeconds: 999 } }
  const { changed, config } = prefillNativeFromSpec(cfg, spec)
  // stage1 уже есть → не трогаем; stage2/communications отсутствуют в spec → без изменений
  assert.equal(config.stage1?.inviteDelaySeconds, 15)
  assert.equal(changed, false)
})
```

- [ ] **Step 2: Запустить — падает (модуль не существует)**

Run: `pnpm exec tsx --test lib/funnel-v2/native-config.test.ts`
Expected: FAIL — «Cannot find module './native-config'».

- [ ] **Step 3: Создать `lib/funnel-v2/native-config.ts` (Стадия 1 + предзаполнение)**

```ts
/**
 * Чистый слой резолва НАТИВНОЙ конфигурации Воронки v2 (без DB-импортов).
 *
 * Принцип: при включённом движке v2 рантайм читает поведенческие настройки из
 * funnelV2.stage1/stage2/communications, а НЕ из Портрета (getSpec). Отсутствие
 * нативного поля → платформенный дефолт (НЕ фоллбэк на Портрет — Портрет уже
 * скопирован в нативные поля один раз при первом открытии, см. prefillNativeFromSpec).
 *
 * Единственный источник истины для дефолтов и маппинга spec→native.
 */

import type { FunnelV2Config, FunnelV2Stage1, FunnelV2Stage2, FunnelV2Communications } from "./types"

// Дефолты Стадии 1 — совпадают со spec-дефолтами Портрета (types.ts:ResumeThresholds).
export const DEFAULT_STAGE1_INVITE_DELAY = 180
export const DEFAULT_STAGE1_OFF_HOURS_DELAY = 15
export const DEFAULT_STAGE1_REJECT_DELAY_MIN = 60
// Дефолты Стадии 2 — совпадают со spec-дефолтами AnketaPassInvite.
export const DEFAULT_STAGE2_PASS_THRESHOLD = 35
export const DEFAULT_STAGE2_AI_EVAL_THRESHOLD = 45
export const DEFAULT_STAGE2_DELAY_SECONDS = 900
export const DEFAULT_STAGE2_FAIL_REJECT_DELAY_MIN = 60
// Дефолт «горячего кандидата».
export const DEFAULT_HOT_CANDIDATE_THRESHOLD = 70

export interface EffectiveStage1 {
  inviteDelaySeconds: number
  offHoursEnabled: boolean
  offHoursDelaySeconds: number
  offHoursText: string           // "" → вызывающий берёт дефолт компании
  rejectLetter: string           // "" → вызывающий берёт дефолт вакансии/платформы
  rejectionDelayMinutes: number
}

/** Эффективные значения Стадии 1 (нативные поля + дефолты). */
export function resolveStage1(config: FunnelV2Config): EffectiveStage1 {
  const s = config.stage1 ?? {}
  return {
    inviteDelaySeconds: s.inviteDelaySeconds ?? DEFAULT_STAGE1_INVITE_DELAY,
    offHoursEnabled: s.offHoursEnabled ?? true,
    offHoursDelaySeconds: s.offHoursDelaySeconds ?? DEFAULT_STAGE1_OFF_HOURS_DELAY,
    offHoursText: s.offHoursText ?? "",
    rejectLetter: s.rejectLetter ?? "",
    rejectionDelayMinutes: s.rejectionDelayMinutes ?? DEFAULT_STAGE1_REJECT_DELAY_MIN,
  }
}

// ── Предзаполнение из Портрета (один раз при первом открытии конструктора) ──────
// spec — сырой объект CandidateSpec (any-shape, приходит из /api/core/spec).
// Заполняем ТОЛЬКО отсутствующие блоки (stage1/stage2/communications), уже
// сохранённые не трогаем. Возвращаем { changed, config } — если changed=false,
// вызывающему не нужно персистить.
type SpecLike = Record<string, unknown> | null | undefined
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined)
const text = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)

export function prefillNativeFromSpec(config: FunnelV2Config, spec: SpecLike): { changed: boolean; config: FunnelV2Config } {
  let changed = false
  const next: FunnelV2Config = { ...config }
  const rt = (spec?.resumeThresholds ?? {}) as Record<string, unknown>
  const ap = (spec?.anketaPassInvite ?? null) as Record<string, unknown> | null
  const tg = (spec?.tgCandidateAlerts ?? null) as Record<string, unknown> | null
  const hot = (spec?.hotCandidateAlert ?? null) as Record<string, unknown> | null

  if (!config.stage1) {
    const s1: FunnelV2Stage1 = {
      inviteDelaySeconds: num(rt.inviteDelaySeconds) ?? DEFAULT_STAGE1_INVITE_DELAY,
      offHoursEnabled: bool(rt.offHoursEnabled) ?? true,
      offHoursDelaySeconds: num(rt.offHoursDelaySeconds) ?? DEFAULT_STAGE1_OFF_HOURS_DELAY,
      offHoursText: text(spec?.offHoursLetter) ?? "",
      rejectLetter: text(spec?.rejectLetter) ?? "",
      rejectionDelayMinutes: num(rt.rejectionDelayMinutes) ?? DEFAULT_STAGE1_REJECT_DELAY_MIN,
    }
    next.stage1 = s1
    changed = true
  }

  if (!config.stage2 && ap) {
    const s2: FunnelV2Stage2 = {
      enabled: bool(ap.enabled) ?? false,
      passThreshold: num(ap.passThreshold) ?? DEFAULT_STAGE2_PASS_THRESHOLD,
      aiEvalThreshold: num(ap.aiEvalThreshold) ?? DEFAULT_STAGE2_AI_EVAL_THRESHOLD,
      transferMode: (ap.transferMode === "seamless" || ap.transferMode === "message" || ap.transferMode === "both") ? ap.transferMode : "both",
      contentBlockId: typeof ap.contentBlockId === "string" ? ap.contentBlockId : null,
      passScreenTitle: text(ap.passScreenTitle) ?? "",
      passScreenText: text(ap.passScreenText) ?? "",
      messageText: text(ap.messageText) ?? "",
      delaySeconds: num(ap.delaySeconds) ?? DEFAULT_STAGE2_DELAY_SECONDS,
      failScreenTitle: text(ap.failScreenTitle) ?? "",
      failScreenText: text(ap.failScreenText) ?? "",
      failAction: (ap.failAction === "pending_manual" || ap.failAction === "pending_rejection") ? ap.failAction : "none",
      failRejectDelayMinutes: num(ap.failRejectDelayMinutes) ?? DEFAULT_STAGE2_FAIL_REJECT_DELAY_MIN,
    }
    next.stage2 = s2
    changed = true
  }

  if (!config.communications && (tg || hot)) {
    const comms: FunnelV2Communications = {}
    if (tg) comms.tgAlerts = {
      enabled: bool(tg.enabled) ?? false,
      minResumeScore: num(tg.minResumeScore) ?? null,
      minAnswersScore: num(tg.minAnswersScore) ?? null,
      onGatePassed: bool(tg.onGatePassed) ?? true,
    }
    if (hot) comms.hotCandidate = {
      enabled: bool(hot.enabled) ?? false,
      threshold: num(hot.threshold) ?? DEFAULT_HOT_CANDIDATE_THRESHOLD,
      staleAfterHours: num(hot.staleAfterHours) ?? 3,
    }
    next.communications = comms
    changed = true
  }

  return { changed, config: next }
}
```

- [ ] **Step 4: Запустить тест — зелёный**

Run: `pnpm exec tsx --test lib/funnel-v2/native-config.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add lib/funnel-v2/native-config.ts lib/funnel-v2/native-config.test.ts
git commit -m "feat(funnel-v2): native-config — resolveStage1 + prefillNativeFromSpec"
```

---

### Task 4: Резолверы Стадии 2 и коммуникаций (`native-config.ts` — часть 2)

**Files:**
- Modify: `lib/funnel-v2/native-config.ts`
- Modify: `lib/funnel-v2/native-config.test.ts`

- [ ] **Step 1: Дописать падающие тесты резолверов Стадии 2 / TG / hot**

В конец `lib/funnel-v2/native-config.test.ts` добавить:

```ts
import { resolveEffectiveAnketaPassInvite, resolveTgAlerts, resolveHotCandidate } from "./native-config"

const SPEC_AP = { enabled: true, passThreshold: 40, aiEvalThreshold: 55, transferMode: "message", contentBlockId: "sb", messageText: "spec-msg", delaySeconds: 300, passScreenTitle: "s-pass", passScreenText: "s-passtext", failScreenTitle: "s-fail", failScreenText: "s-failtext", failAction: "pending_rejection", failRejectDelayMinutes: 30, inlineContinue: false, passScreenButtonLabel: "→", advanceToStage: null, hhAction: null }

test("resolveEffectiveAnketaPassInvite: движок выключен → берём Портрет как есть", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage2: { enabled: true, passThreshold: 10 } })
  const eff = resolveEffectiveAnketaPassInvite(SPEC_AP, cfg, false)
  assert.equal(eff?.passThreshold, 40) // из spec, не из native
})

test("resolveEffectiveAnketaPassInvite: движок включён + есть stage2 → native", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], stage2: { enabled: true, passThreshold: 10, aiEvalThreshold: 20, transferMode: "seamless", contentBlockId: "nb", messageText: "n-msg", delaySeconds: 60, failAction: "none", failRejectDelayMinutes: 15 } })
  const eff = resolveEffectiveAnketaPassInvite(SPEC_AP, cfg, true)
  assert.equal(eff?.passThreshold, 10)
  assert.equal(eff?.transferMode, "seamless")
  assert.equal(eff?.contentBlockId, "nb")
  assert.equal(eff?.messageText, "n-msg")
  assert.equal(eff?.failAction, "none")
})

test("resolveEffectiveAnketaPassInvite: движок включён, но stage2 нет → Портрет (обратная совместимость)", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [] })
  const eff = resolveEffectiveAnketaPassInvite(SPEC_AP, cfg, true)
  assert.equal(eff?.passThreshold, 40)
})

test("resolveTgAlerts / resolveHotCandidate: native при v2, spec иначе", () => {
  const cfg = normalizeFunnelV2({ enabled: true, stages: [], communications: { tgAlerts: { enabled: true, minResumeScore: 88, minAnswersScore: null, onGatePassed: false }, hotCandidate: { enabled: true, threshold: 90, staleAfterHours: 5 } } })
  const specTg = { enabled: false, minResumeScore: 10, minAnswersScore: 20, onGatePassed: true }
  const specHot = { enabled: false, threshold: 60, staleAfterHours: 2 }
  assert.equal(resolveTgAlerts(specTg, cfg, true)?.minResumeScore, 88)
  assert.equal(resolveTgAlerts(specTg, cfg, false)?.minResumeScore, 10)
  assert.equal(resolveHotCandidate(specHot, cfg, true)?.threshold, 90)
  assert.equal(resolveHotCandidate(specHot, cfg, false)?.threshold, 60)
})
```

- [ ] **Step 2: Запустить — падает (функции не определены)**

Run: `pnpm exec tsx --test lib/funnel-v2/native-config.test.ts`
Expected: FAIL — «resolveEffectiveAnketaPassInvite is not a function» (или import error).

- [ ] **Step 3: Дописать резолверы в `lib/funnel-v2/native-config.ts`**

В конец файла добавить:

```ts
// ── Стадия 2: эффективный anketaPassInvite (native при v2, Портрет иначе) ───────
// Возвращаем объект В ФОРМЕ spec.anketaPassInvite, чтобы вызывающие рантайм-места
// (second-demo-invite / demo-route / answer-route) работали без изменения логики.
// Поля, которые нативно НЕ переносятся (advanceToStage / hhAction / inlineContinue /
// passScreenButtonLabel), берём из spec (или дефолты) — модель маршрутизации hh
// остаётся за Портретом.
export interface EffectiveAnketaPassInvite {
  enabled: boolean
  passThreshold: number
  aiEvalThreshold: number
  transferMode: "seamless" | "message" | "both"
  contentBlockId: string | null
  passScreenTitle: string
  passScreenText: string
  passScreenButtonLabel: string
  messageText: string
  delaySeconds: number
  failScreenTitle: string
  failScreenText: string
  failAction: "none" | "pending_manual" | "pending_rejection"
  failRejectDelayMinutes: number
  inlineContinue: boolean
  advanceToStage: string | null
  hhAction: "assessment" | "interview" | "consider" | "invitation" | null
}

export function resolveEffectiveAnketaPassInvite(
  specAp: Record<string, unknown> | null | undefined,
  config: FunnelV2Config,
  runtimeEnabled: boolean,
): EffectiveAnketaPassInvite | null {
  const spec = specAp ?? null
  const useNative = runtimeEnabled && config.stage2 != null
  const s2 = config.stage2 ?? {}
  const specNum = (k: string, d: number): number => (typeof spec?.[k] === "number" ? spec![k] as number : d)
  const specStr = (k: string): string => (typeof spec?.[k] === "string" ? spec![k] as string : "")
  const specHhAction = (spec?.hhAction === "assessment" || spec?.hhAction === "interview" || spec?.hhAction === "consider" || spec?.hhAction === "invitation") ? spec.hhAction : null
  const specAdvance = typeof spec?.advanceToStage === "string" ? spec.advanceToStage : null

  if (!useNative) {
    if (!spec) return null
    return {
      enabled: spec.enabled === true,
      passThreshold: specNum("passThreshold", DEFAULT_STAGE2_PASS_THRESHOLD),
      aiEvalThreshold: specNum("aiEvalThreshold", DEFAULT_STAGE2_AI_EVAL_THRESHOLD),
      transferMode: (spec.transferMode === "seamless" || spec.transferMode === "message" || spec.transferMode === "both") ? spec.transferMode : "both",
      contentBlockId: typeof spec.contentBlockId === "string" ? spec.contentBlockId : null,
      passScreenTitle: specStr("passScreenTitle"),
      passScreenText: specStr("passScreenText"),
      passScreenButtonLabel: specStr("passScreenButtonLabel"),
      messageText: specStr("messageText"),
      delaySeconds: specNum("delaySeconds", DEFAULT_STAGE2_DELAY_SECONDS),
      failScreenTitle: specStr("failScreenTitle"),
      failScreenText: specStr("failScreenText"),
      failAction: (spec.failAction === "pending_manual" || spec.failAction === "pending_rejection") ? spec.failAction : "none",
      failRejectDelayMinutes: specNum("failRejectDelayMinutes", DEFAULT_STAGE2_FAIL_REJECT_DELAY_MIN),
      inlineContinue: spec.inlineContinue !== false,
      advanceToStage: specAdvance,
      hhAction: specHhAction,
    }
  }

  // NATIVE (движок v2 включён): поведенческие поля из stage2, маршрутизация hh — из spec.
  return {
    enabled: s2.enabled ?? false,
    passThreshold: s2.passThreshold ?? DEFAULT_STAGE2_PASS_THRESHOLD,
    aiEvalThreshold: s2.aiEvalThreshold ?? DEFAULT_STAGE2_AI_EVAL_THRESHOLD,
    transferMode: s2.transferMode ?? "both",
    contentBlockId: s2.contentBlockId ?? null,
    passScreenTitle: s2.passScreenTitle ?? "",
    passScreenText: s2.passScreenText ?? "",
    passScreenButtonLabel: specStr("passScreenButtonLabel"),
    messageText: s2.messageText ?? "",
    delaySeconds: s2.delaySeconds ?? DEFAULT_STAGE2_DELAY_SECONDS,
    failScreenTitle: s2.failScreenTitle ?? "",
    failScreenText: s2.failScreenText ?? "",
    failAction: s2.failAction ?? "none",
    failRejectDelayMinutes: s2.failRejectDelayMinutes ?? DEFAULT_STAGE2_FAIL_REJECT_DELAY_MIN,
    inlineContinue: (s2.transferMode ?? "both") !== "message",
    advanceToStage: specAdvance,
    hhAction: specHhAction,
  }
}

// ── Коммуникации: TG-уведомления и «горячий кандидат» ──────────────────────────
export interface EffectiveTgAlerts { enabled: boolean; minResumeScore: number | null; minAnswersScore: number | null; onGatePassed: boolean }
export interface EffectiveHotCandidate { enabled: boolean; threshold: number; staleAfterHours: number }

export function resolveTgAlerts(
  specTg: Record<string, unknown> | null | undefined,
  config: FunnelV2Config,
  runtimeEnabled: boolean,
): EffectiveTgAlerts | null {
  if (runtimeEnabled && config.communications?.tgAlerts) return config.communications.tgAlerts
  if (!specTg) return null
  return {
    enabled: specTg.enabled === true,
    minResumeScore: typeof specTg.minResumeScore === "number" ? specTg.minResumeScore : null,
    minAnswersScore: typeof specTg.minAnswersScore === "number" ? specTg.minAnswersScore : null,
    onGatePassed: specTg.onGatePassed !== false,
  }
}

export function resolveHotCandidate(
  specHot: Record<string, unknown> | null | undefined,
  config: FunnelV2Config,
  runtimeEnabled: boolean,
): EffectiveHotCandidate | null {
  if (runtimeEnabled && config.communications?.hotCandidate) return config.communications.hotCandidate
  if (!specHot) return null
  return {
    enabled: specHot.enabled === true,
    threshold: typeof specHot.threshold === "number" ? specHot.threshold : DEFAULT_HOT_CANDIDATE_THRESHOLD,
    staleAfterHours: typeof specHot.staleAfterHours === "number" ? specHot.staleAfterHours : 3,
  }
}
```

- [ ] **Step 4: Запустить весь тест-файл — зелёный**

Run: `pnpm exec tsx --test lib/funnel-v2/native-config.test.ts`
Expected: PASS (8 тестов).

- [ ] **Step 5: Commit**

```bash
git add lib/funnel-v2/native-config.ts lib/funnel-v2/native-config.test.ts
git commit -m "feat(funnel-v2): native-config — резолверы Стадии 2, TG-алертов и горячего кандидата"
```

---

### Task 5: Добавить оба новых тест-файла в `pnpm test`

**Files:**
- Modify: `package.json` (скрипт `test`)

- [ ] **Step 1: Дописать пути в скрипт test**

В `package.json`, в конец списка файлов скрипта `"test"` (перед закрывающей кавычкой, после `lib/funnel-v2/authz.test.ts`) добавить через пробел:

```
lib/funnel-v2/normalize-native.test.ts lib/funnel-v2/native-config.test.ts
```

- [ ] **Step 2: Прогнать весь набор**

Run: `pnpm test 2>&1 | tail -5`
Expected: все тесты PASS (существующие + 12 новых), ненулевого числа fail нет.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "test(funnel-v2): подключить native-config тесты в pnpm test"
```

---

## ЧАСТЬ 2 — UI конструктора

> Все панели живут в `components/vacancies/funnel-v2-builder.tsx`. Стиль строго как в существующем `StageSheet`: `FieldRow` для строк «подпись+контрол», `Select`/`Switch`/`Input`/`Textarea` из `@/components/ui/*`, классы `h-11 text-base` для инпутов, `text-xs text-muted-foreground` для подписей. Все правки конфига идут через `update(next)` (debounced-persist уже реализован).

### Task 6: Редактируемая карточка Стадии 1 (замена read-only врезки)

**Files:**
- Modify: `components/vacancies/funnel-v2-builder.tsx`

- [ ] **Step 1: Импортировать резолвер и типы Стадии 1**

В блоке импортов из `@/lib/funnel-v2/types` (строки 44–52) добавить к списку типов:

```ts
  type FunnelV2Stage1, type FunnelV2Stage2, type FunnelV2Communications,
```

Ниже этого импорта добавить новый импорт:

```ts
import { resolveStage1, prefillNativeFromSpec, DEFAULT_HOT_CANDIDATE_THRESHOLD } from "@/lib/funnel-v2/native-config"
```

- [ ] **Step 2: Добавить компонент-панель Стадии 1**

Перед `// ── Главный конструктор ──` (строка ~682) вставить компонент:

```tsx
// ── Панель Стадии 1 «Отклик → приглашение» (нативные редактируемые поля) ──────
// Заменяет вчерашние read-only бэджи задержки/нерабочего времени: теперь это
// собственные поля funnelV2.stage1, а не чтение из Портрета. Пороги отбора по
// баллу и авто-приглашение остаются в Портрете (модель скоринга) — показываем
// их read-only строкой со ссылкой «Открыть Портрет».
function Stage1Card({ stage1, summary, loading, onChange, onOpenPortrait }: {
  stage1: FunnelV2Stage1
  summary: SpecSummary | null
  loading: boolean
  onChange: (s: FunnelV2Stage1) => void
  onOpenPortrait?: () => void
}) {
  const patch = (p: Partial<FunnelV2Stage1>) => onChange({ ...stage1, ...p })
  const inviteDelay = stage1.inviteDelaySeconds ?? 180
  const offEnabled = stage1.offHoursEnabled ?? true
  const offDelay = stage1.offHoursDelaySeconds ?? 15
  const rejectDelay = stage1.rejectionDelayMinutes ?? 60
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">Стадия 1 · Отклик → приглашение на демо</span>
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-auto">входной скан</span>
      </div>

      {/* Пороги/авто-приглашение — read-only из Портрета (модель скоринга) */}
      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground/80">
        <span className="text-[11px]">Пороги балла и авто-приглашение — в Портрете</span>
        {onOpenPortrait && <button onClick={onOpenPortrait} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">Открыть Портрет <ExternalLink className="w-3 h-3" /></button>}
        {loading ? <span className="text-[11px] inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> …</span>
          : summary ? (<>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60">пороги &lt;{summary.lower ?? 40} / ≥{summary.upper ?? 75}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60">зона отказа: {summary.rejectAction === "pending_rejection" ? "авто-отказ" : summary.rejectAction === "pending_manual" ? "ручной разбор" : "выкл"}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60">авто-приглашение {summary.autoInvite ? "вкл" : "выкл"}</span>
            {summary.stops.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60">стоп: {summary.stops.join(", ")}</span>}
          </>) : <span className="text-[10px] text-muted-foreground/60">Портрет не настроен → проходят все</span>}
      </div>

      {/* Нативные редактируемые поля тайминга/текстов */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
        <FieldRow label="Задержка первого сообщения, сек">
          <div className="flex items-center gap-1.5">
            <Input type="number" min={0} value={inviteDelay} onChange={e => patch({ inviteDelaySeconds: Math.max(0, Number(e.target.value) || 0) })} className="w-24 h-10 text-base" />
            <span className="text-[11px] text-muted-foreground">{fmtDelay(inviteDelay)}</span>
          </div>
        </FieldRow>
        <FieldRow label="Слать в нерабочее время">
          <Switch checked={offEnabled} onCheckedChange={v => patch({ offHoursEnabled: v })} />
        </FieldRow>
        {offEnabled && (
          <>
            <FieldRow label="Задержка в нерабочее время, сек">
              <div className="flex items-center gap-1.5">
                <Input type="number" min={0} value={offDelay} onChange={e => patch({ offHoursDelaySeconds: Math.max(0, Number(e.target.value) || 0) })} className="w-24 h-10 text-base" />
                <span className="text-[11px] text-muted-foreground">{fmtDelay(offDelay)}</span>
              </div>
            </FieldRow>
            <FieldRow label="Текст в нерабочее время" align="top">
              <Textarea value={stage1.offHoursText ?? ""} onChange={e => patch({ offHoursText: e.target.value })} placeholder="Мягкое подтверждение: «{{name}}, спасибо за отклик! Ответим утром.»" className="min-h-[80px] text-base md:text-base" />
            </FieldRow>
          </>
        )}
        <FieldRow label="Текст авто-отказа" align="top">
          <Textarea value={stage1.rejectLetter ?? ""} onChange={e => patch({ rejectLetter: e.target.value })} placeholder="Пусто → стандартный мягкий текст отказа" className="min-h-[80px] text-base md:text-base" />
        </FieldRow>
        <FieldRow label="Задержка отказа, мин">
          <div className="flex items-center gap-2">
            <Input type="number" min={0} value={rejectDelay} onChange={e => patch({ rejectionDelayMinutes: Math.max(0, Number(e.target.value) || 0) })} className="w-24 h-10 text-base" />
            {rejectDelay >= 60 && <span className="text-[11px] text-muted-foreground">= {Math.floor(rejectDelay / 60)} ч{rejectDelay % 60 ? ` ${rejectDelay % 60} мин` : ""}</span>}
          </div>
        </FieldRow>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Добавить обработчик изменения Стадии 1 в главном компоненте**

В `FunnelV2Builder`, рядом с `changeStage` (строка ~852), добавить:

```tsx
  const changeStage1 = (s1: FunnelV2Stage1) => { if (!config) return; update({ ...config, stage1: s1 }) }
  const changeStage2 = (s2: FunnelV2Stage2) => { if (!config) return; update({ ...config, stage2: s2 }) }
  const changeCommunications = (c: FunnelV2Communications) => { if (!config) return; update({ ...config, communications: c }) }
```

- [ ] **Step 4: Заменить рендер `PortraitStageCard` на `Stage1Card`**

Найти (строка ~931):

```tsx
      <PortraitStageCard summary={summary} loading={specLoading} onOpen={onOpenPortrait} />
```

Заменить на:

```tsx
      <Stage1Card stage1={config?.stage1 ?? {}} summary={summary} loading={specLoading} onChange={changeStage1} onOpenPortrait={onOpenPortrait} />
```

> `PortraitStageCard` и её `interface SpecSummary`/`fmtDelay` НЕ удаляем — `SpecSummary` и `fmtDelay` используются `Stage1Card`. Сам `PortraitStageCard` становится неиспользуемым; оставить с комментарием `// (устарело, заменён Stage1Card — оставлено для истории)` ИЛИ удалить. Рекомендация: удалить `PortraitStageCard` (строки ~659–680), оставив `interface SpecSummary` и `fmtDelay`.

- [ ] **Step 5: Собрать фронт (тайпчек затронутого)**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "funnel-v2-builder" | head`
Expected: пусто.

- [ ] **Step 6: Commit**

```bash
git add components/vacancies/funnel-v2-builder.tsx
git commit -m "feat(funnel-v2): редактируемая карточка Стадии 1 (задержка/нерабочее/тексты)"
```

---

### Task 7: Панель Стадии 2 «Переход на 2-ю часть»

**Files:**
- Modify: `components/vacancies/funnel-v2-builder.tsx`

- [ ] **Step 1: Добавить компонент `Stage2Card`**

Перед `// ── Главный конструктор ──` (после `Stage1Card`) вставить:

```tsx
// ── Панель Стадии 2 «Демо 1-я часть → переход на 2-ю часть» (нативные поля) ────
// Зеркало spec.anketaPassInvite. Гейт срабатывает на сабмите анкеты демо; при
// включённом движке v2 рантайм читает эти поля (см. native-config.ts).
const STAGE2_TRANSFER_OPTS: Array<{ v: "seamless" | "message" | "both"; label: string }> = [
  { v: "both", label: "Бесшовно + письмо (рекомендуется)" },
  { v: "seamless", label: "Только бесшовно (на странице)" },
  { v: "message", label: "Только письмом" },
]
const STAGE2_FAIL_OPTS: Array<{ v: "none" | "pending_manual" | "pending_rejection"; label: string }> = [
  { v: "none", label: "Ничего (мягкий экран «Спасибо»)" },
  { v: "pending_manual", label: "Ручной разбор HR" },
  { v: "pending_rejection", label: "Отложенный авто-отказ" },
]
function Stage2Card({ stage2, content, onChange }: {
  stage2: FunnelV2Stage2
  content: ContentBlock[]
  onChange: (s: FunnelV2Stage2) => void
}) {
  const patch = (p: Partial<FunnelV2Stage2>) => onChange({ ...stage2, ...p })
  const enabled = stage2.enabled ?? false
  const transferMode = stage2.transferMode ?? "both"
  const failAction = stage2.failAction ?? "none"
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Route className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">Стадия 2 · Переход на 2-ю часть демо</span>
        <Switch checked={enabled} onCheckedChange={v => patch({ enabled: v })} className="ml-auto" />
      </div>
      {enabled && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
          <FieldRow label="Порог правильных ответов">
            <div className="flex items-center gap-1.5">
              <Input type="number" min={0} max={100} value={stage2.passThreshold ?? 35} onChange={e => patch({ passThreshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-20 h-10 text-base" />
              <span className="text-[11px] text-muted-foreground w-8">%</span>
            </div>
          </FieldRow>
          <FieldRow label="Порог AI-оценки ответов">
            <div className="flex items-center gap-1.5">
              <Input type="number" min={0} max={100} value={stage2.aiEvalThreshold ?? 45} onChange={e => patch({ aiEvalThreshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-20 h-10 text-base" />
              <span className="text-[11px] text-muted-foreground w-8">из 100</span>
            </div>
          </FieldRow>
          <p className="text-[11px] text-muted-foreground/80">Проходит во 2-ю часть, если взят <b>любой</b> из двух порогов (ИЛИ-гейт).</p>
          <FieldRow label="Блок «2-я часть»">
            <Select value={stage2.contentBlockId ?? "none"} onValueChange={v => patch({ contentBlockId: v === "none" ? null : v })}>
              <SelectTrigger className="h-11 text-base"><SelectValue placeholder="боевой блок" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— боевой блок —</SelectItem>
                {content.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Способ перевода">
            <Select value={transferMode} onValueChange={v => patch({ transferMode: v as "seamless" | "message" | "both" })}>
              <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>{STAGE2_TRANSFER_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </FieldRow>
          {(transferMode === "seamless" || transferMode === "both") && (
            <>
              <FieldRow label="Плашка: заголовок">
                <Input value={stage2.passScreenTitle ?? ""} onChange={e => patch({ passScreenTitle: e.target.value })} placeholder="Вы молодец!" className="h-11 text-base" />
              </FieldRow>
              <FieldRow label="Плашка: текст" align="top">
                <Textarea value={stage2.passScreenText ?? ""} onChange={e => patch({ passScreenText: e.target.value })} placeholder="Вы прошли первую часть. Продолжим — впереди 2-я часть демо." className="min-h-[70px] text-base md:text-base" />
              </FieldRow>
            </>
          )}
          {(transferMode === "message" || transferMode === "both") && (
            <>
              <FieldRow label="Письмо-приглашение" align="top">
                <Textarea value={stage2.messageText ?? ""} onChange={e => patch({ messageText: e.target.value })} placeholder="{{name}}, отлично — вы прошли первую часть! Следующий шаг: {{demo_link}}" className="min-h-[80px] text-base md:text-base" />
              </FieldRow>
              <FieldRow label="Задержка письма, сек">
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={0} value={stage2.delaySeconds ?? 900} onChange={e => patch({ delaySeconds: Math.max(0, Number(e.target.value) || 0) })} className="w-24 h-10 text-base" />
                  <span className="text-[11px] text-muted-foreground">{fmtDelay(stage2.delaySeconds ?? 900)}</span>
                </div>
              </FieldRow>
            </>
          )}
          <div className="rounded-lg bg-muted/40 p-3 space-y-2.5">
            <span className="text-xs font-medium text-rose-700 dark:text-rose-400">Не прошёл гейт →</span>
            <FieldRow label="Экран «Спасибо»: заголовок">
              <Input value={stage2.failScreenTitle ?? ""} onChange={e => patch({ failScreenTitle: e.target.value })} placeholder="Спасибо!" className="h-11 text-base" />
            </FieldRow>
            <FieldRow label="Экран «Спасибо»: текст" align="top">
              <Textarea value={stage2.failScreenText ?? ""} onChange={e => patch({ failScreenText: e.target.value })} placeholder="Пусто → стандартный финальный экран демо" className="min-h-[70px] text-base md:text-base" />
            </FieldRow>
            <FieldRow label="Действие">
              <Select value={failAction} onValueChange={v => patch({ failAction: v as "none" | "pending_manual" | "pending_rejection" })}>
                <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>{STAGE2_FAIL_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </FieldRow>
            {failAction === "pending_rejection" && (
              <FieldRow label="Задержка отказа, мин">
                <Input type="number" min={1} value={stage2.failRejectDelayMinutes ?? 60} onChange={e => patch({ failRejectDelayMinutes: Math.max(1, Number(e.target.value) || 60) })} className="w-24 h-10 text-base" />
              </FieldRow>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Отрендерить `Stage2Card` после списка стадий**

В `FunnelV2Builder`, сразу ПОСЛЕ блока `<DndContext>…</DndContext>` (закрывающий тег на строке ~975), перед `<DropdownMenu>`, вставить:

```tsx
      <Stage2Card stage2={config?.stage2 ?? {}} content={content} onChange={changeStage2} />
```

- [ ] **Step 3: Тайпчек**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "funnel-v2-builder" | head`
Expected: пусто.

- [ ] **Step 4: Commit**

```bash
git add components/vacancies/funnel-v2-builder.tsx
git commit -m "feat(funnel-v2): панель Стадии 2 — переход на 2-ю часть (пороги/плашка/письмо/экран)"
```

---

### Task 8: Секция «Коммуникации воронки» (TG + горячий кандидат + embed стоп-слов/FAQ)

**Files:**
- Modify: `components/vacancies/funnel-v2-builder.tsx`

- [ ] **Step 1: Импортировать `AutoResponderSettings`**

В блок импортов `funnel-v2-builder.tsx` добавить:

```ts
import { AutoResponderSettings } from "@/components/vacancies/auto-responder-settings"
```

> Проверить путь: компонент импортируется в `spec-editor.tsx` как `from "./auto-responder-settings"`, т.е. лежит в `components/vacancies/auto-responder-settings.tsx`. Значит абсолютный путь `@/components/vacancies/auto-responder-settings` корректен. `AutoResponderSettings` принимает `vacancyId: string` (см. использование `<AutoResponderSettings vacancyId={vacancyId} />`).

- [ ] **Step 2: Добавить компонент `CommunicationsCard`**

Перед `// ── Главный конструктор ──` (после `Stage2Card`) вставить:

```tsx
// ── Секция «Коммуникации воронки» ─────────────────────────────────────────────
// Нативные поля funnelV2.communications: TG-уведомления о подходящих кандидатах
// и «горячий кандидат стынет» (перенос из Портрета). Стоп-слова и FAQ — через
// встроенный AutoResponderSettings (общее режимо-независимое хранилище).
function CommunicationsCard({ vacancyId, comms, onChange }: {
  vacancyId: string
  comms: FunnelV2Communications
  onChange: (c: FunnelV2Communications) => void
}) {
  const tg = comms.tgAlerts ?? { enabled: false, minResumeScore: null, minAnswersScore: null, onGatePassed: true }
  const hot = comms.hotCandidate ?? { enabled: false, threshold: DEFAULT_HOT_CANDIDATE_THRESHOLD, staleAfterHours: 3 }
  const patchTg = (p: Partial<typeof tg>) => onChange({ ...comms, tgAlerts: { ...tg, ...p } })
  const patchHot = (p: Partial<typeof hot>) => onChange({ ...comms, hotCandidate: { ...hot, ...p } })
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">Коммуникации воронки</span>
      </div>

      {/* Стоп-слова + частые вопросы (общее хранилище, работает во всех режимах) */}
      <AutoResponderSettings vacancyId={vacancyId} />

      {/* Telegram: подходящие кандидаты */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs font-medium">Telegram: подходящие кандидаты</span>
            <p className="text-[11px] text-muted-foreground/80">Карточка кандидата в канал компании, когда он проходит пороги.</p>
          </div>
          <Switch checked={tg.enabled} onCheckedChange={v => patchTg({ enabled: v })} className="shrink-0" />
        </div>
        {tg.enabled && (
          <>
            <FieldRow label="Мин. балл резюме">
              <Input type="number" min={0} max={100} value={tg.minResumeScore ?? ""} placeholder="—" onChange={e => patchTg({ minResumeScore: e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-24 h-10 text-base" />
            </FieldRow>
            <FieldRow label="Мин. балл ответов">
              <Input type="number" min={0} max={100} value={tg.minAnswersScore ?? ""} placeholder="—" onChange={e => patchTg({ minAnswersScore: e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-24 h-10 text-base" />
            </FieldRow>
            <FieldRow label="Слать при прохождении гейта">
              <Switch checked={tg.onGatePassed} onCheckedChange={v => patchTg({ onGatePassed: v })} />
            </FieldRow>
          </>
        )}
      </div>

      {/* Горячий кандидат стынет */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs font-medium">Горячий кандидат стынет</span>
            <p className="text-[11px] text-muted-foreground/80">Уведомить HR, если кандидат с высоким баллом открыл демо и застыл.</p>
          </div>
          <Switch checked={hot.enabled} onCheckedChange={v => patchHot({ enabled: v })} className="shrink-0" />
        </div>
        {hot.enabled && (
          <>
            <FieldRow label="Порог «высокого» балла">
              <Input type="number" min={0} max={100} value={hot.threshold} onChange={e => patchHot({ threshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="w-24 h-10 text-base" />
            </FieldRow>
            <FieldRow label="Часов бездействия до алерта">
              <Input type="number" min={1} max={72} value={hot.staleAfterHours} onChange={e => patchHot({ staleAfterHours: Math.max(1, Math.min(72, Number(e.target.value) || 1)) })} className="w-24 h-10 text-base" />
            </FieldRow>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Отрендерить `CommunicationsCard`**

В `FunnelV2Builder`, сразу после `<Stage2Card … />` (из Task 7 Step 2), вставить:

```tsx
      <CommunicationsCard vacancyId={vacancyId} comms={config?.communications ?? {}} onChange={changeCommunications} />
```

- [ ] **Step 4: Тайпчек**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "funnel-v2-builder" | head`
Expected: пусто.

- [ ] **Step 5: Commit**

```bash
git add components/vacancies/funnel-v2-builder.tsx
git commit -m "feat(funnel-v2): секция «Коммуникации воронки» (TG, горячий кандидат, стоп-слова/FAQ)"
```

---

## ЧАСТЬ 3 — Предзаполнение при первом открытии

### Task 9: Однократный prefill из Портрета + персист снапшота

**Files:**
- Modify: `components/vacancies/funnel-v2-builder.tsx`

**Контекст:** Билдер уже грузит `config` (эффект на строке ~726) и `spec` (эффект на строке ~813, кладёт `summary`). Нужно: когда оба загружены и `config` НЕ содержит `stage1/stage2/communications` — вызвать `prefillNativeFromSpec`, обновить состояние и один раз персистить снапшот (чтобы зафиксировать независимость с момента открытия).

- [ ] **Step 1: Сохранять сырой spec-объект (не только summary) для prefill**

В `FunnelV2Builder` добавить состояние рядом с `const [summary, setSummary] = useState<SpecSummary | null>(null)` (строка ~685):

```tsx
  const [rawSpec, setRawSpec] = useState<Record<string, unknown> | null>(null)
  const prefilledRef = useRef(false)
```

В эффекте загрузки spec (строка ~815) внутри `.then`, сразу после `const spec = d?.spec; if (!spec) { setSummary(null); return }` добавить:

```tsx
        setRawSpec(spec)
```

- [ ] **Step 2: Добавить эффект prefill (после эффекта загрузки config и spec)**

После эффекта загрузки spec (после строки ~831, закрывающей его `}, [vacancyId])`) добавить:

```tsx
  // Однократное предзаполнение нативных полей копией Портрета при первом открытии
  // конструктора. Срабатывает, когда загружены и config, и spec, и хотя бы один
  // из блоков stage1/stage2/communications ещё не сохранён. persist снапшота
  // фиксирует независимость: дальше изменения в Портрете на воронку не влияют.
  useEffect(() => {
    if (prefilledRef.current) return
    if (!config || !rawSpec) return
    if (config.stage1 && config.stage2 && config.communications) { prefilledRef.current = true; return }
    const { changed, config: filled } = prefillNativeFromSpec(config, rawSpec)
    prefilledRef.current = true
    if (changed) { setConfig(filled); persist(filled) }
  }, [config, rawSpec, persist])
```

> Примечание: `persist` объявлен как `useCallback` на строке ~833 — эффект должен идти ПОСЛЕ его объявления по порядку в теле компонента, иначе TDZ-ошибка. Разместить этот `useEffect` сразу после `const update = useCallback(…)` (строка ~844), а `rawSpec`/`prefilledRef` — в секции состояний. Если линтер ругается на порядок хуков — перенести эффект ниже `update`.

- [ ] **Step 3: Собрать и проверить визуально**

Run: `pnpm build 2>&1 | tail -20`
Expected: сборка проходит (Compiled successfully / без ошибок в этих файлах).

Затем — визуальная проверка в браузере (playwright MCP / залогиненный Chrome):
1. Открыть вакансию → Настройки → «Воронка v2» на вакансии с настроенным Портретом.
2. Убедиться: карточка Стадии 1 показывает задержку/нерабочее/тексты, предзаполненные значениями Портрета; Стадия 2 — пороги/тексты из anketaPassInvite; Коммуникации — TG/hot из Портрета.
3. Изменить значение в Стадии 1 → в Портрете оно НЕ меняется (независимость).

- [ ] **Step 4: Commit**

```bash
git add components/vacancies/funnel-v2-builder.tsx
git commit -m "feat(funnel-v2): предзаполнение нативных полей из Портрета при первом открытии"
```

---

## ЧАСТЬ 4 — Рантайм: чтение нативных полей вместо Портрета

> Общий принцип каждой правки: добавить ветку «если движок v2 включён → читать native, иначе → как раньше (spec)». Портрет и легаси-путь не трогаем.

### Task 10: Стадия 1 — нерабочее время и задержка первого сообщения из native (process-queue)

**Files:**
- Modify: `lib/hh/process-queue.ts`

**Контекст:** v2-гейт на строке ~1282. Вчерашняя off-hours-пауза читает `localVac.firstMessageOffHours*` (зеркало Портрета) на строках ~1350–1362. Задача — при `funnelV2RuntimeEnabled` читать нативный `funnelV2.stage1` вместо vacancy-колонок.

- [ ] **Step 1: Внутри v2-гейта резолвить нативную Стадию 1 из уже нормализованного `funnelV2`**

В блоке `if (funnelV2.enabled && firstStageEnabled) { … }` (после `const funnelV2 = normalizeFunnelV2(descJson?.funnelV2)` на строке ~1286) добавить:

```ts
          const { resolveStage1 } = await import("@/lib/funnel-v2/native-config")
          const nativeStage1 = resolveStage1(funnelV2)
```

- [ ] **Step 2: Переключить off-hours delay/text на native**

Найти блок (строки ~1350–1362):

```ts
              let offHoursSoftText: string | null = null
              if (offHoursSoftMode) {
                const { resolveV2FirstMessageDelayMs, DEFAULT_OFF_HOURS_DELAY_SECONDS, resolveOffHoursSoftText } =
                  await import("@/lib/funnel-v2/first-message-timing")
                const offDelayMs = resolveV2FirstMessageDelayMs(localVac, {
                  enabled:      localVac.firstMessageOffHoursEnabled === true,
                  delaySeconds: typeof localVac.firstMessageOffHoursDelaySeconds === "number"
                    ? localVac.firstMessageOffHoursDelaySeconds
                    : DEFAULT_OFF_HOURS_DELAY_SECONDS,
                })
                if (offDelayMs > 0) await sleep(offDelayMs)
                offHoursSoftText = resolveOffHoursSoftText(localVac, md.offHoursMessage)
              }
```

Заменить на:

```ts
              // Стадия 1 воронки v2 — нативные поля funnelV2.stage1 (перенос из
              // Портрета 14.07). Раньше здесь читались vacancy-колонки-зеркала
              // Портрета; теперь при включённом движке v2 источник — native.
              let offHoursSoftText: string | null = null
              if (offHoursSoftMode) {
                const { resolveV2FirstMessageDelayMs } =
                  await import("@/lib/funnel-v2/first-message-timing")
                const offDelayMs = resolveV2FirstMessageDelayMs(localVac, {
                  enabled:      nativeStage1.offHoursEnabled,
                  delaySeconds: nativeStage1.offHoursDelaySeconds,
                })
                if (offDelayMs > 0) await sleep(offDelayMs)
                // Текст мягкого подтверждения: нативный (stage1.offHoursText) либо,
                // если пуст, эффективный дефолт компании (md.offHoursMessage).
                offHoursSoftText = nativeStage1.offHoursText.trim().length > 0
                  ? nativeStage1.offHoursText
                  : md.offHoursMessage
              }
```

> `resolveOffHoursSoftText` больше не нужен в этой точке (native уже даёт текст). `DEFAULT_OFF_HOURS_DELAY_SECONDS` тут больше не используется. Импорт оставить как есть в `first-message-timing.ts` — он используется в тестах и, возможно, других местах; лишний импорт из этого блока просто убран.

- [ ] **Step 3: Тайпчек затронутого файла**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "process-queue" | head`
Expected: пусто.

- [ ] **Step 4: Commit**

```bash
git add lib/hh/process-queue.ts
git commit -m "feat(funnel-v2): рантайм Стадии 1 читает нерабочее время/задержку из native"
```

> **Заметка о задержке в рабочее время (`inviteDelaySeconds`).** В рабочее время пауза применяется как DEFERRAL ДО входа в v2 (строка ~279, `shouldDeferFirstMessage(resp.createdAt, localVac.firstMessagesChain, new Date(), md.firstMessageDelaySeconds)`). Это общий для легаси и v2 механизм отсрочки, до того как известно, пойдёт ли кандидат по v2. Переносить его на native здесь НЕ требуется: `first_messages_chain[0].delaySeconds` — зеркало Портрета, и `prefill` копирует то же значение в `stage1.inviteDelaySeconds`, поэтому фактическая задержка совпадает. Полное переключение deferral на native (обход `firstMessagesChain`) — отдельная микрозадача, вынесена за рамки батча, чтобы не трогать общий deferral легаси-пути (риск двойной/пропавшей задержки). Поле `stage1.inviteDelaySeconds` в UI редактируемо и отражает Портрет; его самостоятельная развязка от Портрета — follow-up.

---

### Task 11: Стадия 1 — текст и задержка авто-отказа из native (process-queue)

**Files:**
- Modify: `lib/hh/process-queue.ts`

**Контекст:** авто-отказ по баллу резюме считается в ветке `belowThreshold` (строки ~1019+). Текст отказа читается на строке 755 (`rejectLetterText = spec.rejectLetter?.trim() || null`), задержка — `belowThreshold.delayMinutes` (строка 950) / `rejectionDelayMinutes(effAiSettings)` (строка 1112). Портрет-контур продолжает считать САМ балл; но при включённом движке v2 текст и задержку отказа берём из `stage1`.

- [ ] **Step 1: Резолвить native Стадии 1 один раз на ответ (до расчёта belowThreshold)**

Найти начало обработки ответа, где объявляется `let rejectLetterText: string | null = null` (строка ~353). Сразу после этой строки добавить резолв нативной Стадии 1 (когда движок v2 включён):

```ts
    // Стадия 1 воронки v2: при включённом движке текст/задержку авто-отказа
    // берём из funnelV2.stage1 (перенос из Портрета 14.07), а не из spec.
    let nativeStage1ForReject: import("@/lib/funnel-v2/native-config").EffectiveStage1 | null = null
    if (localVac?.funnelV2RuntimeEnabled) {
      try {
        const { normalizeFunnelV2 } = await import("@/lib/funnel-v2/types")
        const { resolveStage1 } = await import("@/lib/funnel-v2/native-config")
        const fv2 = normalizeFunnelV2((localVac.descriptionJson as Record<string, unknown> | null)?.funnelV2)
        if (fv2.enabled) nativeStage1ForReject = resolveStage1(fv2)
      } catch { nativeStage1ForReject = null }
    }
```

- [ ] **Step 2: Переключить текст отказа на native при v2**

Найти (строка ~755):

```ts
                if (portraitOn && spec) rejectLetterText = spec.rejectLetter?.trim() || null
```

Заменить на:

```ts
                if (portraitOn && spec) rejectLetterText = spec.rejectLetter?.trim() || null
                // v2: нативный текст отказа Стадии 1 побеждает Портрет (если задан).
                if (nativeStage1ForReject && nativeStage1ForReject.rejectLetter.trim().length > 0) {
                  rejectLetterText = nativeStage1ForReject.rejectLetter.trim()
                }
```

- [ ] **Step 3: Переключить задержку отложенного отказа на native при v2**

Найти в ветке `portrait_pending_reject` вызов `scheduleRejection` (строка ~1105):

```ts
          await scheduleRejection({
```

Внутри его аргументов найти строку `delayMinutes: belowThreshold.delayMinutes ?? rejectionDelayMinutes(effAiSettings),` (строка ~1112) и заменить на:

```ts
            delayMinutes: nativeStage1ForReject?.rejectionDelayMinutes
              ?? belowThreshold.delayMinutes ?? rejectionDelayMinutes(effAiSettings),
```

- [ ] **Step 4: Тайпчек**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "process-queue" | head`
Expected: пусто.

- [ ] **Step 5: Commit**

```bash
git add lib/hh/process-queue.ts
git commit -m "feat(funnel-v2): рантайм Стадии 1 читает текст/задержку авто-отказа из native"
```

---

### Task 12: Стадия 2 — гейт «переход на 2-ю часть» из native (second-demo-invite)

**Files:**
- Modify: `lib/messaging/second-demo-invite.ts`

**Контекст:** обе функции (`describeSecondDemoInviteState` ~строка 85 и `maybeScheduleSecondDemoInvite` ~строка 199) читают `const ap = spec?.anketaPassInvite`. Нужно заменить на эффективный конфиг через резолвер.

- [ ] **Step 1: Импортировать резолвер и нормализатор + добавить хелпер загрузки эффективного ap**

В начало файла (рядом с `import { getSpec } from "@/lib/core/spec/store"`, строка ~29) добавить:

```ts
import { resolveEffectiveAnketaPassInvite } from "@/lib/funnel-v2/native-config"
import { normalizeFunnelV2 } from "@/lib/funnel-v2/types"
```

Ниже импортов добавить хелпер (загружает флаг движка + funnelV2 и резолвит эффективный ap; сохраняет форму spec.anketaPassInvite, чтобы дальнейшая логика не менялась):

```ts
/**
 * Эффективный anketaPassInvite для Стадии 2: при включённом движке v2 — из
 * funnelV2.stage2 (перенос 14.07), иначе — spec.anketaPassInvite (Портрет).
 * Возвращает объект в форме spec.anketaPassInvite (или null).
 */
async function loadEffectiveAnketaPassInvite(vacancyId: string): Promise<ReturnType<typeof resolveEffectiveAnketaPassInvite>> {
  const spec = await getSpec(vacancyId)
  const [row] = await db
    .select({ runtimeEnabled: vacancies.funnelV2RuntimeEnabled, descriptionJson: vacancies.descriptionJson })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  const runtimeEnabled = row?.runtimeEnabled === true
  const funnelV2 = normalizeFunnelV2((row?.descriptionJson as Record<string, unknown> | null)?.funnelV2)
  return resolveEffectiveAnketaPassInvite(
    (spec?.anketaPassInvite ?? null) as Record<string, unknown> | null,
    funnelV2,
    runtimeEnabled,
  )
}
```

> Проверить, что `vacancies` и `eq`, `db` уже импортированы в этом файле (они используются в `scheduleSecondDemoDozhim`/`maybeScheduleSecondDemoInvite`). Да — `db`, `vacancies`, `eq`, `and` там используются. Дополнительных импортов не нужно.

- [ ] **Step 2: Переключить `describeSecondDemoInviteState` на эффективный ap**

Найти (строка ~85):

```ts
    const spec = await getSpec(vacancyId)
    const ap = spec?.anketaPassInvite
    if (!ap || ap.enabled !== true) return null
```

Заменить на:

```ts
    const ap = await loadEffectiveAnketaPassInvite(vacancyId)
    if (!ap || ap.enabled !== true) return null
```

- [ ] **Step 3: Переключить `maybeScheduleSecondDemoInvite` на эффективный ap**

Найти (строки ~197–201):

```ts
    // 1. Конфиг из Портрета. Защищаемся от undefined (getSpec не применяет
    //    дефолты схемы — см. инцидент 30.06).
    const spec = await getSpec(args.vacancyId)
    const ap = spec?.anketaPassInvite
    if (!ap || ap.enabled !== true) return { scheduled: false, reason: "disabled" }
```

Заменить на:

```ts
    // 1. Эффективный конфиг Стадии 2: native при движке v2, Портрет иначе.
    const ap = await loadEffectiveAnketaPassInvite(args.vacancyId)
    if (!ap || ap.enabled !== true) return { scheduled: false, reason: "disabled" }
```

> Проверить остаток `maybeScheduleSecondDemoInvite`: после этого места `spec` больше нигде не используется в функции (используются только поля `ap.*`). Если где-то ниже осталась ссылка на `spec.` — заменить на соответствующее поле `ap` или отдельно догрузить. По прочтению функции (строки 192–260) далее используются только `ap.contentBlockId`, `ap.passThreshold`, `ap.aiEvalThreshold` — все присутствуют в `EffectiveAnketaPassInvite`.

- [ ] **Step 4: Тайпчек**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "second-demo-invite" | head`
Expected: пусто.

- [ ] **Step 5: Commit**

```bash
git add lib/messaging/second-demo-invite.ts
git commit -m "feat(funnel-v2): гейт Стадии 2 (переход на 2-ю часть) читает native при движке v2"
```

---

### Task 13: Стадия 2 — экраны и переход на страницах демо из native

**Files:**
- Modify: `app/api/public/demo/[token]/route.ts`
- Modify: `app/api/public/demo/[token]/answer/route.ts`

**Контекст:** GET `/demo/[token]` и POST `/demo/[token]/answer` читают `spec.anketaPassInvite` для плашки/экрана «Спасибо»/бесшовного перехода. Нужно переключить на эффективный конфиг тем же резолвером.

- [ ] **Step 1: Найти чтения `anketaPassInvite` в обоих роутах**

Run:
```bash
grep -n "anketaPassInvite\|getSpec\|resolveTransferMode\|shouldAdvanceInline\|shouldSendPassInviteMessage" app/api/public/demo/\[token\]/route.ts app/api/public/demo/\[token\]/answer/route.ts
```
Ожидаемо: увидеть, где берётся `spec.anketaPassInvite` и как из него читаются `passScreen*`/`failScreen*`/`transferMode`/`contentBlockId`.

- [ ] **Step 2: В `app/api/public/demo/[token]/route.ts` заменить чтение spec.anketaPassInvite на эффективный конфиг**

В месте, где сейчас `const spec = await getSpec(vacancyId)` и далее используется `spec.anketaPassInvite` для экранов/перехода, добавить резолв (в этом роуте уже читается `vacancy.funnelV2RuntimeEnabled` — строка 126, и `normalizeFunnelV2(vacancyDescJson.funnelV2)` — строка 152). Заменить прямое использование `spec.anketaPassInvite` на:

```ts
    // Стадия 2: эффективный конфиг (native при движке v2, Портрет иначе).
    const { resolveEffectiveAnketaPassInvite } = await import("@/lib/funnel-v2/native-config")
    const effectiveAp = resolveEffectiveAnketaPassInvite(
      (spec?.anketaPassInvite ?? null) as Record<string, unknown> | null,
      normalizeFunnelV2(vacancyDescJson.funnelV2),
      vacancy.funnelV2RuntimeEnabled === true,
    )
```

и далее по коду роута заменить обращения `spec.anketaPassInvite.<поле>` / `ap.<поле>` на `effectiveAp?.<поле>` (поля: `enabled`, `transferMode`, `contentBlockId`, `passScreenTitle`, `passScreenText`, `passScreenButtonLabel`, `failScreenTitle`, `failScreenText`). `normalizeFunnelV2` уже импортирован в этом файле (строка ~152 использует его).

> Точную форму подстановки определить по факту чтения кода Step 1 — сохранить существующие фолбэки фронта (пустой title/text → дефолтный финальный экран). Семантика `effectiveAp` идентична `spec.anketaPassInvite`, поэтому изменения точечные (только источник объекта).

- [ ] **Step 3: В `app/api/public/demo/[token]/answer/route.ts` — тот же приём**

Где роут читает `spec.anketaPassInvite` для решения о бесшовном переходе/письме/экране после сабмита анкеты — заменить на `resolveEffectiveAnketaPassInvite(...)`. Загрузить `funnelV2RuntimeEnabled` и `descriptionJson.funnelV2` вакансии (если ещё не в выборке — добавить в существующий `db.select` вакансии `funnelV2RuntimeEnabled: vacancies.funnelV2RuntimeEnabled, descriptionJson: vacancies.descriptionJson`), затем:

```ts
    const { resolveEffectiveAnketaPassInvite } = await import("@/lib/funnel-v2/native-config")
    const { normalizeFunnelV2 } = await import("@/lib/funnel-v2/types")
    const effectiveAp = resolveEffectiveAnketaPassInvite(
      (spec?.anketaPassInvite ?? null) as Record<string, unknown> | null,
      normalizeFunnelV2((vacancyRow.descriptionJson as Record<string, unknown> | null)?.funnelV2),
      vacancyRow.funnelV2RuntimeEnabled === true,
    )
```

и заменить последующие обращения `spec.anketaPassInvite.<поле>` на `effectiveAp?.<поле>`.

> `maybeScheduleSecondDemoInvite` (вызывается из этого роута) уже переключён в Task 12 — двойного переключения нет: там своя загрузка эффективного ap. Здесь переключаем только прямые чтения экранов/перехода в самом роуте.

- [ ] **Step 4: Тайпчек обоих роутов**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "demo/\[token\]" | head`
Expected: пусто.

- [ ] **Step 5: Commit**

```bash
git add "app/api/public/demo/[token]/route.ts" "app/api/public/demo/[token]/answer/route.ts"
git commit -m "feat(funnel-v2): экраны/переход Стадии 2 на страницах демо читают native при движке v2"
```

---

### Task 14: Коммуникации — TG-уведомления из native

**Files:**
- Modify: `lib/telegram/candidate-alert.ts`

**Контекст:** `maybeSendCandidateAlert` (строка ~48) читает `const cfg = spec?.tgCandidateAlerts`. Переключить на `resolveTgAlerts` при движке v2.

- [ ] **Step 1: Заменить чтение spec.tgCandidateAlerts на резолвер**

Найти (строки ~50–52):

```ts
  const spec = await getSpec(vacancyId)
  const cfg = spec?.tgCandidateAlerts
  if (!cfg?.enabled) return
```

Заменить на:

```ts
  const spec = await getSpec(vacancyId)
  // Коммуникации воронки v2: при включённом движке TG-уведомления берём из
  // funnelV2.communications.tgAlerts (перенос из Портрета 14.07), иначе — Портрет.
  const { resolveTgAlerts } = await import("@/lib/funnel-v2/native-config")
  const { normalizeFunnelV2 } = await import("@/lib/funnel-v2/types")
  const [vacRow] = await db
    .select({ runtimeEnabled: vacancies.funnelV2RuntimeEnabled, descriptionJson: vacancies.descriptionJson })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .limit(1)
  const cfg = resolveTgAlerts(
    (spec?.tgCandidateAlerts ?? null) as Record<string, unknown> | null,
    normalizeFunnelV2((vacRow?.descriptionJson as Record<string, unknown> | null)?.funnelV2),
    vacRow?.runtimeEnabled === true,
  )
  if (!cfg?.enabled) return
```

> Проверить импорты: `db`, `vacancies`, `eq` должны быть в файле. Если нет — добавить `import { db } from "@/lib/db"`, `import { vacancies } from "@/lib/db/schema"`, `import { eq } from "drizzle-orm"`. Проверить командой Step 2.

- [ ] **Step 2: Проверить/добить импорты и тайпчек**

Run:
```bash
grep -n "from \"@/lib/db\"\|from \"@/lib/db/schema\"\|from \"drizzle-orm\"" lib/telegram/candidate-alert.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "candidate-alert" | head
```
Expected: импорты присутствуют (или добавлены); тайпчек — пусто.

- [ ] **Step 3: Commit**

```bash
git add lib/telegram/candidate-alert.ts
git commit -m "feat(funnel-v2): TG-уведомления читают native communications при движке v2"
```

---

### Task 15: Коммуникации — «горячий кандидат» из native

**Files:**
- Modify: `lib/demo/hot-candidate-alert.ts`

**Контекст:** цикл по кандидатам (строка ~150) кэширует конфиг из `spec?.hotCandidateAlert` в `specCache` по `vacancy_id`. Переключить на `resolveHotCandidate` при движке v2.

- [ ] **Step 1: Расширить загрузку конфига в кэше на native**

Найти блок (строки ~158–170):

```ts
    let cfg = specCache.get(raw.vacancy_id)
    if (!cfg) {
      const spec = await getSpec(raw.vacancy_id)
      const hot = spec?.hotCandidateAlert
      cfg = {
        enabled: hot?.enabled === true,
        threshold: hot?.threshold ?? PLATFORM_DEFAULT_HOT_CANDIDATE_THRESHOLD,
        staleAfterHours: hot?.staleAfterHours ?? 3,
      }
      specCache.set(raw.vacancy_id, cfg)
      if (cfg.enabled) result.vacanciesEligible++
    }
```

Заменить на:

```ts
    let cfg = specCache.get(raw.vacancy_id)
    if (!cfg) {
      const spec = await getSpec(raw.vacancy_id)
      // При включённом движке v2 берём «горячего кандидата» из
      // funnelV2.communications.hotCandidate (перенос из Портрета 14.07).
      const { resolveHotCandidate } = await import("@/lib/funnel-v2/native-config")
      const { normalizeFunnelV2 } = await import("@/lib/funnel-v2/types")
      const [vacRow] = await db
        .select({ runtimeEnabled: vacancies.funnelV2RuntimeEnabled, descriptionJson: vacancies.descriptionJson })
        .from(vacancies)
        .where(eq(vacancies.id, raw.vacancy_id))
        .limit(1)
      const hot = resolveHotCandidate(
        (spec?.hotCandidateAlert ?? null) as Record<string, unknown> | null,
        normalizeFunnelV2((vacRow?.descriptionJson as Record<string, unknown> | null)?.funnelV2),
        vacRow?.runtimeEnabled === true,
      )
      cfg = {
        enabled: hot?.enabled === true,
        threshold: hot?.threshold ?? PLATFORM_DEFAULT_HOT_CANDIDATE_THRESHOLD,
        staleAfterHours: hot?.staleAfterHours ?? 3,
      }
      specCache.set(raw.vacancy_id, cfg)
      if (cfg.enabled) result.vacanciesEligible++
    }
```

> Проверить импорты `db`/`vacancies`/`eq` в файле (см. командой Step 2), добить при отсутствии.

- [ ] **Step 2: Импорты и тайпчек**

Run:
```bash
grep -n "from \"@/lib/db\"\|from \"@/lib/db/schema\"\|from \"drizzle-orm\"" lib/demo/hot-candidate-alert.ts
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "hot-candidate-alert" | head
```
Expected: импорты присутствуют; тайпчек — пусто.

- [ ] **Step 3: Commit**

```bash
git add lib/demo/hot-candidate-alert.ts
git commit -m "feat(funnel-v2): «горячий кандидат» читает native communications при движке v2"
```

---

## ЧАСТЬ 5 — Финальная проверка

### Task 16: Полный тайпчек, тесты и сборка

**Files:** —

- [ ] **Step 1: Юнит-тесты funnel-v2**

Run: `pnpm exec tsx --test lib/funnel-v2/native-config.test.ts lib/funnel-v2/normalize-native.test.ts lib/funnel-v2/first-message-timing.test.ts`
Expected: все PASS.

- [ ] **Step 2: Полный набор тестов**

Run: `pnpm test 2>&1 | tail -5`
Expected: 0 fail.

- [ ] **Step 3: Полный тайпчек**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -20`
Expected: без ошибок (или только предсуществующие, не связанные с этой работой — сверить с `git stash`-базой при сомнении).

- [ ] **Step 4: Сборка**

Run: `pnpm build 2>&1 | tail -20`
Expected: Compiled successfully.

- [ ] **Step 5: Визуальная проверка в браузере (обязательна перед сдачей)**

Через playwright MCP / залогиненный Chrome на локальном dev (`pnpm dev`, порт 3000):
1. Открыть вакансию с настроенным Портретом → Настройки → «Воронка v2».
2. Стадия 1: значения задержки/нерабочего/текстов совпадают с Портретом (prefill сработал). Изменить задержку → сохранение («сохранено»), в Портрете значение НЕ изменилось.
3. Стадия 2: включить, проверить пороги/плашку/письмо/экран; значения предзаполнены из anketaPassInvite.
4. Коммуникации: стоп-слова/FAQ (AutoResponderSettings) редактируются; TG и «горячий кандидат» предзаполнены из Портрета, переключаются.
5. Приложить скриншот каждой из трёх карточек.

- [ ] **Step 6: Финальный commit (если остались правки после проверки)**

```bash
git add -A
git commit -m "chore(funnel-v2): финальная проверка нативного переноса Портрета"
```

---

## Self-Review (сверка с дизайн-документом)

**1. Покрытие спеки (`2026-07-14-portrait-native-migration-design.md`):**

| Требование дизайна | Задача |
|---|---|
| Стадия 1: задержка первого сообщения — native | Task 1/6 (UI), Task 10 (рантайм off-hours), заметка о рабочей задержке в Task 10 |
| Стадия 1: нерабочее время (вкл/задержка/текст) — native | Task 1/6/10 |
| Стадия 1: текст авто-отказа + задержка отказа — native | Task 1/6/11 |
| Стадия 1: пороги отбора / авто-приглашение / текст приглашения / hh-стадия | **Сознательно оставлены в Портрете** (реш. 2/1) — read-only во врезке; текст приглашения/hh уже нативны на demo-стадии |
| Стадия 2: пороги теста / AI-оценки (ИЛИ) | Task 1/7 (UI), Task 12 (рантайм) |
| Стадия 2: способ перевода (авто/плашка/письмо/both) | Task 1/7/12/13 |
| Стадия 2: плашка (заголовок+текст) | Task 1/7/13 |
| Стадия 2: письмо-приглашение + задержка | Task 1/7/12 |
| Стадия 2: экран «Спасибо» не прошедших | Task 1/7/13 |
| Стадия 2: действие если не прошёл | Task 1/7/12 |
| Коммуникации: стоп-слова → отказ (список/действие/прощание) | Task 8 — переиспользован `AutoResponderSettings` (уже режимо-независим) |
| Коммуникации: частые вопросы → авто-ответ | Task 8 — тот же `AutoResponderSettings` |
| Коммуникации: TG подходящие кандидаты | Task 1/8/14 |
| Коммуникации: горячий кандидат стынет | Task 1/8/15 |
| Хранение: `funnelV2.stage1/stage2/communications` | Task 1/2 |
| Аддитивно, native только при движке v2, Портрет не тронут | Все рантайм-таски гейтят по `funnelV2RuntimeEnabled` |
| Предзаполнение копией Портрета при первом открытии | Task 3/9 |
| Критерии AI-скоринга остаются в Портрете | Не переносятся (реш. 2/1) |

**2. Плейсхолдеры:** в плане нет «TODO/добавить обработку ошибок/аналогично Task N» — весь код приведён целиком; для роутов демо (Task 13) точная подстановка полей определяется по факту чтения (Step 1 роута), т.к. эти файлы не были прочитаны целиком — это отмечено явно, а форма `effectiveAp` идентична `spec.anketaPassInvite`, поэтому правки строго точечные (смена источника объекта).

**3. Согласованность типов/сигнатур:**
- `FunnelV2Stage1/Stage2/Communications` объявлены в Task 1, нормализуются в Task 2, резолвятся в Task 3/4, редактируются в Task 6/7/8, читаются рантаймом в Task 10–15 — имена полей едины (`inviteDelaySeconds`, `offHoursEnabled`, `offHoursDelaySeconds`, `offHoursText`, `rejectLetter`, `rejectionDelayMinutes`; `passThreshold`, `aiEvalThreshold`, `transferMode`, `contentBlockId`, `passScreenTitle/Text`, `messageText`, `delaySeconds`, `failScreenTitle/Text`, `failAction`, `failRejectDelayMinutes`; `tgAlerts`, `hotCandidate`).
- Резолверы: `resolveStage1(config)`, `resolveEffectiveAnketaPassInvite(specAp, config, runtimeEnabled)`, `resolveTgAlerts(specTg, config, runtimeEnabled)`, `resolveHotCandidate(specHot, config, runtimeEnabled)`, `prefillNativeFromSpec(config, spec)` — сигнатуры едины между определением (Task 3/4) и использованием (Task 9–15).
- Дефолт-константы (`DEFAULT_STAGE1_*`, `DEFAULT_STAGE2_*`, `DEFAULT_HOT_CANDIDATE_THRESHOLD`) экспортируются из `native-config.ts` и используются в тестах/UI.
