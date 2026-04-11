# ТЗ: Агент актуальности материалов

## Концепция
Cron-задача (API route) которая проверяет все материалы базы знаний и помечает устаревшие. Запускается по GET запросу (потом повесим на cron через Timeweb).

## Файл: app/api/cron/knowledge-freshness/route.ts

### Логика:
1. Получить ВСЕ материалы из knowledgeArticles + demoTemplates где review_cycle != 'none' ИЛИ valid_until IS NOT NULL
2. Для каждого материала проверить:
   - Если valid_until < сегодня → статус "expired"
   - Если valid_until < сегодня + 7 дней → статус "review"
   - Если review_cycle = "1m" и updatedAt < сегодня - 30 дней → статус "review"
   - Если review_cycle = "3m" и updatedAt < сегодня - 90 дней → статус "review"
   - Если review_cycle = "6m" и updatedAt < сегодня - 180 дней → статус "review"
   - Если review_cycle = "12m" и updatedAt < сегодня - 365 дней → статус "review"
3. Обновить поле status у материалов (review/expired)
4. Для каждого tenant у которого есть устаревшие — отправить уведомление:
   - В таблицу notifications (если есть)
   - В Telegram (если у компании подключён бот) — сообщение директору/главному HR

### Защита:
- GET с query param ?secret=CRON_SECRET (из env)
- Без secret → 403

### Ответ:
{ ok: true, checked: 150, expired: 3, review: 7, notified: 2 }

## Файл: app/(modules)/knowledge-v2/settings/page.tsx
Добавить вторую строку accordion НИЖЕ Telegram:
- Иконка: Clock (lucide)
- Текст: "Контроль актуальности"
- Badge: "X материалов" (количество на проверке) / "Всё актуально" (зелёный)
- При раскрытии: список устаревших материалов с ссылками на редактирование
- Кнопка "Проверить сейчас" — вызывает API вручную

## ВАЖНО:
- НЕ ТРОГАТЬ: ai-assistant-widget.tsx, editor.tsx
- Использовать существующие таблицы knowledgeArticles, demoTemplates
- Уведомления: INSERT в notifications (таблица уже есть)
- Telegram: использовать companies.telegramBotToken для отправки
