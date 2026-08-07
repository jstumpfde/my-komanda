# Воронка v2: устранение дрейфа настроек + UX-фикс панели стадии — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть два конкретных дефекта, найденных в инциденте 13.07: (1) `inviteHhStage` может тихо содержать устаревшее значение `"consider"`, уводя реальных кандидатов не в ту hh-папку; (2) панель редактирования стадии «Воронки v2» показывает горизонтальный ряд из 11 кнопок-типов, визуально путающийся с левым списком стадий.

**Architecture:** (1) Ужесточить zod-схему спеки вакансии — убрать `"consider"` из допустимых значений `inviteHhStage`, плюс идемпотентная платформенная миграция данных для уже сохранённых вакансий. (2) В панели редактирования УЖЕ существующей стадии заменить ряд pill-кнопок на компактный `<Select>` — сеточный выбор типа при СОЗДАНИИ стадии уже реализован правильно (`DropdownMenu` на кнопке «+ Добавить стадию»), трогать не нужно.

**Tech Stack:** Next.js/TypeScript, Drizzle, zod, shadcn/ui Select, node:test.

**Scope note:** Этот план НЕ включает (сознательно, см. дизайн-документ `docs/superpowers/specs/2026-07-13-funnel-v2-consolidation-design.md`): миграцию всех 12 вакансий платформы со старого 17-блочного конструктора на «Воронку v2» (нужна отдельная инвентаризация и отдельный план — риск выше, объём больше), и перенос текста сообщения стадии в ссылку на «Коммуникации» вместо дублирующего поля (нужно сначала исследовать точную схему данных вкладки «Коммуникации» — недостаточно понято для bite-sized плана без плейсхолдеров).

---

### Task 1: Убрать `"consider"` из допустимых значений `inviteHhStage`

**Files:**
- Modify: `lib/core/spec/types.ts:158`
- Test: `lib/core/spec/types.test.ts`

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `lib/core/spec/types.test.ts`:

```typescript
test("CandidateSpecSchema: inviteHhStage не принимает устаревшее значение 'consider' (фикс инцидента 13.07 — consider='Подумать' на hh, не 'Первичный контакт')", () => {
  const raw = {
    resumeThresholds: {
      inviteHhStage: "consider",
    },
  }
  assert.throws(() => CandidateSpecSchema.parse(raw))
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
```

Проверь точное имя экспортируемой схемы и путь импорта `assert`/`test` в начале `lib/core/spec/types.test.ts` (по существующим тестам в этом файле, например тест на строке 92) и используй тот же паттерн импорта — не выдумывай новый.

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `pnpm exec tsx --test lib/core/spec/types.test.ts`
Expected: FAIL на первом новом тесте — `assert.throws` не бросает, потому что `"consider"` пока валиден по схеме.

- [ ] **Step 3: Убрать `"consider"` из enum**

В `lib/core/spec/types.ts:158` заменить:

```typescript
inviteHhStage: z.enum(["phone_interview", "consider", "interview", "assessment"]).default("phone_interview"),
```

на:

```typescript
inviteHhStage: z.enum(["phone_interview", "interview", "assessment"]).default("phone_interview"),
```

Также обнови JSDoc-комментарий прямо над этим полем (строки ~150-157) — убери упоминание `consider` как валидного варианта, оставь как историческую заметку о том, почему его больше нет в списке (сохрани контекст про инцидент 29.06/11.07/13.07 для будущих читателей).

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `pnpm exec tsx --test lib/core/spec/types.test.ts`
Expected: PASS все тесты, включая 3 новых.

- [ ] **Step 5: Проверить typecheck**

Run: `npx tsc --noEmit`
Expected: 0 новых ошибок в `lib/core/spec/types.ts` и файлах, которые его импортируют (если где-то в коде явно сравнивается с литералом `"consider"` — найди через `grep -rn '"consider"' lib/ app/ components/` и убедись, что убранное значение больше нигде не ожидается как валидное; если найдёшь такое место — почини его в рамках этого же шага, не создавай отдельную задачу).

- [ ] **Step 6: Коммит**

```bash
git add lib/core/spec/types.ts lib/core/spec/types.test.ts
git commit -m "fix(портрет): убрать consider из допустимых inviteHhStage — источник инцидента 13.07"
```

---

### Task 2: Платформенная миграция — почистить уже сохранённые `"consider"`

**Files:**
- Modify: `lib/platform/settings-migrations.ts`
- Test: смотри существующие тесты миграций в этом модуле (если их нет — ручная проверка через psql, как описано в Step 3)

- [ ] **Step 1: Проверить текущее состояние на проде (ручная сверка, не автоматизируется)**

