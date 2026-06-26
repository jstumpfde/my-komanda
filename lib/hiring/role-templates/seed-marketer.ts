// Двухволновой системный шаблон роли «Маркетолог по работе с AI».
// Источники контента:
//   Волна 1 (короткий фильтр, до демо) — 6 квалиф-вопросов из spec-ТЗ маркетолога.
//   Волна 2 (полная анкета, ПОСЛЕ углублённого демо) — 19 вопросов, источник:
//     «Анкета для маркетолога по AI — исправленная.docx» (Юрий, ред. 2026).
// Воронка: демо-короткое → волна1 → демо-углублённое → волна2 → interview → offer.
// Идемпотентный сид по образцу seed-sales-manager-b2b.ts.

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { roleTemplates, questionnaireTemplates, demoTemplates } from "@/lib/db/schema"
import { makeStage, dozhimChainFor, type FunnelV2Stage, type StageActionType } from "@/lib/funnel-v2/types"
import type { CandidateSpec } from "@/lib/core/spec/types"
import type { Question } from "@/lib/course-types"
import type { RoleScoringFormula } from "./types"

export const MARKETER_SLUG = "marketer"
const QUESTIONNAIRE_W1_NAME = "Маркетолог AI — волна 1 (системная)"
const QUESTIONNAIRE_W2_NAME = "Маркетолог AI — волна 2 (системная)"
const DEMO_SHORT_NAME = "Маркетолог AI — короткое демо (системное)"
const DEMO_DEEP_NAME = "Маркетолог AI — углублённое демо (системное)"

// ─── Вспомогательная функция вопроса ─────────────────────────────────────────

function q(p: Partial<Question> & Pick<Question, "id" | "text" | "answerType">): Question {
  return { required: true, options: [], ...p }
}

// ─── ВОЛНА 1 — короткий фильтр (6 вопросов, до демо) ────────────────────────
// Цель: быстро отсеять явных несоответствующих ДО показа углублённого демо.
// Баллы: optionPoints на варианты (желательные = выше), AI-вопросы с points+aiCriteria.

export const MARKETER_QUESTIONS_W1: Question[] = [
  q({
    id: "w1_q1_exp",
    text: "Сколько у вас реального опыта в маркетинге?",
    answerType: "single",
    points: 0,
    options: [
      "До 6 месяцев",
      "6–12 месяцев",
      "1–2 года",
      "2–3 года",
      "3+ года",
      "Опыта в маркетинге почти нет, но есть сильный интерес и опыт с AI",
    ],
    optionPoints: [0, 5, 10, 15, 20, 5],
  }),
  q({
    id: "w1_q2_formats",
    text: "В каких форматах вы работали?",
    answerType: "multiple",
    points: 0,
    options: [
      "В штате компании",
      "В digital-агентстве",
      "На фрилансе",
      "В собственном проекте",
      "В стартапе",
      "В B2B-проекте",
      "В B2C-проекте",
      "В SaaS / IT / AI-проекте",
      "Вёл(а) личный блог / канал / медиа",
      "Другое",
    ],
    optionPoints: [8, 5, 5, 5, 8, 10, 3, 10, 3, 0],
    otherOptions: [9], otherPlaceholder: "Укажите формат",
  }),
  q({
    id: "w1_q3_strong",
    text: "В чём вы сильнее всего как маркетолог? (выберите до 5 вариантов)",
    answerType: "multiple",
    points: 0,
    options: [
      "Тексты и копирайтинг",
      "SEO-статьи и лонгриды",
      "Telegram / соцсети",
      "Контент-стратегия",
      "Личный бренд",
      "Визуалы и креативы",
      "Простое видео / Reels / Shorts",
      "Email-рассылки",
      "Лендинги и упаковка продукта",
      "Маркетинговые исследования",
      "Анализ конкурентов",
      "Лидогенерация",
      "Реклама: Яндекс / VK / Telegram Ads",
      "Аналитика, метрики, воронки",
      "Автоматизация маркетинга",
      "AI-инструменты и промты",
      "Быстрое тестирование гипотез",
      "Другое",
    ],
    optionPoints: [5, 8, 5, 8, 3, 3, 3, 7, 7, 5, 5, 8, 7, 8, 8, 10, 8, 0],
    otherOptions: [17], otherPlaceholder: "Укажите",
  }),
  q({
    id: "w1_q4_ai_tools",
    text: "Какие AI-инструменты вы реально использовали в работе? Перечислите кратко.",
    answerType: "short",
    textMatchMode: "ai",
    points: 20,
    aiCriteria:
      "Оцени реальность и глубину опыта с AI. " +
      "Конкретные инструменты (ChatGPT, Claude, Midjourney, n8n, Make, Perplexity, Notion AI, Runway и т.д.) + " +
      "описание задач, в которых применялись → выше. " +
      "«ChatGPT иногда» без деталей → средний балл. " +
      "«Ничего» или «не знаком» → ниже. " +
      "Продвинутые инструменты (агенты, автоматизации, цепочки промтов) → бонус.",
  }),
  q({
    id: "w1_q5_ai_level",
    text: "Какой у вас уровень работы с AI?",
    answerType: "single",
    points: 0,
    options: [
      "Новичок: пользуюсь иногда, простые запросы",
      "Базовый: регулярно использую для текстов и идей",
      "Уверенный: использую каждый день в рабочих задачах",
      "Сильный: умею строить промты, цепочки, шаблоны, процессы",
      "Продвинутый: делал(а) AI-агентов, автоматизации, сложные связки",
    ],
    optionPoints: [2, 5, 10, 15, 20],
  }),
  q({
    id: "w1_q6_ready_tasks",
    text: "Какие задачи вы готовы брать в работу сразу, без долгого обучения? Выберите всё подходящее.",
    answerType: "multiple",
    points: 0,
    options: [
      "Посты для Telegram",
      "Контент-план",
      "SEO-статьи",
      "GEO-статьи",
      "Лонгриды",
      "Обзоры инструментов",
      "Анализ конкурентов",
      "Исследование ЦА",
      "Простые визуалы",
      "Обложки и карточки",
      "Короткие видео",
      "Email-письма",
      "Презентации",
      "Лендинги на конструкторах/AI",
      "Структуры лендингов",
      "Промпты для повторяющихся задач",
      "Вайбкодинг",
      "Документация по AI-инструментам",
      "Другое",
    ],
    optionPoints: [5, 7, 8, 8, 7, 8, 7, 6, 3, 3, 5, 7, 5, 6, 6, 8, 7, 7, 0],
    otherOptions: [18], otherPlaceholder: "Укажите",
  }),
]

