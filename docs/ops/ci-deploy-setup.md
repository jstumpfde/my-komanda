# CI-деплой: off-box сборка + атомарный своп

Дата: 2026-06-10  
Статус: готово к включению (workflow_dispatch, не автозапуск)

---

## Архитектура потока

```
GitHub Actions (ubuntu-latest)          Сервер (5.42.125.91)
──────────────────────────────          ────────────────────
checkout                                /tmp/deploy-artifact.tar.gz
pnpm install (cached)          scp →   /tmp/receive-artifact.sh
pnpm build
verify BUILD_ID                ssh →   bash receive-artifact.sh
tar (.next + package.json                 └─ распаковка в .next-incoming
     + pnpm-lock.yaml)                    └─ verify BUILD_ID
                                          └─ pnpm install --prod
                                          └─ mv .next → .next-prev
                                          └─ mv .next-incoming → .next
                                          └─ pm2 reload (НЕ restart)
                                          └─ health-check (5 попыток)
                                          └─ при провале: откат + reload
```

**Ключевое отличие от старого deploy-prod-safe.sh:**
- Сборка происходит в CI, не на проде → нет нагрузки на прод-CPU
- Своп `.next` только после полной распаковки (исправлен инцидент ENOENT)
- `deploy-prod-safe.sh` остаётся рабочим fallback-ом, ничего не ломаем

---

## Шаг 1: Secrets в GitHub

Перейти: GitHub → repo → Settings → Secrets and variables → Actions

Создать 5 secrets:

```bash
# 1. SSH-ключ (приватный) для деплой-пользователя
gh secret set DEPLOY_SSH_KEY < ~/.ssh/id_deploy_prod

# 2. IP сервера
gh secret set DEPLOY_HOST --body "5.42.125.91"

# 3. Пользователь SSH (обычно root или deploy)
gh secret set DEPLOY_USER --body "root"

# 4-5. Нужны для pnpm build в CI:
gh secret set NEXTAUTH_SECRET --body "<значение из .env на сервере>"
gh secret set DATABASE_URL    --body "<значение из .env на сервере>"
```

> **Примечание про DATABASE_URL в CI:** Next.js build не выполняет миграции,
> но некоторые пути могут инициализировать Drizzle при импорте. Если build
> падает с «cannot connect to DB» — добавь DATABASE_URL. Если нет — не нужен.

---

## Шаг 2: Положить receive-artifact.sh на сервер

Скрипт scp-ится каждый раз при деплое (workflow копирует его из репо).
При первом запуске — убедиться, что `/tmp` доступен на запись (обычно да).

Опционально — положить постоянную копию:

```bash
scp scripts/deploy/receive-artifact.sh root@5.42.125.91:/root/receive-artifact.sh
chmod +x /root/receive-artifact.sh
```

---

## Шаг 3: Первый тестовый прогон (ОБЯЗАТЕЛЬНО на стейджинге)

1. Перейти: GitHub → Actions → «Deploy (off-box build)»
2. Нажать «Run workflow»
3. Параметры:
   - **environment**: `staging` (дефолт — всегда начинать с него!)
   - **ref**: `develop` (или оставить пустым)
4. Проверить new.company24.pro (через `curl http://127.0.0.1:3001` на сервере,
   так как стейджинг закрыт nginx basic-auth)
5. Только после успешного стейджинга — запускать `prod`

---

## Шаг 4: Прод-деплой

1. Убедиться, что ветка `main` содержит нужные изменения
2. Проверить /admin/platform → «Присутствие» — нет ли кандидатов на демо/анкетах
3. Деплоить **вечером** (после ~21:00), когда нет активных кандидатов
4. Workflow → «Run workflow» → environment: `prod`, ref: `main`

---

## Environments в GitHub (опционально, рекомендуется)

Создать два environments: `staging` и `prod`.

Для `prod` включить **Required reviewers** — тогда деплой на прод
потребует одобрения перед выполнением.

```
GitHub → repo → Settings → Environments → New environment
  prod:
    ✓ Required reviewers: @jstumpfde
    ✓ Deployment branches: main only
```

---

## Fallback: deploy-prod-safe.sh

Если CI недоступен или нужен срочный хотфикс:

```bash
ssh tz "bash /root/deploy-prod-safe.sh"
```

Старый скрипт работает независимо от CI. Оба подхода совместимы.

---

## Что НЕ входит в этот workflow (задачи будущего)

- **Zero-downtime cluster mode** — `NEXT_OUTPUT_STANDALONE=1` + PM2 cluster
  (уже подготовлено в `next.config.mjs`). Обкатать на стейджинге отдельно.
- **Автотриггер по push в main** — намеренно отключён. Включить после
  нескольких успешных ручных прогонов.
- **Database migrations в CI** — сейчас миграции запускаются вручную.
  Добавить как отдельный шаг или отдельный workflow.

---

## Быстрая диагностика

| Симптом | Что проверить |
|---|---|
| Build fails в CI | Проверить NEXTAUTH_SECRET / DATABASE_URL secrets |
| `BUILD_ID не найден` | Смотреть логи CI шага «pnpm build» — ошибки сборки |
| Health-check 000 | PM2 не запустился; `ssh tz pm2 logs my-komanda --lines 50` |
| Health-check 5xx | Новый код падает; откат произошёл автоматически |
| `pnpm install --prod` fails | Несовместимые пакеты; проверить `pnpm-lock.yaml` |
