# SYSTEM-MAP — общая карта my-komanda (Company24.pro)

> Как всё работает, схематически. Составлено 31.05.2026 по итогам аудита.
> Стек: Next.js 16 (App Router), TypeScript, Tailwind+shadcn, PostgreSQL 16,
> Drizzle ORM, pnpm. Прод: company24.pro (ветка main→ но деплоят с develop),
> сервер 5.42.125.91 /var/www/my-komanda, PM2 my-komanda:3000.

---

## 1. БОЛЬШАЯ КАРТИНА — что это за продукт
HR-платформа полного цикла найма: от привлечения кандидата до выхода на работу,
с AI на каждом шаге. Плюс смежные модули (адаптация, обучение, продажи, склад...).
Ядро — раздел HR (`app/(modules)/hr/`).

```
ПРИВЛЕЧЕНИЕ          ОБРАБОТКА                 ОЦЕНКА            РЕШЕНИЕ
hh.ru отклики  →                          →  AI-скоринг   →   воронка стадий
hh.ru поиск    →    кандидат в БД          →  (резюме/       (new→демо→тест→
(исходящий)    →    (candidates)           →   анкета/         интервью→оффер→
прямые ссылки  →                          →   рубрика)        выход / отказ)
                         ↓
                    AI чат-бот общается в hh-чате
                    (демо, тест, дожим, отложенный отказ)
```

---

## 2. ОТКУДА БЕРУТСЯ КАНДИДАТЫ (источники → воронка)

### A. hh.ru входящие отклики (основной поток)
```
Кандидат откликается на hh → cron hh-import (раз в минуту) тянет negotiations
→ создаёт candidates (source=hh) → cron process-queue: стоп-факторы → AI-скоринг
резюме → первое сообщение → AI чат-бот ведёт диалог в hh-чате
```
Файлы: `lib/hh/scan-incoming.ts`, `lib/hh/process-queue.ts`, `lib/hh/client.ts`,
`app/api/cron/hh-import`, `app/api/integrations/hh/*`. Токен по company_id (OAuth),
`lib/hh-helpers.ts getValidToken`. Прокси для hh НЕТ (прямые вызовы api.hh.ru).

### B. hh.ru ИСХОДЯЩИЙ подбор (новый модуль, Фаза 1, Заход 9)
```
Фильтр поиска (как на hh) → hh GET /resumes (грубое сито, лимит НЕ тратит)
→ AI-скоринг по сниппетам (тонко, по AI-профилю из Анкеты) → ранжир лучшие сверху
→ HR жмёт «Пригласить» → hh negotiations → кандидат source=hh_outbound → воронка
```
Таблицы: outbound_searches, outbound_candidates, hh_resume_view_quota.
Файлы: `lib/hh/outbound.ts`, `app/api/modules/hr/outbound/{search,score,invite,status}`,
`components/vacancies/outbound-sourcing-tab.tsx`.
Лимиты hh: 50 просмотров из поиска/день + 500 суммарно. Поиск не тратит, полный
GET /resumes/{id} (перед приглашением) тратит → учёт в hh_resume_view_quota.
⚠️ «Пригласить» (negotiations) — формат НЕ сверён с докой, TODO. Поиск+скоринг ок.

### C. Прямые ссылки / демо
Кандидат заходит по публичной ссылке `/demo/[token]`, `/vacancy/[slug]`,
`/apply` → создаётся candidate (source=site/прямая ссылка).

---

## 3. AI-СКОРИНГ — 3 разные системы (НЕ путать)
| Система | Когда | Движок | Где |
|---|---|---|---|
| resume_score | резюме ДО демо (боевой) | Haiku screenResume | process-queue.ts, hh/client.ts |
| rubric_score | shadow-оценка (правильная) | Sonnet, forced tool-use | lib/scoring/rubric.ts |
| ai_score (анкета) | после демо | Sonnet | lib/ai-screen-candidate.ts |

**Откуда берёт требования** — из Анкеты вакансии, блок «AI-профиль кандидата»
(descriptionJson.anketa): aiIdealProfile (свободный текст идеала), aiRequiredHardSkills
(обязательные навыки — штраф по доле, НЕ «всё или ничего»), aiStopFactors (= рейтинг 0,
жёсткий отсев), aiMinExperience, aiWeights (критерии-баллы критично/важно/желательно),
aiCustomCriteria. Исходящий подбор переиспользует screenCandidate по сниппетам.

Фильтр поиска (поля города/опыта/ЗП/занятости...) ≠ AI-профиль. Фильтр = грубое
сито hh; AI-профиль = тонкая оценка. Кнопка «Заполнить из анкеты» связывает их.

---

