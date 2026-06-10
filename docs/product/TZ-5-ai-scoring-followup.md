# ТЗ-5: AI-скоринг backend-гейт + Воронка дожима кандидатов

**Цель:** (1) Включить реальный AI-скоринг при разборе с гейтом по тумблеру.
(2) Реализовать MVP воронки дожима (4 пресета, cron, стоп-логика).
**Оценка:** 60-90 минут.

---

## КОНТЕКСТ

**Что сделано (ТЗ-1):**
- В таблице vacancies есть колонка ai_scoring_enabled BOOLEAN DEFAULT true
- В UI вакансии есть тумблер «AI-скоринг при разборе»
- Endpoint /api/modules/hr/vacancies/[id]/ai-settings принимает aiScoringEnabled

**Что НЕ сделано:**
- Backend-гейт в process-queue/route.ts — AI-скоринг там сейчас отключён
  комментарием на стр. 26-29 («AI-скоринг временно отключён»). Нужно вернуть
  и обернуть в проверку тумблера.

**Стратегия воронки (согласована):**
- 4 пресета: Выкл / Мягкий (4 касания / 2 нед) / Стандартный (7 касаний / 3 нед) /
  Агрессивный (10 касаний / 3 нед)
- Запускается если кандидат не открыл демо ИЛИ открыл, но не допрошёл
- Стоп-триггеры: вакансия закрыта/в архиве, кандидат прошёл демо до конца,
  кандидат написал стоп-слово, AI классифицировал ответ как отказ

---

# ЧАСТЬ 1: AI-скоринг backend-гейт

## 1.1 Вернуть AI-скоринг в process-queue

Файл: app/api/integrations/hh/process-queue/route.ts

1. Найди закомментированный блок AI-скоринга (стр. 26-29). Раскомментируй
   вызов screenCandidate.
2. Оберни в проверку:

  let aiResult = null;
  if (vacancy.aiScoringEnabled !== false) {
    try {
      aiResult = await screenCandidate({ vacancy, candidate, hhResponse });
      await db.update(candidates)
        .set({
          aiScore: aiResult.score,
          aiComment: aiResult.comment,
          aiScoredAt: new Date(),
        })
        .where(eq(candidates.id, candidate.id));
    } catch (err) {
      console.error('[process-queue] AI scoring failed:', err);
    }
  }

3. Если в БД нет колонок ai_score/ai_comment/ai_scored_at в candidates —
   добавь миграцию + поля в db/schema.ts.

## 1.2 Лог AI-токенов
При вызове screenCandidate записывай расход в существующую таблицу
ai_audit_log (если есть). Если нет — TODO в комментарии.

## 1.3 Smoke-тест
pnpm tsc --noEmit | head -30

---

# ЧАСТЬ 2: Воронка дожима — БД

## 2.1 Таблица follow_up_campaigns

В db/schema.ts:

  export const followUpCampaigns = pgTable('follow_up_campaigns', {
    id: uuid('id').defaultRandom().primaryKey(),
    vacancyId: uuid('vacancy_id').notNull().references(() => vacancies.id, { onDelete: 'cascade' }),
    preset: text('preset').notNull().default('off'),
    enabled: boolean('enabled').notNull().default(false),
    stopOnReply: boolean('stop_on_reply').notNull().default(true),
    stopOnVacancyClosed: boolean('stop_on_vacancy_closed').notNull().default(true),
    customMessages: jsonb('custom_messages').$type<string[] | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  });