// ─── ВОЛНА 2 — полная анкета (19 вопросов, ПОСЛЕ углублённого демо) ──────────
// Источник: «Анкета для маркетолога по AI — исправленная.docx» (Юрий, 2026).
// Тексты/варианты максимально близки к оригиналу docx.
// Интро-сообщение волны 2 — из docx.

export const MARKETER_WAVE2_INTRO =
  "Благодарим вас за отклик! Мы посмотрели ваше резюме и по первому впечатлению " +
  "вы можете подойти нам на роль маркетолога по работе с AI / нейросетями. " +
  "Чтобы перейти к следующему шагу, заполните ответы ниже. " +
  "Большая часть вопросов — чекбоксы, поэтому анкета не займёт много времени. " +
  "Отвечайте честно: нам важно понять ваш реальный уровень, сильные стороны " +
  "и зоны, где потребуется прокачка. " +
  "После заполнения анкеты мы изучим ответы и дадим вам обратную связь. " +
  "Если ожидания совпадут, пригласим вас на следующий этап — " +
  "финальное обсуждение роли, задач и условий."

export const MARKETER_QUESTIONS_W2: Question[] = [
  // Блок 1. Ваш опыт
  q({
    id: "w2_q1_exp",
    text: "Сколько у вас реального опыта в маркетинге?",
    answerType: "single",
    points: 0,
    options: [
      "До 6 месяцев",
      "6–12 месяцев",
      "1–2 года",
      "2–3 года",
      "3+ года",
      "Опыта в маркетинге почти нет, но есть сильный интерес и опыт с AI",
    ],
    optionPoints: [0, 5, 10, 15, 20, 5],
  }),
  q({
    id: "w2_q2_formats",
    text: "В каких форматах вы работали? (можно выбрать несколько)",
    answerType: "multiple",
    points: 0,
    options: [
      "В штате компании",
      "В digital-агентстве",
      "На фрилансе",
      "В собственном проекте",
      "В стартапе",
      "В B2B-проекте",
      "В B2C-проекте",
      "В SaaS / IT / AI-проекте",
      "Вёл(а) личный блог / канал / медиа",
      "Другое",
    ],
    optionPoints: [6, 4, 4, 4, 6, 10, 2, 10, 2, 0],
    otherOptions: [9], otherPlaceholder: "Укажите",
  }),
  q({
    id: "w2_q3_strong",
    text: "В чём вы сильнее всего как маркетолог? (выберите до 5 вариантов)",
    answerType: "multiple",
    points: 0,
    options: [
      "Тексты и копирайтинг",
      "SEO-статьи и лонгриды",
      "Telegram / соцсети",
      "Контент-стратегия",
      "Личный бренд",
      "Визуалы и креативы",
      "Простое видео / Reels / Shorts",
      "Email-рассылки",
      "Лендинги и упаковка продукта",
      "Маркетинговые исследования",
      "Анализ конкурентов",
      "Лидогенерация",
      "Реклама: Яндекс / VK / Telegram Ads",
      "Аналитика, метрики, воронки",
      "Автоматизация маркетинга",
      "AI-инструменты и промты",
      "Быстрое тестирование гипотез",
      "Другое",
    ],
    optionPoints: [5, 8, 5, 8, 2, 3, 3, 7, 7, 5, 5, 8, 6, 8, 8, 10, 8, 0],
    otherOptions: [17], otherPlaceholder: "Укажите",
  }),
  q({
    id: "w2_q4_weak",
    text: "Что у вас пока слабее или почти нет опыта? (выберите всё, где не чувствуете себя уверенно)",
    answerType: "multiple",
    points: 0,
    options: [
      "SEO",
      "GEO",
      "Telegram / соцсети",
      "Email-маркетинг",
      "Визуалы",
      "Видео",
      "Лендинги",
      "Реклама",
      "Аналитика",
      "B2B-маркетинг",
      "SaaS / IT-продукты",
      "AI-инструменты",
      "Автоматизация через n8n / Make",
      "Вайбкодинг",
      "Работа с подрядчиками",
      "Построение контент-плана",
      "Исследования рынка и конкурентов",
      "Пока сложно оценить",
      "Другое",
    ],
    // Баллы штрафные: больше слабых мест критичных для роли — ниже.
    // Слабости некритичные (видео, подрядчики) — нейтральны.
    // Максимальный штраф: AI-инструменты, аналитика, B2B, SaaS.
    optionPoints: [-3, -2, -2, -3, -1, -1, -2, -2, -4, -5, -4, -8, -3, -1, -1, -2, -3, 0, 0],
    otherOptions: [18], otherPlaceholder: "Укажите",
  }),
  // Блок 2. AI-инструменты
  q({
    id: "w2_q5_ai_tools",
    text: "Какие AI-инструменты вы реально использовали? Перечислите.",
    answerType: "short",
    textMatchMode: "ai",
    points: 20,
    aiCriteria:
      "Оцени конкретность и разнообразие AI-инструментов. " +
      "Конкретные названия (ChatGPT/Claude/Midjourney/Runway/n8n/Make/Perplexity/Notion AI и т.д.) → выше. " +
      "Только ChatGPT без деталей → средний. " +
      "«Не использовал» или нет ответа → ниже.",
  }),
  q({
    id: "w2_q6_ai_tasks",
    text: "Для каких задач вы использовали AI? Опишите кратко.",
    answerType: "short",
    textMatchMode: "ai",
    points: 15,
    aiCriteria:
      "Оцени, насколько задачи прикладные и разнообразные. " +
      "Контент + анализ + автоматизация → выше. " +
      "Только «написание текстов» → средний. " +
      "Нет ответа или «не использую» → ниже.",
  }),
  q({
    id: "w2_q7_ai_level",
    text: "Какой у вас уровень работы с AI?",
    answerType: "single",
    points: 0,
    options: [
      "Новичок: пользуюсь иногда, простые запросы",
      "Базовый: регулярно использую для текстов и идей",
      "Уверенный: использую каждый день в рабочих задачах",
      "Сильный: умею строить промты, цепочки, шаблоны, процессы",
      "Продвинутый: делал(а) AI-агентов, автоматизации, сложные связки",
    ],
    optionPoints: [2, 5, 10, 15, 20],
  }),
  // Блок 3. Маркетинговые задачи
  q({
    id: "w2_q8_ready_tasks",
    text: "Какие задачи вы готовы брать в работу сразу?",
    answerType: "multiple",
    points: 0,
    options: [
      "Посты для Telegram",
      "Контент-план",
      "SEO-статьи",
      "GEO-статьи",
      "Лонгриды",
      "Обзоры инструментов",
      "Анализ конкурентов",
      "Исследование ЦА",
      "Простые визуалы",
      "Обложки и карточки",
      "Короткие видео",
      "Email-письма",
      "Презентации",
      "Лендинги на конструкторах/AI",
      "Структуры лендингов",
      "Промпты для повторяющихся задач",
      "Вайбкодинг",
      "Документация по AI-инструментам",
      "Другое",
    ],
    optionPoints: [5, 7, 7, 7, 6, 8, 6, 5, 2, 2, 4, 6, 4, 6, 5, 8, 7, 7, 0],
    otherOptions: [18], otherPlaceholder: "Укажите",
  }),
  q({
    id: "w2_q9_unwanted_tasks",
    text: "Какие задачи вы НЕ хотите вести?",
    answerType: "multiple",
    points: 0,
    options: [
      "Сбор баз для обзвона",
      "Холодный email",
      "Реклама",
      "SEO/GEO",
      "Соцсети",
      "Визуалы",
      "Видео",
      "Рассылки мессенджеры",
      "Лендинги",
      "Аналитика",
      "Вайбкодинг",
      "Работа с подрядчиками",
      "Комментарии и комьюнити",
      "Рутинная документация",
      "Частые переключения между задачами",
      "Нет таких задач, готов(а) пробовать разное",
      "Другое",
    ],
    // Штраф за отказ от ключевых задач роли; готовность к разному — плюс.
    optionPoints: [0, 0, -3, -3, -3, -1, -1, -2, -2, -4, -2, 0, -1, 0, -3, 5, 0],
    otherOptions: [16], otherPlaceholder: "Укажите",
  }),
  // Блок 4. Формат работы и мотивация
  q({
    id: "w2_q10_task_format",
    text: "Какой формат задач вам ближе? (выберите до 3 вариантов)",
    answerType: "multiple",
    points: 0,
    options: [
      "Получить понятную задачу и быстро сделать",
      "Самостоятельно разобраться с новой темой",
      "Делать много разных задач в течение дня",
      "Вести одно направление глубоко",
      "Работать по готовой стратегии",
      "Самому/самой предлагать гипотезы",
      "Делать контент каждый день",
      "Анализировать рынок и конкурентов",
      "Тестировать новые AI-инструменты",
      "Настраивать процессы и автоматизации",
    ],
    optionPoints: [5, 8, 5, 6, 3, 8, 6, 5, 10, 8],
  }),
  q({
    id: "w2_q11_learn_style",
    text: "Как вы обычно осваиваете новый сервис?",
    answerType: "multiple",
    points: 0,
    options: [
      "Смотрю YouTube/Rutube-разборы",
      "Читаю документацию",
      "Спрашиваю у ChatGPT / Claude / Gemini",
      "Ищу примеры и кейсы",
      "Сразу тестирую на простой задаче",
      "Сравниваю с аналогами",
      "Делаю краткую инструкцию для себя или команды",
      "Жду, когда мне подробно объяснят",
      "Другое",
    ],
    optionPoints: [5, 8, 8, 6, 10, 5, 8, -3, 0],
    otherOptions: [8], otherPlaceholder: "Укажите",
  }),
  q({
    id: "w2_q12_multitask",
    text: "Как вы относитесь к большому количеству разных задач?",
    answerType: "single",
    points: 0,
    options: [
      "Мне это нравится, я люблю переключаться",
      "Нормально, если есть понятные приоритеты",
      "Могу, но быстро устаю от хаоса",
      "Лучше работаю, когда есть один фокус",
      "Мне сложно работать в таком формате",
    ],
    optionPoints: [10, 8, 5, 3, 0],
  }),
  q({
    id: "w2_q13_feedback",
    text: "Как вы относитесь к обратной связи и правкам?",
    answerType: "single",
    points: 0,
    options: [
      "Спокойно, правки помогают сделать лучше",
      "Нормально, если обратная связь конкретная",
      "Иногда сложно, но я учусь",
      "Не люблю частые правки",
      "Мне важно, чтобы задачу сразу объясняли максимально подробно",
    ],
    optionPoints: [10, 8, 5, 2, 3],
  }),
  q({
    id: "w2_q14_salary",
    text: "С какого минимального дохода готовы стартовать, пока выходите на результат?",
    answerType: "short",
    textMatchMode: "ai",
    points: 10,
    aiCriteria:
      "Оцени реалистичность ожиданий и гибкость. " +
      "Назвал конкретную цифру → нейтрально (информация для HR). " +
      "«Готов на стартовую ставку» / гибкость → плюс. " +
      "Нереалистично высокая сумма без опыта → снижай балл.",
  }),
  q({
    id: "w2_q15_combine",
    text: "Вы ищете единственное место работы или хотите совмещать?",
    answerType: "single",
    points: 0,
    options: [
      "Хочу совмещать с работой",
      "Хочу совмещать с учёбой",
      "Единственное место",
    ],
    optionPoints: [3, 5, 10],
  }),
  q({
    id: "w2_q16_start_date",
    text: "Когда готовы выйти, если обо всём договоримся?",
    answerType: "short",
    textMatchMode: "ai",
    points: 5,
    aiCriteria:
      "Оцени готовность к быстрому старту. " +
      "«Сразу» / «в течение недели» → выше. " +
      "Конкретная дата → нейтрально. " +
      "«Не знаю» / очень долгий срок без объяснений → ниже.",
  }),
  // Короткие открытые вопросы
  q({
    id: "w2_q17_strengths",
    text: "Назовите 1–2 свои самые сильные стороны, коротко: что у вас получается лучше всего?",
    answerType: "long",
    textMatchMode: "ai",
    points: 15,
    aiCriteria:
      "Оцени конкретность и самосознание. " +
      "Конкретные сильные стороны с примером → выше. " +
      "Общие слова («коммуникабельный», «ответственный») без примеров → ниже. " +
      "Упомянута работа с AI, аналитика или контент-продакшн → бонус.",
  }),
  q({
    id: "w2_q18_motivation",
    text: "Почему вам интересна эта роль?",
    answerType: "long",
    textMatchMode: "ai",
    points: 15,
    aiCriteria:
      "Оцени, насколько мотивация искренняя и связана с реальными интересами к AI и маркетингу. " +
      "Конкретные причины (интерес к продукту / теме AI / рост в нише) → выше. " +
      "Шаблонные ответы («хочу развиваться», «компания привлекательная») без деталей → ниже.",
  }),
  q({
    id: "w2_q19_question",
    text: "Один вопрос, который вы хотите задать нам",
    answerType: "long",
    textMatchMode: "ai",
    points: 5,
    aiCriteria:
      "Оцени вопрос кандидата. " +
      "Содержательный вопрос о роли, продукте, команде, метриках → выше. " +
      "«Нет вопросов» / формальный вопрос → нейтрально. " +
      "Вопрос только про зарплату → немного снижай.",
  }),
]

