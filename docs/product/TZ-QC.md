# ТЗ: ОКК (Отдел контроля качества) — демо-модуль для презентации

## Контекст
AI-анализ записей звонков менеджеров. Для презентации — красивый UI с demo-данными. Без реальной телефонии и Whisper — всё на фронтенде.

## ВАЖНО
- Таблицы НЕ создавать — всё на demo-данных
- Стиль: цветные summary, rounded-xl, shadow-sm, countUp, recharts
- Прочитай /dialer и /marketing/dashboard как эталон

## 1. Demo данные — lib/qc/demo-data.ts

```ts
// Чек-лист оценки звонка
export const QC_CHECKLIST = [
  { id: "greeting", label: "Приветствие", weight: 10, description: "Представился, назвал компанию" },
  { id: "needs", label: "Выявление потребностей", weight: 20, description: "Задал открытые вопросы, выслушал" },
  { id: "presentation", label: "Презентация", weight: 20, description: "Рассказал о продукте/услуге под потребность" },
  { id: "objections", label: "Работа с возражениями", weight: 20, description: "Отработал возражения по технике" },
  { id: "closing", label: "Закрытие", weight: 15, description: "Предложил следующий шаг, назначил встречу" },
  { id: "crm", label: "Заполнение CRM", weight: 5, description: "Внёс данные в CRM после звонка" },
  { id: "tone", label: "Тон и вежливость", weight: 10, description: "Доброжелательный, без конфликтов" },
];

// Оценённые звонки менеджеров
export const QC_CALLS = [
  {
    id: "1", managerName: "Алексей Иванов", clientName: "ООО Ромашка", 
    date: "2026-04-12T09:15:00", duration: 340, type: "incoming",
    totalScore: 87, 
    scores: { greeting: 10, needs: 18, presentation: 16, objections: 18, closing: 12, crm: 5, tone: 8 },
    aiSummary: "Менеджер хорошо выявил потребности клиента и провёл презентацию. Немного поспешил с закрытием — стоило задать ещё 1-2 уточняющих вопроса. Тон уверенный, профессиональный.",
    aiRecommendations: ["Больше открытых вопросов перед закрытием", "Использовать технику 'мост' при переходе к цене"],
    sentiment: "positive", result: "meeting_set"
  },
  {
    id: "2", managerName: "Мария Петрова", clientName: "ИП Сидоров",
    date: "2026-04-12T09:45:00", duration: 215, type: "outgoing",
    totalScore: 72,
    scores: { greeting: 8, needs: 14, presentation: 15, objections: 12, closing: 10, crm: 5, tone: 8 },
    aiSummary: "Звонок прошёл хорошо, но менеджер пропустил этап выявления потребностей и сразу перешёл к презентации. Возражение 'дорого' отработано шаблонно.",
    aiRecommendations: ["Не пропускать выявление потребностей", "Подготовить 3-4 варианта отработки 'дорого'"],
    sentiment: "neutral", result: "callback"
  },
  {
    id: "3", managerName: "Дмитрий Козлов", clientName: "ЗАО ТехноГрупп",
    date: "2026-04-12T10:30:00", duration: 180, type: "outgoing",
    totalScore: 45,
    scores: { greeting: 6, needs: 8, presentation: 10, objections: 6, closing: 5, crm: 3, tone: 7 },
    aiSummary: "Слабый звонок. Менеджер читал скрипт монотонно, не слушал клиента. Когда клиент сказал 'не интересно', не попытался вернуть внимание. CRM не заполнен.",
    aiRecommendations: ["Тренировка активного слушания", "Курс по работе с отказами", "Контроль заполнения CRM"],
    sentiment: "negative", result: "rejected"
  },
  {
    id: "4", managerName: "Алексей Иванов", clientName: "ГК Вектор",
    date: "2026-04-12T11:00:00", duration: 420, type: "incoming",
    totalScore: 93,
    scores: { greeting: 10, needs: 20, presentation: 18, objections: 18, closing: 14, crm: 5, tone: 8 },
    aiSummary: "Отличный звонок. Менеджер глубоко разобрался в потребности, предложил точное решение. Закрытие через назначение встречи с демонстрацией. Эталонный звонок для обучения.",
    aiRecommendations: ["Использовать как пример для обучения новых менеджеров"],
    sentiment: "positive", result: "meeting_set"
  },
  {
    id: "5", managerName: "Елена Волкова", clientName: "ООО СтройМир",
    date: "2026-04-12T11:30:00", duration: 290, type: "incoming",
    totalScore: 78,
    scores: { greeting: 9, needs: 16, presentation: 14, objections: 16, closing: 11, crm: 4, tone: 8 },
    aiSummary: "Хороший звонок. Менеджер спокойно отработала возражения, но презентация была слишком общей — не адаптирована под строительную отрасль клиента.",
    aiRecommendations: ["Готовить отраслевые кейсы перед звонком", "Упомянуть клиентов из той же отрасли"],
    sentiment: "positive", result: "proposal_sent"
  },
  {
    id: "6", managerName: "Мария Петрова", clientName: "ИП Новиков",
    date: "2026-04-12T13:15:00", duration: 155, type: "outgoing",
    totalScore: 65,
    scores: { greeting: 8, needs: 12, presentation: 12, objections: 10, closing: 8, crm: 5, tone: 10 },
    aiSummary: "Менеджер была вежлива и приятна в общении, но не хватило напористости при закрытии. Клиент сказал 'подумаю' и менеджер не попыталась закрыть конкретным следующим шагом.",
    aiRecommendations: ["Всегда предлагать конкретный следующий шаг", "Техника 'альтернативное закрытие'"],
    sentiment: "neutral", result: "thinking"
  },
  {
    id: "7", managerName: "Дмитрий Козлов", clientName: "ООО Прайм",
    date: "2026-04-12T14:00:00", duration: 95, type: "outgoing",
    totalScore: 38,
    scores: { greeting: 5, needs: 6, presentation: 8, objections: 4, closing: 5, crm: 2, tone: 8 },
    aiSummary: "Критически слабый звонок. Менеджер не представился полностью, не выявил потребности, при первом возражении сразу сдался. Рекомендуется повторное обучение.",
    aiRecommendations: ["Пройти базовый курс продаж заново", "Назначить наставника", "Ежедневный разбор 2 звонков"],
    sentiment: "negative", result: "rejected"
  },
  {
    id: "8", managerName: "Елена Волкова", clientName: "ЗАО МедТех",
    date: "2026-04-12T14:30:00", duration: 380, type: "incoming",
    totalScore: 85,
    scores: { greeting: 10, needs: 18, presentation: 16, objections: 16, closing: 13, crm: 5, tone: 7 },
    aiSummary: "Хороший звонок с глубоким погружением в тему. Единственный минус — под конец менеджер начала торопиться, что повлияло на тон.",
    aiRecommendations: ["Следить за темпом в конце длинных звонков"],
    sentiment: "positive", result: "proposal_sent"
  },
];

// Рейтинг менеджеров
export const MANAGER_RATINGS = [
  { name: "Алексей Иванов", calls: 24, avgScore: 90, trend: "up", avatar: null, bestSkill: "needs", worstSkill: "crm" },
  { name: "Елена Волкова", calls: 18, avgScore: 81, trend: "up", avatar: null, bestSkill: "objections", worstSkill: "tone" },
  { name: "Мария Петрова", calls: 21, avgScore: 68, trend: "stable", avatar: null, bestSkill: "tone", worstSkill: "closing" },
  { name: "Дмитрий Козлов", calls: 15, avgScore: 42, trend: "down", avatar: null, bestSkill: "tone", worstSkill: "needs" },
];

// Результаты звонков
export const CALL_RESULTS_QC = [
  { id: "meeting_set", label: "Встреча назначена", color: "#10B981" },
  { id: "proposal_sent", label: "КП отправлено", color: "#3B82F6" },
  { id: "callback", label: "Перезвонить", color: "#8B5CF6" },
  { id: "thinking", label: "Думает", color: "#F59E0B" },
  { id: "rejected", label: "Отказ", color: "#EF4444" },
];

// Средний балл по критериям за неделю
export const WEEKLY_SCORES = [
  { day: "Пн", greeting: 8.5, needs: 15, presentation: 14, objections: 13, closing: 10 },
  { day: "Вт", greeting: 8.8, needs: 16, presentation: 15, objections: 14, closing: 11 },
  { day: "Ср", greeting: 8.2, needs: 14, presentation: 13, objections: 12, closing: 9 },
  { day: "Чт", greeting: 9.0, needs: 17, presentation: 16, objections: 15, closing: 12 },
  { day: "Пт", greeting: 8.7, needs: 15, presentation: 14, objections: 14, closing: 11 },
];
```

