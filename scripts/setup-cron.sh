#!/usr/bin/env bash
# Установка systemd-таймера для авто-разбора hh-откликов на проде.
#
# Зачем: ранее cron вызывался Vercel Cron'ом или руками. На прод-сервере
# 5.42.125.91 (self-hosted Next.js) надёжнее — systemd timer:
# OnUnitActiveSec=2min, OnBootSec=2min. При падении сервиса restart=on-failure
# сам перезапустит. Логи через journalctl -u my-komanda-hh-cron.
#
# Защита от параллельных запусков — через pg_try_advisory_lock внутри
# /api/cron/hh-import (см. app/api/cron/hh-import/route.ts).
#
# Запуск (один раз, под root):
#   CRON_SECRET=xxx ./scripts/setup-cron.sh
#
# Переменные окружения:
#   CRON_SECRET (обязательно) — должен совпадать с .env.production
#   APP_PORT    (необязательно, default 3000)
#   APP_HOST    (необязательно, default localhost)

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Запускать под root: sudo CRON_SECRET=... $0" >&2
  exit 1
fi

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "ERROR: CRON_SECRET не задан. Возьмите из .env.production." >&2
  exit 1
fi

APP_PORT="${APP_PORT:-3000}"
APP_HOST="${APP_HOST:-localhost}"
URL="http://${APP_HOST}:${APP_PORT}/api/cron/hh-import"

SERVICE_FILE="/etc/systemd/system/my-komanda-hh-cron.service"
TIMER_FILE="/etc/systemd/system/my-komanda-hh-cron.timer"

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=my-komanda hh.ru auto-import (single iteration)
After=network-online.target

[Service]
Type=oneshot
# 60s таймаут хватает PROCESS_LIMIT_PER_RUN=50 c delaySeconds=2.
TimeoutStartSec=120
# Header X-Cron-Secret должен совпадать с process.env.CRON_SECRET.
ExecStart=/usr/bin/curl -fsS -m 110 -X POST "${URL}" -H "X-Cron-Secret: ${CRON_SECRET}"
# 409 (busy) — это нормальный отклик при параллельном запуске. Не алармим.
SuccessExitStatus=0 22
EOF

cat > "${TIMER_FILE}" <<EOF
[Unit]
Description=Run my-komanda hh.ru auto-import every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
Unit=my-komanda-hh-cron.service
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Лимит на видимость секретов в systemd unit (хоть и /etc/systemd/system/*.service
# уже под root-only).
chmod 600 "${SERVICE_FILE}" "${TIMER_FILE}"

systemctl daemon-reload
systemctl enable --now my-komanda-hh-cron.timer

echo "✅ Установлено. Проверка:"
echo "    systemctl status my-komanda-hh-cron.timer"
echo "    journalctl -u my-komanda-hh-cron.service -f"