// ─── Критерии оценки (CandidateSpec) ─────────────────────────────────────────
// mustHave [] / dealBreakers [] — без жёсткого авто-стопа (политика Юрия).
// anketaThresholds: upper=70 зелёный, lower=30 — почти не режет автоматом.

export const MARKETER_SPEC: Partial<CandidateSpec> = {
  mustHave: [],
  niceToHave: [
    { text: "Опыт работы с AI-инструментами (ChatGPT/Claude и другие) в реальных задачах", importance: "very" },
    { text: "Понимание B2B-маркетинга (продукт для бизнеса, а не B2C/розница)", importance: "very" },
    { text: "Самостоятельное ведение хотя бы 2 маркетинговых направлений", importance: "important" },
    { text: "Умеет создавать контент руками: тексты, SEO, Telegram, email", importance: "important" },
    { text: "Готов тестировать гипотезы и работать с разными задачами", importance: "important" },
    { text: "Опыт в SaaS / IT / HRTech-проектах", importance: "nice" },
    { text: "Умеет строить промты, цепочки, шаблоны в AI", importance: "nice" },
    { text: "Знает базовую аналитику: воронка, конверсии, метрики", importance: "nice" },
  ],
  dealBreakers: [],
  idealProfile:
    "Маркетолог с реальным опытом работы с AI-инструментами, который умеет самостоятельно " +
    "вести разные направления (контент, SEO, email, соцсети), думает задачами и результатами, " +
    "гибок в формате работы и готов расти в AI-маркетинге как в специализации.",
  anketaThresholds: { enabled: true, upperThreshold: 70, lowerThreshold: 30 },
  scoringWeights: {
    relevant_experience: 25,
    hard_skills:         25,
    results_in_numbers:  15,
    soft_skills_fit:     15,
    tenure_stability:    5,
    company_size_match:  5,
    managerial_match:    2,
    location_readiness:  4,
    education:           4,
  },
  customCriteria: [
    {
      key: "ai_tools_depth",
      label: "Глубина опыта с AI-инструментами",
      weight: "critical",
      importance: 30,
      hardness: "soft",
      aiMode: "instruction",
      hint: "Конкретные инструменты + задачи, в которых применялись; уровень (базовый/продвинутый)",
    },
    {
      key: "marketing_selfreliance",
      label: "Самостоятельность в маркетинге (не только надзор)",
      weight: "important",
      importance: 25,
      hardness: "soft",
      aiMode: "instruction",
      hint: "Кандидат сам создавал контент, настраивал каналы — не просто управлял подрядчиком",
    },
    {
      key: "b2b_it_fit",
      label: "Опыт в B2B / IT / SaaS-проектах",
      weight: "important",
      importance: 20,
      hardness: "soft",
      aiMode: "instruction",
      hint: "Работал с продуктом для бизнеса или IT-аудитории — не только B2C/розница",
    },
    {
      key: "content_production",
      label: "Навык производства контента (тексты, SEO, email, соцсети)",
      weight: "important",
      importance: 15,
      hardness: "soft",
      aiMode: "instruction",
      hint: "Руками пишет, публикует, оптимизирует — конкретные форматы из анкеты",
    },
    {
      key: "adaptability",
      label: "Гибкость и готовность к разным задачам",
      weight: "nice",
      importance: 10,
      hardness: "soft",
      aiMode: "context",
      hint: "Открыт к новым форматам, учится быстро, не отказывается от ключевых задач роли",
    },
  ],
}

