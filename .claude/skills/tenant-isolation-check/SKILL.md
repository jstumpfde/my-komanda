---
name: tenant-isolation-check
description: Проверка изоляции компаний (мультитенант) в my-komanda — каждый API-роут должен фильтровать данные по companyId, чтобы компания НИКОГДА не видела чужих кандидатов/вакансий/клиентов. Использовать при ревью новых/изменённых роутов, перед мерджем, при аудите безопасности и когда Юрий просит «проверь изоляцию».
---

# Проверка изоляции тенантов (Company24)

SaaS: МНОГО компаний в одной БД. Критическое требование Юрия: компания НИКОГДА не
видит данные другой (кандидаты, вакансии, клиенты, демо, чаты, файлы, отчёты).

## Модель изоляции
- Тенант = `companies.id`. Сессия даёт `user.companyId` (через requireCompany/requireDirector из @/lib/api-helpers).
- Таблицы с прямым `company_id`: vacancies, hh_*, avito_integrations, outbound_searches, calendar_events, compare_*, report_shares, activity_log, rooms, vacancy_intakes, company_funnel_templates.
- Дочерние (через JOIN): candidates/demos/ai_chatbot_messages/test_submissions/candidate_contacts/vacancy_specs/vacancy_utm_links → привязаны через vacancy_id → vacancies.company_id.

## Эталонный паттерн (ОБЯЗАТЕЛЬНЫЙ)
```ts
const user = await requireCompany()            // или requireDirector для общекомпанийских настроек
// прямая сущность:
.where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
// дочерняя сущность (кандидат и т.п.):
.from(candidates)
.innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
.where(and(eq(candidates.id, id), eq(vacancies.companyId, user.companyId)))
```

## Что искать (типовые дыры IDOR)
1. **Сырой `where(eq(table.id, params.id))` БЕЗ companyId** — читает/пишет чужое по угаданному UUID (UUID кандидата светятся в публичных demo/anketa-ссылках!).
2. **Двухшаговая проверка** (сначала читаем сущность, потом отдельно проверяем компанию) — не атомарно + сущность читается до гейта. Свести в один JOIN-запрос.
3. **Soft-gate**: `if (!isPlatform && companyId && companyId !== x)` — при `companyId=null` пропускает. Правильно: `if (!isPlatform && (!companyId || companyId !== x))`.
4. **Доп. запросы** в роуте (напр. подтянуть city/birthDate по списку ids из query) без скоупа по компании.
5. **Public-роуты** (app/api/public/**, /demo/[token], /report/[token], /ask, /jobs, /careers, /vacancy/[slug]): токен должен скоупить на ОДНУ компанию/сущность; отдавать ТОЛЬКО публичные поля (без внутренних заметок/AI-оценок/телефонов чужих); только published + deletedAt IS NULL.
6. **Webhook'и** (telegram candidate-bot): связка по токену — добавлять проверку принадлежности компании бота.
7. **Роль vs компания**: общекомпанийские настройки (tg-токен, kill-switch AI, trash-retention, hh-connect, calendar/settings) → requireDirector, не requireCompany (любой hr_manager не должен их менять).
8. **Cron/process-queue**: кросс-тенантные seq-scan — фильтровать по company/inArray, не сканировать всех.

## Процедура
1. `git diff origin/main...HEAD -- 'app/api/**/route.ts'` — список затронутых роутов.
2. Для каждого: есть ли requireCompany/requireDirector? фильтр по companyId ИЛИ проверка принадлежности [id] ДО чтения/мутации?
3. Грепнуть подозрительное: `grep -rn "eq(.*\.id, .*params\|eq(.*Id, id)" app/api` без соседнего companyId.
4. Вердикт по каждому: OK / ⚠️ / 🔴. 🔴 = реальный IDOR с PoC. Чинить однотипно (JOIN+companyId).
5. Отчёт в docs/audit/ при системном аудите.

## История
Аудит 10.06 (флот 6 агентов) нашёл и закрыл: preview-candidate, undo-action, compare (IDOR), 4 soft-gate, ролевой кластер, send-email open-relay. База ядра — здоровая, дыры были точечные. См. docs/audit/SECURITY-AUDIT-2026-06-10.md.
