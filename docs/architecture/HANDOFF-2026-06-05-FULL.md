# HANDOFF — полная передача дел (сессия 04→05.06.2026)

> Новый чат: прочитай ЭТОТ файл первым. Подробнейший отчёт обо всём за сессию.
> ⚠️ ОБНОВЛЕНО: **ВСЁ ВЫКАЧЕНО НА ПРОД** (company24.pro). Прод == develop, HEAD **4e0bd4cb**.
> Реальный outward (рассылки кандидатам) НЕ включали (Phase 3 off, C6 без crontab, hh-маппинги off).
> Свежее (после раздела «3») — см. раздел **8. ПРОДОЛЖЕНИЕ** внизу.

---

## 0. РЕЖИМ РАБОТЫ (важно)
- Автономно: брать задачи, делать, коммитить в develop, выкатывать на стейджинг,
  не спрашивать по мелочам. Юрий проверяет визуально на стейджинге и даёт фидбек.
- **НЕ деплоить ПРОД сам.** Прод — пачкой, когда Юрий скажет «прод» (дамп БД + миграции
  + build + pm2 reload).
- **НЕ включать outward** без OK: AI-чат-бот рассылка, авто-отказ, прогрев Резерва,
  Битрикс-отправка, Phase 3. C6-напоминания HR — внутренние, не кандидату (ок).
- **Дизайн-эталон — Календарь** (`/hr/calendar`). Все новые/правленые страницы — в этом
  стиле. Референс: `docs/architecture/DESIGN-REFERENCE.md`. Память: design-reference-calendar.
- ⚠️ Визуальную проверку фронта Я делать НЕ МОГУ (DNS/сеть с Mac в окружении закрыты,
  браузер не резолвит new.company24.pro). Проверяю сборкой (`pnpm build`) + серверным
  curl через `ssh tz`. Поэтому Юрий смотрит глазами на стейджинге.

## 1. ДОСТУПЫ / ИНФРА (без изменений)
- Прод: `ssh tz` (root@5.42.125.91), /var/www/my-komanda, pm2 my-komanda:3000.
- Стейджинг: /var/www/my-komanda-new-staging, pm2 my-komanda-new-staging:3001,
  БД mykomanda_new_staging (копия прода). Домен new.company24.pro за basic-auth
  **yuri / Komanda2026**. Тест-аккаунт j.stumpf@yandex.ru (ГК Орлинк / ИП Штумпф).
- AI-прокси: рижский VPS 155.212.231.73:8080.
- ⚠️ Стейджинг telegramBotToken/chatId скопированы с прода → НЕ включать cron-рассылки/
  C6-crontab на стейджинге (уйдёт реальным компаниям).

## 2. РАБОЧИЙ ЦИКЛ ДЕПЛОЯ НА СТЕЙДЖИНГ (мой основной)
```
cd ~/Projects/my-komanda && git add <files> && git commit && git push origin develop
ssh tz 'cd /var/www/my-komanda-new-staging && git pull origin develop -q \
  && [sudo -u postgres psql -d mykomanda_new_staging -f drizzle/NNNN.sql — если миграция] \
  && pnpm build && pm2 reload my-komanda-new-staging'
```
Локальный билд перед коммитом обязателен (EXIT 0). После `pm2 reload` ждать ~6 сек
перед health-check (иначе ловишь 502 в окне reload — это НЕ падение).

---

## 3. ЧТО СДЕЛАНО (26 коммитов, b18a6c83 → 0f7dac5e). Всё на стейджинге.

### 3.1. Быстрые фиксы по очереди (вечер 04.06)
- **B5/#31 + #29** `b18a6c83` — `app/api/ai/vacancy-advisor/route.ts`: детерминированная
  пост-обработка секции «О компании» в AI-пути (если описание есть — ok; пусто — максимум
  warning, не error). `components/vacancies/vacancy-advisor.tsx`: карточка «О компании»
  в AI-панели не дублирует текст (он в блоке 4 формы), убран мёртвый чекбокс.
