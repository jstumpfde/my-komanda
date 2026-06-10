# ТЗ: Модуль Бронирование — MVP (слоты по времени)

## Контекст
Новый модуль "Бронирование" для Company24.pro. MVP — запись клиентов на временные слоты (клиники, салоны, консультации, фитнес). Универсальный модуль с переключателем режима в настройках (сейчас работает только "По времени").

## ВАЖНО
- Drizzle ORM (НЕ Prisma). Схемы в `db/schema.ts`
- После добавления schema: `pnpm drizzle-kit push`
- Стиль: как в /sales/deals — цветные summary карточки, rounded-xl, shadow-sm, анимации
- Прочитай `db/schema.ts`, sidebar, layout перед началом

## 1. База данных — 3 таблицы

### booking_services (услуги):
```ts
export const bookingServices = pgTable("booking_services", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),              // "Стрижка мужская", "Консультация терапевта"
  description: text("description"),
  duration: integer("duration").notNull().default(60),  // длительность в минутах
  price: real("price"),                       // цена
  currency: text("currency").default("RUB"),
  color: text("color").default("#3B82F6"),    // цвет в календаре
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### booking_resources (ресурсы/специалисты):
```ts
export const bookingResources = pgTable("booking_resources", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),              // "Кабинет 1", "Мастер Анна", "Зал 2"
  type: text("type").default("specialist"),   // specialist / room / equipment
  description: text("description"),
  avatar: text("avatar"),                     // URL фото
  isActive: boolean("is_active").default(true),
  
  // Рабочее расписание (JSON): { mon: {start: "09:00", end: "18:00"}, tue: {...}, ... }
  schedule: jsonb("schedule"),
  // Перерывы (JSON): [{ start: "13:00", end: "14:00" }]
  breaks: jsonb("breaks"),
  
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### bookings (записи):
```ts
export const bookings = pgTable("bookings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  serviceId: text("service_id").notNull().references(() => bookingServices.id),
  resourceId: text("resource_id").references(() => bookingResources.id),
  
  // Клиент (может быть из CRM или новый)
  contactId: text("contact_id").references(() => contacts.id),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone"),
  clientEmail: text("client_email"),
  
  // Время
  date: date("date").notNull(),                    // "2026-04-15"
  startTime: text("start_time").notNull(),         // "10:00"
  endTime: text("end_time").notNull(),             // "11:00"
  
  status: text("status").default("confirmed").notNull(), // confirmed / completed / cancelled / no_show
  notes: text("notes"),
  
  // Оплата
  price: real("price"),
  isPaid: boolean("is_paid").default(false),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
});
```

## 2. Константы — lib/booking/constants.ts

```ts
export const BOOKING_STATUSES = [
  { id: "confirmed", label: "Подтверждена", color: "#3B82F6", icon: "Check" },
  { id: "completed", label: "Завершена", color: "#10B981", icon: "CheckCheck" },
  { id: "cancelled", label: "Отменена", color: "#EF4444", icon: "X" },
  { id: "no_show",   label: "Не пришёл", color: "#F59E0B", icon: "UserX" },
] as const;

export const RESOURCE_TYPES = [
  { id: "specialist", label: "Специалист", icon: "User" },
  { id: "room",       label: "Кабинет/Зал", icon: "Door" },
  { id: "equipment",  label: "Оборудование", icon: "Wrench" },
] as const;

export const BOOKING_MODES = [
  { id: "time_slots", label: "По времени", description: "Клиники, салоны, консультации", active: true },
  { id: "days",       label: "По дням", description: "Отели, аренда, апартаменты", active: false },
  { id: "request",    label: "По заявке", description: "Автосервис, ремонт", active: false },
] as const;

export const DEFAULT_SCHEDULE = {
  mon: { start: "09:00", end: "18:00", active: true },
  tue: { start: "09:00", end: "18:00", active: true },
  wed: { start: "09:00", end: "18:00", active: true },
  thu: { start: "09:00", end: "18:00", active: true },
  fri: { start: "09:00", end: "18:00", active: true },
  sat: { start: "10:00", end: "15:00", active: false },
  sun: { start: "10:00", end: "15:00", active: false },
};

export const DEFAULT_BREAKS = [
  { start: "13:00", end: "14:00" }
];
```

## 3. API endpoints — app/api/modules/booking/

### Услуги:
- GET /api/modules/booking/services — список услуг
- POST /api/modules/booking/services — создать
- PUT /api/modules/booking/services/[id] — обновить
- DELETE /api/modules/booking/services/[id] — удалить

### Ресурсы:
- GET /api/modules/booking/resources — список ресурсов
- POST /api/modules/booking/resources — создать
- PUT /api/modules/booking/resources/[id] — обновить
- DELETE /api/modules/booking/resources/[id] — удалить

### Записи:
- GET /api/modules/booking/bookings — список записей (фильтры: date, resourceId, status, dateRange)
- POST /api/modules/booking/bookings — создать запись (с проверкой конфликтов!)
- PUT /api/modules/booking/bookings/[id] — обновить (изменить время, статус)
- DELETE /api/modules/booking/bookings/[id] — удалить

