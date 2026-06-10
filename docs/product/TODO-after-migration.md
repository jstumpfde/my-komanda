# Отложенные задачи (вернуться после переезда)

Готово в коде, ждёт доводки/активации. Всё уже в ветке `develop`.

## 1. Zero-downtime деплой — АКТИВИРОВАТЬ
Подготовлено (опт-ин, прод сейчас НЕ затронут). Нужно обкатать на стейджинге и
сделать cutover, чтобы деплой в рабочее время не ронял кандидатов.
- Конфиг: `ecosystem.config.cjs` (PM2 cluster, 2 инстанса).
- `next.config.mjs`: standalone под флагом `NEXT_OUTPUT_STANDALONE=1`.
- **Runbook: `DEPLOY-zero-downtime.md`** — шаги для стейджинга → прода.
- Каверзы: env-загрузка standalone, рантайм-uploads через симлинк (всё в runbook).

## 2. «Корзина» кандидатов — доводка UI
Бэкенд готов (мягкое удаление работает: `?trashed=true`, действия trash/untrash/
hard_delete в `/api/modules/hr/candidates/bulk`, права у админ/менеджер-платформы/
директор). Осталось:
- тумблер «Корзина» у фильтров списка кандидатов вакансии (передавать `trashed`
  в `usePaginatedCandidates`/`useCandidates` → API уже понимает `?trashed=true`);
- в режиме корзины передавать `trashedView` в `BulkActionsBar` (там уже есть
  кнопки «Восстановить» / «Удалить навсегда»);
- остальные счётчики (воронка/дашборд/экспорт) — фильтр `deleted_at` (по
  желанию);
- авто-очистка корзины по `companies.trash_retention_days` (cron).

## 3. (опц.) Открыть `/privacy`, `/terms` и др. в PUBLIC_PREFIXES middleware
Сейчас аноним на них улетает на `/login`. Юр-страницы стоит открыть.

## Стандарт деплоя (до zero-downtime)
```
cd /var/www/my-komanda && git pull origin develop \
  && [если есть drizzle/NNNN_*.sql → sudo -u postgres psql -d mykomanda -f drizzle/NNNN_*.sql] \
  && pnpm build && pm2 reload my-komanda --update-env
```
НИКОГДА `rm -rf .next` на живом проде в рабочее время; всегда `reload`, не `restart`.