- **#50** `29bbb2b8` — `app/(modules)/hr/calendar/page.tsx`: тело Sheet «Настройки
  календаря» прижималось к краям (SheetContent без px, SheetHeader p-4) → добавлен `px-4 pb-6`.
- **#39** `29bbb2b8` — `components/hr/integrations-content.tsx`: вместо россыпи «Скоро»
  (Авито/SuperJob/Яндекс) — одна карточка «+ Добавить источник» (аккордеон) в стиле hh.
- **QW4** `2c17e257` — `app/(modules)/hr/hiring-settings/page.tsx`: убран «Видео-звонок
  Telegram» из способов интервью (Я.Телемост уже был).
- **#34** — ПРОВЕРЕНО, рабочее (дропдаун «Заполнить из…» в `vacancies/[id]/page.tsx:2367`
  все 4 пункта бьют в реальные эндпоинты). Кода не менял.

### 3.2. Задача 2 — мультикомпания vacancy-side (O1 ч.2) `494ba9ed` + доработки
- `components/vacancies/anketa-tab.tsx`: в блоке «О компании» селектор «Компания
  вакансии» когда в Настройках найма включён showCompanySelector. brandCompanyId
  хранится в descriptionJson.anketa (без миграции). Предвыбирается дефолтная компания.
- `app/api/public/vacancy/[slug]/route.ts`: API резолвит brandCompanyId → кандидат видит
  название выбранного бренда вместо основной компании.
- Доработки по фидбегу Юрия (несколько итераций, `26bbf98b`, `12d88dbf`, `0f7dac5e`):
  - Настройки найма → блок «Выбор компании»: основная компания КАРТОЧКОЙ (название из
    профиля + редактируемое описание кандидатам). Дубля описания НЕТ (отдельная карточка
    «Описание компании» удалена, слита сюда).
  - Дефолт — ЧЕКБОКС «По умолчанию» (основная или бренд). Поле hiringDefaults.defaultBrandCompanyId.
  - Список доп. компаний СВОРАЧИВАЕМЫЙ. Свёрнуто → показывается компания ПО УМОЛЧАНИЮ
    (одна). Развёрнуто → основная (editable) + бренды.
  - Порядок: drag-and-drop за ручку ⠿ (native dnd) + стрелки ↑↓. Поле в массиве brandCompanies.

### 3.3. S2 — унификация таблиц (~69 таблиц, ВЕСЬ внутренний продукт)
Коммиты: `da8cbd09 c4a69fb9 89589c18 e63fedb6 4e604671 b7420353`. Сырые
`<table>/<thead>/<th>/<tr>/<td>` → примитивы `components/ui/data-table.tsx`
(TableCard/DataTable/DataHead/DataHeadCell/DataRow/DataCell). Единый вид, функционал 1:1.
Модули: HR (positions/departments/pulse-surveys/flight-risk/talent-pool/adaptation×2/
vacancy-аналитика/hiring-settings), talent-pool/Резерв (5 компонентов), платформа
(billing/team/referrals/analytics), sales(6)/marketing(6)/warehouse(9)/admin(7)/
knowledge-v2(7)/learning(3)/dialer(2)/b2b/qc/logistics(5) + HR-компоненты (outbound-sourcing/
utm-links/candidates-progress-mini) + публичная ref/[id]. Делалось пачками субагентов,
собиралось централизованно. **НЕ трогал** (намеренно): матрицы со sticky/динам. колонками
(settings/roles, module-access, upgrade, admin/roles, vacancies/[id]/compare, test-table,
public/compare), тёмный public/landing, HTML-строка public/demo. Память: table-unification-complete.

