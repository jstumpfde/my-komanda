# ТЗ-9: Автоматический импорт+разбор hh-откликов с настраиваемым расписанием

**Цель:**
1. Унифицировать /api/cron/* (POST + X-Cron-Secret)
2. Сделать /api/cron/hh-import = автоматический импорт + разбор
3. Реализовать настройки рабочего времени, дней недели и праздников на уровне вакансии

**Оценка:** 90-120 минут.

---

## КОНТЕКСТ

- /api/cron/follow-up = POST + X-Cron-Secret → работает
- /api/cron/hh-import = GET и не проверяет X-Cron-Secret → возвращает 401
- Юзер хочет ПОЛНЫЙ АВТОМАТ: каждые 10 минут импортировать новые отклики с hh.ru И сразу разбирать (демо-ссылка через process-queue)
- НО отправка должна уважать настройки рабочего времени конкретной вакансии

---

## ЗАДАЧА 1: УНИФИКАЦИЯ /api/cron/hh-import

Файл: app/api/cron/hh-import/route.ts

- Метод POST (не GET)
- Заголовок X-Cron-Secret для авторизации
- Возвращать JSON {ok, imported, processed, deferredOffHours, skipped, errors}

Не оставляй старые методы — только POST.

---

## ЗАДАЧА 2: ПРОВЕРИТЬ ВСЕ CRON НА ЕДИНООБРАЗИЕ

В app/api/cron/* всего ~12 endpoint'ов. Все должны: POST + X-Cron-Secret.

Если разнобой — приведи к единому формату. Если есть общий util lib/cron/auth.ts — используй везде. Если нет — создай.

---

## ЗАДАЧА 3: НОВЫЕ ПОЛЯ В БД (vacancies)

Создай миграцию drizzle/0082_vacancy_schedule.sql (НЕ применяй).

В db/schema.ts — добавь в таблицу vacancies:

  scheduleEnabled: boolean('schedule_enabled').notNull().default(false),
  scheduleStart: text('schedule_start').notNull().default('09:00'),
  scheduleEnd: text('schedule_end').notNull().default('19:55'),
  scheduleTimezone: text('schedule_timezone').notNull().default('Europe/Moscow'),
  scheduleWorkingDays: jsonb('schedule_working_days').$type<number[]>().notNull().default([1,2,3,4,5]),
  scheduleExcludedHolidayIds: jsonb('schedule_excluded_holiday_ids').$type<string[]>().notNull().default(['dec_31','jan_1','jan_2','jan_3','jan_4','jan_5','jan_6','jan_7','jan_8','feb_23','mar_8','may_1','may_9','jun_12','nov_4']),
  scheduleCustomHolidays: jsonb('schedule_custom_holidays').$type<{from:string,to:string,label:string}[]>().notNull().default([]),

Где scheduleWorkingDays — массив чисел 1-7 (1=Пн, 7=Вс).

---

## ЗАДАЧА 4: КОНСТАНТЫ ПРАЗДНИКОВ

Файл: lib/schedule/holidays.ts (новый)

  export const RU_HOLIDAYS = [
    { id: 'dec_31', month: 12, day: 31, label: 'Канун Нового года' },
    { id: 'jan_1', month: 1, day: 1, label: 'Новый год' },
    { id: 'jan_2', month: 1, day: 2, label: 'Новогодние' },
    { id: 'jan_3', month: 1, day: 3, label: 'Новогодние' },
    { id: 'jan_4', month: 1, day: 4, label: 'Новогодние' },
    { id: 'jan_5', month: 1, day: 5, label: 'Новогодние' },
    { id: 'jan_6', month: 1, day: 6, label: 'Новогодние' },
    { id: 'jan_7', month: 1, day: 7, label: 'Рождество' },
    { id: 'jan_8', month: 1, day: 8, label: 'Новогодние' },
    { id: 'feb_23', month: 2, day: 23, label: 'День защитника Отечества' },
    { id: 'mar_8', month: 3, day: 8, label: 'Международный женский день' },
    { id: 'may_1', month: 5, day: 1, label: 'Праздник Весны и Труда' },
    { id: 'may_9', month: 5, day: 9, label: 'День Победы' },
    { id: 'jun_12', month: 6, day: 12, label: 'День России' },
    { id: 'nov_4', month: 11, day: 4, label: 'День народного единства' },
  ] as const;

  export type HolidayId = typeof RU_HOLIDAYS[number]['id'];

---

## ЗАДАЧА 5: ХЕЛПЕР canSendNow(vacancy)

Файл: lib/schedule/can-send-now.ts (новый)

  import { RU_HOLIDAYS } from './holidays';

  type VacancySchedule = {
    scheduleEnabled?: boolean;
    scheduleStart?: string;
    scheduleEnd?: string;
    scheduleTimezone?: string;
    scheduleWorkingDays?: number[];
    scheduleExcludedHolidayIds?: string[];
    scheduleCustomHolidays?: {from: string, to: string, label: string}[];
  };

  export function canSendNow(vacancy: VacancySchedule): { allowed: boolean; reason?: string } {
    if (!vacancy.scheduleEnabled) return { allowed: true };

    const tz = vacancy.scheduleTimezone || 'Europe/Moscow';
    const now = new Date();

    // Текущее в локальной таймзоне вакансии
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));

    // 1. Часы
    const start = vacancy.scheduleStart || '09:00';
    const end = vacancy.scheduleEnd || '19:55';
    const currentTime = parts.hour + ':' + parts.minute;
    if (currentTime < start || currentTime > end) {
      return { allowed: false, reason: 'off_hours' };
    }

    // 2. Дни недели (1=Пн, 7=Вс)
    const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const today = weekdayMap[parts.weekday];
    const workingDays = vacancy.scheduleWorkingDays || [1,2,3,4,5];
    if (!workingDays.includes(today)) {
      return { allowed: false, reason: 'non_working_day' };
    }

    // 3. Стандартные праздники
    const month = parseInt(parts.month);
    const day = parseInt(parts.day);
    const excludedIds = vacancy.scheduleExcludedHolidayIds || [];
    const todayHoliday = RU_HOLIDAYS.find(h => h.month === month && h.day === day);
    if (todayHoliday && excludedIds.includes(todayHoliday.id)) {
      return { allowed: false, reason: 'holiday_' + todayHoliday.id };
    }

    // 4. Кастомные праздники
    const isoToday = parts.year + '-' + parts.month + '-' + parts.day;
    const custom = vacancy.scheduleCustomHolidays || [];
    for (const c of custom) {
      if (c.from <= isoToday && isoToday <= c.to) {
        return { allowed: false, reason: 'custom_holiday' };
      }
    }

    return { allowed: true };
  }

---

## ЗАДАЧА 6: ПОЛНЫЙ АВТОМАТ В hh-import

В app/api/cron/hh-import/route.ts:

После импорта новых hh-откликов в БД для каждого нового отклика:
- Проверить canSendNow(vacancy)
- Если allowed === false → ОСТАВИТЬ отклик в БД со status='response', НЕ слать сообщение. Следующий cron в рабочее время подберёт. Увеличить счётчик deferredOffHours.
- Если allowed === true → выполнить полный разбор (вызвать существующую логику из process-queue):
  - Создать кандидата в БД
  - AI-скоринг если vacancy.aiScoringEnabled
  - Демо-ссылка через hh API
  - Перевод в стадию «Первичный контакт»
  - Запланировать касания воронки дожима

Используй существующую логику из app/api/integrations/hh/process-queue/route.ts. Импортируй функцией.

---

## ЗАДАЧА 7: ОГРАНИЧЕНИЕ В hh-import

В одном вызове максимум 30 откликов. Следующий cron подберёт остальное.

---

## ЗАДАЧА 8: УВАЖАТЬ РАСПИСАНИЕ В follow-up

В app/api/cron/follow-up/route.ts:

Перед отправкой каждого касания:
- Проверить canSendNow(vacancy)
- Если false → СКИПНУТЬ (НЕ менять scheduled_at, НЕ помечать failed). Следующий cron в рабочее время подберёт.
- Если true → отправить как обычно.

---

## ЗАДАЧА 9: UI КАЛЕНДАРЯ В НАСТРОЙКАХ ВАКАНСИИ

Файл: components/vacancies/vacancy-schedule-settings.tsx (новый компонент)

Дизайн как описано в обсуждении с юзером:

  ⏰ Рабочие часы и дни
  ☑ Соблюдать расписание [tumbler]
  
  Время:
    С [09:00 input type=time] до [19:55 input type=time]
    Часовой пояс: [Europe/Moscow ▾ select]
  
  Дни недели:
    [☑ Пн] [☑ Вт] [☑ Ср] [☑ Чт] [☑ Пт] [☐ Сб] [☐ Вс]
  
  📅 Нерабочие дни
  
  Праздники РФ:
    [☑ 31 декабря] [☑ 1 января] [☑ 2 января] ... (все 15 из RU_HOLIDAYS)
  
  Свои нерабочие дни:
    Список: { from, to, label }[]
    Кнопка [+ Добавить]
    При клике — модалка с radio (Один день / Период), date picker(s), input для метки

API endpoint: app/api/modules/hr/vacancies/[id]/schedule-settings/route.ts (новый)
- GET — вернуть текущие настройки
- PATCH — сохранить

Вставить компонент в страницу вакансии:
- app/(modules)/hr/vacancies/[id]/page.tsx
- В табе Настройки, под секцией Цепочка дожима

УБРАТЬ из существующего UI:
- Старый тумблер «Рабочие часы — Отправлять только в рабочее время» (если есть в components/vacancies/* — заменить на новый компонент)

---

## ВОЗВРАТ JSON из hh-import

  {
    ok: true,
    imported: N,
    processed: M,
    deferredOffHours: K,
    skipped: Z,
    errors: []
  }

---

## ЧЕГО НЕ ДЕЛАТЬ

- Не применять миграцию (юзер применит)
- Не запускать pnpm build, только pnpm tsc --noEmit
- Не добавлять новые библиотеки (Intl.DateTimeFormat в стандарте)
- Не трогать другие модули кроме vacancies/cron/schedule

## ПРОВЕРКИ
  pnpm tsc --noEmit | head -30

## ГОТОВНОСТЬ

Закоммить и запушь в main атомарными коммитами по задачам.

Когда готово — напиши «ТЗ-9 готово» и перечисли:
1. Какие cron'ы привёл к POST + X-Cron-Secret
2. Где общая util-функция auth (lib/cron/auth.ts?)
3. Откуда вызывается process-queue в hh-import
4. Изменённые/созданные файлы
5. SQL-миграции для применения
6. Что проверить в браузере (URL + действия)
7. Известные TODO

Закоммить и запушь в main.
