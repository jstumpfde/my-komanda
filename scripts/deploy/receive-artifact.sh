#!/usr/bin/env bash
# receive-artifact.sh — серверная часть CI-деплоя.
#
# Использование:
#   bash receive-artifact.sh <artifact.tar.gz> <app_dir> <pm2_name> <health_url>
#
# Пример (прод):
#   bash receive-artifact.sh /tmp/deploy-artifact.tar.gz \
#     /var/www/my-komanda my-komanda https://company24.pro
#
# Пример (стейджинг):
#   bash receive-artifact.sh /tmp/deploy-artifact.tar.gz \
#     /var/www/my-komanda-new-staging my-komanda-new-staging http://127.0.0.1:3001
#
# ВАЖНО: этот скрипт НЕ делает git pull и pnpm build — всё это произошло
# в GitHub Actions (off-box). Сервер только принимает готовый .next и
# делает атомарный своп.

set -euo pipefail

ARTIFACT="${1:?Укажи путь к tar.gz артефакту}"
APP_DIR="${2:?Укажи путь к каталогу приложения}"
PM2_NAME="${3:?Укажи имя PM2-процесса}"
HEALTH_URL="${4:?Укажи health-check URL}"

INCOMING_DIR="$APP_DIR/.next-incoming"
PREV_DIR="$APP_DIR/.next-prev"
NEXT_DIR="$APP_DIR/.next"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ------------------------------------------------------------------
# Функция отката — объявляем ДО использования
# ------------------------------------------------------------------
rollback() {
  log "ОТКАТ: восстанавливаем .next-prev..."
  rm -rf "$NEXT_DIR"
  if [ -d "$PREV_DIR" ]; then
    mv "$PREV_DIR" "$NEXT_DIR"
    pm2 reload "$PM2_NAME" --update-env 2>&1 || true
    log "Откат завершён."
  else
    log "КРИТИЧНО: .next-prev тоже нет! Прод может быть недоступен."
  fi
}

# ------------------------------------------------------------------
# Шаг 1: Распаковка во временный каталог .next-incoming
# ------------------------------------------------------------------
log "=== Начало деплоя ==="
log "Артефакт:   $ARTIFACT"
log "Приложение: $APP_DIR"
log "PM2:        $PM2_NAME"
log "Health:     $HEALTH_URL"

if [ ! -f "$ARTIFACT" ]; then
  log "ERROR: артефакт не найден: $ARTIFACT"
  exit 1
fi

# Чистим прошлый incoming (если остался от упавшего деплоя)
rm -rf "$INCOMING_DIR"

log "Распаковка артефакта..."
# Распаковываем .next в staging-директорию .next-incoming
# Это гарантирует: своп произойдёт ТОЛЬКО после полной распаковки
# (исправляет инцидент «mv .next до build» — краш-луп ENOENT)
mkdir -p "$INCOMING_DIR"
tar -xzf "$ARTIFACT" -C "$INCOMING_DIR" --strip-components=1 .next

# Обновляем package.json и pnpm-lock.yaml в APP_DIR
tar -xzf "$ARTIFACT" -C "$APP_DIR" package.json pnpm-lock.yaml 2>/dev/null || true

log "Распаковка завершена."

# ------------------------------------------------------------------
# Шаг 2: Проверяем BUILD_ID ДО свопа
# Если нет BUILD_ID — сборка была неполной, не деплоим
# ------------------------------------------------------------------
if [ ! -f "$INCOMING_DIR/BUILD_ID" ]; then
  log "ERROR: BUILD_ID не найден в .next-incoming — отмена деплоя"
  rm -rf "$INCOMING_DIR"
  exit 1
fi
log "BUILD_ID: $(cat "$INCOMING_DIR/BUILD_ID")"

# ------------------------------------------------------------------
# Шаг 3: pnpm install --prod (если lock изменился)
# Нужно для обновления node_modules на сервере
# ------------------------------------------------------------------
log "pnpm install --prod..."
cd "$APP_DIR"
if ! pnpm install --prod --frozen-lockfile 2>&1; then
  log "ERROR: pnpm install --prod завершился с ошибкой"
  rm -rf "$INCOMING_DIR"
  exit 1
fi

# ------------------------------------------------------------------
# Шаг 4: Атомарный своп
# ВАЖНО: mv происходит ТОЛЬКО после полной распаковки (шаг 1-2).
# Это исправляет инцидент «mv .next до build» — краш-луп ENOENT.
# ------------------------------------------------------------------
log "Атомарный своп .next..."

# Убираем старый prev (он уже устарел)
rm -rf "$PREV_DIR"

if [ -d "$NEXT_DIR" ]; then
  mv "$NEXT_DIR" "$PREV_DIR"
  log "Старый .next → .next-prev"
fi

mv "$INCOMING_DIR" "$NEXT_DIR"
log "Новый .next-incoming → .next"

# ------------------------------------------------------------------
# Шаг 5: pm2 reload (НЕ restart — restart даёт 5-8 сек простоя)
# ------------------------------------------------------------------
log "pm2 reload $PM2_NAME..."
if ! pm2 reload "$PM2_NAME" --update-env 2>&1; then
  log "ERROR: pm2 reload провалился — откат"
  rollback
  exit 1
fi

# ------------------------------------------------------------------
# Шаг 6: Health-check (5 попыток, интервал 5 сек)
# ------------------------------------------------------------------
log "Health-check $HEALTH_URL..."
MAX_RETRIES=5
RETRY_DELAY=5
OK=false

for i in $(seq 1 "$MAX_RETRIES"); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 --connect-timeout 5 "$HEALTH_URL" 2>/dev/null || echo "000")
  log "  Попытка $i/$MAX_RETRIES — HTTP $HTTP_CODE"

  # Проверяем 2xx/3xx как успех
  if [[ "$HTTP_CODE" =~ ^[23][0-9][0-9]$ ]]; then
    OK=true
    break
  fi

  if [ "$i" -lt "$MAX_RETRIES" ]; then
    sleep "$RETRY_DELAY"
  fi
done

if [ "$OK" = "false" ]; then
  log "ERROR: health-check провалился после $MAX_RETRIES попыток — откат"
  rollback
  exit 1
fi

# ------------------------------------------------------------------
# Шаг 7: Очистка артефакта
# ------------------------------------------------------------------
rm -f "$ARTIFACT"
rm -f /tmp/receive-artifact.sh 2>/dev/null || true

log "=== Деплой завершён успешно ==="
log "BUILD_ID: $(cat "$NEXT_DIR/BUILD_ID")"
