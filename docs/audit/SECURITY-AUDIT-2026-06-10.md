# Security-аудит 10.06.2026

> Запущен флот из 6 агентов по непересекающимся зонам. Только чтение, находки сводятся сюда.
> Прод = main `3f130a29` (на момент аудита). Чиним по серьёзности: 🔴 — немедленно, ⚠️ — батчем.
>
> ✅ **СТАТУС 10.06 вечер: патч безопасности P0+P1 СОБРАН и выкатывается** (develop→main `6dfb5696`,
> 3 фикс-агента A/B/C, сборка зелёная, стейджинг проверен: tts→401, jobs→200, next 16.2.9 ок).
> Все 🔴 (13) и большинство ⚠️ закрыты. Осталось P2 (техдолг) + постоянное наблюдение.
> Детали фиксов — в коммитах sec(P0/P1)/sec(P0) и в плане ниже (помечены ✅).

## Зона 1 — Изоляция тенантов (IDOR / кросс-тенант) ✅ отчёт получен

| ID | Серьёзность | Файл | Суть |
|---|---|---|---|
| **IDOR-1** | 🔴 КРИТ (write) | `app/api/modules/hr/vacancies/[id]/ai-chatbot/undo-action/route.ts:52-81` | Читает/пишет кандидата только по `candidates.id` без JOIN на companyId. Через свою вакансию + чужой candidateId (из публичных demo-ссылок) можно менять стадию/сбрасывать autoProcessingStopped чужого кандидата |
| **IDOR-2** | 🔴 ВЫСОКАЯ (read PII) | `app/api/modules/hr/vacancies/[id]/compare/route.ts:51-58` | Доп. запрос city/birthDate по `inArray(ids)` из query без companyId-фильтра. ПДн чужих кандидатов читаются на уровне БД (в HTTP-ответ при текущей логике не попадают, но запрос исполняется → дыра) |
| **IDOR-3** | ⚠️ СРЕДНЯЯ | `app/api/modules/hr/candidates/[id]/rubric-score/route.ts:27-42` | Tenant-проверка не атомарна (2 запроса), кандидат читается по id до проверки компании; race при переносе вакансии |
| IDOR-4 | ℹ️ INFO | `app/api/modules/hr/vacancies/[id]/analytics/route.ts:42-46` | Намеренный обход для platform_admin/manager — ОК, но проверить, что эти роли нельзя присвоить обычному HR через API |
| **WARN-1** | ⚠️ СРЕДНЯЯ | `app/api/modules/hr/send-email/route.ts` | Open relay: `{to,subject,body}` без привязки к кандидату/вакансии — любой залогиненный шлёт письмо на любой адрес от SMTP платформы (спам-вектор) |
| WARN-2 | 🟢 НИЗКАЯ | `app/api/modules/hr/vacancies/[id]/ai-chatbot/abuse-history/route.ts:47-61` | raw SQL LEFT JOIN candidates без tenant — реальной утечки нет (vacancy_id уже изолирован), техдолг |

**Вывод зоны 1:** основной паттерн `requireCompany() + innerJoin(vacancies, companyId)` соблюдён почти везде (CRUD кандидатов/вакансий, stage, notes, contacts, demos, calendar, bulk, trash, settings, templates, reports, chatbot GET/PUT, sandbox, watcher). Точечные дыры — в перечисленных 6 местах.

### План фиксов зоны 1
- IDOR-1, IDOR-2, IDOR-3: добавить `innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))` + `eq(vacancies.companyId, user.companyId)` в чтение/запись (один запрос вместо двух).
- WARN-1: send-email — привязать `to` к кандидату компании (брать email из БД по candidateId+companyId, а не из тела), либо ограничить роль/добавить companyId-гейт.
- IDOR-4: проверить мутации роли пользователя (нельзя ли выставить себе platform_admin).

### Зона 1b — изоляция (второй агент, core/public/cron) ✅ отчёт получен

