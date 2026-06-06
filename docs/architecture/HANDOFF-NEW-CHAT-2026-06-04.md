# HANDOFF — передача в новый чат (04.06.2026)

> **Новый чат — читай ЭТОТ файл первым**, затем `00-START-HERE.md`.
> Здесь: новый режим работы, что Claude делает САМ, доступы, состояние, бэклог, правила.
> Проект: my-komanda / Company24.pro. Автор передачи — предыдущая сессия Claude.

---

## 0. ГЛАВНОЕ — РЕЖИМ СОВМЕСТНОЙ РАБОТЫ (это важнее всего)

Юрий — **продакт-фаундер**. Его роль в нашей работе: **сказать, что в итоге должно
получиться** (цель, результат, как должно быть), и направлять/подсказывать.
**Роль Claude: исполнять и САМ проверять результат.** Не перекладывать на Юрия то,
что Claude может сделать сам через терминал.

**Claude РАБОТАЕТ САМ (по умолчанию), не спрашивая разрешения на каждый шаг:**
- **Прод-сервер** — `ssh tz '...'` (алиас уже настроен на Mac Юрия → root@5.42.125.91,
  `/var/www/my-komanda`). Через него: править БД, читать логи, менять `.env`,
  гонять `curl`, `pm2 reload`, проверять HTTP-коды.
- **БД прода** — `ssh tz "sudo -u postgres psql -d mykomanda -c '...'"` (или `-tAc`).
- **Рижский VPS** (AI-прокси) — `ssh root@155.212.231.73 '...'` по ключу (ключ
  `jstumpf.de@gmail.com` уже в authorized_keys, заходит без пароля).
- **Браузер на проде** — playwright MCP (залогинен под тестовым аккаунтом), проверять
  UI/фетчи/песочницу прямо на https://company24.pro.
- **Локально** — код, `pnpm build`, git-коммиты в develop.

**Claude ОСТАНАВЛИВАЕТ Юрия только когда реально нужен ОН:**
- вход в **чужие панели** (beget, VNC-консоль, Cloudflare, Anthropic-консоль);
- **пароли/доступы, которых у Claude нет**;
- **продуктовые решения** (что строить, как должно выглядеть/работать);
- **запуск outward на ЖИВЫХ кандидатов** (письма/сообщения 1505 людям) — без явного OK;
- **деплой** — пушит в develop Claude, но `git pull + build + pm2 reload` на проде
  запускает по явной команде Юрия (правило проекта, чтобы не ронять сайт днём).

> Память: `working-mode-autonomous-terminal`, `working-mode-product-founder`.
> ⚠️ НЕ возвращать Юрию пошаговые «выполни в терминале X» для того, что Claude
> может выполнить сам через `ssh tz`. Это его бесит и теряет время.

---

## 1. ТЕКУЩЕЕ СОСТОЯНИЕ (на 04.06.2026)

- Ветка работы: **develop**. Локальный HEAD = **2feed7cc**. Прод HEAD = **2feed7cc**
  (СИНХРОНЫ, очередь деплоя пуста). Прод-ветка `main` — только для прода, напрямую не пушим.
- pm2 на проде: `my-komanda` **online** (порт 3000), `my-komanda-new-staging` online
  (стейджинг 3001). `company24-coordinator/worker/watchman` — **stopped** (не используются, не трогать).
- Незакоммичено локально: только `.claude/settings.local.json`, `.gitignore`, и untracked
  артефакты (скриншоты .jpeg, sheet-probe.json, доки .md). **Весь код сессии закоммичен.**
- **AI РАБОТАЕТ** (см. §2). **Чат-бот включён** на полигоне «Помощник по маркетингу».

### Что сделано в большой сессии 03–04.06 (всё в проде)
- **Phase 1 (паритет Funnel Builder)**: 17→20 блоков (Тест/quiz, callIntent «Хочет
  созвониться», recovery «Аварийное сообщение»); фикс пустого Sheet (B4 — подписан лоадер);
  честные бейджи «Нужно для AI-скрининга» (T5).
- **Quick-wins**: QW2 «Анкета»→«Вакансия» (таб редактора), QW3 «Talent Pool»→«Резерв»
  везде, QW5–9/QW11 (UI-пачка), QW10 плейсхолдеры orlink.ru→yourdomain.ru.
- **Q1**: активная вакансия уважает явный `?tab=` deep-link (page.tsx).
- **hiring-settings** (страница «Дефолты компании», была «вообще ничего не сделано»):
  B8 hydration-фиксы, O3 предупреждение ФЗ-152 при долгом хранении ПДн, O5 точечное
  отключение AI по вакансиям (+ новый эндпоинт `/api/modules/hr/company/ai-vacancies`),
  D12 скрытие stub-блоков под платформенного админа.
- **IA-навигация настроек** (D8): 4 раздела (Профиль/Интеграции/Дефолты/Служебные) в
  `components/settings/settings-header.tsx` (был отредактирован мёртвый файл —
  `settings-navigation.tsx` удалён).
