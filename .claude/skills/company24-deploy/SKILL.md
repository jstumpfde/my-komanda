---
name: company24-deploy
description: Деплой my-komanda на прод/стейджинг по проверенному ритуалу — гейт присутствия, safe-скрипт, проверка BUILD_ID, смоук. Использовать при «кати»/«деплой»/«выкати на прод» и при выкатке develop→стейджинг.
---

# Деплой Company24 (my-komanda)

Ритуал деплоя, выстраданный инцидентами 02/06/07/09.06 и 10.06. Соблюдать ПОЛНОСТЬЮ.

## Словарь
- develop → стейджинг (new.company24.pro, /var/www/my-komanda-new-staging, pm2 my-komanda-new-staging, порт 3001, БД mykomanda_new_staging)
- main → прод (company24.pro, /var/www/my-komanda, pm2 my-komanda, порт 3000, БД mykomanda)
- ssh-алиас `tz` работает только с Mac координатора. Деплой запускает координатор сам.

## ПРОД: стандарт с 02.07.2026 — blue-green (ноль секунд простоя)
Проверено 02.07 тремя выкатами: 0×5xx у посетителей за все окна. Работает при
живых кандидатах в любое время суток (RAM 15Гб с 02.07 — два Next-процесса
влезают). Старый safe-скрипт даёт мигание на pm2 reload — использовать только
как fallback, если blue-green недоступен.

```bash
# 0) Пуш main уже сделан. Миграции (аддитивные) — ДО всего: psql -f drizzle/NNNN_*.sql
# 1) Теневой каталог /var/www/mk-shadow (постоянный; git-клон + серверные .env):
ssh tz 'cd /var/www/mk-shadow && git fetch origin && git reset --hard origin/main && \
  cp /var/www/my-komanda/.env .env; cp /var/www/my-komanda/.env.local .env.local; \
  nohup sh -c "pnpm install --prefer-offline && \
    NEXT_PUBLIC_BUILD_ID=$(git rev-parse --short origin/main) \
    NODE_OPTIONS=--max-old-space-size=6144 pnpm build" > /tmp/shadow-build.log 2>&1 &'
# NEXT_PUBLIC_BUILD_ID ОБЯЗАТЕЛЕН (git-sha) — без него клиентский
# StaleDeploymentReload получает "dev" и ломается на следующих деплоях.
# 2) Проверить сборку ДО переключений: EXIT:0 в логе, есть
#    .next/prerender-manifest.json и page_client-reference-manifest.js ключевых роутов.
# 3) Зелёный инстанс: cd /var/www/mk-shadow && PORT=3002 pm2 start pnpm --name mk-next-green -- start
#    → health: curl 127.0.0.1:3002/login = 200, /api/public/build-id = новый sha.
# 4) nginx upstream nextapp: 3000 → 3002; nginx -t && systemctl reload nginx (без разрыва соединений).
# 5) Публика на зелёном → обновить основной: в /var/www/my-komanda:
#    rm -rf .next-prev && mv .next .next-prev && cp -a /var/www/mk-shadow/.next .next &&
#    git pull origin main && pm2 restart my-komanda --update-env → build-id на :3000 = новый.
# 6) nginx upstream: 3002 → 3000, reload; pm2 delete mk-next-green.
# 7) Проверка: внешний build-id/200 через ssh riga (Mac-curl врёт), 0 новых 5xx в
#    access.log за окно, 0 InvariantError в pm2-логе. Откат: .next-prev на месте.
```
На каждом шаге до п.4 прод вообще не задет; после п.4 публика уже на проверенной
новой версии. Крон-задачи бьют в localhost:3000 — на шаге 5 один минутный тик
может не пройти, это безопасно (следующий тик повторит).

## Гейт деплоя на ПРОД (для fallback через safe-скрипт)
Окно 19:00–08:00 МСК ИЛИ журнал присутствия пуст. Для blue-green гейт не
обязателен (простоя нет), но проверка присутствия остаётся хорошим тоном.
Проверка пустоты:
```bash
ssh tz 'sudo -u postgres psql -d mykomanda -tAc "SELECT count(*) FROM visit_log WHERE created_at > now() - interval '"'"'20 minutes'"'"' AND page NOT LIKE '"'"'/report/%'"'"'"'
# + candidates updated_at и ai_chatbot_messages за 20 мин. 0 визитов = людей нет.
# candidates_updated >0 при 0 визитах = крон (process-queue), НЕ человек — безопасно.
```

## Стейджинг (develop)
```bash
ssh tz 'cd /var/www/my-komanda-new-staging && git pull origin develop && \
  nohup sh -c "pnpm install && pnpm build && pm2 restart my-komanda-new-staging --update-env && \
  sleep 6 && curl -s -o /dev/null -w \"health:%{http_code}\n\" http://127.0.0.1:3001/hr/vacancies" \
  > /tmp/staging-build.log 2>&1 &'
# pnpm install ОБЯЗАТЕЛЕН если менялись зависимости (next/drizzle и т.п.).
# Поллить /tmp/staging-build.log. Если меняли .env — restart (не reload), с --update-env.
```

## Прод (main) — только через safe-скрипт в фоне
```bash
# 1) проверить отсутствие хотфиксов на main мимо develop:
git fetch origin && git log --oneline origin/develop..origin/main   # должно быть пусто
# 2) мердж + пуш:
git merge origin/develop -m "merge: ..." && git push origin main
# 3) миграции (если есть НОВЫЕ .sql) — применить на прод-БД ДО сборки:
ssh tz 'sudo -u postgres psql -d mykomanda -f /var/www/my-komanda/drizzle/NNNN_*.sql'
# 4) деплой в фоне + поллинг:
ssh tz 'nohup /root/deploy-prod-safe.sh > /var/log/deploy-prod-$(date +%F).log 2>&1 &'
```
deploy-prod-safe.sh сам: чистит дерево-чек, дамп БД (пароль берёт из .env.local — НЕ хардкод), pnpm install, build в свежий .next (старый → .next-prev), pm2 reload (НЕ restart, zero-downtime), health-check.

## ПОСЛЕ деплоя — обязательная проверка
```bash
ssh tz 'cat /var/www/my-komanda/.next/BUILD_ID'   # ДОЛЖЕН СМЕНИТЬСЯ vs прошлого
curl -s -o /dev/null -w "%{http_code}" https://company24.pro/login   # 200
# смоук затронутых фич + 0 свежих auth_failed в /root/.pm2/logs/my-komanda-error.log
```

## Грабли (НЕ повторять)
- **Грязное дерево на сервере блокирует safe-скрипт** — убрать untracked (.env.rotate-*, дампы) в /root, НЕ в репо.
- **pg_dump в safe-скрипте** должен брать пароль из .env.local динамически, не хардкод (инцидент ротации 10.06).
- **После ротации секретов** pm2 держит старое значение в env → `pm2 restart --update-env` с ЯВНО экспортированным новым значением (reload не помогает). См. memory pm2-stale-env-after-secret-rotation.
- **НИКОГДА `rm -rf .next` на живом проде в часы кандидатов** (инцидент 02.06).
- **mv .next ДО build** = краш-луп 502 (инцидент 07/09.06) — safe-скрипт делает своп в конце.
- **Тестовый CI-артефакт** собирать ТОЛЬКО с серверными env и БЕЗ `pnpm install --prod` (сносит devDeps → @tailwindcss/postcss отсутствует → сборка падает).
- Агенты НЕ деплоят и не пушат в main — только координатор.