### 3.4. C6 — напоминания об интервью `06ac9b96` (миграция 0172)
- Источник — записи КАЛЕНДАРЯ (calendar_events, type='interview'). НЕ mock-модуль.
- Cron `app/api/cron/interview-reminders/route.ts` (GET/POST, X-Cron-Secret): интервью в
  окне 24ч и 2ч до start_at → ВНУТРЕННЕЕ напоминание HR/организатору (in-app notifications,
  userId=createdBy + Telegram-канал компании sendToCompanyChannel). НЕ кандидату.
- Миграция 0172: calendar_events.remind_24h_sent_at / remind_2h_sent_at (идемпотентно).
- Уважает тумблеры hiringDefaults.schedule.remind24h/remind2h (дефолт ВКЛ). E2E-проверено
  на стейджинге (sent2h/sent24h, повтор 0 дублей, cron_runs).
- ⚠️ НЕ в crontab — активирует Юрий на ПРОДЕ (строка раз в час в шапке роута). На стейджинг crontab НЕ ставить.

### 3.5. #60 — конфликты времени в календаре `5cfe3f5c`
- `app/api/modules/hr/calendar/conflicts/route.ts`: пересечения по времени (та же
  переговорная — roomConflicts; общее двойное бронирование — timeConflicts).
- `components/calendar/event-modal.tsx`: авто-проверка при изменении времени/комнаты
  (дебаунс 400мс), мягкое предупреждение amber, НЕ блокирует.

### 3.6. ФЗ-152 — журнал аудита ПДн `bdeea557` (миграция 0173) + `fea0428b`
- Миграция 0173: таблица audit_log (tenant/user/action/entity/count/meta/ip).
- `lib/audit/log.ts`: logAudit() (не блокирует/не бросает) + ipFromRequest().
- Подключено: экспорт кандидатов (`vacancies/[id]/export-candidates`: candidate_export),
  bulk удаление (`candidates/bulk`: candidate_delete trash/hard_delete).
- `app/api/modules/hr/audit-log/route.ts` (GET, админ/директор) + страница `/hr/audit-log`.
- Просмотр контактов по карточке НЕ логируем (был бы шум).

### 3.7. Модуль «Интервью» — mock → реальные данные (миграции 0174, 0175)
- `9b682831` инкр.1: миграция 0174 — calendar_events + candidate_id/vacancy_id/interviewer/
  interview_type/interview_format. Calendar API POST/PATCH принимают, GET (select *) отдаёт.
- `117a37e0` инкр.3: `app/(modules)/hr/interviews/page.tsx` БОЛЬШЕ НЕ MOCK — грузит интервью
  из календаря (`/api/modules/hr/calendar?type=interview`), маппит (candidate=title, vacancy
  по vacancyId, статус из event.status+время). Drag-перенос времени/статуса персистится
  (PATCH). id: number→string.
- `2ee710b9` инкр.2: `components/calendar/event-modal.tsx` — при type='interview' поля
  Вакансия(селектор)/Интервьюер/Тип/Формат. `components/calendar/week-view.tsx` CalendarEvent
  расширен.
- `798fcee6`: миграция 0175 — calendar_events.interview_status (полный статус 5 значений,
  включая «Не явился»). Маппинг приоритетно берёт его.
- `1b14fd8a`: кнопка «Запланировать интервью» + форма создания прямо на странице интервью
  (кандидат/вакансия/дата/время/длит./интервьюер/тип/формат → POST события type='interview').
- C6-напоминания уже шлют название события (= кандидата).

### 3.8. Дизайн — эталон + выравнивание `1429becc` `c86af531`
- Создан `docs/architecture/DESIGN-REFERENCE.md` (эталон = Календарь: акцент primary/violet,
  заголовок иконка text-violet-600 + h1 text-lg, переключатели shadcn Tabs, без кастомных hex).
- Память: design-reference-calendar.
- Интервью: убран оранжевый #C0622F, заголовок и переключатель вида приведены к эталону.
- Audit-log: заголовок text-lg + иконка violet.
- ⚠️ ОСТАЛОСЬ: у части старых страниц (positions/departments и др.) заголовки text-xl + серая
  иконка — мелко расходятся с эталоном. Свип заголовков под референс — НЕ сделан (1-2ч).

