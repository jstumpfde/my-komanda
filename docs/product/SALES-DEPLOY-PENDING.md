# SALES — к вечернему выкату (готово в коде, НЕ задеплоено)

Ветка: feat/sales-mvp (worktree /Users/juri/Projects/my-komanda-sales). Всё uncommitted.
Выкат вечером по сигналу Юрия: стейджинг → тест → прод.

## Что в бандле

1. **Фикс дублей брони** — lib/sales/create-booking.ts: идемпотентность слота без мастера
   (тот же клиент → не дублируем; чужой → «время занято»). Чинит дубли на 09.06 14:00.

2. **Раздел «Настройки CRM»** (/sales/settings):
   - Таблица sales_settings + **миграция drizzle/0188_sales_settings.sql** (прогнать на БД!).
   - Вкладки: Воронка (тип + редактор стадий), Услуги, Мастера, Расписание, Источники,
     Автоматизации, Бот(ссылка). Завязаны на /api/modules/booking/* и /api/modules/sales/settings.
   - Пункт «Настройки» в меню CRM (registry.ts).

3. **Воронка реально управляет доской** — deals/page.tsx + deal-create-modal.tsx читают
   стадии тенанта из sales_settings (вместо хардкода DEAL_STAGES).

4. **Счётчики компаний** — companies API отдаёт contactsCount/dealsCount; колонки в таблице;
   clients/page подставляет реальные значения.

## Команды выката (после коммита и пуша в develop)

⚠️ **Координация миграций.** В develop уже есть `0187_avito_integration.sql` (другой чат,
avito выключен). Мои sales-миграции перенумерованы, чтобы не было двух 0187:
`0188_sales_settings`, `0189_sales_tasks`, `0190_sales_products`.

**Прогнать ВСЕ (включая avito-0187):**
0187_avito_integration, 0188_sales_settings, 0189_sales_tasks, 0190_sales_products.

Стейджинг:
```
ssh tz 'cd /var/www/my-komanda-new-staging && git pull origin develop \
  && for f in 0187_avito_integration 0188_sales_settings 0189_sales_tasks 0190_sales_products; do \
       sudo -u postgres psql -d mykomanda_new_staging -f drizzle/$f.sql; done \
  && pnpm build && pm2 reload my-komanda-new-staging'
```
Прод (вечером, через safe-скрипт в фоне):
```
ssh tz 'cd /var/www/my-komanda && for f in 0187_avito_integration 0188_sales_settings 0189_sales_tasks 0190_sales_products; do \
  sudo -u postgres psql -d mykomanda -f drizzle/$f.sql; done'
ssh tz 'nohup /root/deploy-prod-safe.sh > /tmp/deploy.log 2>&1 &'   # затем поллить /tmp/deploy.log
```
(Все идемпотентны — CREATE TABLE IF NOT EXISTS; повторный прогон безопасен.)

5. **Шаг слота + горизонт записи настраиваемые** — sales_settings.slot_step_minutes /
   book_ahead_days (в миграции 0188). API GET/PUT, оба генератора слотов
   (slots/route.ts + service-context.ts) читают per-tenant; контрол «Сетка слотов»
   на вкладке «Расписание».

6. **Аналитика воронки на реальных данных** — sales/pipeline/page.tsx теперь считает
   воронку/конверсию/источники/тренд по месяцам из реальных сделок + per-tenant стадий
   (был мок). Пустое состояние, если сделок нет.

7. **Карточка сделки deals/[id] на реальном API** — была полностью мок (MOCK_DEALS).
   Теперь GET/PUT/DELETE через /api/modules/sales/deals/[id], per-tenant стадии в степпере,
   closedAt для терминальных стадий (PUT-роут принимает body.closedAt; доска и карточка
   шлют его при переходе на won/lost/showed/no_show).

8. **Дашборд / Прогнозы / Аналитика — на реальных данных** (были мок): KPI, воронка,
   последние сделки, топ-менеджеры, взвешенный прогноз, сценарии, выручка по периодам,
   win/loss, эффективность менеджеров (реальный цикл), источники. Всё из сделок +
   per-tenant стадий. Пустые состояния. CPL/ROI на аналитике убраны (нет данных о затратах).

9. **Встречи / Задачи / Товары — на реальных данных** (были мок):
   - **Встречи** → bookings: список записей (сегодня/предстоящие/прошедшие), неделя
     со счётчиками, создание записи (услуга+мастер+клиент+время → POST bookings), карточка.
   - **Задачи** → новая таблица `sales_tasks` (миграция 0189) + API
     /api/modules/sales/tasks: список/создание/выполнение, фильтры, вид «по сотрудникам»,
     привязка к реальной сделке.
   - **Товары** → новая таблица `sales_products` (миграция 0190) + API
     /api/modules/sales/products: каталог (категория/единица/НДС/статус), создание, архив.
     Решение: «Товары» = отдельный прайс-лист (НЕ booking_services, чтобы не дублировать
     вкладку «Услуги» и не терять category/unit/vat).

   Итог: **все страницы sales-модуля на реальных данных, мок-страниц не осталось.**

10. **Автоматизации воронки — исполняются** (lib/sales/automations.ts): при реальной
    смене стадии сделки (PUT deals/[id] — и с доски, и из карточки) запускаются правила
    из sales_settings.automations. Реально: `create_task` и `notify_manager` создают
    задачу в sales_tasks (привязанную к сделке). `send_message`/`start_followup` пока
    пропускаются с логом (нужна связь сделка↔диалог клиента).

11. **Сделки связаны с диалогами бота → автоматизации пишут клиенту** (новая фича):
    - Связь через существующую колонку sales_conversations.deal_id (МИГРАЦИЯ НЕ НУЖНА).
    - API /api/modules/sales/conversations: GET (список, ?dealId=) + PATCH (привязать/отвязать).
    - Карточка сделки deals/[id]: блок «Диалог клиента» — привязать/отвязать диалог.
    - lib/sales/automations.ts: `send_message` шлёт текст клиенту в привязанный диалог
      (через sendToConversation), `start_followup` реактивирует диалог для крона дожима.
      Диалог резолвится по deal_id, fallback — по общему contactId.

## Известные гэпы (не блокеры)
- Привязка делается вручную в карточке сделки. Авто-создание сделки из диалога бота —
  отдельная задача (если понадобится).
- booking-модуль имеет свою /booking/settings (gridStep) — не персистится; отдельный
  модуль, не трогали (CRM-путь через /sales/settings — настоящий).