## 2. UI — Страницы в app/(modules)/qc/

### 2.1 Дашборд — /qc (главная)

#### Summary карточки (4 штуки):
- Проверено звонков: синий (bg-blue-500), число 8, иконка Headphones
- Средний балл: фиолетовый (bg-purple-500), 70/100, иконка Award
- Лучший менеджер: зелёный (bg-emerald-500), "Алексей И. — 90", иконка Crown
- Требуют внимания: оранжевый (bg-orange-500), число 2 (score < 50), иконка AlertTriangle

#### Рейтинг менеджеров (карточки):
- 4 карточки в ряд
- Аватар/инициалы + имя + средний балл (большой, цвет по шкале: >=80 зелёный, >=60 жёлтый, <60 красный)
- Тренд: ↑ зелёная стрелка / → серая / ↓ красная
- Кол-во звонков, лучший/слабый навык
- Место в рейтинге (#1, #2, #3, #4) — с медалями для топ-3 (🥇🥈🥉)

#### RadarChart (recharts) — средний профиль отдела:
- 5 осей: Приветствие, Потребности, Презентация, Возражения, Закрытие
- Заполненная область с прозрачностью
- В карточке rounded-xl shadow-sm

#### Таблица последних проверок:
- Столбцы: Время, Менеджер, Клиент, Длительность, Балл (цветной badge), Результат, AI-вердикт (краткий, 1 строка)
- Клик по строке → переход на /qc/call/[id]
- 8 строк

### 2.2 Карточка звонка — /qc/call/[id]
- Заголовок: менеджер + клиент + дата + длительность
- Score bar: большой круг с баллом (цвет по шкале) + текст оценки ("Отличный звонок" / "Хороший" / "Требует работы" / "Критический")

#### Чек-лист оценки (7 критериев):
- Каждый критерий: название + вес + полученный балл + прогресс-бар (цвет по %)
- Иконка ✅ если >= 80% от макс, ⚠️ если 50-80%, ❌ если < 50%

#### AI-резюме:
- bg-gradient-to-br from-[#EEEDFE] to-[#E6F1FB] rounded-xl p-6
- Иконка ✨ + "AI-анализ звонка"
- Текст aiSummary

#### AI-рекомендации:
- Список рекомендаций с иконками 💡
- Каждая как pill/badge

#### Фейковый "Транскрипт" (заглушка):
- Блок с иконкой 🔒 и текстом "Транскрипция звонка — подключите IP-телефонию для автоматической записи и анализа"
- Кнопка "Подключить" (disabled)

### 2.3 Чек-листы — /qc/checklists
- Текущий чек-лист (7 критериев) в виде карточек
- Каждая: название, описание, вес (%), иконка
- Кнопка "+ Создать чек-лист" (disabled, "Скоро")
- Кнопка "Редактировать" (disabled)

### 2.4 Настройки — /qc/settings
- Заглушка с карточками:
  - Подключить IP-телефонию (Манго, Билайн, Мегафон)
  - Автоматический анализ (AI проверяет каждый звонок)
  - Уведомления (низкий балл → alert руководителю)
  - Whisper API (транскрипция)

## 3. Sidebar
Новый раздел "ОКК" (иконка: Headphones из lucide-react):
- 📊 Дашборд → /qc
- 📋 Чек-листы → /qc/checklists
- ⚙️ Настройки → /qc/settings

## 4. Стиль
- Summary: полная заливка + белый текст
- Рейтинг менеджеров: карточки с медалями, яркие баллы
- RadarChart: фиолетовый градиент fill
- Таблица: стандартный стиль проекта
- Карточка звонка: чистый layout, крупный score-круг
- AI блоки: gradient фон
- CountUp, staggered анимации

## НЕ делать
- Реальную телефонию / Whisper
- API endpoints
- Миграции БД
- Аудиоплеер

## Порядок
1. Demo данные
2. Sidebar
3. Дашборд /qc
4. Карточка звонка /qc/call/[id]
5. Чек-листы /qc/checklists
6. Настройки /qc/settings