### Слоты:
- GET /api/modules/booking/slots?date=2026-04-15&serviceId=xxx&resourceId=xxx — получить доступные слоты на дату. Логика: берём расписание ресурса → вычитаем перерывы → вычитаем существующие записи → возвращаем свободные слоты с шагом = duration услуги

### Summary:
- GET /api/modules/booking/summary — статистика: записей сегодня, на неделю, выручка за месяц, % отмен

## 4. UI — Страницы в app/(modules)/booking/

### 4.1 Календарь записей — /booking (главная страница)
Основной вид — НЕДЕЛЬНЫЙ КАЛЕНДАРЬ (пн-вс):
- Сверху: 4 summary карточки (стиль как в /sales/deals):
  - Записей сегодня (blue-500)
  - На этой неделе (purple-500)
  - Выручка за месяц (emerald-500)
  - Отмены % (orange-500)
- Навигация: < Пред неделя | Сегодня | След неделя >
- Переключатель вида: День / Неделя (default неделя)
- Колонки = дни недели (Пн 14 апр, Вт 15 апр...)
- Строки = время (09:00, 09:30, 10:00... до 18:00) с шагом 30 мин
- Записи отображаются как цветные блоки (цвет = услуга) с высотой пропорционально длительности
- Внутри блока: время, название услуги, имя клиента
- Клик по записи → модалка с деталями + кнопки: Завершить / Отменить / Не пришёл
- Клик по пустому слоту → модалка создания записи (с предзаполненной датой/временем)
- Фильтр по ресурсу (вверху): "Все" / конкретный специалист/кабинет

### 4.2 Создание записи — модалка
1. Выбор услуги (карточки или select)
2. Выбор ресурса (если есть несколько)
3. Выбор даты (date picker)
4. Выбор времени (показать ТОЛЬКО свободные слоты как кнопки-чипы: 09:00, 09:30, 10:00...)
5. Клиент: поиск по CRM контактам ИЛИ ввести новые данные (имя, телефон, email)
6. Заметки (опционально)
7. Кнопка "Записать"

### 4.3 Услуги — /booking/services
- Таблица/карточки услуг
- Для каждой: название, длительность (60 мин), цена (2000 ₽), цвет, вкл/выкл
- Кнопка "+ Добавить услугу" → модалка
- Inline editing

### 4.4 Ресурсы — /booking/resources
- Карточки ресурсов (аватар/иконка + имя + тип + расписание)
- Для каждого: расписание по дням недели (пн-вс, время начала-конца)
- Перерывы
- Кнопка "+ Добавить ресурс"

### 4.5 Настройки — /booking/settings
- Режим бронирования: 3 карточки (По времени ✅ / По дням 🔒 / По заявке 🔒)
- Шаг сетки: 15 / 30 / 60 мин
- За сколько можно бронировать (1 день / 3 дня / 7 дней / 14 дней / 30 дней)
- Уведомления: email/telegram о новых записях

## 5. Sidebar
Новый раздел "Бронирование" (иконка: CalendarCheck из lucide-react):
- 📅 Календарь → /booking
- 🛎 Услуги → /booking/services
- 👤 Ресурсы → /booking/resources
- ⚙️ Настройки → /booking/settings

## 6. Seed данные (для демо)
Создать в seed или при первом заходе:
- 3 услуги: "Консультация" (60мин, 3000₽, синий), "Диагностика" (30мин, 1500₽, фиолетовый), "Процедура" (90мин, 5000₽, зелёный)
- 2 ресурса: "Кабинет 1" (room, пн-пт 9-18), "Доктор Иванова" (specialist, пн-пт 9-18, перерыв 13-14)
- 8-10 записей на текущую неделю (разбросанных по дням и времени)

## Стиль
- Summary карточки: полная заливка цветом + белый текст (как /sales/deals)
- Календарная сетка: тонкие линии border-muted, текущий день подсвечен
- Блоки записей: rounded-lg, цвет услуги с opacity, hover:shadow-md
- Свободные слоты при создании: кнопки-чипы rounded-full border hover:bg-primary hover:text-white
- Карточки услуг/ресурсов: rounded-xl shadow-sm p-6
- Анимации: countUp для summary, fade-in для модалок

## НЕ делать
- Публичную страницу записи (потом)
- Онлайн-оплату (потом)
- SMS/WhatsApp уведомления (потом)
- Повторяющиеся записи (потом)
- Режимы "По дням" и "По заявке" (только UI-заглушки в настройках)

## Порядок
1. Schema 3 таблицы + push
2. Константы
3. API (services, resources, bookings, slots, summary)
4. Seed данные
5. Sidebar
6. Страница услуг /booking/services
7. Страница ресурсов /booking/resources
8. Календарь /booking (главная — самая сложная)
9. Модалка создания записи
10. Summary панель
11. Настройки /booking/settings