## 2.2 Таблица follow_up_messages

  export const followUpMessages = pgTable('follow_up_messages', {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull().references(() => followUpCampaigns.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at').notNull(),
    sentAt: timestamp('sent_at'),
    touchNumber: integer('touch_number').notNull(),
    channel: text('channel').notNull(),
    messageText: text('message_text').notNull(),
    status: text('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  });

Индексы: (candidateId, status), (scheduledAt, status).

## 2.3 SQL-миграция
Создай drizzle/0076_followup_campaigns.sql с CREATE TABLE + индексы.
НЕ применяй — юзер применит сам.

---

# ЧАСТЬ 3: Пресеты и расписание

## 3.1 lib/followup/presets.ts

  export type FollowUpPreset = 'off' | 'soft' | 'standard' | 'aggressive';

  export const FOLLOWUP_PRESETS = {
    off: { days: [], description: 'Без дожима' },
    soft: {
      days: [2, 4, 8, 10],
      description: '4 касания за 2 недели. Для редких позиций (директор, senior).',
    },
    standard: {
      days: [0, 2, 4, 8, 10, 15, 17],
      description: '7 касаний за 3 недели. Рекомендуем для большинства.',
    },
    aggressive: {
      days: [0, 1, 2, 3, 4, 7, 9, 11, 15, 17],
      description: '10 касаний за 3 недели. Для массового найма.',
    },
  };

## 3.2 Дефолтные тексты сообщений

Файл lib/followup/default-messages.ts. Массив из 10 текстов с разными углами:
напоминание, акцент на доход, акцент на сроки, финальное касание.

Переменные: {Имя}, {должность}, {компания}, {ссылка}.

Примеры (CC напишет 10 разных в этом стиле):
- «{Имя}, добрый день! Вчера отправляли обзор должности {должность}. Может, не дошло? Вот ссылка: {ссылка}»
- «{Имя}, хотели уточнить — менеджеры у нас выходят на 120-180К через 3 месяца. Короткий обзор: {ссылка}»
- «{Имя}, вакансия {должность} всё ещё открыта. Если актуально — {ссылка}. Если нет — просто скажите.»

## 3.3 Функция планирования касаний

Файл lib/followup/schedule.ts:

  export function generateTouchSchedule(campaignId, candidateId, preset, startDate, messages) {
    if (preset === 'off') return [];
    const schedule = FOLLOWUP_PRESETS[preset];
    return schedule.days.map((dayOffset, idx) => ({
      campaignId,
      candidateId,
      scheduledAt: addDays(startDate, dayOffset),
      touchNumber: idx + 1,
      channel: 'hh',
      messageText: messages[idx] || messages[messages.length - 1],
      status: 'pending',
    }));
  }

---

# ЧАСТЬ 4: Cron и стоп-логика

## 4.1 Cron-endpoint /api/cron/follow-up

В выводе билда есть app/api/cron/follow-up. Открой и реализуй:

1. SELECT follow_up_messages WHERE status='pending' AND scheduledAt <= NOW()
2. Для каждого:
   - Проверка стоп-триггеров (см. 4.2)
   - Если стоп — status='cancelled'
   - Иначе — отправка через hh API (используй логику из process-queue)
   - Запись sentAt, status='sent'/'failed' + errorMessage
3. Limit 50 за один запуск.

## 4.2 Стоп-триггеры

lib/followup/should-stop.ts:

  export async function shouldStopFollowUp(candidateId, campaignId, db) {
    // 1. Вакансия закрыта/в архиве
    if (vacancy.status === 'archived' || vacancy.status === 'closed') {
      return { stop: true, reason: 'vacancy_closed' };
    }
    // 2. Кандидат прошёл демо до конца
    if (candidate.demoCompletedAt || candidate.progress >= 100) {
      return { stop: true, reason: 'demo_completed' };
    }
    // 3. Стоп-слова
    const stopWords = ['нет', 'неинтересно', 'не интересно', 'не нужно',
                       'не хочу', 'не подходит', 'отказ', 'остановит',
                       'прекрат', 'спасибо нет', 'уже работаю', 'нашел работу'];
    if (lastReply && stopWords.some(w => lastReply.text.toLowerCase().includes(w))) {
      return { stop: true, reason: 'candidate_refused' };
    }
    // 3b. AI-классификация — TODO для MVP, только стоп-слова
    return { stop: false };
  }

## 4.3 Триггер старта дожима

В process-queue/route.ts ПОСЛЕ успешной отправки демо-ссылки:

  const campaign = await db.query.followUpCampaigns.findFirst({
    where: and(
      eq(followUpCampaigns.vacancyId, vacancy.id),
      eq(followUpCampaigns.enabled, true)
    ),
  });
  if (campaign && campaign.preset !== 'off') {
    const messages = campaign.customMessages || DEFAULT_FOLLOWUP_MESSAGES;
    const scheduledMessages = generateTouchSchedule(
      campaign.id, candidate.id, campaign.preset, new Date(), messages
    );
    await db.insert(followUpMessages).values(scheduledMessages);
  }

---

# ЧАСТЬ 5: UI воронки

## 5.1 Компонент components/vacancies/vacancy-followup-settings.tsx

UI:
- Заголовок «Цепочка дожима» + тумблер enabled
- 4 кнопки пресетов: Выкл / Мягкий / Стандартный / Агрессивный
- Под выбранным пресетом — описание + список касаний с датами
- Тумблер «Остановить если ответил нет»
- Тумблер «Остановить если вакансия закрыта»
- Кнопка «Сохранить»

Дизайн как на скрине Цепочка дожима с касаниями Д1, Д3, Д7.

## 5.2 API app/api/modules/hr/vacancies/[id]/followup-settings/route.ts
- GET — вернуть настройки
- PATCH — создать/обновить запись в follow_up_campaigns

## 5.3 Вставить в страницу вакансии
В app/(modules)/hr/vacancies/[id]/page.tsx — <VacancyFollowupSettings />
в табе «Настройки» под секцией «AI-обработка hh-откликов».

---

# ОБЩИЕ ТРЕБОВАНИЯ

- Атомарные коммиты по частям (1, 2, 3+4, 5)
- Миграции НЕ применять, только создать SQL-файл
- Не запускать pnpm build, только pnpm tsc --noEmit
- date-fns должен быть в проекте, используй его
- НЕ ТРОГАТЬ зону auth (app/api/auth/*, forgot-password, reset-password) —
  там работает ТЗ-6 в другом окне CC
- Не трогать публичные страницы кроме демо

## ГОТОВНОСТЬ
Напиши «ТЗ-5 готово» и перечисли:
1. Что сделано в каждой части
2. Изменённые/созданные файлы
3. SQL-миграции для применения
4. Что проверить в браузере
5. Известные TODO

Закоммить и запушь в main атомарными коммитами.
