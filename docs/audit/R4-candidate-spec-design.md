# R4 «Candidate Spec» — дизайн-документ

> Дата: 2026-06-10. Статус: Этап 1 + Этап 2 РЕАЛИЗОВАНЫ (спящий код, новый контур).
> Соответствует §3 Слой 1 / R4 карты HR-system-map-and-target-2026-06-10.md.
> Этап 2 (см. §7): две пары порогов (T1 закрыт), UI «Кого ищем», перенос v1→v2.

---

## 1. Проблема

«Кого ищем» размазано по 4+ местам вакансии:

| Место | Что хранит | Потребители |
|---|---|---|
| `vacancies.requirements_json` | v2: must/nice/deal, ideal_profile, scoring_weights (Σ=100) | ai-score-candidate-v2, блок «AI-скоринг резюме» |
| `vacancies.ai_process_settings` | v1-пороги (minScore/minScoreUpper/lower), midRangeAction, задержка | process-queue, блок «AI-скоринг резюме» |
| `descriptionJson.anketa.*` | v1-портрет: aiIdealProfile, aiRequiredHardSkills, desiredSkills, aiStopFactors, aiWeights, aiCustomCriteria | ai-screen-candidate (v1), ai-screen-resume, scoring/vacancy-spec.ts |
| `vacancies.stop_factors_json` | Жёсткий отсев: город/формат/возраст/опыт/документы/гражданство/зарплата | process-queue → stop-factors-matcher.ts |
| `descriptionJson.anketa.{upper,lower}Threshold` | Пороги AI-скрининга анкеты (PostDemoSettings) | post-demo-settings, ai_anketa_score блок |
| `outbound_searches.soft_criteria` | «Мягкие критерии» для outbound AI-скоринга | outbound scoring |

Итог: 2 набора порогов (резюме 75/40 vs анкета 75/50), 2 системы критериев (v1 текстовые vs v2 структурированные), v1 и v2 работают параллельно.

---

## 2. Целевая TypeScript-модель CandidateSpec

### 2.1 Четыре секции

```
CandidateSpec {
  // (a) Оценочные критерии
  mustHave:         string[]         // 3-5 жёстких требований (v2)
  niceToHave:       string[]         // до 5 желательных (v2)
  dealBreakers:     string[]         // до 3 дисквалификаторов (v2)
  scoringWeights:   ScoringWeights   // 9 осей Σ=100 (v2)
  customCriteria:   Criterion[]      // произвольные оси HR (из anketa.aiCustomCriteria)

  // (b) Жёсткий отсев
  stopFactors:      StopFactors      // город/формат/возраст/опыт/документы/гражданство/зарплата

  // (c) Пороги — ДВЕ пары (Этап 2, T1 закрыт; см. §7.1)
  resumeThresholds: {                 // оценка РЕЗЮМЕ
    upperThreshold:        number     // >=upper → invite (дефолт 75)
    lowerThreshold:        number     // <lower → reject/keep_new (дефолт 40)
    midRangeAction:        enum       // direct_demo | prequalification | keep_new
    autoRejectEnabled:     boolean    // реальный discard через hh
    rejectionDelayMinutes: number     // дефолт 300
  }
  anketaThresholds: {                 // оценка АНКЕТЫ (после демо)
    upperThreshold:        number     // >=upper → зелёный уровень (дефолт 75)
    lowerThreshold:        number     // <lower → красный уровень (дефолт 50)
  }

  // (d) Профиль / текстовые описания
  idealProfile:            string    // 1-2 предложения (v2 > v1-портрет)
  portraitRequiredSkills:  string[]  // anketa.aiRequiredHardSkills (v1-мост)
  portraitNiceSkills:      string[]  // anketa.desiredSkills (v1-мост)
  portraitKnockouts:       string[]  // anketa.aiStopFactors (v1-мост)
  outboundSoftCriteria:    string    // из outbound_searches.soft_criteria

  version: 1
}
```

Полный zod-контракт: `lib/core/spec/types.ts`.

### 2.2 Пороги: история решения

**Этап 1 (устарело):** Spec вводил ОДНУ пару порогов из ai_process_settings;
пороги анкеты оставались legacy-only. Trade-off: при активации поменялось бы
поведение анкеты (lower 40 vs 50).

**Этап 2 (актуально, T1 закрыт):** координатор утвердил ДВЕ пары —
`resumeThresholds` (75/40 + маршрутизация) и `anketaThresholds` (75/50).
Обе собираются мостом из своих legacy-источников, активация ничьё поведение
не меняет. Подробности и уточнённый источник порогов анкеты — §7.1.

---

## 3. Таблица маппинга legacy → Spec

