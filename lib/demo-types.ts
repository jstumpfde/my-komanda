// ─── Demo section/subblock types ─────────────────────────────────────────────

export type DemoNiche = "sales_b2b" | "callcenter" | "client_service" | "it" | "construction" | "logistics" | "labor" | "universal"
export type DemoLength = "short" | "standard" | "full"
export type DemoStatus = "draft" | "ready" | "published"
export type SubblockType = "text" | "text_media" | "video" | "test" | "task" | "video_card"

export interface Subblock {
  id: string
  title: string
  type: SubblockType
  content: string
  enabled: boolean
  placeholder?: string
  /** For tests: array of { question, options[], correctIndex } */
  questions?: TestQuestion[]
  /** For tasks: array of { text, answerType } */
  tasks?: TaskItem[]
}

export interface TestQuestion {
  question: string
  options: string[]
  correctIndex: number
}

export interface TaskItem {
  text: string
  answerType: "text" | "video"
}

export interface DemoSection {
  id: string
  key: string
  title: string
  emoji: string
  subblocks: Subblock[]
}

export interface DemoTemplate {
  id: string
  name: string
  niche: DemoNiche
  length: DemoLength
  isSystem: boolean
  sections: DemoSection[]
  createdAt?: string
  updatedAt?: string
}

// ─── Niche labels ────────────────────────────────────────────────────────────

export const NICHE_LABELS: Record<DemoNiche, { label: string; emoji: string; desc: string }> = {
  sales_b2b:      { label: "Продажи B2B",           emoji: "💼", desc: "KPI, воронка, средний чек" },
  callcenter:     { label: "Колл-центр",             emoji: "📞", desc: "Скрипты, нормативы, SLA" },
  client_service: { label: "Клиентский сервис",      emoji: "🤝", desc: "Стандарты обслуживания, NPS" },
  it:             { label: "IT / разработка",        emoji: "💻", desc: "Стек, процессы, code review" },
  construction:   { label: "Строительство",          emoji: "🏗", desc: "Объекты, ТБ, сертификаты" },
  logistics:      { label: "Логистика / склад",      emoji: "📦", desc: "Маршруты, WMS, нормативы" },
  labor:          { label: "Рабочие специальности",  emoji: "🔧", desc: "График, условия, ТБ" },
  universal:      { label: "Универсальный",          emoji: "⚡", desc: "Без привязки к нише" },
}

export const LENGTH_LABELS: Record<DemoLength, { label: string; emoji: string; time: string; desc: string; subblocks: number }> = {
  short:    { label: "Короткая",   emoji: "📝", time: "~5 мин",  desc: "Рабочие специальности, массовый найм, первый контакт", subblocks: 8 },
  standard: { label: "Стандартная", emoji: "📄", time: "~15 мин", desc: "Менеджеры, специалисты, офисные сотрудники", subblocks: 16 },
  full:     { label: "Полная",     emoji: "📚", time: "~25 мин", desc: "Продажи B2B, руководители, ключевые позиции", subblocks: 22 },
}

// ─── Variables ───────────────────────────────────────────────────────────────

export interface DemoVariable {
  key: string
  label: string
  group: string
}

export const DEMO_VARIABLES: DemoVariable[] = [
  // Компания
  { key: "компания", label: "Название компании", group: "Компания" },
  { key: "компания_описание", label: "Описание компании", group: "Компания" },
  { key: "год_основания", label: "Год основания", group: "Компания" },
  { key: "сотрудников", label: "Количество сотрудников", group: "Компания" },
  { key: "сфера", label: "Сфера деятельности", group: "Компания" },
  { key: "адрес_офиса", label: "Адрес офиса", group: "Компания" },
  { key: "график", label: "График работы", group: "Компания" },
  { key: "email_компании", label: "Email компании", group: "Компания" },
  { key: "телефон", label: "Телефон", group: "Компания" },
  { key: "сайт", label: "Сайт", group: "Компания" },
  { key: "руководитель", label: "Руководитель", group: "Компания" },
  // Дополнительные
  { key: "миссия", label: "Миссия компании", group: "Дополнительные" },
  { key: "цель", label: "Цель компании", group: "Дополнительные" },
  { key: "география", label: "География работы", group: "Дополнительные" },
  { key: "команда_описание", label: "Описание команды", group: "Дополнительные" },
  { key: "основатель_имя", label: "Имя основателя", group: "Дополнительные" },
  // Вакансия
  { key: "должность", label: "Название должности", group: "Вакансия" },
  { key: "зарплата_от", label: "Зарплата от", group: "Вакансия" },
  { key: "зарплата_до", label: "Зарплата до", group: "Вакансия" },
  { key: "обязанности", label: "Обязанности", group: "Вакансия" },
  { key: "требования", label: "Требования", group: "Вакансия" },
  { key: "условия", label: "Условия работы", group: "Вакансия" },
  // Кандидат
  { key: "имя_кандидата", label: "Имя кандидата", group: "Кандидат" },
]

