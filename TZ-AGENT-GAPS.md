# ТЗ: Агент аудита пробелов базы знаний

## Концепция
Логируем все вопросы к Ненси. Два триггера:
1. Раз в неделю (cron) — сводка неотвеченных
2. МГНОВЕННО — если вопрос задан 3+ раз без ответа, уведомление сразу

## Шаг 1: Таблица логов
Добавить в schema.ts таблицу knowledge_question_logs:
- id uuid PK
- tenant_id uuid NOT NULL ref companies
- user_id uuid ref users
- question text NOT NULL
- question_key text (нормализованный: lowercase, trim, без знаков, первые 100 символов)
- answered boolean default false
- source text default web
- notified boolean default false
- created_at timestamptz default now

## Шаг 2: Логировать в ai-search
В app/api/knowledge/ai-search/route.ts после поиска:
1. INSERT в knowledge_question_logs
2. Если answered=false, проверить count по question_key для tenant
3. Если count >= 3 и notified=false: уведомить (notifications + Telegram), пометить notified=true

## Шаг 3: Cron
Файл: app/api/cron/knowledge-gaps/route.ts
GET ?secret=CRON_SECRET:
1. Собрать неотвеченные за 7 дней по tenant
2. Топ-10 по частоте
3. Claude API — рекомендации какие материалы создать
4. Уведомить через notifications + Telegram

## Шаг 4: Третья строка accordion в settings
- Иконка Search, текст "Аудит пробелов"
- Badge: количество неотвеченных
- Раскрытие: таблица вопросов + кнопка "Запустить аудит"

## ВАЖНО:
- НЕ ТРОГАТЬ: ai-assistant-widget.tsx, editor.tsx
- Claude API через getClaudeMessagesUrl()
- Telegram через companies.telegramBotToken