| Legacy поле | Spec поле | Приоритет | Примечание |
|---|---|---|---|
| `requirementsJson.must_have` | `mustHave` | — | v2; [] = v2 выключен |
| `requirementsJson.nice_to_have` | `niceToHave` | — | v2 |
| `requirementsJson.deal_breakers` | `dealBreakers` | — | v2 |
| `requirementsJson.scoring_weights` | `scoringWeights` | HIGH | если Σ≠100 → дефолт |
| `requirementsJson.ideal_profile` | `idealProfile` | **v2 > v1** | перекрывает aiIdealProfile |
| `aiProcessSettings.minScoreUpper` | `resumeThresholds.upperThreshold` | HIGH | дефолт 75 |
| `aiProcessSettings.minScoreLower` | `resumeThresholds.lowerThreshold` | HIGH | fallback → minScore; дефолт 40 |
| `aiProcessSettings.minScore` | `resumeThresholds.lowerThreshold` | LOW | legacy-alias, если нет minScoreLower |
| `aiProcessSettings.midRangeAction` | `resumeThresholds.midRangeAction` | — | дефолт direct_demo |
| `aiProcessSettings.belowThresholdAction` | `resumeThresholds.midRangeAction` | LOW | legacy-маппинг |
| `aiProcessSettings.autoRejectEnabled` | `resumeThresholds.autoRejectEnabled` | — | дефолт false |
| `aiProcessSettings.rejectionDelayMinutes` | `resumeThresholds.rejectionDelayMinutes` | — | дефолт 300 |
| `demos.postDemoSettings.upperThreshold` | `anketaThresholds.upperThreshold` | — | Этап 2; kind='demo'; дефолт 75 |
| `demos.postDemoSettings.lowerThreshold` | `anketaThresholds.lowerThreshold` | — | Этап 2; дефолт 50 |
| `stopFactorsJson` | `stopFactors` | — | прямой маппинг |
| `descriptionJson.anketa.aiIdealProfile` | `idealProfile` (fallback) | LOW | если v2 пуст |
| `descriptionJson.anketa.aiRequiredHardSkills` | `portraitRequiredSkills` | — | храним отдельно от mustHave |
| `descriptionJson.anketa.desiredSkills` | `portraitNiceSkills` | — | храним отдельно от niceToHave |
| `descriptionJson.anketa.aiStopFactors` | `portraitKnockouts` | — | текстовые нокауты v1 |
| `descriptionJson.anketa.aiCustomCriteria` | `customCriteria` | — | произвольные оси |
| `outboundSearches.softCriteria` | `outboundSoftCriteria` | — | передаётся явно |

---

## 4. Спорные решения и trade-offs

### T1: Пороги анкеты не включены в Spec — ✅ ЗАКРЫТ (Этап 2)
**Проблема:** пороги анкеты (50) отличаются от порогов резюме (40). Если включить в Spec только одну пару, при активации изменится поведение одной из систем.

**Решение Этапа 2:** в CandidateSpec ДВЕ пары — `resumeThresholds` (75/40 +
маршрутизация) и `anketaThresholds` (75/50). Источник порогов анкеты —
`demos.post_demo_settings` (см. §7.1). Поведение при активации не меняется.

### T2: portraitRequiredSkills ≠ mustHave
**Проблема:** portraitRequiredSkills (v1) и mustHave (v2) хранят одно и то же, но разными способами. Можно было объединить автоматически.

**Решение:** НЕ объединяем. Хранятся отдельно, потребитель сам решает источник. При активации нового скоринга нужно явно выбрать: mustHave.length > 0 → v2, иначе → legacy fallback через portraitRequiredSkills. Это явнее, чем тихое слияние.

### T3: Почему новая таблица, а не колонка в vacancies
**Альтернатива:** добавить `spec jsonb` в таблицу vacancies.

**Решение:** новая таблица `vacancy_specs`. Мотивы:
- Двухконтурная схема: не менять vacancies пока Spec «спит»;
- PK = vacancy_id → нет лишнего uuid, CASCADE-удаление бесплатно;
- Размер: Spec может быть крупным (сотни байт), лучше хранить отдельно.

### T4: Zod-валидация на входе
**Решение:** PUT-эндпоинт валидирует через `CandidateSpecSchema.safeParse`. Первая ошибка возвращается с путём поля. Это достаточно для MVP — подробный отчёт об ошибках (все поля) можно добавить позже.

---

## 5. Созданные файлы

| Файл | Назначение |
|---|---|
| `lib/core/spec/types.ts` | CandidateSpec zod-схема + TypeScript-типы |
| `lib/core/spec/from-legacy.ts` | buildSpecFromLegacy — мост чтения |
| `lib/core/spec/store.ts` | getSpec / saveSpec / deleteSpec — CRUD |
| `app/api/core/spec/[vacancyId]/route.ts` | GET (legacy fallback) / PUT (сохранение) |
| `drizzle/0197_vacancy_specs.sql` | SQL-миграция (НЕ применена) |
| `scripts/check-spec-from-legacy.ts` | 6 тест-кейсов buildSpecFromLegacy |

---

## 6. Активация (после тестирования)

1. Применить миграцию на стейджинге:
   ```bash
   sudo -u postgres psql -d mykomanda_new_staging -f drizzle/0197_vacancy_specs.sql
   ```
2. Убедиться, что GET /api/core/spec/[vacancyId] отдаёт source:"legacy" для полигона.
3. Сохранить spec через PUT — source перейдёт в "spec".
4. Проверить: spec совпадает с legacy (автотест buildSpecFromLegacy).
5. Аналогично на проде через deploy-prod-safe.sh.

