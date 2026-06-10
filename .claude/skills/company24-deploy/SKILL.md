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

## Гейт деплоя на ПРОД (обязательно перед main)
Окно 19:00–08:00 МСК ИЛИ журнал присутствия пуст. Проверка пустоты:
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