Run на проде: `sudo -u postgres psql -d mykomanda -c "select vacancy_id from vacancy_specs where spec->'resumeThresholds'->>'inviteHhStage' = 'consider';"`
Ожидается: список vacancy_id (на 13.07 их было 4: `5ae8f734-b468-46fc-88f9-69ed662879ed`, `8995a044-4ca6-4526-bde2-68cf585f74ea`, `6916db01-a765-4c4e-a652-81475566f95b`, `3e8d1f6b-b3bf-4f71-8d77-85a3a9344d71` — к моменту реализации плана список мог измениться, не полагайся на этот конкретный список, перезапроси свежий).

- [ ] **Step 2: Добавить миграцию в `SETTINGS_MIGRATIONS`**

В конец массива `SETTINGS_MIGRATIONS` (`lib/platform/settings-migrations.ts`) добавить:

```typescript
{
  id: "2026-07-13-fix-consider-invite-hh-stage",
  description: "Заменить устаревшее inviteHhStage='consider' на 'phone_interview' во всех vacancy_specs (инцидент 13.07 — consider уводил приглашённых кандидатов в hh-папку «Подумать» вместо «Первичный контакт»)",
  apply: async (db) => {
    const result = await db.execute(sql`
      UPDATE vacancy_specs
      SET spec = jsonb_set(spec, '{resumeThresholds,inviteHhStage}', '"phone_interview"')
      WHERE spec->'resumeThresholds'->>'inviteHhStage' = 'consider'
      RETURNING vacancy_id
    `)
    return { affectedCount: result.length, rollbackData: result.map((r: { vacancy_id: string }) => r.vacancy_id) }
  },
  rollback: async (db, rollbackData) => {
    const vacancyIds = rollbackData as string[]
    for (const id of vacancyIds) {
      await db.execute(sql`
        UPDATE vacancy_specs
        SET spec = jsonb_set(spec, '{resumeThresholds,inviteHhStage}', '"consider"')
        WHERE vacancy_id = ${id}
      `)
    }
  },
},
```

Перед этим шагом прочитай ПОЛНОСТЬЮ существующий пример миграции в том же файле (`"2026-05-22-example-add-stop-word"`, начинается сразу после массива `SETTINGS_MIGRATIONS =`), чтобы точно повторить стиль `apply`/`rollback`/использование `sql` template-тега — не выдумывай сигнатуру заново.

- [ ] **Step 3: Локальная проверка на dev-БД**

Применить миграцию 0276 (или актуальную на момент выполнения — `ls drizzle/*.sql | sort | tail -3` на origin/main) на локальную dev-БД, если ещё не применена, затем вручную создать тестовую строку с `consider`:

```sql
-- локально, dev-БД
UPDATE vacancy_specs SET spec = jsonb_set(spec, '{resumeThresholds,inviteHhStage}', '"consider"') WHERE vacancy_id = (select id from vacancies limit 1);
```

Вызвать раннер миграций локально (`POST /api/platform/run-migrations` с заголовком `X-Platform-Admin-Key` из своего `.env.local`, на локальный dev-сервер), затем проверить:

```sql
select spec->'resumeThresholds'->>'inviteHhStage' from vacancy_specs where vacancy_id = (select id from vacancies limit 1);
```

Expected: `phone_interview`.

- [ ] **Step 4: Коммит**

```bash
git add lib/platform/settings-migrations.ts
git commit -m "feat(платформа): миграция настроек — заменить consider на phone_interview в inviteHhStage"
```

Применение на проде (`POST /api/platform/run-migrations`) — НЕ делать самому в рамках этого шага, это прод-действие. Оставить координатору/Юрию после ревью и деплоя (пункт 1 из списка «когда спрашивать» в промте оркестратора).

---

### Task 3: UX-фикс — тип стадии как `Select`, не ряд кнопок

**Files:**
- Modify: `components/vacancies/funnel-v2-builder.tsx:277-292`
- Test: ручная живая проверка (это чисто UI-задача, юнит-тестов на JSX-разметку в этом компоненте нет и заводить не нужно — YAGNI)

- [ ] **Step 1: Прочитать текущий код секции целиком**

Прочитать `components/vacancies/funnel-v2-builder.tsx:264-340` (весь `SheetContent` панели редактирования стадии, включая секцию «Тип этой стадии» и следующую за ней «Сообщение / контент») — понять текущие переменные `stage`, `patch`, `meta`, `actionMeta`, используемые в этой части файла, прежде чем менять.

- [ ] **Step 2: Заменить ряд pill-кнопок на `Select`**

Заменить блок (строки 277-292):

