# Три системы оценки кандидатов

> Справочник: как устроены три независимых скоринга — **AI-резм.**, **AI-оцен.**, **Рубрика**.
> Составлено по коду 14.06.2026 (трассировка). Источник истины — код; при расхождении верить коду.

В UI (таб «Кандидаты» вакансии) три колонки скоринга. Это **три полностью независимые
системы**, каждая со своей колонкой в БД, своим триггером, своей моделью и своим влиянием
на воронку.

| Колонка UI | Поле БД | Что оценивает |
|---|---|---|
| **AI-резм.** | `candidates.resume_score` | Резюме vs требования вакансии (ДО демо) |
| **AI-оцен.** | `candidates.ai_score` | Ответы на демо/анкету vs вакансия (ПОСЛЕ демо) |
| **Рубрика** | `candidates.rubric_score` | Резюме vs спецификация (новый shadow-движок) |

## Путь кандидата

```
Отклик с hh ──► [AI-резм.]  автоматически при импорте, ДО демо
                   │ пороги minScoreLower/Upper → приглашение / отказ / в «Новый»
                   ▼
Кандидат прошёл демо ──► [AI-оцен.]  автоматически по завершении демо
                            └ только показывается, на стадию НЕ влияет

[Рубрика] ──► вручную (кнопка) или по cron, параллельно — shadow, ни на что не влияет
```

## Таблица сравнения

| | **AI-резм.** (`resumeScore`) | **AI-оцен.** (`aiScore`) | **Рубрика** (`rubricScore`) |
|---|---|---|---|
| **Что оценивает** | Резюме vs требования | Ответы демо/анкеты vs вакансия | Резюме vs `ScoringSpec` |
| **Когда считается** | Авто, при импорте отклика с hh (один раз, если `resume_score IS NULL`) | Авто, по завершении демо; + кнопка «Оценить сейчас» в карточке | Кнопка «Оценить рубрикой» (1 / батч 8) + cron (15/прогон, только NULL) |
| **Этап** | До демо | После демо | В любой момент, отдельно |
| **Модель** | Claude (`screenResume`) | Sonnet-4.6 (v1) + Sonnet-4 (v2); показывается v2, иначе v1 | Sonnet-4, forced tool-use (структурный вывод) |
| **Вход в промпт** | Резюме (опыт, скиллы, город, ЗП, языки…) + требования/стоп-факторы | Ответы демо + требования анкеты (must/nice/веса/идеал) | Резюме-текст + `ScoringSpec` (критерии с весами, knockouts) |
| **Влияет на стадию?** | **ДА, косвенно** — через пороги (см. ниже) | **Нет** — только история/показ | **Нет** — shadow |
| **Управляющие параметры** | `minScoreLower`, `minScoreUpper`, `midRangeAction`, `prequalificationMode`, `autoRejectEnabled` (в aiProcessSettings / таб «Воронка») | `aiAnketaScoreEnabled` (мягкий флаг); наличие `requirementsJson.must_have` → v2 | Веса критериев в спецификации; флага вкл/выкл нет |
| **Доп. колонки БД** | — | `ai_summary`, `ai_details`, `ai_scored_at`, `ai_score_v1/v2`, `ai_score_v2_details` | `rubric_details`, `rubric_scored_at` |
| **Дата скоринга** | не хранится | `ai_scored_at` | `rubric_scored_at` |

## AI-резм.: пороги → действие (это и есть «сценарий разбора»)

После подсчёта `resumeScore` при импорте (`lib/hh/process-queue.ts:648–690`):

- **`score < lower`** → **отказ** (если `autoRejectEnabled`, иначе в «Новый» на ручной разбор)
- **`lower ≤ score < upper`** → по `midRangeAction`: `keep_new` / `prequalification` / `direct_demo` (просто пригласить)
- **`score ≥ upper`** → **приглашение на демо**
- Режим `prequal_then_demo` / `prequal_only` перекрывает пороги: предквалификация для всех, lower-reject выключен (защита P0-14)

Дефолты `lower=0, upper=0` → пороги **не применяются**, все идут на демо.

## Что ещё важно

1. **На авто-воронку влияет ТОЛЬКО AI-резм.** AI-оцен. и Рубрика ничего не двигают — это аналитика/обкатка. «Сценарий разбора» = пороги резюме.
2. **AI-оцен. есть две версии (A/B):** v1 (legacy) и v2 (по структурным требованиям `requirementsJson`). В колонке показывается v2, если посчитался, иначе v1 — оба пишутся для сравнения (R4 этап 2).
3. **Рубрика — будущая замена** старого скоринга (миграция 0151, «shadow»). Её спецификация (`ScoringSpec`) строится из анкеты вакансии; та же спека кормит v2 AI-оцен.
4. **Как читать бейджи:**
   - AI-резм. / Рубрика показывают число всегда, даже `0` (0 = посчитано, низкий скор).
   - AI-оцен. показывает `—`, если реально не считалась (`aiScore == null` или нет `aiSummary`) — чтобы не путать «не было демо» с «низкий балл». Поэтому `0` у резюме и `—` у оценки — **разные** состояния.
   - Цвет (зелёный/жёлтый/красный) — общий `getScoreColor`, пороги цвета одни для всех трёх.
5. **Где крутить настройки:** пороги/режимы AI-резм. — таб **«Воронка»** вакансии (источник истины `vacancy_ai_settings`), **не** в поповере «Разобрать» (там только лимит/скорость отправки).

## Ключевые файлы

**AI-резм. (`resumeScore`)**
- Вычисление + пороги: `lib/hh/process-queue.ts:563–690`
- Вторая точка (sync hh-резюме): `lib/hh/client.ts:315`
- Движок: `lib/ai-screen-resume.ts` (`screenResume`)
- UI-колонка: `components/dashboard/list-view.tsx:410, 545–555`

**AI-оцен. (`aiScore`)**
- HR-кнопка «Оценить сейчас»: `app/api/vacancies/[id]/score-candidate/route.ts`
- Авто при завершении демо: `app/api/public/demo/[token]/answer/route.ts:35–67`
- Движок v1: `lib/ai-score-candidate.ts` (`scoreCandidateById`, Sonnet-4.6)
- Движок v2: `lib/ai-score-candidate-v2.ts` (`scoreCandidateV2`)
- UI-таб «AI-оценка» + кнопка: `components/candidates/candidate-drawer.tsx:1095, 1336, 1751+`

**Рубрика (`rubricScore`) — shadow**
- Ручной 1 кандидат: `app/api/modules/hr/candidates/[id]/rubric-score/route.ts`
- Батч по вакансии (≤8): `app/api/modules/hr/vacancies/[id]/rubric-score-all/route.ts`
- Cron (≤15, только NULL): `app/api/cron/rubric-score/route.ts`
- Движок: `lib/scoring/rubric.ts` (`scoreResumeRubric`, Sonnet-4, forced tool-use)
- Spec: `lib/scoring/vacancy-spec.ts` (`buildSpecFromAnketa`), типы `lib/scoring/types.ts`
- UI: `components/candidates/rubric-shadow-section.tsx`, `rubric-rank-panel.tsx`
- Миграция: `drizzle/0151_candidate_rubric_score.sql`

**Спецификация требований (общая для v2 + Рубрики)**
- `lib/scoring/types.ts` — `ScoringSpec` (criteria/weights, requiredSkills, niceSkills, knockouts, screeningQuestions, salary, location, workFormat)
- Строится из `vacancy.descriptionJson.anketa`; миграция `drizzle/0197_vacancy_specs.sql`