- **Webhooks**: подключена реальная отправка вебхука при смене этапа кандидата
  (`app/api/modules/hr/candidates/[id]/stage/route.ts` → `lib/webhooks`).
- **Резерв R2**: таб «База» подключён к реальным кандидатам стадии `talent_pool`
  (новый GET `/api/modules/hr/talent-pool/candidates`). Кампании/Рефералы/Аналитика/
  Формы — ВСЁ ЕЩЁ MOCK (нужны новые таблицы+миграции, отдельный заход).
- **AI восстановлен** (главное этой сессии, см. §2).

---

## 2. AI-ИНФРАСТРУКТУРА — КРИТИЧНО (как починили и как проверять)

**Проблема:** Anthropic отдавал **403 «Request not allowed»** и на прямой прод-IP
(Россия), и на Cloudflare Worker `claude-proxy.jstumpf-de.workers.dev` (Cloudflare тоже
блокируется). Весь AI лежал: чат-бот, скоринг, watcher; песочница давала `classifier_error`.
Ключ и аккаунт при этом ЖИВЫЕ — дело чисто в гео/IP.

**Решение:** рижский VPS **155.212.231.73** (Латвия, Ubuntu 24.04, hostname `qlkxonmheu`,
в beget-VNC зовётся «Divine Lumi»). На нём **Caddy 2.6.2** (systemd, `/etc/caddy/Caddyfile`)
уже настроен как reverse-proxy к Anthropic на порту 8080:
```
:8080 { reverse_proxy https://api.anthropic.com { header_up Host api.anthropic.com } }
```
На этом же VPS в Docker крутится посторонний «Baff Trading» (порты 80/443/8000) — **не трогать**.

**Прод настроен** — в `/var/www/my-komanda/.env`:
```
CLAUDE_PROXY_URLS=http://155.212.231.73:8080,https://claude-proxy.jstumpf-de.workers.dev
```
(VPS первым, Cloudflare запасным — но запасной заблокирован, реально работает только VPS.)
`lib/claude-proxy.ts` читает CLAUDE_PROXY_URLS списком; `lib/ai/client.ts` берёт первый.
Применено через `pm2 reload my-komanda --update-env`. ⚠️ `.env` НЕ в git — при
`git reset --hard` деплое сохраняется (git его не трогает), но знать про это.

**Проверка живости AI** (если снова молчит / `classifier_error` — делать ПЕРВЫМ):
```bash
ssh tz 'cd /var/www/my-komanda; KEY=$(grep -m1 "^ANTHROPIC_API_KEY" .env | cut -d= -f2- | tr -d "\"");
curl -s -m20 -o/dev/null -w "%{http_code}\n" -XPOST http://155.212.231.73:8080/v1/messages \
 -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
 -d "{\"model\":\"claude-haiku-4-5-20251001\",\"max_tokens\":5,\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}"'
```
**200 = прокси жив.** 403/000/timeout = VPS/Caddy упал.