// ─── Default sections structure ──────────────────────────────────────────────

function sb(id: string, title: string, type: SubblockType, placeholder: string, enabled = true): Subblock {
  return { id, title, type, content: "", enabled, placeholder }
}

export function getDefaultSections(length: DemoLength): DemoSection[] {
  const isShort = length === "short"
  const isFull = length === "full"

  return [
    {
      id: "intro", key: "intro", title: "Введение", emoji: "📢",
      subblocks: [
        sb("intro-1", "Приветствие и формат", "text", "Добро пожаловать! Расскажите кандидату что его ждёт в этой демонстрации."),
        sb("intro-2", "Видео-обращение руководителя", "video", "Запишите короткое видео от руководителя или вставьте ссылку на YouTube.", !isShort),
        sb("intro-3", "Важно: для кого подходит", "text", "Опишите для кого эта позиция подходит и НЕ подходит. Помогите кандидату принять решение."),
        sb("intro-4", "Про доход (тизер)", "text", "Кратко упомяните уровень дохода чтобы заинтересовать кандидата."),
        sb("intro-5", "Содержание демонстрации", "text", "Чеклист: что кандидат узнает в этой демонстрации.", !isShort),
      ],
    },
    {
      id: "company", key: "company", title: "Компания", emoji: "🏢",
      subblocks: [
        sb("company-1", "О компании", "text", "{{компания_описание}}. Год основания: {{год_основания}}. Сотрудников: {{сотрудников}}."),
        sb("company-2", "География работы", "text", "В каких городах/регионах работает компания.", !isShort),
        sb("company-3", "Команда", "text_media", "Расскажите о команде: структура, коллеги, атмосфера."),
        sb("company-4", "Основатель / руководство", "text_media", "Кто основал компанию, кто руководит. {{основатель_имя}}.", isFull),
        sb("company-5", "Обзор офиса", "video", "Видео-тур по офису или фотографии рабочих мест.", isFull),
      ],
    },
    {
      id: "product", key: "product", title: "Продукт и клиенты", emoji: "💼",
      subblocks: [
        sb("product-1", "Продукт / услуга", "text", "Что продаёт/делает компания? В чём ценность для клиентов?"),
        sb("product-2", "Ассортимент / направления", "text", "Основные продуктовые линейки или направления.", !isShort),
        sb("product-3", "Клиенты", "text", "Кто ваши клиенты? Типы, отрасли, боли."),
        sb("product-4", "Как работаем с клиентами", "text", "Модель продаж/обслуживания: воронка, цикл, процесс.", !isShort),
        sb("product-5", "Кейсы и отзывы", "text_media", "Примеры успешных проектов, отзывы клиентов.", isFull),
        sb("product-6", "FAQ по продукту", "text", "Частые вопросы и ответы о продукте.", isFull),
      ],
    },
    {
      id: "work", key: "work", title: "Работа и условия", emoji: "📋",
      subblocks: [
        sb("work-1", "Роль и задачи", "text", "{{обязанности}}. Чем предстоит заниматься каждый день."),
        sb("work-2", "Требования к кандидату", "text", "{{требования}}. Какой опыт и навыки нужны.", !isShort),
        sb("work-3", "Мотивация", "text", "Оклад: {{зарплата_от}}–{{зарплата_до}} ₽. Бонусы, KPI, соцпакет."),
        sb("work-4", "Рост и карьера", "text", "Какие перспективы роста? Примеры карьерных треков.", !isShort),
        sb("work-5", "Адаптация и обучение", "text", "Как проходит обучение нового сотрудника.", isFull),
        sb("work-6", "Почему это интересно", "text", "Аргументы почему стоит выбрать эту позицию.", isFull),
      ],
    },
    {
      id: "candidate", key: "candidate", title: "О вас", emoji: "✍️",
      subblocks: [
        sb("candidate-1", "Тест", "test", "Проверочные вопросы на понимание демонстрации.", !isShort),
        sb("candidate-2", "Задания", "task", "Открытые вопросы кандидату (3–7 штук)."),
        sb("candidate-3", "Видео-визитка", "video_card", "Попросите кандидата записать короткое видео о себе.", !isShort),
        sb("candidate-4", "Финал", "text", "Что дальше? Когда ждать обратную связь? CTA."),
      ],
    },
  ]
}
