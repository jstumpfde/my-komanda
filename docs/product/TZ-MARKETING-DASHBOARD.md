# ТЗ: Модуль Маркетинг — Дашборд (демо для презентации)

## Контекст
Модуль "Маркетинг" для Company24.pro. Цель — красивый дашборд с метриками, графиками и demo-данными для презентации 22 апреля. Реальных интеграций не нужно — всё на захардкоженных данных.

## ВАЖНО
- Drizzle ORM, схемы в `db/schema.ts`
- НЕ создавать таблицы в БД — всё на фронтенде с demo-данными
- Стиль: как в /sales/deals и /knowledge-v2/dashboard — цветные карточки, анимации, recharts
- Прочитай sidebar и layout перед началом
- recharts уже в зависимостях

## 1. БД — НЕ НУЖНА
Всё на demo-данных (константы в файле). Никаких миграций.

## 2. Demo данные — lib/marketing/demo-data.ts

```ts
// Каналы
export const MARKETING_CHANNELS = [
  { 
    id: "yandex", name: "Яндекс.Директ", icon: "Search", color: "#FF0000",
    budget: 150000, spent: 127500, impressions: 45200, clicks: 3120, 
    leads: 89, conversions: 23, ctr: 6.9, cpa: 5543, status: "active"
  },
  { 
    id: "vk", name: "VK Реклама", icon: "Users", color: "#0077FF",
    budget: 80000, spent: 68400, impressions: 128000, clicks: 4870,
    leads: 134, conversions: 31, ctr: 3.8, cpa: 2206, status: "active"
  },
  { 
    id: "telegram", name: "Telegram Ads", icon: "Send", color: "#26A5E4",
    budget: 50000, spent: 43200, impressions: 67000, clicks: 2010,
    leads: 67, conversions: 15, ctr: 3.0, cpa: 2880, status: "active"
  },
  { 
    id: "seo", name: "SEO / Органика", icon: "Globe", color: "#10B981",
    budget: 30000, spent: 30000, impressions: 89000, clicks: 12400,
    leads: 210, conversions: 45, ctr: 13.9, cpa: 667, status: "active"
  },
  { 
    id: "email", name: "Email-рассылка", icon: "Mail", color: "#8B5CF6",
    budget: 15000, spent: 12800, impressions: 8500, clicks: 1870,
    leads: 52, conversions: 18, ctr: 22.0, cpa: 711, status: "active"
  },
  { 
    id: "referral", name: "Реферальная программа", icon: "Gift", color: "#F59E0B",
    budget: 25000, spent: 18900, impressions: 0, clicks: 0,
    leads: 38, conversions: 28, ctr: 0, cpa: 675, status: "active"
  },
];

// Лиды по дням (30 дней)
export const LEADS_BY_DAY = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(2026, 3, i + 1).toISOString().split('T')[0], // апрель 2026
  yandex: Math.floor(Math.random() * 5) + 1,
  vk: Math.floor(Math.random() * 7) + 2,
  telegram: Math.floor(Math.random() * 4) + 1,
  seo: Math.floor(Math.random() * 10) + 3,
  email: Math.floor(Math.random() * 3) + 1,
  referral: Math.floor(Math.random() * 3),
}));

// Кампании
export const CAMPAIGNS = [
  { id: "1", name: "Весенняя акция -20%", channel: "yandex", status: "active", budget: 45000, spent: 38200, leads: 34, startDate: "2026-04-01", endDate: "2026-04-30" },
  { id: "2", name: "Ретаргет посетителей сайта", channel: "vk", status: "active", budget: 25000, spent: 19800, leads: 47, startDate: "2026-04-05", endDate: "2026-04-25" },
  { id: "3", name: "Запуск нового продукта", channel: "telegram", status: "active", budget: 30000, spent: 24100, leads: 28, startDate: "2026-04-10", endDate: "2026-04-20" },
  { id: "4", name: "SEO оптимизация блога", channel: "seo", status: "active", budget: 30000, spent: 30000, leads: 89, startDate: "2026-03-01", endDate: "2026-04-30" },
  { id: "5", name: "Рассылка по базе клиентов", channel: "email", status: "completed", budget: 5000, spent: 5000, leads: 23, startDate: "2026-04-01", endDate: "2026-04-07" },
  { id: "6", name: "Холодная рассылка IT-директорам", channel: "email", status: "paused", budget: 10000, spent: 4200, leads: 12, startDate: "2026-04-08", endDate: "2026-04-30" },
];

// AI рекомендации Ненси
export const AI_RECOMMENDATIONS = [
  { type: "success", text: "SEO показывает лучший CPA (667 ₽). Рекомендую увеличить бюджет на контент-маркетинг." },
  { type: "warning", text: "Яндекс.Директ: CPA вырос на 12% за неделю. Проверьте минус-слова и посадочные страницы." },
  { type: "info", text: "VK Реклама генерирует больше всего лидов. Попробуйте look-alike аудитории для масштабирования." },
  { type: "success", text: "Email-рассылка: Open Rate 22% — выше среднего по рынку (15-18%). Хорошие заголовки!" },
];
```