## 4. СТРАНИЦА ВАКАНСИИ — 6 вкладок (app/(modules)/hr/vacancies/[id]/page.tsx, ~4000 строк)
| Вкладка | ?tab= | Что |
|---|---|---|
| Кандидаты | candidates | список (серверная пагинация), фильтры, bulk, рубрика, hh-разбор |
| Аналитика | analytics | серверная агрегация (Заход 7): воронка/источники/распределение скора |
| Анкета | anketa | описание вакансии + AI-профиль (требования для скоринга) |
| Демонстрация | course | курс-демо кандидату (NotionEditor, блоки, AI-генерация) |
| Тест | test | тест со структур. вопросами (Заход 6); прохождение /test/[token] |
| Исходящий подбор | outbound | hh-поиск + AI-скоринг + приглашение (Заход 9) |
| Настройки | settings | 9 под-табов (брендинг/источники/воронка/конструктор/сообщения/дожим/AI-чат-бот/расписание/интеграции) |

Карточка кандидата (drawer): contacts/answers/chat(hh)/ai/rubric/channels(заглушка)/history.

---

## 5. AI ЧАТ-БОТ (общается с кандидатами)
Сейчас работает ТОЛЬКО в hh-чате. 4-уровневая security:
1. Executor (Sonnet) — отвечает, по vacancy.aiChatbotPrompt
2. Pre-filter (Haiku) — проверяет входящее (injection/мат/код)
3. Post-filter (Haiku) — проверяет ответ перед отправкой
4. Watcher — периодический аудит (cron)
Ядро `lib/ai/chatbot-processor.ts processChatbotMessage` — КАНАЛО-НЕЗАВИСИМО
(вход: candidateId+vacancy+текст; выход: action+reply, сам НЕ отправляет).
Отправка/история — на стороне канала (hh: scan-incoming; журнал ai_chatbot_messages).
Kill-switch: vacancy.aiChatbotEnabled / companies.aiChatbotKilled / platform emergency.
Telegram-канал для кандидатов — ТОЛЬКО фундамент (0158), не построен.

---

## 6. ДЕФОЛТЫ КОМПАНИИ (/hr/hiring-settings, Заход 3)
Per-company настройки в companies.hiring_defaults_json (+ отдельные колонки для
рабочих: aiChatbotKilled, aiAbuseMode, followUpSendDelaySeconds, trashRetentionDays).
GET/PATCH /api/modules/hr/company/hiring-defaults (deep-merge).
При создании вакансии (Заход 4) дефолты копируются: стоп-факторы (если флаг),
расписание (таймзона/часы/дни). Автоматизация воронки — пока не применяется.

---

## 7. КРОНЫ (на сервере crontab → /api/cron/*)
- hh-import (1 мин) — тянет отклики
- hh-incoming-messages (10 мин) — входящие сообщения чат-бота
- follow-up (1 мин) — дожимы
- prequalification (15 мин)
- pending-rejections (5 мин) — отложенные отказы (Заход 2)
- ai-chatbot-watcher, trash-cleanup, rubric-score и др.
Авторизация — заголовок X-Cron-Secret (env CRON_SECRET, литерально в crontab).

---

## 8. БД — ключевые таблицы (lib/db/schema.ts — источник правды)
- companies — тенант (бренд, hh-токены, дефолты найма, telegram)
- vacancies — вакансии (descriptionJson.anketa = вся анкета + AI-профиль; stopFactorsJson; funnelConfigJson; aiChatbot*)
- candidates — кандидаты (stage, source, aiScore/resumeScore/rubricScore, hh-данные, pending_rejection_*, telegram_chat_id)
- ai_chatbot_messages — журнал диалога бота (raw-SQL, не pgTable; channel='hh'|'telegram')
- demos / test_submissions — демо и тесты
- outbound_searches / outbound_candidates / hh_resume_view_quota — исходящий подбор
- platform_* — платформенное администрирование (/admin/platform)

Канон стадий воронки — lib/stages.ts. Source кандидата: hh / hh_outbound / site / ...

---

## 9. ГЛАВНЫЕ ИЗВЕСТНЫЕ ПРОБЛЕМЫ (из аудита, не сделано)
- Заглушки интеграций: Битрикс24/AmoCRM, Авито/SuperJob, домены — «Скоро».
- Channels в карточке кандидата (Telegram/WhatsApp/Email) — заглушка.
- 4 AI-инструмента в списке кандидатов (сравнение/вопросы/refcheck/оффер) —
  бэкенд рабочий, но отрезаны от UI ({false &&}).
- Шаблоны демо — в localStorage, а не в БД (хотя таблица есть).
- Скрининг-вопросы анкеты сохраняются, но никем не читаются.
- Активные баги (CLAUDE.md): B3 дубли Орлинка, B5 разные колонки, B6 фильтры,
  B8 порядок табов, B9 две системы статусов.
</content>
</invoke>
