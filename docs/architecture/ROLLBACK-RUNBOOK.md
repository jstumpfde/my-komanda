# ROLLBACK RUNBOOK — откат прода

> Что есть для отката + точная процедура. Прод: `ssh tz`, /var/www/my-komanda,
> pm2 my-komanda. БД mykomanda (postgres, localhost).

## Что уже есть (точки отката)
### Регулярные бэкапы БД (автоматом)
- Скрипт `/usr/local/bin/backup-mykomanda.sh`, cron `0 3 * * *` (ежедневно 03:00).
- Дампы в `/root/backups/mykomanda_YYYYMMDD_HHMMSS.sql.gz` (gzip), **ротация 30 дней**.
- Лог `/var/log/backup-mykomanda.log`.

### Точка отката деплоя 05.06.2026
- Код ДО деплоя — git-тег **`prod-rollback-2026-06-05`** (коммит 2feed7cc).
- Код релиза — git-тег **`release-2026-06-05`** (коммит 266aed0c).
- Дамп БД ДО деплоя — `/root/backups/ROLLBACK-2026-06-05-predeploy.dump`
  (он же `~/mykomanda-predeploy-2026-06-05-0924.dump`).

## Процедура отката (если релиз сломал прод)

### A. Откат только КОДА (если БД-миграции безопасны — а они аддитивные)
Чаще всего достаточно: новые колонки/таблицы аддитивные, старый код их игнорирует.
```bash
ssh tz
cd /var/www/my-komanda
git reset --hard prod-rollback-2026-06-05    # или нужный тег/коммит
pnpm install --prod=false
pnpm build
pm2 reload my-komanda --update-env
curl -s -o /dev/null -w "%{http_code}\n" https://company24.pro/hr/vacancies   # ждём 200
```

### B. Полный откат КОД + БД (если данные испорчены)
⚠️ Восстановление БД ПЕРЕЗАПИШЕТ текущие данные (потеряются изменения после дампа).
Сначала сделать свежий дамп текущего состояния! Делать ВНЕ пиков кандидатов.
```bash
ssh tz
# 0) свежий дамп «как есть» на всякий
pg_dump 'postgresql://mykomanda:Comp2024!@localhost:5432/mykomanda' -Fc -f ~/before-rollback-$(date +%F-%H%M).dump
# 1) стоп процесса (чтобы не писал в БД во время восстановления)
pm2 stop my-komanda
# 2) восстановить БД из предеплойного дампа (custom-format -Fc → pg_restore)
sudo -u postgres pg_restore --clean --if-exists -d mykomanda /root/backups/ROLLBACK-2026-06-05-predeploy.dump
#    (для gz-дампов из ~/backups/*.sql.gz:  gunzip -c FILE.sql.gz | sudo -u postgres psql -d mykomanda)
# 3) откат кода
cd /var/www/my-komanda && git reset --hard prod-rollback-2026-06-05 && pnpm install --prod=false && pnpm build
# 4) старт
pm2 start my-komanda --update-env   # или pm2 reload
curl -s -o /dev/null -w "%{http_code}\n" https://company24.pro/hr/vacancies
```

## Рекомендация (единственный пробел)
Бэкапы лежат на ТОМ ЖЕ сервере (`/root/backups`). Если диск/сервер умрёт — бэкапы тоже.
Стоит настроить **офсайт-копию** (S3 / Backblaze / другой сервер / Timeweb Object Storage):
например rclone в cron после backup-mykomanda.sh. Нужны: бакет + ключи. Скажи —
настрою (rclone copy /root/backups → remote, ежедневно).

## Полезное
- Прод-деплой/команды — см. CLAUDE.md (раздел Deployment) и HANDOFF-2026-06-05-FULL.md.
- Список миграций релиза 05.06: 0166–0175 (все аддитивные, idempotent IF NOT EXISTS).
