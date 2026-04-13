export type DemoTemplateId = "short" | "medium" | "long"

export interface DemoTemplateBlock {
  id: string
  title: string
  description: string
  type: "text" | "question" | "placeholder"
  questionType?: "long" | "short" | "yesno"
  ai?: boolean
}

export interface DemoTemplate {
  id: DemoTemplateId
  label: string
  description: string
  time: string
  blocks: DemoTemplateBlock[]
}

export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: "short",
    label: "Короткая",
    description: "Быстрый обзор должности — для массовых позиций",
    time: "5-7 мин",
    blocks: [
      { id: "s1", title: "О компании", description: "Кратко о компании, отрасль, масштаб", type: "text", ai: true },
      { id: "s2", title: "Должность и задачи", description: "Ключевые обязанности на позиции", type: "text", ai: true },
      { id: "s3", title: "Требования", description: "Что нужно уметь и знать", type: "text", ai: true },
      { id: "s4", title: "Условия и ЗП", description: "Зарплата, график, бонусы", type: "text", ai: true },
      { id: "s5", title: "Следующий шаг", description: "CTA — что делать дальше", type: "text", ai: true },
    ],
  },
  {
    id: "medium",
    label: "Средняя",
    description: "Подробный обзор — для специалистов и менеджеров",
    time: "10-15 мин",
    blocks: [
      { id: "m1", title: "О компании", description: "Кто мы, чем занимаемся, масштаб", type: "text", ai: true },
      { id: "m2", title: "Команда и культура", description: "Атмосфера, ценности, коллектив", type: "text", ai: true },
      { id: "m3", title: "Должность и задачи", description: "Подробно о роли и ежедневных задачах", type: "text", ai: true },
      { id: "m4", title: "Карьерный рост", description: "Куда можно вырасти через 1-3 года", type: "text", ai: true },
      { id: "m5", title: "Требования", description: "Обязательные и желательные навыки", type: "text", ai: true },
      { id: "m6", title: "Условия и ЗП", description: "Зарплата, бонусы, соцпакет", type: "text", ai: true },
      { id: "m7", title: "Бонусы и плюшки", description: "ДМС, обучение, мероприятия и прочее", type: "text", ai: true },
      { id: "m8", title: "Процесс отбора", description: "Этапы: что будет после просмотра", type: "text", ai: true },
      { id: "m9", title: "Вопрос про опыт", description: "Расскажите о релевантном опыте", type: "question", questionType: "long" },
      { id: "m10", title: "FAQ", description: "Частые вопросы и ответы", type: "text", ai: true },
      { id: "m11", title: "Следующий шаг", description: "CTA — запись на интервью", type: "text", ai: true },
    ],
  },
  {
    id: "long",
    label: "Длинная",
    description: "Полная презентация — для ключевых и руководящих позиций",
    time: "20-30 мин",
    blocks: [
      { id: "l1", title: "Видео-приветствие", description: "Добавьте видео от руководителя или HR", type: "placeholder" },
      { id: "l2", title: "О компании", description: "История, миссия, масштаб, достижения", type: "text", ai: true },
      { id: "l3", title: "Миссия и ценности", description: "Зачем мы работаем, что для нас важно", type: "text", ai: true },
      { id: "l4", title: "Команда и культура", description: "Люди, атмосфера, как мы работаем", type: "text", ai: true },
      { id: "l5", title: "Экскурсия по офису", description: "Добавьте фото или видео офиса", type: "placeholder" },
      { id: "l6", title: "Должность и задачи", description: "Детальное описание роли и обязанностей", type: "text", ai: true },
      { id: "l7", title: "День из жизни", description: "Как выглядит типичный рабочий день", type: "text", ai: true },
      { id: "l8", title: "Карьерный рост и развитие", description: "Рост внутри компании, грейды, примеры", type: "text", ai: true },
      { id: "l9", title: "Обучение и менторство", description: "Как компания помогает расти", type: "text", ai: true },
      { id: "l10", title: "Требования", description: "Обязательные и желательные навыки, опыт", type: "text", ai: true },
      { id: "l11", title: "Условия и ЗП", description: "Детально: оклад, KPI, бонусы, пересмотр", type: "text", ai: true },
      { id: "l12", title: "Бонусы и плюшки", description: "ДМС, фитнес, обучение, мероприятия", type: "text", ai: true },
      { id: "l13", title: "Процесс отбора", description: "Все этапы от просмотра до оффера", type: "text", ai: true },
      { id: "l14", title: "Отзывы сотрудников", description: "Добавьте цитаты или видео от команды", type: "placeholder" },
      { id: "l15", title: "FAQ", description: "Ответы на частые вопросы кандидатов", type: "text", ai: true },
      { id: "l16", title: "Вопрос про опыт", description: "Расскажите о релевантном опыте", type: "question", questionType: "long" },
      { id: "l17", title: "Видео-визитка", description: "Запишите короткое видео о себе", type: "question", questionType: "short" },
      { id: "l18", title: "Следующий шаг", description: "CTA — как продолжить", type: "text", ai: true },
    ],
  },
]
