import { renderDemoVars, demoVarExamplesMap, DEMO_PICKER_VARIABLES } from "./demo-vars"

export type BlockType = "text" | "image" | "video" | "audio" | "file" | "info" | "button" | "task" | "media" | "stories" | "pdf"

export interface StoriesCard {
  id: string
  mediaType: "image" | "video"
  url: string
  caption?: string
  // Длительность показа карточки в сторис-плеере, сек (1–60). Для фото; видео
  // играет по своей длине. По умолчанию STORIES_CARD_DEFAULT_DURATION_SEC.
  durationSec?: number
}

// Дефолтная длительность фото-карточки сторис (сек).
export const STORIES_CARD_DEFAULT_DURATION_SEC = 15

export type ImageLayout = "full" | "image-left" | "image-right"
export type AudioLayout = "full" | "audio-left" | "audio-right"
export type FileLayout = "full" | "file-left" | "file-right"
export type VideoLayout = "full" | "video-left" | "video-right"

// answerType — 6 основных типов + legacy "text"/"video" для обратной совместимости:
// "short"   — короткий текст (input)
// "long"    — длинный текст (textarea)
// "yesno"   — да/нет
// "single"  — один из списка (radio)
// "multiple"— несколько из списка (checkbox)
// "sort"    — расставить по порядку
// "text"    — legacy алиас для "short"
// "video"   — legacy (видео-ответ)
export type QuestionAnswerType = "short" | "long" | "yesno" | "single" | "multiple" | "sort" | "text" | "video"

export interface Question {
  id: string
  text: string
  answerType: QuestionAnswerType
  required?: boolean
  options: string[]          // варианты для single/multiple/sort
  correctOptions?: number[]  // индексы правильных вариантов (single/multiple)
  correctYesNo?: "yes" | "no" // правильный ответ для yesno
  correctSort?: number[]     // правильный порядок для sort (индексы)
  points?: number            // баллы за правильный ответ (0 = не учитывать)
  // Баллы на каждый вариант (index-aligned с options) для single/multiple.
  // Если задан — частичный скоринг: балл за вопрос = сумма баллов выбранных
  // вариантов (для single — балл выбранного), обрезается в [0 … макс].
  // Отрицательные значения = штраф за лишний/ловушку. Если НЕ задан —
  // деривится из correctOptions + points (см. lib/score-test-objective).
  optionPoints?: number[]
  // Штраф за лишний (неверный) выбор в multiple, когда баллы НЕ заданы вручную
  // (простой режим с ✓). Влияет на деривацию optionPoints:
  //   "none" → лишний = 0, "half" → лишний = −½ балла верного, "full" → −полный.
  // undefined → "half" (мягкий дефолт).
  overselectPenalty?: "none" | "half" | "full"
  // «Другое (с полем ввода)»: индексы вариантов, при выборе которых кандидату
  // показывается текстовое поле для своего ответа. otherPlaceholder — подсказка
  // в этом поле (напр. «Укажите что»). Хранение по индексам (как correctOptions),
  // правится на удалении варианта.
  otherOptions?: number[]
  otherPlaceholder?: string
  // legacy fields
  textMatchMode?: "exact" | "ai"
  correctText?: string
  aiCriteria?: string
  weight?: number
}