### 3.9. Маппинг воронки ↔ hh.ru `ac037dd9` + `1c86b7b5`
- НАХОДКА: компонент per-vacancy маппинга `components/vacancies/funnel-tab.tsx` (с
  редактором стадий + hh-действие на стадию) был НАПИСАН, но НИГДЕ НЕ РЕНДЕРИЛСЯ (осиротел),
  а таб «Воронка» вакансии (AutomationSettings) свою pipeline-секцию удалил. Поэтому
  стадии/маппинг негде было настроить.
- `ac037dd9` company-level дефолт: hiringDefaults.stageHhActions (Record<slug, invitation|
  discard|null>). `lib/stages.ts` getDefaultPipeline/parsePipeline принимают company-дефолты.
  `lib/hh/sync-stage.ts` подтягивает их → при смене стадии шлёт hh-действие даже без кастомной
  воронки. UI: Настройки найма → «Воронка → действия в hh.ru» (Select на стадию).
- `1c86b7b5` смонтировал FunnelTab в таб «Воронка» вакансии (`vacancies/[id]/page.tsx`):
  пресет + включение/переименование/цвет стадий + hh-действие на стадию (переопределяет
  company-дефолт). initialPipeline берёт company-маппинг (key-ремаунт при подгрузке).
- hh API поддерживает: invitation(phone_interview)/assessment/discard. Маппим invite+discard.

---

## 4. МИГРАЦИИ — для ПРОД-активации (когда Юрий скажет «прод»)
Применять по порядку на проде (после дампа БД):
- `0172_interview_reminders.sql` — calendar_events.remind_24h_sent_at / remind_2h_sent_at
- `0173_audit_log.sql` — таблица audit_log
- `0174_calendar_interview_fields.sql` — calendar_events.candidate_id/vacancy_id/interviewer/
  interview_type/interview_format
- `0175_interview_status.sql` — calendar_events.interview_status

Все применены на стейджинге. Прод-деплой:
```
ssh tz "pg_dump 'postgresql://mykomanda:Comp2024!@localhost:5432/mykomanda' -Fc -f ~/mykomanda-$(date +%F).dump"
ssh tz 'cd /var/www/my-komanda && git pull origin develop \
  && for m in 0172_interview_reminders 0173_audit_log 0174_calendar_interview_fields 0175_interview_status; do \
       sudo -u postgres psql -d mykomanda -f drizzle/$m.sql; done \
  && pnpm build && pm2 reload my-komanda --update-env'
```
Для **C6** на проде добавить в crontab (раз в час):
```
0 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  https://company24.pro/api/cron/interview-reminders >> /var/log/interview-reminders.log 2>&1
```

---

## 5. ОТКРЫТО (план, не сделано)
| Задача | ETA | Тип |
|--------|-----|-----|
| Свип заголовков всех страниц под эталон дизайна | 1–2 ч | 🟢 |
| Новый IA (4 раздела) | 6–10 ч | 🟢 большой (визуал) |
| Мульти-hh (N подключений) | 10–16 ч | 🔴 outward/доступы |
| Битрикс/CRM подключение + роутинг | 6–8 ч | 🔴 API |
| Свой домен клиента (hr.client.ru) | 3–4 ч | 🔴 per-client |
| Прогрев Резерва / авто-отказ / чат-рассылка / Phase 3 | — | 🔴 outward (OK Юрия) |
| Per-vacancy переопределение маппинга — ПОДКЛЮЧЕНО (FunnelTab в табе «Воронка») | done | — |
| Company-level «переименовать/покрасить стадии разом» | 2–3 ч | 🟢 (если захочет) |
| Активные баги B3 (дубли Орлинк) / B9 (две системы статусов) | — | ⚠️ «не трогать без задачи» |
| assessment-действие в hh (тестовое) в маппинге | ~1 ч | 🟢 |