// ─── Стадии воронки v2 (двухволновой сценарий) ───────────────────────────────
// Порядок: demo(короткое) → prequalification(волна1) → demo(углублённое) →
//           test(волна2) → interview → offer.
// contentBlockId на demo-стадиях — маркер null (apply.ts подставит id созданного demo).
// autoReject: true только там, где явный фильтр оправдан (волна1 — мягко).
// autoAdvance: false везде (политика Юрия: никаких авто-приглашений).

function stage(action: StageActionType, seed: string, over: Partial<FunnelV2Stage>): FunnelV2Stage {
  const base = makeStage(action, seed)
  const dozhim = over.dozhim ?? base.dozhim
  return {
    ...base, ...over, dozhim,
    dozhimChain: dozhimChainFor(dozhim, action),
    rule: { ...base.rule, ...(over.rule ?? {}) },
  }
}

export const MARKETER_FUNNEL: FunnelV2Stage[] = [
  stage("demo", "mkt-1-demo-short", {
    title: "Короткое демо (хук)",
    messagePresetId: "Здравствуйте, {{name}}! Спасибо за отклик на «{{vacancy}}». Подготовили короткую демонстрацию должности — 15 минут, и вы узнаете о продукте, задачах и команде: {{demo_link}}",
    contentBlockId: null,  // apply.ts подставит id короткого demo
    // _demoTemplateId — apply.ts подставит реальный id после сида.
    // При вызове buildMarketerFunnelWithIds() поле заполняется.
    _demoTemplateId: null,
    dozhim: "strong",
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: 60,
      passCriteria: "Кандидат посмотрел короткое демо — хуковый обзор продукта/роли. Переход на волну 1.",
    },
  }),
  stage("prequalification", "mkt-2-wave1", {
    title: "Анкета волна 1 (короткий фильтр)",
    // _questionnaireTemplateId — apply.ts подставит реальный id анкеты волны 1.
    // При вызове buildMarketerFunnelWithIds() поле заполняется.
    _questionnaireTemplateId: null,
    dozhim: "standard",
    rule: {
      autoAdvance: false,
      autoReject: true,
      threshold: 20,
      rejectDelayMinutes: 60,
      rejectText: "{{name}}, спасибо за интерес к вакансии «{{vacancy}}» и за ваши ответы. На данный момент мы остановимся на других кандидатах — профиль пока не совсем совпадает с тем, что мы ищем. Желаем успехов и будем рады видеть ваш отклик в будущем!",
      passCriteria:
        "Короткий квалиф-фильтр: опыт, форматы, AI-инструменты. " +
        "Ниже 20 баллов → авто-отказ (явное несоответствие). " +
        "Прошедшие → на углублённое демо.",
    },
  }),
  stage("demo", "mkt-3-demo-deep", {
    title: "Углублённое демо (продукт + роль)",
    messagePresetId: "{{name}}, отличные ответы — спасибо! Подготовили для вас углублённую демонстрацию: подробно о продукте, реальных задачах маркетолога и о том, как мы работаем с AI: {{demo_link}}",
    contentBlockId: null,  // apply.ts подставит id углублённого demo
    // _demoTemplateId — apply.ts подставит реальный id углублённого демо.
    _demoTemplateId: null,
    dozhim: "standard",
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: 60,
      passCriteria: "Кандидат прошёл углублённый обзор продукта и роли маркетолога. Переход на волну 2.",
    },
  }),
  stage("test", "mkt-4-wave2", {
    title: "Анкета волна 2 (полная)",
    messagePresetId: `${MARKETER_WAVE2_INTRO}\n\nЗаполнить анкету: {{test_link}}`,
    // _questionnaireTemplateId — apply.ts подставит реальный id анкеты волны 2.
    _questionnaireTemplateId: null,
    dozhim: "standard",
    rule: {
      autoAdvance: false,
      autoReject: false,
      threshold: 70,
      rejectDelayMinutes: 60,
      passCriteria:
        "Полная анкета из 19 вопросов (опыт + AI + задачи + мотивация). " +
        "≥70 → зелёный уровень. 30–69 → ручной просмотр HR. " +
        "Авто-отказ ВЫКЛ (политика Юрия): спорные на ручной просмотр.",
    },
  }),
  stage("interview", "mkt-5-interview", {
    title: "Интервью (знакомство)",
    messagePresetId: "{{name}}, поздравляем — вы прошли на следующий этап! Предлагаем познакомиться лично: короткий разговор о роли, задачах и условиях. Напишите, пожалуйста, когда вам удобно (день и время).",
    interviewMode: "phone",
    scheduling: ["bot", "self_link"],
    dozhim: "soft",
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: 60,
      passCriteria: "Скрининговый звонок: знакомство, уточнение мотивации и деталей. Вес в финале 0.5.",
    },
  }),
  stage("offer", "mkt-6-offer", {
    title: "Решение / оффер",
    messagePresetId: "{{name}}, рады сообщить: мы готовы сделать вам предложение по вакансии «{{vacancy}}»! HR свяжется с вами, чтобы обсудить детали и условия. Поздравляем!",
    dozhim: "off",
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: 60,
    },
  }),
]