| ID | Серьёзность | Файл | Суть |
|---|---|---|---|
| **IDOR-5** | 🔴 КРИТ | `app/api/modules/hr/vacancies/[id]/preview-candidate/route.ts:14-16` | НЕТ проверки companyId вакансии. Юзер компании A передаёт vacancyId компании B → создаётся превью-кандидат в чужой вакансии → по возвращённому token через `/api/public/demo/[token]` утекает всё демо/уроки/настройки чужой вакансии |
| **SOFT-GATE** | ⚠️ СРЕДНЯЯ (×4) | `vacancies/[id]/{stats,analytics,candidate-stats,mark-seen}/route.ts` | Гейт вида `if(!isPlatform && userCompanyId && userCompanyId!==vac.companyId)` — при `userCompanyId=null/undefined` проверка ПРОПУСКАЕТСЯ → данные чужой вакансии. Чинить: `if(!isPlatform && (!userCompanyId || userCompanyId!==vac.companyId)) 403` |
| **TG-START** | ⚠️ СРЕДНЯЯ | `app/api/telegram/candidate-bot/webhook/route.ts:122-138` | `handleStart` ищет кандидата по inviteToken без проверки, что он принадлежит компании этого бота. Токен 16 байт crypto (эксплуатация маловероятна), но архитектурно надо JOIN на companyId |
| candidate-update | 🟢 НИЗКАЯ | `app/api/public/candidate-update/[token]/route.ts:19-24` | Нет проверки `isNull(vacancies.deletedAt)` — можно обновлять кандидата удалённой вакансии (не кросс-тенант) |
| buildComparison | 🟢 НИЗКАЯ | `lib/compare/build-comparison.ts:131-140` | testSubmissions без vacancyId-scope — в ответ не утекает (фильтр выше), код-запах |

**Новые роуты сессии (F1–F7, R4, этап A) — изоляция ОК** на всех, кроме TG-START (⚠️). preview-candidate — СТАРЫЙ роут, не из этой сессии.

### ⭐ Сводный план фиксов изоляции (батч безопасности)
1. 🔴 **preview-candidate** — добавить `eq(vacancies.companyId, user.companyId)` в проверку вакансии.
2. 🔴 **undo-action** — JOIN candidates↔vacancies + companyId при чтении/записи кандидата.
3. 🔴 **compare** (доп. запрос city/birthDate) — скоупить ids по вакансии/компании.
4. ⚠️ **4 soft-gate роута** (stats/analytics/candidate-stats/mark-seen) — `(!userCompanyId || ...)`.
5. ⚠️ **send-email** — привязать получателя к кандидату компании.
6. ⚠️ **rubric-score** — один запрос с JOIN.
7. ⚠️ **tg webhook handleStart** — JOIN на companyId бота.
8. 🟢 candidate-update (deletedAt), abuse-history/buildComparison (техдолг).
+ проверить: нельзя ли через API выставить себе роль platform_admin (IDOR-4).

## Зона 3 — Инъекции/SSRF/XSS/файлы ✅ отчёт получен
| # | Серьёзность | Файл | Суть |
|---|---|---|---|
| X-1 | 🔴 КРИТ | `app/(public)/vacancy/[slug]/page.tsx:396` + `vacancies/[id]/route.ts:98` | **Stored XSS**: `description`/`companyDescription` сохраняются без санитизации и рендерятся через `dangerouslySetInnerHTML` на ПУБЛИЧНОЙ странице вакансии. HR (или угнанный HR-аккаунт) → `<script>`/`<img onerror>` исполняется у кандидатов. Чинить: серверная санитизация (DOMPurify/jsdom) при сохранении ИЛИ при рендере |
| X-2 | ⚠️ | `app/api/core/fetch-url` + `knowledge/ai-courses/fetch-url` + `lib/webhooks.ts`/`lib/bitrix.ts` | SSRF: fetch по URL без блокировки 127/10/169.254/192.168/::1. Webhooks стреляют авто при импорте. Чинить: blocklist приватных диапазонов |
| X-3 | ⚠️ | `lib/ai-screen-candidate.ts:122` | Prompt injection: резюме идёт в промпт; `manipulationDetected` НЕ блокирует — autoAction может остаться "invite". Чинить: при detected → autoAction="review" + cap score≤55 |
| X-4 | ⚠️ | `lib/hh/process-queue.ts:400`, `lib/candidate-tokens.ts:5` | Токены публичных страниц кандидата на `Math.random()` (не crypto) → сужение перебора. Чинить: crypto.randomBytes/nanoid |
| X-5 | ⚠️ | `lib/clean-html.ts:22` | cleanHtml сохраняет href (вкл. `javascript:`) на публичной странице кандидата — зависит от фильтрации hh |
| X-6 | 🟢 | `DevLoginClient.tsx:48` | Открытый редирект через callbackUrl (только dev) |
| X-7 | 🟢 | `lib/sanitize.ts` | Слабый санитайзер intake (данные в БД, не прямой HTML-рендер) |