## 6. ЗАМЕТКИ / РИСКИ
- В коммит `e63fedb6` случайно попали ранее-неотслеженные рабочие .md-доки (через `git add -A`)
  + `.claude/settings.local.json`. Безвредно, историю develop НЕ переписывал (без force-push).
  Дальше — `git add` точечно.
- На стейджинге остались тест-события с префиксом `[удалить]` (cancelled, безвредны) —
  можно дропнуть вручную (хук блокирует DELETE из-под Claude).
- Тонкие статусы интервью «Пройдено/Не явился» — «Не явился» теперь хранится в
  interview_status (раньше терялся).
- C6/интервью: напоминание уходит HR (организатору). Если нужно КАНДИДАТУ (адрес/ссылка) —
  это outward + есть привязка candidateId на событии, но текст/канал кандидату не настроен.

## 7. КЛЮЧЕВЫЕ ФАЙЛЫ (карта)
- Воронка/стадии/hh: `lib/stages.ts` (источник правды стадий), `lib/hh/sync-stage.ts`,
  `components/vacancies/funnel-tab.tsx` (редактор), `app/api/.../[id]/pipeline/route.ts`.
- Календарь/интервью: `app/(modules)/hr/calendar/page.tsx`, `components/calendar/event-modal.tsx`,
  `app/(modules)/hr/interviews/page.tsx`, `app/api/modules/hr/calendar/{route,[id]/route,conflicts/route}.ts`,
  `app/api/cron/interview-reminders/route.ts`.
- Мультикомпания/настройки: `app/(modules)/hr/hiring-settings/page.tsx`, `components/vacancies/anketa-tab.tsx`,
  `app/api/public/vacancy/[slug]/route.ts`, `app/api/modules/hr/company/hiring-defaults/route.ts`.
- Аудит: `lib/audit/log.ts`, `app/api/modules/hr/audit-log/route.ts`, `app/(modules)/hr/audit-log/page.tsx`.
- Дизайн: `docs/architecture/DESIGN-REFERENCE.md`, эталон `app/(modules)/hr/calendar/page.tsx`.
- Схема: `lib/db/schema.ts` (CompanyHiringDefaults — stageHhActions/defaultBrandCompanyId/
  brandCompanies; calendarEvents — interview-поля).

---

## 8. ПРОДОЛЖЕНИЕ (05.06, после раздела 3 — всё уже на ПРОДЕ)

### 8.1. ПРОД-ДЕПЛОЙ состоялся ✅
- Прод выкачен на develop, миграции **0166–0175 применены** (все аддитивные/idempotent).
- Дамп до деплоя: `/root/backups/ROLLBACK-2026-06-05-predeploy.dump`.
- С тех пор каждая правка деплоится и на стейджинг, И на прод (build + `pm2 reload`).
- Прод HEAD = develop HEAD (на момент записи **4e0bd4cb**). Деплоить нечего.
- **Outward по-прежнему OFF:** Phase 3 (`funnel_runtime_enabled`)=false; C6-крон НЕ в crontab
  (строка в шапке `app/api/cron/interview-reminders/route.ts` — активирует Юрий);
  hh-маппинги воронки по умолчанию «ничего».

### 8.2. Откат и бэкапы (см. docs/architecture/ROLLBACK-RUNBOOK.md)
- Авто-бэкап БД: cron `0 3 * * *` → `/root/backups/*.sql.gz`, ротация 30 дней.
- Git-теги: **`prod-rollback-2026-06-05`** (код до деплоя) и **`release-2026-06-05`** (релиз).
- Локальные копии БД на Mace Юрия: `~/my-komanda-backups/` (current + predeploy, валидны).
- ⚠️ Пробел: офсайт-бэкапа нет (всё на том же сервере). Рекомендация — rclone в облако.