// ─── Формула финала ───────────────────────────────────────────────────────────

export const MARKETER_FORMULA: RoleScoringFormula = {
  weights: { screening: 0.5, interview: 0.5 },
  statuses: { suitable: 70, review: 40 },
  anketaGate: { passingScore: 70 },
  note:
    "Волна 1 — мягкий фильтр (≥20). Волна 2 — ≥70 зелёный, 30–69 ручной просмотр, авто-отказ ВЫКЛ. " +
    "Финал = скрининг·0.5 + интервью·0.5. " +
    "≥70 подходит · 40–69 рассмотреть · <40 не подходит.",
}

// ─── Демо-секции ──────────────────────────────────────────────────────────────

function p(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((para) => `<p style="margin:0 0 12px 0;line-height:1.55">${para.replace(/\n/g, "<br/>")}</p>`)
    .join("")
}

function blk(id: string, type: string, content: string, extras: Record<string, unknown> = {}) {
  return {
    id, type, content,
    imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
    videoUrl: "", videoLayout: "full", videoTitleTop: "", videoCaption: "",
    audioUrl: "", audioTitle: "", audioLayout: "full", audioTitleTop: "", audioCaption: "",
    fileUrl: "", fileName: "", fileLayout: "full", fileTitleTop: "", fileCaption: "",
    infoStyle: "info", infoColor: "", infoIcon: "", infoSize: "m",
    buttonText: "Подробнее", buttonUrl: "", buttonVariant: "primary", buttonColor: "",
    buttonIconBefore: "", buttonIconAfter: "",
    taskTitle: "", taskDescription: "", questions: [],
    ...extras,
  }
}

