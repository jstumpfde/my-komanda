# ТЗ-1: Критичные фиксы для рассылки «Разобрать»

**Дата:** 30.04.2026
**Цель:** Подготовить функцию «Разобрать» к массовой рассылке 251 откликов hh.ru.
**Оценка:** ~10 минут работы.

---

## КОНТЕКСТ

Сейчас функция «Разобрать» в `/hr` отправляет демо-ссылки через hh API
(`PUT /negotiations/phone_interview/{id}`). Уже работает — 5 кандидатов получили.

Перед массовой рассылкой 251 откликов нужно починить 3 вещи:

1. Баг подстановки переменных в else-ветке `process-queue/route.ts:285`
2. Debug-логи `[PQ:dbg]` в `process-queue/route.ts`
3. Добавить тумблер «AI-скоринг при разборе» в настройки вакансии

---

## ЗАДАЧА 1: Фикс подстановки переменных в else-ветке

### Файл
`app/api/integrations/hh/process-queue/route.ts`

### Что сделать
1. Открой файл, найди строки 274–290 (примерно).
2. Посмотри как ветка `if (template)` (стр. 274–283) делает `.replaceAll('[Имя]', ...)`.
   Аналогичную логику применить и в `else`-ветке (стр. 284+).

### Подстановки в обеих ветках
- `[Имя]` и `{имя}` → `firstName` кандидата (если нет — «Здравствуйте»)
- `[должность]` и `{должность}` → `vacancy.name`
- `[компания]` и `{компания}` → `company.name`
- `[ссылка]` и `{ссылка}` → демо-ссылка `https://company24.pro/demo/{token}`

### Проверка
`grep -n "replaceAll" app/api/integrations/hh/process-queue/route.ts`
должен показать минимум 8 вхождений (4 переменных × 2 ветки).

---

## ЗАДАЧА 2: Убрать debug-логи `[PQ:dbg]`

### Файл
`app/api/integrations/hh/process-queue/route.ts`

```bash
grep -n "PQ:dbg" app/api/integrations/hh/process-queue/route.ts
```
Удалить все строки с этим тегом. Это чистые `console.log` без логики.

После: `grep -c "PQ:dbg" app/api/integrations/hh/process-queue/route.ts` → `0`.

---

## ЗАДАЧА 3: Тумблер «AI-скоринг при разборе»

### 3.1 — БД
Добавить колонку в `vacancies`:

В `db/schema.ts` — в схему `vacancies`:
```typescript
aiScoringEnabled: boolean('ai_scoring_enabled').notNull().default(true),
```

Применить: `pnpm drizzle-kit push`

### 3.2 — Backend (process-queue)
В `app/api/integrations/hh/process-queue/route.ts` найти место вызова
AI-скоринга (`screenCandidate` или похожая функция).

Перед вызовом добавить:
```typescript
if (vacancy.aiScoringEnabled !== false) {
  // существующий код AI-скоринга
}
```

Если `false` — пропускаем AI, отправка демо-ссылки идёт как обычно.

### 3.3 — Frontend
Найди файл настроек вакансии:
```bash
grep -r "AI-обработка hh-откликов" components app --include="*.tsx" -l
```

В табе «Настройки» вакансии, в секции «AI-обработка hh-откликов»
(сейчас помечена «Функция в разработке»):

Добавить тумблер выше слайдера «Минимальный AI-скор для приглашения на демо»:

```tsx
<div className="flex items-center justify-between py-3 border-b">
  <div>
    <div className="font-medium">AI-скоринг при разборе</div>
    <div className="text-sm text-muted-foreground">
      AI оценивает каждого кандидата перед отправкой демо. Выключите если хотите
      экономить токены и слать всем подряд.
    </div>
  </div>
  <Switch
    checked={aiScoringEnabled}
    onCheckedChange={(v) => updateVacancy({ aiScoringEnabled: v })}
  />
</div>
```

Состояние сохраняется через PATCH-endpoint вакансии
(`/api/modules/hr/vacancies/[id]`). Если endpoint не принимает
`aiScoringEnabled` — добавить.

### 3.4 — Убрать заглушку
Оранжевая плашка «Функция в разработке. Скоро будет доступна.»
в секции «AI-обработка hh-откликов» — удалить. Функция теперь работает.

---

## ПРОВЕРКИ
```bash
# 1. Нет debug-логов
grep -c "PQ:dbg" app/api/integrations/hh/process-queue/route.ts
# Ожидание: 0

# 2. replaceAll везде
grep -c "replaceAll" app/api/integrations/hh/process-queue/route.ts
# Ожидание: >= 8

# 3. Колонка в БД
psql postgresql://juri@localhost:5432/mykomanda -c "\d vacancies" | grep ai_scoring
# Ожидание: ai_scoring_enabled | boolean | not null default true

# 4. TypeScript
pnpm tsc --noEmit 2>&1 | head -30
# Ожидание: нет ошибок

# 5. Линтер
pnpm lint 2>&1 | head -30
# Ожидание: нет новых warnings
```

## ЧЕГО НЕ ДЕЛАТЬ
- Не трогать карточку hh.ru на табе Настройки (это ТЗ-2)
- Не трогать список кандидатов (это ТЗ-3)
- Не трогать demo-client.tsx и анкету (это ТЗ-4)
- Не делать рефакторинг — только точечные правки
- Не добавлять новые библиотеки

## ГОТОВНОСТЬ
Когда всё сделано — напиши **«ТЗ-1 готово»** и кратко перечисли что изменилось.
