# ТЗ: Бот-звонарь — демо-модуль для презентации

## Контекст
AI-агент который звонит по скриптам (исходящие звонки). Для презентации 22 апреля — красивый UI с demo-данными. Реальной телефонии нет — всё на фронтенде.

## ВАЖНО
- Drizzle ORM, НО таблицы НЕ создавать — всё на demo-данных
- Стиль: цветные summary карточки, rounded-xl, shadow-sm, countUp, staggered анимации
- Прочитай sidebar и /marketing/dashboard как эталон
- recharts для графиков

## 1. Demo данные — lib/dialer/demo-data.ts

```ts
// Скрипты звонков
export const CALL_SCRIPTS = [
  { id: "1", name: "Подтверждение записи", type: "reminder", calls: 156, answered: 134, success: 128, avgDuration: 45, status: "active" },
  { id: "2", name: "NPS опрос после визита", type: "survey", calls: 89, answered: 67, success: 61, avgDuration: 120, status: "active" },
  { id: "3", name: "Реактивация спящих клиентов", type: "reactivation", calls: 230, answered: 142, success: 38, avgDuration: 90, status: "paused" },
  { id: "4", name: "Холодный обзвон B2B", type: "cold", calls: 450, answered: 198, success: 23, avgDuration: 75, status: "active" },
  { id: "5", name: "Напоминание о дедлайне оплаты", type: "reminder", calls: 67, answered: 58, success: 52, avgDuration: 35, status: "completed" },
];

// Типы скриптов
export const SCRIPT_TYPES = [
  { id: "reminder", label: "Напоминание", color: "#3B82F6", icon: "Bell" },
  { id: "survey", label: "Опрос", color: "#8B5CF6", icon: "ClipboardList" },
  { id: "reactivation", label: "Реактивация", color: "#F59E0B", icon: "RefreshCw" },
  { id: "cold", label: "Холодный обзвон", color: "#EF4444", icon: "PhoneOutgoing" },
];

// История звонков (последние 20)
export const CALL_HISTORY = [
  { id: "1", scriptName: "Подтверждение записи", clientName: "Иванов Иван", phone: "+7 (999) 123-45-67", date: "2026-04-12T10:15:00", duration: 42, result: "success", sentiment: "positive" },
  { id: "2", scriptName: "NPS опрос после визита", clientName: "Петрова Мария", phone: "+7 (916) 234-56-78", date: "2026-04-12T10:18:00", duration: 135, result: "success", sentiment: "neutral" },
  { id: "3", scriptName: "Холодный обзвон B2B", clientName: "ООО ТехноСтарт", phone: "+7 (495) 345-67-89", date: "2026-04-12T10:22:00", duration: 68, result: "callback", sentiment: "neutral" },
  { id: "4", scriptName: "Реактивация спящих клиентов", clientName: "Сидорова Елена", phone: "+7 (903) 456-78-90", date: "2026-04-12T10:30:00", duration: 95, result: "rejected", sentiment: "negative" },
  { id: "5", scriptName: "Подтверждение записи", clientName: "Козлов Алексей", phone: "+7 (926) 567-89-01", date: "2026-04-12T10:35:00", duration: 38, result: "success", sentiment: "positive" },
  { id: "6", scriptName: "Холодный обзвон B2B", clientName: "ИП Морозов", phone: "+7 (495) 678-90-12", date: "2026-04-12T10:40:00", duration: 0, result: "no_answer", sentiment: null },
  { id: "7", scriptName: "NPS опрос после визита", clientName: "Волкова Анна", phone: "+7 (915) 789-01-23", date: "2026-04-12T10:45:00", duration: 110, result: "success", sentiment: "positive" },
  { id: "8", scriptName: "Холодный обзвон B2B", clientName: "ЗАО Прогресс", phone: "+7 (499) 890-12-34", date: "2026-04-12T10:50:00", duration: 45, result: "callback", sentiment: "neutral" },
  { id: "9", scriptName: "Напоминание о дедлайне оплаты", clientName: "Данилов Сергей", phone: "+7 (977) 901-23-45", date: "2026-04-12T11:00:00", duration: 30, result: "success", sentiment: "positive" },
  { id: "10", scriptName: "Реактивация спящих клиентов", clientName: "Новикова Ольга", phone: "+7 (905) 012-34-56", date: "2026-04-12T11:05:00", duration: 88, result: "success", sentiment: "neutral" },
];

// Результаты звонков
export const CALL_RESULTS = [
  { id: "success", label: "Успешный", color: "#10B981", icon: "CheckCircle" },
  { id: "callback", label: "Перезвонить", color: "#3B82F6", icon: "PhoneCallback" },
  { id: "rejected", label: "Отказ", color: "#EF4444", icon: "XCircle" },
  { id: "no_answer", label: "Нет ответа", color: "#6B7280", icon: "PhoneMissed" },
  { id: "voicemail", label: "Автоответчик", color: "#F59E0B", icon: "Voicemail" },
];

// Звонки по часам сегодня
export const CALLS_BY_HOUR = [
  { hour: "09:00", calls: 12, answered: 9 },
  { hour: "10:00", calls: 18, answered: 14 },
  { hour: "11:00", calls: 22, answered: 17 },
  { hour: "12:00", calls: 15, answered: 11 },
  { hour: "13:00", calls: 8, answered: 6 },
  { hour: "14:00", calls: 20, answered: 16 },
  { hour: "15:00", calls: 25, answered: 19 },
  { hour: "16:00", calls: 19, answered: 15 },
  { hour: "17:00", calls: 14, answered: 10 },
];

// Конверсия по дням (7 дней)
export const CONVERSION_BY_DAY = [
  { date: "06.04", total: 85, success: 52 },
  { date: "07.04", total: 92, success: 58 },
  { date: "08.04", total: 78, success: 45 },
  { date: "09.04", total: 110, success: 71 },
  { date: "10.04", total: 95, success: 63 },
  { date: "11.04", total: 103, success: 68 },
  { date: "12.04", total: 67, success: 42 },
];
```