function lesson(id: string, emoji: string, title: string, blocks: ReturnType<typeof blk>[]) {
  return { id, emoji, title, blocks }
}

// Короткое демо: 2 секции — хук-приветствие + почему интересно (без длинного питча)
export const MARKETER_DEMO_SHORT_SECTIONS = [
  lesson("ls1", "👋", "Привет!", [
    blk("bs1", "text", p(
      "{{имя}}, добрый день! Рады, что вы откликнулись на вакансию «{{должность}}» в {{компания}}.\n\n" +
      "Это короткий обзор за 2–3 минуты: что мы делаем и почему ищем маркетолога, " +
      "который работает с AI. В конце — несколько быстрых вопросов об опыте."
    )),
  ]),
  lesson("ls2", "🚀", "Почему эта роль", [
    blk("bs2", "text", p(
      "Мы строим {{productName}} — {{productDescription}}\n\n" +
      "Наши клиенты: {{icp}}. Продукт уже работает, есть данные и первые кейсы. " +
      "Маркетолог нужен для роста: контент, AI-контент, SEO, аудитория.\n\n" +
      "Главное, что нас отличает: здесь можно работать с AI не «ради хайпа», " +
      "а как с реальным рабочим инструментом. Именно это нам и нужно."
    )),
  ]),
]