export interface Block {
  id: string
  type: BlockType
  content: string
  imageUrl: string
  imageLayout: ImageLayout
  imageCaption: string
  imageTitleTop: string
  videoUrl: string
  videoLayout?: VideoLayout
  videoTitleTop: string
  videoCaption: string
  audioUrl: string
  audioTitle: string
  audioLayout?: AudioLayout
  audioTitleTop: string
  audioCaption: string
  fileUrl: string
  fileName: string
  fileLayout?: FileLayout
  fileTitleTop: string
  fileCaption: string
  imageSize?: "S" | "M" | "L"
  videoSize?: "S" | "M" | "L"
  fileAlign?: "left" | "center" | "right"
  infoStyle: "info" | "warning" | "success" | "error"
  infoColor?: string
  infoIcon?: string
  infoSize?: "s" | "m" | "l" | "xl"
  buttonText: string
  buttonUrl: string
  buttonVariant: "primary" | "outline"
  buttonColor?: string
  buttonIconBefore?: string
  buttonIconAfter?: string
  buttonAlign?: "left" | "center" | "right"  // расположение кнопки на странице
  // Куда ведёт кнопка: "next" — следующая страница по очереди (для теста —
  // отправка ответов + экран после), "url" — внешняя ссылка (показываем поле URL).
  // undefined трактуем как "url" при заполненном buttonUrl, иначе "next".
  buttonTarget?: "next" | "url"
  taskTitle: string        // заголовок задания (новое)
  taskDescription: string  // вступительный текст
  questions: Question[]
  // media-блок — запись/загрузка видео/аудио/фото кандидатом
  mediaAllowVideo?: boolean
  mediaAllowAudio?: boolean
  mediaAllowPhoto?: boolean
  mediaMaxDuration?: number | null  // секунды, null = без лимита
  mediaRequired?: boolean
  mediaInstruction?: string
  // stories-блок — карусель карточек (фото + видео)
  storiesCards?: StoriesCard[]
  // Финальный CTA-слайд сторис: после последней карточки — экран с кнопкой
  // «Откликнуться». Текст кнопки и подпись — редактируемые поля (не хардкод).
  storiesCtaEnabled?: boolean
  storiesCtaText?: string     // текст кнопки (дефолт — STORIES_CTA_DEFAULT_TEXT)
  storiesCtaCaption?: string  // подпись над кнопкой (необязательно)
  // pdf-блок — презентация из PDF. На загрузке PDF растеризуется на сервере
  // (poppler) в картинки-слайды; кандидат листает их встроенным слайдером.
  // Картинки = «фото каждой страницы», поэтому 100% точность вёрстки/шрифтов.
  pdfUrl?: string             // ссылка на исходный PDF (для скачивания/ре-рендера)
  pdfFileName?: string        // оригинальное имя файла
  pdfPages?: string[]         // ссылки на картинки страниц по порядку
  pdfPageCount?: number       // число страниц
  pdfAspect?: number          // соотношение страницы ширина/высота (для рамки)
  pdfRequireComplete?: boolean // требовать долистать до конца перед «Далее» (дефолт true)
  pdfAllowDownload?: boolean  // показать кнопку скачать исходный PDF
  pdfCaption?: string         // подпись под презентацией (необязательно)
}

/** Дефолт текста кнопки финального CTA-слайда сторис. Значение поля, не вшитая
 *  в рендер строка — HR может изменить его в редакторе сторис. */
export const STORIES_CTA_DEFAULT_TEXT = "Откликнуться"

export interface Lesson {
  id: string
  emoji: string
  title: string
  blocks: Block[]
}

export interface Demo {
  id: string
  title: string
  companyName: string
  description: string
  status: "draft" | "published"
  createdAt: Date
  updatedAt: Date
  coverGradientFrom: string
  coverGradientTo: string
  lessons: Lesson[]
}

export interface DemoSection {
  id: string
  title: string
  demoIds: string[]
}

// Единый список переменных — lib/demo-vars.ts (DEMO_PICKER_VARIABLES).
// Локальная копия дрейфовала: рекламировала {{офис}}/{{график}} до того, как
// рендер демо их знал, — кандидат видел сырые «{{офис}}».
export const VARIABLES = DEMO_PICKER_VARIABLES

export const BLOCK_TYPE_META: { type: BlockType; icon: string; label: string }[] = [
  { type: "text", icon: "T", label: "Текст" },
  { type: "image", icon: "🖼", label: "Фото" },
  { type: "video", icon: "🎥", label: "Видео" },
  { type: "audio", icon: "🎵", label: "Аудио" },
  { type: "file", icon: "📄", label: "Файл" },
  { type: "info", icon: "ℹ️", label: "Инфо" },
  { type: "button", icon: "🔘", label: "Кнопка" },
  { type: "task", icon: "✅", label: "Задание" },
  { type: "media", icon: "🎥", label: "Запись медиа" },
  { type: "stories", icon: "▶", label: "Сторис" },
  { type: "pdf", icon: "📑", label: "PDF презентация" },
]

export function defaultQuestion(): Question {
  return { id: `q-${Date.now()}`, text: "", answerType: "short", required: false, options: [] }
}