## 2. UI — Страницы в app/(modules)/dialer/

### 2.1 Дашборд — /dialer (главная)

#### Summary карточки (4 штуки, полная заливка):
- Звонков сегодня: синий (bg-blue-500), число 67, иконка Phone
- Дозвон: фиолетовый (bg-purple-500), 76% (answered/total), иконка PhoneCall
- Успешных: зелёный (bg-emerald-500), число 42, иконка CheckCircle
- Конверсия: оранжевый (bg-orange-500), 63%, иконка TrendingUp
CountUp анимация.

#### Два графика рядом (recharts, flex row):
1. **Звонки по часам** — BarChart (синий=все, зелёный=дозвонились)
2. **Конверсия по дням** — AreaChart/LineChart (% успешных за 7 дней)

#### Скрипты обзвона (карточки):
- 5 карточек в сетке
- Каждая: иконка типа + название + badge статуса (active/paused/completed)
- Метрики: Звонков | Дозвон % | Успех %
- Прогресс-бар (success / calls)
- Цветная левая полоска по типу скрипта
- hover:shadow-md, staggered анимация

#### Последние звонки (таблица):
- Столбцы: Время, Скрипт, Клиент, Телефон, Длительность (формат 1:15), Результат (badge с цветом), Настроение (emoji: 😊/😐/😞)
- 10 строк из CALL_HISTORY
- hover:bg-muted/50

### 2.2 Скрипты — /dialer/scripts
- Список скриптов как карточки (крупнее чем на дашборде)
- Каждый: название, тип, статистика, пример первой фразы
- Кнопка "+ Новый скрипт" (disabled, "Скоро")
- Кнопка "▶ Запустить обзвон" (disabled, "Скоро")

### 2.3 История — /dialer/history
- Полная таблица звонков
- Фильтры: по скрипту, по результату, по дате
- Пагинация

### 2.4 Настройки — /dialer/settings
- Заглушка с карточками интеграций (все disabled):
  - SIP-транк (Манго, Билайн, МегаФон)
  - Голосовой движок (Yandex SpeechKit, Sber Salute)
  - CRM интеграция
  - Расписание обзвона

## 3. Sidebar
Новый раздел "Бот-звонарь" (иконка: PhoneOutgoing из lucide-react):
- 📊 Дашборд → /dialer
- 📝 Скрипты → /dialer/scripts
- 📋 История → /dialer/history
- ⚙️ Настройки → /dialer/settings

## 4. Wow-элемент: визуализация "Живой обзвон"
На дашборде блок "Активный обзвон" (можно под summary):
- Анимированный индикатор: пульсирующий зелёный круг "● В процессе"
- Текущий звонок: "Звоним: Петрова Мария +7 (916) ... — 0:23"
- Очередь: "В очереди: 12 контактов"
- Скорость: "~3 звонка/мин"
- Это просто анимация с таймером, НЕ реальный звонок

## Стиль
- Как /sales/deals и /marketing/dashboard
- Summary: полная заливка + белый текст
- Графики: recharts, тёмная тема через CSS vars
- Таблица: uppercase headers, стандартный стиль
- Настроение в таблице: emoji (😊 positive, 😐 neutral, 😞 negative)

## НЕ делать
- Реальную телефонию
- API endpoints
- Миграции БД
- Конструктор скриптов (только список)

## Порядок
1. Demo данные
2. Sidebar
3. Дашборд /dialer
4. Скрипты /dialer/scripts
5. История /dialer/history
6. Настройки /dialer/settings