// Углублённое демо: 5 секций — приветствие + продукт + роль маркетолога + что ждём + след. шаг
export const MARKETER_DEMO_DEEP_SECTIONS = [
  lesson("ld1", "👋", "Приветствие", [
    blk("bd1", "text", p(
      "{{имя}}, спасибо за интерес к роли и за то, что прошли первый шаг!\n\n" +
      "Сейчас — подробный обзор: что за продукт, кому продаём, и что конкретно " +
      "предстоит делать маркетологу. Займёт 10–15 минут. После — анкета."
    )),
  ]),
  lesson("ld2", "📦", "О продукте", [
    blk("bd2", "text", p(
      "{{productName}} — {{productDescription}}\n\n" +
      "Кому продаём: {{icp}}. Почему покупают: нанимать быстрее и дешевле, " +
      "не теряя качество кандидатов. Автоматизация рутины найма через AI.\n\n" +
      "Ключевое: это B2B SaaS-продукт с понятной воронкой и измеримым результатом — " +
      "маркетинг здесь виден от первого касания до оплаты."
    )),
  ]),
  lesson("ld3", "🎯", "Роль маркетолога", [
    blk("bd3", "text", p(
      "Что будете делать:\n\n" +
      "— Контент и AI-контент: статьи, посты, обзоры инструментов, кейсы — " +
      "с активным использованием AI для ускорения и масштабирования.\n\n" +
      "— SEO и органика: статьи под запросы {{icp}}, оптимизация лендингов, " +
      "GEO-контент для AI-поиска.\n\n" +
      "— Email и автоматизации: прогрев лидов, онбординг, реактивация — " +
      "с использованием AI-шаблонов и цепочек.\n\n" +
      "— Тестирование гипотез: предлагаете идею → тестируете → смотрите на цифры → итерируете."
    )),
  ]),
  lesson("ld4", "⚙️", "Что нам важно", [
    blk("bd4", "text", p(
      "Три главных критерия:\n\n" +
      "1. AI как рабочий инструмент — не «пробовал однажды», а регулярно в задачах. " +
      "ChatGPT, Claude, Midjourney, n8n — всё, что помогает делать быстрее и лучше.\n\n" +
      "2. Самостоятельность — вы сами пишете, публикуете, настраиваете, измеряете. " +
      "Не ждёте пошагового брифа на каждую задачу.\n\n" +
      "3. Гибкость — роль растущая, задачи разные. Кому-то это минус, " +
      "нам нужен тот, кому это плюс."
    )),
  ]),
  lesson("ld5", "➡️", "Следующий шаг", [
    blk("bd5", "text", p(
      "Дальше — анкета: ~19 вопросов об опыте, AI-инструментах, задачах и мотивации. " +
      "Займёт 10–15 минут. Большинство вопросов — чекбоксы.\n\n" +
      "Отвечайте честно: нам важно понять реальный уровень, " +
      "а не идеальный образ. Если ожидания совпадут — свяжемся для знакомства. " +
      "Удачи!"
    )),
  ]),
]

// ─── Воронка с реальными id шаблонов ─────────────────────────────────────────

/**
 * Строит MARKETER_FUNNEL с проставленными _demoTemplateId и
 * _questionnaireTemplateId для каждой стадии — apply.ts использует эти поля
 * для создания отдельных demos-записей (демо-блоков и блоков с вопросами).
 *
 * Идентификация стадий по id (mkt-1-demo-short, mkt-2-wave1, mkt-3-demo-deep,
 * mkt-4-wave2) — стабильные константы, не зависят от порядка.
 */
export function buildMarketerFunnelWithIds(ids: {
  demoShortId: string
  demoDeepId: string
  questionnaireW1Id: string
  questionnaireW2Id: string
}): FunnelV2Stage[] {
  return MARKETER_FUNNEL.map((s) => {
    if (s.id === "st-mkt-1-demo-short") {
      return { ...s, _demoTemplateId: ids.demoShortId }
    }
    if (s.id === "st-mkt-2-wave1") {
      return { ...s, _questionnaireTemplateId: ids.questionnaireW1Id }
    }
    if (s.id === "st-mkt-3-demo-deep") {
      return { ...s, _demoTemplateId: ids.demoDeepId }
    }
    if (s.id === "st-mkt-4-wave2") {
      return { ...s, _questionnaireTemplateId: ids.questionnaireW2Id }
    }
    return s
  })
}

// ─── Идемпотентный сид ───────────────────────────────────────────────────────

type SeedResult = {
  roleTemplateId: string
  questionnaireW1Id: string
  questionnaireW2Id: string
  demoShortId: string
  demoDeepId: string
  created: boolean
}

/**
 * Создаёт (или обновляет) системный двухволновой шаблон роли «Маркетолог AI».
 * Идемпотентно: анкеты/демо ищутся по имени среди системных, роль — по slug.
 * Повторный сид достаёт строки из корзины (deletedAt: null), а не плодит дубли.
 *
 * ДВУХВОЛНОВОЙ сценарий (хранение в funnelV2Template стадиях):
 *   st-mkt-1-demo-short → _demoTemplateId = demoShortId
 *   st-mkt-2-wave1      → _questionnaireTemplateId = questionnaireW1Id
 *   st-mkt-3-demo-deep  → _demoTemplateId = demoDeepId
 *   st-mkt-4-wave2      → _questionnaireTemplateId = questionnaireW2Id
 *
 * apply.ts читает _demoTemplateId/_questionnaireTemplateId из стадий и создаёт
 * для каждой отдельную запись в таблице demos (демо-блок или блок с вопросами).
 */
