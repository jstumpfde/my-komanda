# R4 «Candidate Spec» — дизайн-документ

> Дата: 2026-06-10. Статус: РЕАЛИЗОВАН (спящий код, новый контур).
> Соответствует §3 Слой 1 / R4 карты HR-system-map-and-target-2026-06-10.md.

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

  // (c) Единые пороги (одна шкала для резюме И анкеты)
  thresholds: {
    upperThreshold:        number     // >=upper → invite (дефолт 75)
    lowerThreshold:        number     // <lower → reject/keep_new (дефолт 40)
    midRangeAction:        enum       // direct_demo | prequalification | keep_new
    autoRejectEnabled:     boolean    // реальный discard через hh
    rejectionDelayMinutes: number     // дефолт 300
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

### 2.2 Почему одна шкала порогов

**Проблема:** пороги резюме (75/40 в ai_process_settings) ≠ пороги анкеты (75/50 в descriptionJson.anketa). Разные пороги создают несогласованные маршруты: кандидат с 45 баллов пройдёт анкету, но получит отказ по резюме.

**Решение:** Spec вводит ОДНУ пару порогов. Текущая реализация берёт пороги из ai_process_settings (резюме-контекст). Пороги анкеты из PostDemoSettings — legacy-only, остаются в descriptionJson.

**Trade-off:** нижний порог 40 (из резюме) мягче, чем 50 (из анкеты). При активации Spec на полигоне это изменит поведение анкеты. Решение: перед активацией HR должен осознанно выставить пороги через новый UI. TODO: добавить `resumeThresholds` / `anketaThresholds` в v2 Spec.

---

## 3. Таблица маппинга legacy → Spec

| Legacy поле | Spec поле | Приоритет | Примечание |
|---|---|---|---|
| `requirementsJson.must_have` | `mustHave` | — | v2; [] = v2 выключен |
| `requirementsJson.nice_to_have` | `niceToHave` | — | v2 |
| `requirementsJson.deal_breakers` | `dealBreakers` | — | v2 |
| `requirementsJson.scoring_weights` | `scoringWeights` | HIGH | если Σ≠100 → дефолт |
| `requirementsJson.ideal_profile` | `idealProfile` | **v2 > v1** | перекрывает aiIdealProfile |
| `aiProcessSettings.minScoreUpper` | `thresholds.upperThreshold` | HIGH | дефолт 75 |
| `aiProcessSettings.minScoreLower` | `thresholds.lowerThreshold` | HIGH | fallback → minScore; дефолт 40 |
| `aiProcessSettings.minScore` | `thresholds.lowerThreshold` | LOW | legacy-alias, если нет minScoreLower |
| `aiProcessSettings.midRangeAction` | `thresholds.midRangeAction` | — | дефолт direct_demo |
| `aiProcessSettings.belowThresholdAction` | `thresholds.midRangeAction` | LOW | legacy-маппинг |
| `aiProcessSettings.autoRejectEnabled` | `thresholds.autoRejectEnabled` | — | дефолт false |
| `aiProcessSettings.rejectionDelayMinutes` | `thresholds.rejectionDelayMinutes` | — | дефолт 300 |
| `stopFactorsJson` | `stopFactors` | — | прямой маппинг |
| `descriptionJson.anketa.aiIdealProfile` | `idealProfile` (fallback) | LOW | если v2 пуст |
| `descriptionJson.anketa.aiRequiredHardSkills` | `portraitRequiredSkills` | — | храним отдельно от mustHave |
| `descriptionJson.anketa.desiredSkills` | `portraitNiceSkills` | — | храним отдельно от niceToHave |
| `descriptionJson.anketa.aiStopFactors` | `portraitKnockouts` | — | текстовые нокауты v1 |
| `descriptionJson.anketa.aiCustomCriteria` | `customCriteria` | — | произвольные оси |
| `descriptionJson.anketa.{upper,lower}Threshold` | **НЕ маппируется** | — | legacy-only (см. §2.2) |
| `outboundSearches.softCriteria` | `outboundSoftCriteria` | — | передаётся явно |

---

## 4. Спорные решения и trade-offs

### T1: Пороги анкеты не включены в Spec
**Проблема:** пороги анкеты (50) отличаются от порогов резюме (40). Если включить в Spec только одну пару, при активации изменится поведение одной из систем.

**Решение v1:** берём пороги из ai_process_settings (резюме). Пороги анкеты остаются legacy-only.

**TODO v2:** добавить `resumeThresholds` и `anketaThresholds` в CandidateSpec, чтобы HR мог раздельно настраивать. До этого Spec имеет одну пару.

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