export function createBlock(type: BlockType): Block {
  return {
    id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    content: "",
    imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
    videoUrl: "", videoLayout: "full", videoTitleTop: "", videoCaption: "",
    audioUrl: "", audioTitle: "", audioLayout: "full", audioTitleTop: "", audioCaption: "",
    fileUrl: "", fileName: "", fileLayout: "full", fileTitleTop: "", fileCaption: "",
    pdfUrl: "", pdfFileName: "",
    pdfRequireComplete: type === "pdf" ? true : undefined,
    infoStyle: "info", infoColor: "", infoIcon: "", infoSize: "m",
    buttonText: "Подробнее", buttonUrl: "", buttonVariant: "primary", buttonColor: "", buttonIconBefore: "", buttonIconAfter: "",
    taskTitle: "", taskDescription: "", questions: type === "task" ? [defaultQuestion()] : [],
    mediaAllowVideo: type === "media" ? true : undefined,
    mediaAllowAudio: type === "media" ? false : undefined,
    mediaAllowPhoto: type === "media" ? false : undefined,
    mediaMaxDuration: type === "media" ? 60 : undefined,
    mediaRequired: type === "media" ? false : undefined,
    mediaInstruction: type === "media" ? "" : undefined,
    storiesCards: type === "stories" ? [] : undefined,
  }
}

function lesson(id: string, emoji: string, title: string, blocks: Block[]): Lesson {
  return { id, emoji, title, blocks }
}

function textBlock(id: string, content: string): Block {
  return { ...createBlock("text"), id, content }
}

export const DEFAULT_LESSONS: Lesson[] = [
  lesson("l1", "👋", "Приветствие", [
    textBlock("b1", "Здравствуйте, {{имя}}!\n\nМы рады, что вы рассматриваете возможность присоединиться к команде {{компания}}.\n\nВ этой демонстрации мы расскажем всё о должности «{{должность}}» — чем занимается компания, что вы будете делать, сколько зарабатывать и как расти.\n\nЗаймёт ~10 минут. Поехали! 🚀"),
  ]),
  lesson("l2", "🎥", "Видео-обращение основателя", [
    textBlock("b2a", "Основатель {{компания}} рассказывает о миссии компании и почему стоит к нам присоединиться."),
    { ...createBlock("video"), id: "b2b" },
  ]),
  lesson("l3", "🚀", "Куда растёт компания", [
    textBlock("b3", "{{компания}} активно развивается:\n\n• Рост выручки +40% за последний год\n• Открытие новых направлений\n• Расширение команды\n• Выход на новые рынки\n\nМы ищем людей, которые хотят расти вместе с нами."),
  ]),
  lesson("l4", "🏢", "О компании", [
    textBlock("b4", "{{компания}} — это современная компания с командой 150+ человек.\n\n📍 Основана: 2018\n👥 Команда: 150+\n🌍 География: {{город}}\n🏆 Лидер в своём сегменте"),
  ]),
  lesson("l5", "💰", "Рынок и заказчики", [
    textBlock("b5a", "Наши клиенты — ведущие компании в отрасли.\nСредний чек — от 500 000 ₽."),
    { ...createBlock("image"), id: "b5b", imageLayout: "full" as ImageLayout },
  ]),
  lesson("l6", "🏗", "Обзор объектов", [
    textBlock("b6a", "Наши проекты и объекты — то, чем мы гордимся."),
    { ...createBlock("image"), id: "b6b", imageLayout: "full" as ImageLayout },
    { ...createBlock("video"), id: "b6c" },
  ]),
  lesson("l7", "👤", "Ваша роль", [
    textBlock("b7", "На позиции «{{должность}}» вы будете:\n\n• Работать с клиентами\n• Вести переговоры и заключать сделки\n• Развивать клиентскую базу\n• Выполнять план продаж\n• Участвовать в стратегических проектах"),
  ]),
  lesson("l8", "⚙️", "Как устроена работа", [
    textBlock("b8", "📍 Офис: {{офис}}, {{город}}\n⏰ График: {{график}}\n🏠 Формат: офис + возможность удалённой работы\n\nИнструменты:\n• CRM-система\n• Корпоративная связь\n• Ноутбук"),
  ]),
  lesson("l9", "💵", "Система дохода", [
    { ...createBlock("info"), id: "b9", infoStyle: "success" as const, content: "💰 Оклад: {{зарплата_от}} – {{зарплата_до}} ₽\n\n📊 Бонусная система:\n• 100% плана → +20%\n• 120% плана → +35%\n• 150% плана → +50%\n\nПримеры дохода:\n• Новичок (3 мес): ~{{зарплата_от}} ₽\n• Опытный (6 мес): ~{{зарплата_до}} ₽" },
  ]),
  lesson("l10", "📍", "Офис, график и команда", [
    textBlock("b10a", "Наш офис — современное пространство в центре города.\n\n• Кухня и зона отдыха\n• Парковка для сотрудников\n• Удобная транспортная доступность"),
    { ...createBlock("image"), id: "b10b", imageLayout: "image-right" as ImageLayout },
  ]),
  lesson("l11", "📈", "Рост и карьера", [
    textBlock("b11", "Карьерная лестница:\n\n1️⃣ Стажёр → 2️⃣ Менеджер → 3️⃣ Старший → 4️⃣ Руководитель группы → 5️⃣ Руководитель отдела\n\nСреднее время роста: 6-12 месяцев.\n\n📚 Обучение:\n• Внутренняя академия\n• Менторство от руководителя\n• Внешние курсы и конференции"),
  ]),
  lesson("l12", "🚀", "Адаптация", [
    textBlock("b12", "Первые 30 дней:\n\n🗓 Неделя 1: Знакомство с командой, продуктом, инструментами\n🗓 Неделя 2: Обучение процессам, работа с наставником\n🗓 Неделя 3: Первые самостоятельные задачи\n🗓 Неделя 4: Полноценная работа + обратная связь\n\nВас не бросят одного — наставник рядом."),
  ]),
  lesson("l13", "✅", "Задания и вопросы", [
    { ...createBlock("task"), id: "b13", taskDescription: "Ответьте на несколько вопросов — это поможет нам лучше понять ваш опыт и мотивацию.", questions: [
      { ...defaultQuestion(), id: "q1", text: "Расскажите о вашем опыте работы" },
      { ...defaultQuestion(), id: "q2", text: "Почему вас заинтересовала эта должность?" },
      { ...defaultQuestion(), id: "q3", text: "Какой у вас опыт продаж?", answerType: "single" as const, options: ["Нет опыта", "Менее 1 года", "1-3 года", "3-5 лет", "Более 5 лет"] },
    ]},
  ]),
  lesson("l14", "🎥", "Видео-визитка", [
    { ...createBlock("task"), id: "b14", taskDescription: "Запишите короткое видео (1-2 минуты) о себе.", questions: [
      { ...defaultQuestion(), id: "vq1", text: "Кто вы и чем занимаетесь", answerType: "long" as const },
      { ...defaultQuestion(), id: "vq2", text: "Почему хотите работать в {{компания}}?", answerType: "long" as const },
    ]},
  ]),
  lesson("l15", "➡️", "Что дальше", [
    textBlock("b15", "Спасибо, что прошли демонстрацию должности! 🎉\n\nСледующие шаги:\n1. Мы проверим ваши ответы\n2. HR-менеджер свяжется с вами\n3. Пригласим на собеседование\n\nДо встречи!"),
  ]),
]