**OK:** SQL-инъекций нет (whitelist сортировок, параметризация); upload-media (sanitizeId, MIME-whitelist, путь по candidate.id); JSON-LD (stripHtml+JSON.stringify); hh-import URL (только цифровой id, домен захардкожен).

## Зона 2 — Аутентификация/авторизация/роли ✅ отчёт получен
| # | Серьёзность | Файл | Суть |
|---|---|---|---|
| A-1 | 🔴 КРИТ | `app/api/tts/route.ts` (в PUBLIC_PREFIXES) | TTS БЕЗ авторизации — аноним жжёт Yandex TTS за счёт платформы |
| A-2 | 🔴 КРИТ | `app/api/integrations/hh/auth/route.ts` | hh OAuth-флоу без авторизации — открытый редирект от имени платформы |
| A-3 | 🔴 КРИТ | `app/api/telegram/webhook/route.ts:227` + `[tenantId]/route.ts:224` | Секрет ОПЦИОНАЛЕН (`if(WEBHOOK_SECRET)`) — если env не задан, любой шлёт поддельные апдейты → дёргает Claude (дубль D-5) |
| A-ROLE | ⚠️ КЛАСТЕР (директорские настройки под requireCompany) | `company/telegram`, `company/ai-chatbot-kill-switch`, `company/ai-abuse-mode`, `company/send-delay`, `company/trash-retention`, `calendar/settings`, `integrations/hh/connect+disconnect`, часть `hiring-defaults` (webhooks/bitrix/automation) | Любой hr_manager меняет общекомпанийские настройки (подменить tg-бот-токен → перехват, выключить AI всем, trash-retention=0 → авто-удаление, отключить hh). Должно быть requireDirector. Ср. memory company-settings-director-only |
| A-INVITE | 🟢 | `app/api/invites/route.ts:10` | CAN_INVITE содержит мёртвую роль "manager"; hr_lead исключён (вероятно намеренно) |
| A-VISIT | 🟢 | `/api/visit-log` | анонимный спам в visit_log (by design для трекинга) |