Интеграция в рантайм скоринга/чат-бота — отдельная задача после стабилизации модели.

---

## 7. Этап 2 (2026-06-10, решения координатора утверждены)

### 7.1 T1 ЗАКРЫТ: две пары порогов вместо одной

Единый `thresholds` заменён на две независимые пары (рантайм не трогали,
записей vacancy_specs в проде нет → совместимость не ломается, version=1):

| Секция Spec | Поля | Дефолты | Legacy-источник |
|---|---|---|---|
| `resumeThresholds` | upper/lower/midRangeAction/autoRejectEnabled/rejectionDelayMinutes | 75/40 | `vacancies.ai_process_settings` |
| `anketaThresholds` | upper/lower | 75/50 | `demos.post_demo_settings` (kind='demo', последняя по updated_at) |

**Уточнение маппинга:** пороги анкеты живут в таблице `demos`
(post_demo_settings.upperThreshold/lowerThreshold), а НЕ в
`descriptionJson.anketa`, как предполагал Этап 1. buildSpecFromLegacy получает
их через новое поле `LegacyVacancyInput.postDemoSettings` — GET-роут
/api/core/spec/[vacancyId] делает запрос к demos сам.

Маршрутизация анкеты (зелёный/жёлтый/красный экраны, тексты уровней) остаётся
в legacy (PostDemoSettings) — в Spec только пороги.

### 7.2 UI: один экран «Кого ищем» (section=spec)

Новая секция настроек вакансии: `?tab=settings&section=spec`, ярлык
«Кого ищем» (иконка Target), размещена сразу после «Воронки».
Компонент `components/vacancies/spec-editor.tsx`:

- Загружает GET /api/core/spec/[id]; при source="legacy" — бейдж
  «Собрано из текущих настроек — проверьте и сохраните».
- (а) Критерии: must (до 5) / nice (до 5) / dealbreakers (до 3) — теги-инпуты;
  веса 9 осей со слайдерами + прогресс-бар суммы (Σ=100, иначе сохранение
  заблокировано).
- (б) Стоп-факторы: тумблеры + значения в стиле блока «Стоп-факторы по
  резюме» (FactorRow). Тексты отказов НЕ дублируем — остаются в legacy-блоке.
- (в) Пороги: две карточки рядом — «Оценка резюме» (слайдеры 75/40 + действие
  между порогами + авто-отказ + задержка) и «Оценка анкеты» (75/50).
- (г) Идеальный профиль: textarea ≤500 зн.
- Кнопка «Сохранить» → PUT; также регистрируется в sticky-баре настроек
  (tabKey="spec" добавлен в VacancyTabKey).

### 7.3 Перенос v1→v2 (подготовка к выпилу Портрета)

Если у вакансии `mustHave` пуст, а v1-портрет (`portraitRequiredSkills`)
непуст — жёлтая плашка «Перенести из старого Портрета». Кнопка разово
маппит БЕЗ AI-вызова (простое копирование текстов):

| v1 (портрет) | → v2 (Spec) | Лимит |
|---|---|---|
| portraitRequiredSkills | mustHave | 5 (излишки показываются пользователю) |
| portraitNiceSkills | niceToHave | 5 (не перезаписывает непустой niceToHave) |
| portraitKnockouts | dealBreakers | 3 (не перезаписывает непустой dealBreakers) |
| aiIdealProfile | idealProfile | уже учтён мостом (v2 > v1) |

Излишки сверх лимитов выводятся в Alert — HR сокращает формулировки руками
и сохраняет. Никакой автоматики поверх.

### 7.4 План выпила v1 (после полигона)

1. Полигон: вакансия «Помощник по маркетингу» (ИП) — HR заполняет Spec,
   проверяем совпадение с legacy-поведением.
2. Рантайм-потребители (process-queue, ai-screen-*) переводятся на чтение
   Spec через флаг useNewCore (отдельный этап, НЕ этот).
3. После стабилизации: legacy-формы «Портрет кандидата» и «AI-профиль» в
   анкете скрываются (сначала за флаг), поля anketa.ai* остаются в БД
   read-only для отката.
4. Финал: dual-write Spec→legacy при сохранении spec-editor (если потребуется
   для переходного периода) и выпил v1-скоринга.

### 7.5 Изменённые/новые файлы Этапа 2

| Файл | Изменение |
|---|---|
| `lib/core/spec/types.ts` | thresholds → resumeThresholds + anketaThresholds (zod) |
| `lib/core/spec/from-legacy.ts` | postDemoSettings во входе; сборка двух пар порогов |
| `app/api/core/spec/[vacancyId]/route.ts` | GET дотягивает demos.post_demo_settings |
| `scripts/check-spec-from-legacy.ts` | 7 кейсов (новый: пороги анкеты) |
| `components/vacancies/spec-editor.tsx` | НОВЫЙ — экран «Кого ищем» |
| `components/vacancies/vacancy-settings-context.tsx` | VacancyTabKey + "spec" |
| `app/(modules)/hr/vacancies/[id]/page.tsx` | секция spec в сабнаве настроек |