export interface RoleTemplate {
  emoji: string
  title: string
  description: string
  lessons: Lesson[]
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { emoji: "💼", title: "Менеджер по продажам (B2B)", description: "Классическая демонстрация для B2B продавцов", lessons: DEFAULT_LESSONS },
  { emoji: "📞", title: "Телемаркетолог", description: "Для позиций с холодными звонками", lessons: DEFAULT_LESSONS },
  { emoji: "🤝", title: "Клиентский менеджер", description: "Для сопровождения клиентов", lessons: DEFAULT_LESSONS },
  { emoji: "📋", title: "Бизнес-ассистент", description: "Для помощников руководителей", lessons: DEFAULT_LESSONS },
  { emoji: "🏗", title: "Менеджер проектных продаж", description: "Для строительства и проектов", lessons: DEFAULT_LESSONS },
  { emoji: "💻", title: "IT-специалист", description: "Для технических позиций", lessons: DEFAULT_LESSONS },
  { emoji: "📦", title: "Логист", description: "Для позиций в логистике", lessons: DEFAULT_LESSONS },
  { emoji: "🔧", title: "Рабочая специальность", description: "Для производственных позиций", lessons: DEFAULT_LESSONS },
]

export function createDemo(title: string, templateLessons?: Lesson[]): Demo {
  const ts = Date.now()
  const lessons = (templateLessons || DEFAULT_LESSONS).map((l, i) => ({
    ...l,
    id: `${l.id}-${ts}`,
    blocks: l.blocks.map((b) => ({ ...b, id: `${b.id}-${ts}-${i}` })),
  }))
  return {
    id: `demo-${ts}`,
    title,
    companyName: "TechCorp",
    description: "Демонстрация должности для кандидатов",
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    coverGradientFrom: "#6366f1",
    coverGradientTo: "#8b5cf6",
    lessons,
  }
}

// Подстановка примеров в превью/витрине — через общий lib/demo-vars.ts
// (локальная регулярка с `\w` не матчила кириллицу — плейсхолдеры оставались
// сырыми). Примеры значений — из того же единого списка, что и пикеры.
export function replaceVars(text: string): string {
  return renderDemoVars(text, demoVarExamplesMap())
}