**OK:** все cron под X-Cron-Secret · все /api/platform/emergency под X-Platform-Admin-Key · /admin/* → 404 для не-платформы · companies/team/billing/invites POST под requireDirector · billing invoice→paid только platform · candidate-telegram-bot под requireDirector · /api/dev/* под denyIfNotDevAccess · /api/ai/messages под requireCompany.

---

# ⭐ СВОДКА И ПЛАН ФИКСА (приоритеты)

## 🔴 P0 — критические, чинить ПЕРВЫМ батчем безопасности
1. **next 16.1.6 → 16.2.5+** (D-1) — 7 high CVE, в т.ч. **обход авторизации через middleware**. Самое опасное.
2. **TTS без auth** (A-1) — добавить requireCompany.
3. **hh/auth без auth** (A-2) — добавить requireCompany.
4. **Telegram webhook: секрет обязателен** (A-3/D-5) — убрать `if`, всегда требовать.
5. **IDOR preview-candidate** (IDOR-5) — companyId-гейт.
6. **IDOR undo-action** (IDOR-1) — JOIN+companyId на write.
7. **IDOR compare** city/birthDate (IDOR-2) — скоуп ids.
8. **Stored XSS публичной вакансии** (X-1) — серверная санитизация description/companyDescription.
9. **Брутфорс логина** (D-2) — rate-limit на credentials.
10. **Пароль БД в seed-candidates.js** (S-1) — удалить из дерева (пароль уже ротирован 10.06).

## ⚠️ P1 — важные, вторым батчем
- A-ROLE кластер: вернуть requireDirector на ~10 company-настроек.
- soft-gate 4 роута (stats/analytics/candidate-stats/mark-seen).
- SSRF blocklist (X-2): fetch-url ×2 + webhooks/bitrix.
- upload-media rate-limit (D-4).
- security-заголовки в next.config (S-2): X-Frame-Options/CSP/HSTS/nosniff.
- prompt-injection скоринга (X-3): detected → review + cap score.
- токены кандидатов crypto (X-4).
- drizzle 0.45.1→0.45.2 (D-3).
- send-email open-relay (WARN-1), rubric-score race (IDOR-3), tg handleStart companyId (TG-START).
- ai/messages rate-limit + ограничить модель (S-3).

## 🟢 P2 — техдолг
serverActions bodySizeLimit, xlsx/lodash/xmldom бамп, ignoreBuildErrors, cleanHtml href, candidate-update deletedAt, knowledge-chat/context rate-limit, документировать PUBLIC_PREFIXES-паттерн, проверить self-эскалацию роли (IDOR-4), aiScore в demo-ответе, vacancy-view пароль по умолчанию.

**Итого: 13 🔴 + ~18 ⚠️ + техдолг.** Изоляция компаний (главный запрос Юрия): база здоровая, дыры точечные (8 мест), все в P0/P1.
## Зона 4 — Секреты/утечки/PII ✅ отчёт получен
| # | Серьёзность | Файл | Суть |
|---|---|---|---|
| S-1 | 🔴 КРИТ | `scripts/seed-candidates.js:3` | Пароль БД `mykomanda2026` хардкодом, закоммичен в main (b09ef669) + в истории. УДАЛИТЬ из дерева; пароль БД мы уже ротировали 10.06 (значит старый невалиден — проверить, что seed не на проде), но из git-истории чистить отдельно |
| S-2 | 🔴 КРИТ | `next.config.mjs` | Нет security-заголовков: X-Frame-Options/CSP frame-ancestors (iframe-able → clickjacking), HSTS, nosniff, Referrer-Policy, Permissions-Policy |
| S-3 | ⚠️ | `app/api/ai/messages/route.ts:63` | Нет rate-limit + любая claude-* модель (включая opus) → финансовый риск при компрометации сессии |
| S-4 | ⚠️ | `app/api/core/fetch-url/route.ts` | SSRF: не блокирует private IP (127/169.254/10/192.168/172.16) → сканирование внутренней сети, облачная метадата |
| S-5 | ⚠️ | `app/api/public/demo/[token]/route.ts:50,221` | aiScore кандидата уходит в публичный ответ (видно в DevTools) |
| S-6 | ⚠️ | `app/api/public/vacancy-view/[token]` | AI-оценки кандидатов без обязательного пароля (если HR не задал) |
| S-7 | ⚠️ | `app/api/public/candidate-update/[token]` | email+phone кандидата по токену из письма |
| S-8 | 🟢 | `app/api/auth/sms/send/route.ts:61` | SMS-код в console.log при отсутствии SMSRU_API_KEY (на проде ключ есть) |

## Зона 5 — Зависимости/конфиг/rate-limit ✅ отчёт получен
| # | Серьёзность | Что | Действие |
|---|---|---|---|
| D-1 | 🔴 P0 | **next 16.1.6 → 16.2.5+** — 7 high CVE, среди них middleware/proxy bypass (ОБХОД АВТОРИЗАЦИИ!), SSRF image, DoS | обновить минор |
| D-2 | 🔴 P0 | **Нет rate-limit на credentials-логин** (`/api/auth/[...nextauth]`) → брутфорс паролей без ограничений | добавить лимит попыток |
| D-3 | 🔴 P1 | **drizzle-orm 0.45.1 → 0.45.2** — патч SQL-injection (эксплуатации в нашем коде не видно) | патч-бамп |
| D-4 | 🔴 P1 | **upload-media** публичный, файлы до 200MB, без rate-limit → исчерпание диска | лимит по IP/token |
| D-5 | ⚠️ P2 | knowledge-bot telegram webhook: secret ОПЦИОНАЛЕН + нет лимита на Claude → абуз квоты | secret обязательным + лимит |
| D-6 | ⚠️ P2 | `serverActions.bodySizeLimit: 200mb` на ВСЕ Server Actions → DoS | сузить |
| D-7 | ⚠️ P3 | xlsx (prototype pollution/ReDoS), lodash через recharts, @xmldom через mammoth | обновить/заменить |
| D-8 | ⚠️ P3 | `typescript.ignoreBuildErrors:true` | убрать после чистки ~57 ошибок |
| D-9 | ℹ️ | @anthropic-ai/sdk 0.82→0.91+ (file perms, не используем filesystem memory) | плановый бамп |

**Cron — OK** (все 24 под X-Cron-Secret, health-check намеренно открыт без данных). **Build-артефакты — OK** (не в git). Кандидатский tg-webhook — OK (secret обязателен). Middleware: `/api/modules` и `/api/core` в PUBLIC_PREFIXES — реальной дыры нет (все вызывают requireCompany), но паттерн опасен → задокументировать.
## Зона 6 — Изоляция тенантов (core/public/cron) — ⏳ в работе (tenant-isolation-audit)