```tsx
{/* Тип этой стадии */}
<section className="space-y-1.5">
  <Label className="text-xs text-muted-foreground">Тип этой стадии</Label>
  <p className="text-[11px] text-muted-foreground/70 -mt-0.5">Стадия — один шаг пути кандидата. Тип задаёт, что кандидат делает на этом шаге. Последовательность шагов — в списке слева.</p>
  <div className="flex flex-wrap gap-1">
    {STAGE_ACTIONS.map(a => {
      const active = a.type === stage.action
      return (
        <button key={a.type} type="button"
          onClick={() => patch(a.type === "interview" ? { ...makeStage("interview", stage.id.slice(3)), id: stage.id, action: "interview", messagePresetId: stage.messagePresetId, messages: stage.messages, title: stage.title, hhStatus: stage.hhStatus } : { action: a.type, dozhimChain: dozhimChainFor(stage.dozhim, a.type, dripTemplates), dozhimChainOpened: dozhimChainForOpened(stage.dozhim, a.type, dripTemplates) })}
          className={cn("text-[11px] px-2 py-1 rounded-md border transition-colors", active ? "bg-blue-500/10 border-blue-400 text-blue-700 dark:text-blue-300 font-medium" : "border-border text-muted-foreground hover:bg-muted/50")}>{a.label}</button>
      )
    })}
  </div>
  <p className="text-[11px] text-muted-foreground/80">{meta.desc}</p>
</section>
```

на:

```tsx
{/* Тип этой стадии — компактный Select, не ряд кнопок (UX-фикс 13.07:
    ряд из 11 pill-кнопок визуально путался с левым списком стадий воронки —
    оба выглядели как навигация, хотя тип стадии почти всегда задаётся один
    раз при создании через «+ Добавить стадию», сеточный выбор там не трогаем). */}
<section className="space-y-1.5">
  <div className="flex items-center justify-between gap-2">
    <Label className="text-xs text-muted-foreground">Тип стадии</Label>
    <Select
      value={stage.action}
      onValueChange={(v) => {
        const a = v as StageActionType
        patch(a === "interview"
          ? { ...makeStage("interview", stage.id.slice(3)), id: stage.id, action: "interview", messagePresetId: stage.messagePresetId, messages: stage.messages, title: stage.title, hhStatus: stage.hhStatus }
          : { action: a, dozhimChain: dozhimChainFor(stage.dozhim, a, dripTemplates), dozhimChainOpened: dozhimChainForOpened(stage.dozhim, a, dripTemplates) })
      }}
    >
      <SelectTrigger className="h-7 w-auto text-xs gap-1.5">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAGE_ACTIONS.map(a => (
          <SelectItem key={a.type} value={a.type} className="text-xs">{a.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
  <p className="text-[11px] text-muted-foreground/80">{meta.desc}</p>
</section>
```

`Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` уже импортированы в файле (строка 34) — новых импортов не требуется. `StageActionType` тоже должен быть уже импортирован (проверь по факту, если нет — добавь `import type { StageActionType } from "@/lib/funnel-v2/types"` или откуда он реально экспортируется в этом файле).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 новых ошибок в `funnel-v2-builder.tsx`.

- [ ] **Step 4: Живая проверка в браузере**

Поднять dev-сервер (`.claude/launch.json`, свободный порт), зайти на любую вакансию → Настройки → Воронка v2, кликнуть на существующую стадию — убедиться:
- Вместо ряда кнопок — один компактный дропдаун с текущим типом.
- Смена значения в дропдауне реально меняет тип стадии (сохранить настройки, перезайти — тип должен остаться новым).
- Слева список стадий больше не выглядит визуально идентично внутренней панели.
- Кнопка «+ Добавить стадию» и её выпадающее меню — работают как раньше, без изменений (это НЕ трогали).

Сделать скриншот до/после для отчёта.

- [ ] **Step 5: Коммит**

```bash
git add components/vacancies/funnel-v2-builder.tsx
git commit -m "fix(воронка v2): тип стадии — компактный Select вместо ряда pill-кнопок (UX-путаница со списком стадий)"
```

---

## Self-Review (выполнено при написании плана)

- **Покрытие спеки**: пункты «жёсткий недрейфующий дефолт Первичный контакт» (Task 1+2) и «UX-фикс панели» (Task 3) покрыты. Пункты «Воронка v2 = единственная система» (миграция 12 вакансий) и «ссылка на Коммуникации вместо дублирования текста» — явно вынесены за рамки этого плана (см. Scope note выше), не забыты, а осознанно отложены как отдельные последующие планы.
- **Плейсхолдеры**: не найдено — везде даны точные файлы/строки/код.
- **Типы/сигнатуры**: `StageActionType`, `STAGE_ACTIONS`, `dozhimChainFor`/`dozhimChainForOpened`, `makeStage` — использованы идентично их текущему использованию в файле (скопировано из существующего кода строк 277-292, не придумано заново).