**Хрупкости (TODO на потом):**
- прокси по **http** — ключ Anthropic идёт прод→VPS открытым текстом. Лучше https
  (Caddy + домен + Let's Encrypt).
- зависит от **чужого VPS** «Baff Trading»; его ребут/падение Caddy → AI ляжет.
  Своего запасного прокси нет — стоит поднять.
- доступ к VPS по ключу `jstumpf.de@gmail.com`. Root-пароль `7!JFvnHu&sA7` Юрий
  вводил в чат — **сменить**.

> Память: `claude-proxy-riga-vps`. Старая память `claude-proxy-riga-vps` уже описывает это.

### Чат-бот включён на полигоне
`vacancies.ai_chatbot_enabled=true` на «Помощник по маркетингу»
(id `5ae8f734-b468-46fc-88f9-69ed662879ed`, компания ИП/Company24.Pro, 1505 кандидатов).
Промпт (2193 симв.) сохранён в `ai_chatbot_prompt`. Обкатка в песочнице пройдена: бот
представляется (Юлия), зарплату не называет (граница), режет инъекции. Крон
`scan-incoming` теперь **отвечает живым кандидатам** — Юрию стоит последить за первыми
диалогами. Песочница (без записи в БД): POST
`/api/modules/hr/vacancies/[id]/ai-chatbot/sandbox-message` `{message, history}`.

---

## 3. ДОСТУПЫ И СЕКРЕТЫ

- **Прод**: `ssh tz` (root@5.42.125.91), `/var/www/my-komanda`, pm2 `my-komanda:3000`.
- **Стейджинг**: `/var/www/my-komanda-new-staging`, pm2 `my-komanda-new-staging:3001`,
  домен new.company24.pro (из ветки develop).
- **БД**: `postgresql://mykomanda:Comp2024!@localhost:5432/mykomanda` (через `ssh tz`,
  `sudo -u postgres psql -d mykomanda`).
- **Рижский VPS (AI-прокси)**: `ssh root@155.212.231.73` по ключу (без пароля).
- **Тестовый аккаунт** (для playwright): `j.stumpf@yandex.ru` / `Reset2026!` (Директор,
  Company24.Pro). Второй: `j.stumpf@ya.by` (Орлинк — НЕ ТРОГАТЬ его живые вакансии).
- **Платформенный админ**: та же учётка, переключатель вверху справа. Защита —
  `PLATFORM_ADMIN_EMAILS`, ключ `PLATFORM_ADMIN_KEY` (env).
- **GitHub**: github.com/jstumpfde/my-komanda.
- **Env-переменные**: см. CLAUDE.md (DATABASE_URL, ANTHROPIC_API_KEY, CLAUDE_PROXY_URLS,
  NEXTAUTH_SECRET, PLATFORM_ADMIN_*, CRON_SECRET, HH_CLIENT_*).

⚠️ **Сменить (засветились в чате):** root-пароль VPS `7!JFvnHu&sA7`; пароль тестового
аккаунта `Reset2026!`. (Не блокер, но сказать Юрию ещё раз.)

---

## 4. БЭКЛОГ — пер-страничные задачники

Подробные статусы (✅/⏳/❓) — в `docs/architecture/`:
- **TASKS-hiring-settings.md** — «Дефолты компании» (O1-O6, I1-I5, P1). Сделано O3/O5/B8/D12.
- **TASKS-vacancy-editor.md** — главная вакансия (воронка/скоринг/табы, V1-V2, VA/VD/VO/VK/VS).
- **TASKS-calendar.md** — календарь (C1-C6). Сделано C1/C2.
- **TASKS-talent-pool.md** — «Резерв» (R1-R6). Сделано R1/R2/R6. Кампании/Рефералы/
  Аналитика/Формы — mock, нужны новые таблицы (talent_campaigns, referral_links) + миграции.
- **BUGS-AND-QUICKWINS.md** — баги + quick-wins, статусы.
- **SPEC-funnel-scoring-consolidation.md** — спека консолидации, фазы 2-6.

**Следующий крупный шаг по консолидации:** Phase 2 — заполнить `funnel_config_json`
из legacy-полей (Builder = источник правды). ⚠️ Только полигон «Помощник по маркетингу»,
массовую миграцию НЕ делаем (память `funnel-consolidation-scope-one-vacancy`), Орлинк не трогать.
Перед любой миграцией — **дамп БД** (см. §5).

---

## 5. ПРАВИЛА ПРОЕКТА (критично — см. CLAUDE.md)

- **Деплой только по явной команде Юрия**, вечером (днём роняет сайт у кандидатов),
  мягко: `git pull origin develop && pnpm build && pm2 reload my-komanda --update-env`
  (`--update-env` когда менялся `.env`). **Всегда `reload`, НЕ `restart`** (restart =
  5-8 сек простоя). **НИКОГДА `rm -rf .next` на живом проде в рабочее время** (инцидент 02.06).
- **Git**: работаем в develop. НИКОГДА не пушить в main. Перед merge develop→main —
  `git log develop..origin/main` (на проде бывают hotfix-коммиты).
- Перед миграцией БД — дамп:
  `ssh tz "pg_dump 'postgresql://mykomanda:Comp2024!@localhost:5432/mykomanda' -Fc -f ~/mykomanda-\$(date +%F).dump"`.
- ORM **Drizzle** (схема `lib/db/schema.ts`), не Prisma. Auth import `@/auth`.
- Перед API — проверять реальные колонки (`\d table` в psql). Тексты на русском.
  shadcn/ui + Tailwind. Не добавлять npm-пакеты без разрешения. Не трогать файлы не из задачи.
- `vacancies.status` = 'published' (у Орлинка 'active' — не трогать).
- Новые публичные токен-страницы кандидата → в middleware PUBLIC_PREFIXES
  (память `public-routes-middleware-whitelist`).
- public/uploads на проде — симлинк наружу; писать только через `lib/uploads-path.ts`
  (память `plan-a-uploads-symlink-breaks-turbopack-build`).
- **Outward к живым кандидатам** (письма/сообщения/чат-бот на реальных) — только с явным OK.

---

## 6. АКТИВНЫЕ БАГИ (не трогать без задачи)
- B3: дубли кандидатов у Орлинка (54 из 384). B5: разные колонки у разных HR.
- B6: фильтры в списке Орлинка не применяются. B8: порядок табов вакансии (фронт-фиксы сделаны).
- B9: две параллельные системы статусов кандидатов (решается консолидацией).

---

## 7. ПЕРВЫЕ ШАГИ ДЛЯ НОВОГО ЧАТА
1. Прочитать этот файл + `00-START-HERE.md`.
2. Проверить состояние: `cd ~/Projects/my-komanda && git status && git log --oneline -5`;
   `ssh tz 'cd /var/www/my-komanda && git rev-parse --short HEAD'` (локаль = прод?).
3. Спросить/уточнить у Юрия **цель** текущего захода (он скажет, что должно получиться).
4. Дальше — **работать автономно** (§0): делать сам через терминал/браузер, проверять
   сам, останавливать Юрия только при настоящем блоке (§0).
5. Если что-то с AI — сначала curl-проверка прокси (§2).
