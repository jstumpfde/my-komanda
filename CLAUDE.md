# CLAUDE.md — my-komanda / Company24.pro

## Словарь (для устранения путаницы)

ВЕТКА (Git):
- develop — для разработки и стейджинга
- main — для прода

СРЕДА:
- Локально — мой Mac, ~/Projects/my-komanda
- Стейджинг — new.company24.pro (запускается из ветки develop)
- Прод — company24.pro (запускается из ветки main)

ДОМЕН:
- company24.pro → Прод
- new.company24.pro → Стейджинг

ТЕХНИЧЕСКОЕ:
- Прод: /var/www/my-komanda + PM2 my-komanda (порт 3000)
- Стейджинг: /var/www/my-komanda-new-staging + PM2 my-komanda-new-staging (порт 3001)

ПРАВИЛО:
- Код → "ветка develop/main"
- Среда → "стейджинг/прод"
- Браузер → "new.company24.pro / company24.pro"

## Стек
Next.js 16.1.6 (App Router), TypeScript, Tailwind, shadcn/ui, pnpm, PostgreSQL 16, Drizzle ORM (НЕ Prisma)

## Инфраструктура
- Прод: 5.42.125.91, /var/www/my-komanda, PM2 my-komanda:3000
- БД: postgresql://mykomanda:Comp2024!@localhost:5432/mykomanda
- Ветки: develop (разработка) → merge в main → деплой с main. main = прод-ветка.
- GitHub: github.com/jstumpfde/my-komanda
- AI прокси: CLAUDE_PROXY_URL=https://claude-proxy.jstumpf-de.workers.dev

## Команды
- pnpm dev — локальная разработка
- pnpm build — проверка сборки перед коммитом
- kill $(lsof -t -i:3000) 2>/dev/null; pnpm dev — если порт занят

## КРИТИЧЕСКИЕ ПРАВИЛА

### Git
- Рабочая ветка: develop. Прод-ветка: main. Перед мерджем develop → main всегда проверять `git log develop..origin/main` — на проде могут быть hotfix-коммиты, которых нет в develop (их нужно подтянуть в develop перед мерджем).
- НИКОГДА не пушить в main напрямую
- НИКОГДА не делать git pull origin main без проверки git log origin/main..HEAD
- НИКОГДА не работать в двух Claude Code одновременно для одного проекта
- Перед началом работы: git status && git log --oneline -3

### Код
- ORM: Drizzle. Схема в lib/db/schema.ts
- Перед написанием API: проверить реальные колонки через \d tablename в psql
- Auth import: "@/auth" (не "@/lib/auth")
- Пути с (modules) в bash — в одинарных кавычках
- vacancies.status в БД = 'published' (не 'active') — но у Орлинка = 'active', не трогать

### Деплой
- Деплой делает Юрий сам: ssh tz "cd /var/www/my-komanda && git fetch && git reset --hard origin/main && pnpm build && pm2 reload my-komanda"
- НЕ пушить, НЕ деплоить самостоятельно без явной команды

### Тестирование
- После каждого изменения фронта: использовать playwright MCP для проверки в браузере
- URL прода: https://company24.pro
- Тестовый аккаунт: j.stumpf@yandex.ru (компания ИП Штумпф), j.stumpf@ya.by (Орлинк)

### Стиль кода
- Все тексты на русском
- shadcn/ui + Tailwind, без отдельных CSS файлов
- Не добавлять новые npm пакеты без явного разрешения
- Не трогать файлы не упомянутые в задаче

## Архитектура
app/(auth)/           — вход/регистрация
app/(public)/         — публичные страницы (демо кандидата, вакансия)
app/(platform)/       — основные страницы платформы
app/(modules)/        — модули (hr/*, marketing/*, ...)
app/(admin)/          — панель администратора
app/api/              — API роуты

lib/db/schema.ts      — Drizzle схема (источник правды)
lib/hh/               — hh.ru интеграция
lib/ai-screen-candidate.ts — AI скоринг кандидатов
hooks/use-candidates.ts    — хук пагинации кандидатов

## Активные баги (не трогать без задачи)
- B3: дубли кандидатов у Орлинка (54 из 384)
- B5: разные колонки у разных HR-юзеров
- B6: фильтры в списке Орлинка не применяются
- B8: неправильный порядок табов вакансии
- B9: две параллельные системы статусов кандидатов

## Platform-level operations (Group 14)

Скрытый раздел /admin/platform и набор API-эндпоинтов для платформенного
администратора. Эндпоинты защищены заголовком X-Platform-Admin-Key (значение
из env PLATFORM_ADMIN_KEY). UI защищён списком email в PLATFORM_ADMIN_EMAILS
(разделитель ","), при несовпадении возвращается 404 (не 403 — скрываем).

### Env переменные
- PLATFORM_ADMIN_KEY — секрет для curl-ов на /api/platform/*
- PLATFORM_ADMIN_EMAILS — белый список email через запятую для /admin/platform

### Settings migrations runner
Идемпотентные миграции данных/настроек, журнал — таблица
platform_settings_migrations. Список миграций — в
lib/platform/settings-migrations.ts (SETTINGS_MIGRATIONS).

```bash
curl -X POST https://company24.pro/api/platform/run-migrations \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY"
```

### Emergency broadcast
Срочные действия на всех компаниях. Каждое логируется в
platform_emergency_actions.

```bash
# Аварийно вырубить AI-чат-бот у всех компаний (companies.ai_chatbot_killed=true)
curl -X POST https://company24.pro/api/platform/emergency/kill-all-ai-chatbots \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY"

# Восстановить
curl -X POST https://company24.pro/api/platform/emergency/restore-all-ai-chatbots \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY"

# Добавить стоп-слово всем вакансиям, где его ещё нет
curl -X POST https://company24.pro/api/platform/emergency/add-stop-word \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"word":"спасибо за общение"}'

# Сбросить ai_chatbot_prompt у всех вакансий с включённым AI чат-ботом
curl -X POST https://company24.pro/api/platform/emergency/regenerate-ai-prompts \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY"
```

### Admin UI
Открыть https://company24.pro/admin/platform под аккаунтом из
PLATFORM_ADMIN_EMAILS. Табы: Migrations, Companies, AI vacancies, Emergency
(требует ввод «CONFIRM»), Logs.

## TODO (актуально на 18.05.2026)
- [ ] Подтянуть 4 коммита с main в develop: git checkout develop && git merge origin/main
- [ ] Удалить старую ветку deploy/pagination-clean (локально и на remote)
- [ ] Удалить старую ветку feat/pagination-v1
- [ ] Перевести стейджинг new.company24.pro с timestamped-ветки на develop