### 8.3. Новые фичи (после раздела 3, всё на проде)
- **Platform Admin → таб «Сроки»** (`/admin/platform`): TLS-серты (живая проверка node tls —
  основной до 30.08, **wildcard *.company24.pro до 02.09**, стейджинг до 30.07), hh-токены по
  компаниям, кроны (последний запуск из cron_runs), бэкапы. Кнопка «↻ Обновить».
  Эндпоинт `app/api/platform/deadlines/route.ts` (защита — isPlatformAdminEmail).
- **Страница сравнения кандидатов** (`hr/vacancies/[id]/compare`): ячейки свёрнуты до 8 строк
  (клик раскрывает) + кнопка «Раскрыть всё»; ресайз колонок за правую границу; **AI-группировка
  текстовых ответов** в фильтре (кнопка «Сгруппировать (AI)» → эндпоинт `.../compare-group`);
  секции фильтра (Тест/Демо/Анкета) сворачиваемые, «Тест» развёрнут по умолчанию.
- **Карточка кандидата** (`components/candidates/candidate-drawer.tsx`): подтверждающие диалоги
  «Пригласить на интервью» / «Отказать» (кнопка выразительнее); **инлайн-переименование имени**
  (карандаш у имени → PUT `/candidates/[id] {name}`) — для анонимных «Новый кандидат».
- **Мультикомпания (Настройки найма)** — финальный вид по фидбеку: основная компания
  (название+описание, без дубля «Описание компании»), чекбокс «По умолчанию», сворачиваемый
  список (свёрнуто → видна дефолтная), **drag-and-drop ⠿** + стрелки.
- **Маппинг воронки→hh** + **FunnelTab подключён** в таб «Воронка» вакансии (был осиротевшим).
- **Дизайн-эталон** — Календарь. Интервью/аудит выровнены; **свип заголовков остальных страниц
  под эталон (text-lg + иконка violet) НЕ сделан** (1–2ч 🟢).

### 8.4. РАЗБОР: анонимные «Новый кандидат» (важно для следующего чата)
Юрий шлёт ОДНУ ссылку из «Источников» многим hh-кандидатам. Кто переходит и делает тест —
создаётся как аноним: stage `new`/`test_task_done`, source=`other`,
`referred_by_short_id='src:52b59348...'`, **БЕЗ имени/контактов/hh-привязки** (демо+анкета не
пройдены — только тест). На вакансии 58ba1d88: 30 таких (26 в `new`).
- **Восстановить их авто НЕЛЬЗЯ** — данных в БД нет (hh_responses не привязаны, осиротевших
  с именами у компании нет, в ответах теста имени нет). Только ручное (A: переименование) или
  опознание по ответам. Юрий сказал «подумаю как, напишу позже».
- Причина: **общая ссылка не знает, КТО по ней перешёл** → hh-резюме подтянуть нельзя. hh-данные
  тянутся только при реальном отклике на hh (это работает).
- **B1 (СОГЛАСОВАНО, на будущее, НЕ сделано):** запрашивать имя+телефон ПЕРЕД тестом для
  анонимных. ⚠️ Перед стройкой уточнить у Юрия, КУДА ведёт его ссылка из «Источников» (тест
  напрямую?), чтобы поставить гейт на правильный вход — ИЛИ сделать универсальный
  name-gate перед тестом. Демо-флоу анкету с телефоном уже спрашивает (но анонимы её минуют).

### 8.5. ОТКРЫТО (актуальный список)
- **B1** — name-gate перед тестом (согласовано, ждёт уточнения входа от Юрия).
- Восстановление существующих анонимов — Юрий думает, напишет позже.
- Свип заголовков под дизайн-эталон (1–2ч 🟢).
- Офсайт-бэкап (rclone, нужны бакет+ключи).
- C6-crontab активация (внутреннее, по решению Юрия).
- Большие: новый IA, мульти-hh, Битрикс/CRM, свой домен (🔴 доступы/решения).
- Баги B3 (дубли Орлинк) / B9 (две системы статусов) — «не трогать без задачи».
- Wildcard-серт продлить до 02.09 (Timeweb DNS-01).
