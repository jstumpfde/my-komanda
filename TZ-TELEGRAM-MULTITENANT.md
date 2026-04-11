# ТЗ: Telegram-бот мультитенант для базы знаний

## Концепция
Каждая компания (tenant) подключает СВОЕГО Telegram-бота в настройках модуля "База знаний".
Webhook URL содержит tenant_id для роутинга.

## Шаг 1: Миграция БД
Добавить в таблицу companies (schema.ts) три поля:
- telegramBotToken: text("telegram_bot_token")
- telegramBotUsername: text("telegram_bot_username")
- telegramWebhookSet: boolean("telegram_webhook_set").default(false)

## Шаг 2: API
Файл: app/api/modules/knowledge/telegram/route.ts
GET - получить настройки бота (маскированный токен)
POST - сохранить токен + зарегистрировать webhook
DELETE - отключить бота

## Шаг 3: Мультитенант webhook
Файл: app/api/telegram/webhook/[tenantId]/route.ts
Роутинг по tenantId, токен из БД а не из env.
НЕ УДАЛЯТЬ старый app/api/telegram/webhook/route.ts

## Шаг 4: UI страница настроек
Файл: app/(modules)/knowledge-v2/settings/page.tsx
Стиль как /settings/notifications

## Шаг 5: Sidebar - добавить пункт Настройки БЗ

## ВАЖНО - НЕ ТРОГАТЬ:
- components/knowledge/ai-assistant-widget.tsx
- components/knowledge/editor.tsx
- app/api/telegram/webhook/route.ts