export async function seedMarketer(createdBy?: string): Promise<SeedResult> {
  // 1) Анкета волна 1
  const [existingQ1] = await db.select({ id: questionnaireTemplates.id })
    .from(questionnaireTemplates)
    .where(and(eq(questionnaireTemplates.isSystem, true), eq(questionnaireTemplates.name, QUESTIONNAIRE_W1_NAME)))
    .limit(1)

  let questionnaireW1Id: string
  if (existingQ1) {
    questionnaireW1Id = existingQ1.id
    await db.update(questionnaireTemplates)
      .set({ questions: MARKETER_QUESTIONS_W1, deletedAt: null, updatedAt: new Date() })
      .where(eq(questionnaireTemplates.id, existingQ1.id))
  } else {
    const [row] = await db.insert(questionnaireTemplates)
      .values({ name: QUESTIONNAIRE_W1_NAME, type: "candidate", questions: MARKETER_QUESTIONS_W1, isSystem: true, tenantId: null })
      .returning({ id: questionnaireTemplates.id })
    questionnaireW1Id = row.id
  }

  // 2) Анкета волна 2
  const [existingQ2] = await db.select({ id: questionnaireTemplates.id })
    .from(questionnaireTemplates)
    .where(and(eq(questionnaireTemplates.isSystem, true), eq(questionnaireTemplates.name, QUESTIONNAIRE_W2_NAME)))
    .limit(1)

  let questionnaireW2Id: string
  if (existingQ2) {
    questionnaireW2Id = existingQ2.id
    await db.update(questionnaireTemplates)
      .set({ questions: MARKETER_QUESTIONS_W2, deletedAt: null, updatedAt: new Date() })
      .where(eq(questionnaireTemplates.id, existingQ2.id))
  } else {
    const [row] = await db.insert(questionnaireTemplates)
      .values({ name: QUESTIONNAIRE_W2_NAME, type: "candidate", questions: MARKETER_QUESTIONS_W2, isSystem: true, tenantId: null })
      .returning({ id: questionnaireTemplates.id })
    questionnaireW2Id = row.id
  }

  // 3) Короткое демо
  const [existingDShort] = await db.select({ id: demoTemplates.id })
    .from(demoTemplates)
    .where(and(eq(demoTemplates.isSystem, true), eq(demoTemplates.name, DEMO_SHORT_NAME)))
    .limit(1)

  let demoShortId: string
  if (existingDShort) {
    demoShortId = existingDShort.id
    await db.update(demoTemplates)
      .set({ sections: MARKETER_DEMO_SHORT_SECTIONS, deletedAt: null, updatedAt: new Date() })
      .where(eq(demoTemplates.id, existingDShort.id))
  } else {
    const [row] = await db.insert(demoTemplates)
      .values({ name: DEMO_SHORT_NAME, niche: "marketing_ai", length: "short", isSystem: true, tenantId: null, sections: MARKETER_DEMO_SHORT_SECTIONS, audience: ["candidates"] })
      .returning({ id: demoTemplates.id })
    demoShortId = row.id
  }

  // 4) Углублённое демо
  const [existingDDeep] = await db.select({ id: demoTemplates.id })
    .from(demoTemplates)
    .where(and(eq(demoTemplates.isSystem, true), eq(demoTemplates.name, DEMO_DEEP_NAME)))
    .limit(1)

  let demoDeepId: string
  if (existingDDeep) {
    demoDeepId = existingDDeep.id
    await db.update(demoTemplates)
      .set({ sections: MARKETER_DEMO_DEEP_SECTIONS, deletedAt: null, updatedAt: new Date() })
      .where(eq(demoTemplates.id, existingDDeep.id))
  } else {
    const [row] = await db.insert(demoTemplates)
      .values({ name: DEMO_DEEP_NAME, niche: "marketing_ai", length: "full", isSystem: true, tenantId: null, sections: MARKETER_DEMO_DEEP_SECTIONS, audience: ["candidates"] })
      .returning({ id: demoTemplates.id })
    demoDeepId = row.id
  }

  // 5) Шаблон роли (по slug).
  // questionnaireTemplateId → волна 1 (короткий фильтр, legacy-поле).
  // demoTemplateId → короткое демо (хук, legacy-поле).
  // Углублённое демо и волна 2 — привязаны к funnelV2Template через _demoTemplateId /
  // _questionnaireTemplateId — apply.ts читает эти id при применении шаблона.
  const [existingR] = await db.select({ id: roleTemplates.id })
    .from(roleTemplates)
    .where(eq(roleTemplates.slug, MARKETER_SLUG))
    .limit(1)

  // Воронка с реальными id шаблонов, проставленными в _demoTemplateId /
  // _questionnaireTemplateId каждой стадии. apply.ts читает эти поля и
  // создаёт нужные demos-записи для каждой стадии отдельно.
  const funnelWithIds = buildMarketerFunnelWithIds({
    demoShortId,
    demoDeepId,
    questionnaireW1Id,
    questionnaireW2Id,
  })

  const values = {
    slug: MARKETER_SLUG,
    name: "Маркетолог AI",
    description:
      "Системный двухволновой шаблон роли: маркетолог по работе с AI. " +
      "Волна 1 (6 квалиф-вопросов, короткий фильтр) + углублённое демо + " +
      "волна 2 (19 вопросов из исправленной анкеты Юрия). Мягкие пороги, ручной просмотр.",
    roleCategory: "marketing",
    isSystem: true,
    tenantId: null,
    questionnaireTemplateId: questionnaireW1Id,
    demoTemplateId: demoShortId,
    specTemplate: MARKETER_SPEC,
    funnelV2Template: funnelWithIds,
    scoringFormula: MARKETER_FORMULA,
    isPublished: true,
    deletedAt: null,
    createdBy: createdBy ?? null,
    updatedAt: new Date(),
  }

  let roleTemplateId: string
  let created = false
  if (existingR) {
    roleTemplateId = existingR.id
    await db.update(roleTemplates).set(values).where(eq(roleTemplates.id, existingR.id))
  } else {
    const [row] = await db.insert(roleTemplates).values(values).returning({ id: roleTemplates.id })
    roleTemplateId = row.id
    created = true
  }

  return { roleTemplateId, questionnaireW1Id, questionnaireW2Id, demoShortId, demoDeepId, created }
}