## 3. UI — Страницы в app/(modules)/marketing/

### 3.1 Дашборд — /marketing (главная)

#### Summary карточки (4 штуки, полная заливка):
- Общий охват: синий (bg-blue-500), сумма impressions всех каналов, формат "337K"
- Лиды за месяц: фиолетовый (bg-purple-500), сумма leads, число
- Средний CPA: зелёный (bg-emerald-500), средневзвешенный CPA, формат "2 113 ₽"
- Бюджет использован: оранжевый (bg-orange-500), spent/budget в %, прогресс-бар внутри карточки

Все с countUp анимацией.

#### График "Лиды по дням" (recharts):
- AreaChart или BarChart stacked
- Ось X: дни (1 апр, 2 апр...)
- Ось Y: количество лидов
- Стеки по каналам (цвета из MARKETING_CHANNELS)
- Легенда внизу
- Tooltip при наведении
- Обёрнут в rounded-xl shadow-sm p-6 карточку

#### Карточки каналов (6 штук, сетка 3x2):
Каждая карточка:
- rounded-xl shadow-sm hover:shadow-md p-5
- Иконка канала + название + статус badge (active = зелёный)
- Метрики в 2 ряда:
  - Показы | Клики | CTR
  - Лиды | Конверсии | CPA
- Прогресс-бар бюджета (spent / budget)
- Цветная левая полоска 3px в цвет канала

#### Таблица "Кампании":
- Столбцы: Название, Канал (badge с цветом), Статус (active/completed/paused badge), Бюджет, Потрачено, Лиды, Период
- rounded-xl shadow-sm
- Строки с hover:bg-muted/50
- Статусы: active=зелёный, completed=синий, paused=серый

#### Блок "🤖 Ненси рекомендует":
- bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] rounded-xl p-6
- 4 рекомендации с иконками (success=зелёная галка, warning=жёлтый треугольник, info=синий i)
- Заголовок: "Ненси рекомендует" с иконкой ✨

### 3.2 Кампании — /marketing/campaigns
- Та же таблица кампаний но на полную страницу
- Кнопка "+ Новая кампания" (disabled, tooltip "Скоро")
- Фильтры: по каналу, по статусу

### 3.3 Аналитика — /marketing/analytics
- Заглушка: красивая страница с иконкой BarChart3 и текстом "Детальная аналитика — Скоро"
- Описание: "AI-анализ эффективности каналов, прогноз бюджета, автоматические отчёты"
- Иконки фич: ROI-калькулятор, A/B тесты, Атрибуция, Воронка

### 3.4 Настройки — /marketing/settings  
- Заглушка: "Подключение рекламных кабинетов — Скоро"
- Карточки интеграций (все disabled):
  - Яндекс.Директ API
  - VK Рекламный кабинет
  - Telegram Ads
  - Google Analytics
  - Яндекс.Метрика

## 4. Sidebar
Новый раздел "Маркетинг" (иконка: Megaphone из lucide-react):
- 📊 Дашборд → /marketing
- 📢 Кампании → /marketing/campaigns
- 📈 Аналитика → /marketing/analytics
- ⚙️ Настройки → /marketing/settings

## 5. Стиль (ВАЖНО — следовать точно)
- Summary карточки: ПОЛНАЯ ЗАЛИВКА цветом + белый текст + иконка в bg-white/20 (как /sales/deals)
- CountUp анимация для всех чисел
- График: recharts, тёмная тема если включена (проверить CSS vars)
- Карточки каналов: staggered появление (50ms задержка между карточками)
- Таблица: uppercase text-xs headers, как в дизайн-системе
- Рекомендации Ненси: gradient блок
- Заглушки "Скоро": красивые, с иконками и описанием, не просто текст
- Общий layout: py-6, paddingLeft/Right по стандарту проекта

## НЕ делать
- API endpoints (всё на фронте)
- Реальные интеграции
- Миграции БД
- Функционал создания/редактирования кампаний

## Порядок
1. Demo данные lib/marketing/demo-data.ts
2. Sidebar пункты
3. Дашборд /marketing (главная страница — основная работа)
4. Кампании /marketing/campaigns
5. Аналитика /marketing/analytics (заглушка)
6. Настройки /marketing/settings (заглушка)
