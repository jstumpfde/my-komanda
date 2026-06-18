/**
 * seed-demo-sales-remote.ts — наполняет демо-тенант COMPANY24.PRO данными для
 * продающего видео: кейс «Менеджер по продажам на удалёнке».
 *
 * Идемпотентен: ищет вакансию по (companyId, title); если есть —
 * ТОЛЬКО по ней удаляет кандидатов/сообщения/интервью и пересидит.
 * Остальные вакансии и данные тенанта НЕ трогает.
 *
 * Что создаёт:
 *  - 1 вакансию «Менеджер по продажам на удалёнке — тёплая база, без холодного обзвона»
 *  - 9 именованных кандидатов-героев (шорт-лист/интервью/офер/нанят) с AI-баллами 82-96
 *  - 4 кандидата в «Тестировании» (баллы 74-79)
 *  - 4 кандидата в «AI-квалификации» (баллы 65-72)
 *  - ~1117 минимальных кандидатов в «Новых откликах» → итого ~1134
 *  - Героев Артём Соколов (96) и Марина Лебедева (94) с резюме и оценкой Юлии
 *  - Переписку Юлии с Артёмом в ai_chatbot_messages (11 реплик)
 *  - 4 интервью в calendar_events (Вт/Ср на ближайшей рабочей неделе)
 *
 * Запуск (только на сервере с правильным DATABASE_URL):
 *   DATABASE_URL="postgresql://mykomanda:PASS@localhost:5432/mykomanda" \
 *   npx tsx scripts/seed-demo-sales-remote.ts
 *
 * Или через пакетный менеджер (если добавить скрипт в package.json):
 *   pnpm tsx scripts/seed-demo-sales-remote.ts
 */

import { eq, and, ilike, inArray, sql } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import {
  companies, users, vacancies, candidates, calendarEvents,
} from "@/lib/db/schema"

// ── Константы тенанта ─────────────────────────────────────────────────────────
const DEMO_COMPANY_ID = "ae75117f-a3b7-49f5-abf3-8b3fbd9e3de9"
const DEMO_DIRECTOR_EMAIL = "director@company24.pro"

// ── Целевые счётчики воронки (из датасета) ───────────────────────────────────
const TARGET_TOTAL = 1134  // Откликов всего
const NAMED_CANDIDATES = 17  // 9 топ + 4 тест + 4 квалиф
const BULK_COUNT = TARGET_TOTAL - NAMED_CANDIDATES  // ~1117 в «Новых»

// ── Вспомогательные утилиты ───────────────────────────────────────────────────

// Детерминированный PRNG (mulberry32) — повторный запуск даёт те же данные
let _seed = 20260618_2
function rnd(): number {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rnd() * arr.length)] }
function int(min: number, max: number): number { return Math.floor(rnd() * (max - min + 1)) + min }
function daysAgo(d: number): Date { return new Date(Date.now() - d * 86400000) }
function daysFromNow(d: number): Date { return new Date(Date.now() + d * 86400000) }

// Транслит для email
const TR: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",
  к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
  х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
}
function translit(s: string): string {
  return s.toLowerCase().split("").map(ch => TR[ch] ?? ch).join("")
}

// Генерация уникального slug-based токена (без uuid4 — просто рандом + seq)
function makeToken(seq: number): string {
  return `demo-sr-${String(seq).padStart(6, "0")}-${Math.random().toString(36).slice(2, 8)}`
}
function makeShortId(seq: number): string {
  return `D24SR${String(seq).padStart(5, "0")}`
}

// Ближайший вторник (относительно now)
function nextTuesday(): Date {
  const d = new Date()
  const dow = d.getDay() // 0=Sun,1=Mon,2=Tue,...
  const diff = dow <= 2 ? (2 - dow) : (9 - dow)  // дней до ближайшего вторника
  const tuesday = new Date(d)
  tuesday.setDate(d.getDate() + diff)
  return tuesday
}

// ── Пулы вымышленных имён для балка ──────────────────────────────────────────
const BULK_MALE_FIRST = [
  "Александр","Дмитрий","Сергей","Андрей","Алексей","Максим","Иван","Михаил",
  "Николай","Павел","Роман","Кирилл","Егор","Владимир","Артём","Илья","Антон",
  "Денис","Виктор","Тимур","Руслан","Евгений","Георгий","Станислав","Владислав",
  "Олег","Игорь","Вячеслав","Анатолий","Григорий",
]
const BULK_FEM_FIRST = [
  "Анна","Мария","Екатерина","Ольга","Наталья","Татьяна","Юлия","Елена",
  "Светлана","Дарья","Ирина","Полина","Виктория","Ксения","Алина","Марина",
  "Кристина","Алёна","Валерия","Диана","Наталия","Галина","Людмила","Тамара",
  "Вера","Надежда","Любовь","Зинаида","Раиса","Антонина",
]
const BULK_LAST = [
  "Иванов","Петров","Сидоров","Смирнов","Кузнецов","Попов","Лебедев","Новиков",
  "Морозов","Волков","Зайцев","Соловьёв","Васильев","Фёдоров","Михайлов",
  "Алексеев","Яковлев","Андреев","Степанов","Козлов","Николаев","Орлов",
  "Белов","Тимофеев","Данилов","Егоров","Кириллов","Макаров","Пономарёв","Абрамов",
  "Богданов","Власов","Громов","Гуляев","Дроздов","Ершов","Жуков","Захаров",
  "Ильин","Карпов","Коваль","Крылов","Лазарев","Мельников","Назаров","Осипов",
]
const BULK_FEM_LAST = [
  "Иванова","Петрова","Сидорова","Смирнова","Кузнецова","Попова","Лебедева","Новикова",
  "Морозова","Волкова","Зайцева","Соловьёва","Васильева","Фёдорова","Михайлова",
  "Алексеева","Яковлева","Андреева","Степанова","Козлова","Николаева","Орлова",
  "Белова","Тимофеева","Данилова","Егорова","Кириллова","Макарова","Пономарёва","Абрамова",
  "Богданова","Власова","Громова","Гуляева","Дроздова","Ершова","Жукова","Захарова",
  "Ильина","Карпова","Коваль","Крылова","Лазарева","Мельникова","Назарова","Осипова",
]
const BULK_CITIES = [
  "Москва","Санкт-Петербург","Екатеринбург","Новосибирск","Казань","Нижний Новгород",
  "Ростов-на-Дону","Самара","Челябинск","Пермь","Воронеж","Тольятти","Уфа","Рязань",
  "Волгоград","Саратов","Тюмень","Краснодар","Барнаул","Ярославль","Ижевск","Омск",
  "Оренбург","Иркутск","Ульяновск","Томск","Кемерово","Тверь","Астрахань","Пенза",
]
const SOURCES = ["hh","hh","hh","hh","avito","avito","site","referral"] as const

// ── Данные именованных кандидатов из датасета ─────────────────────────────────

interface NamedCandidate {
  name: string
  firstName: string
  city: string
  experienceYears: number
  experienceSummary: string
  resumeScore: number
  aiScore: number
  /** stage slug системы (candidates.stage) */
  stage: string
  /** Человекочитаемый статус для stageHistory (для визуального отображения) */
  displayStatus: string
  /** null = нет интервью */
  interviewDay: "tuesday" | "wednesday" | null
  interviewTime: string | null
  interviewStatus: string | null
  /** Только для Артёма и Марины — подробный ai_summary */
  aiSummary?: string
  /** Только для Артёма и Марины — текст резюме для experience поля */
  resumeText?: string
  /** Дней назад создан (createdAt) */
  createdDaysAgo: number
  /** Дней назад найт (для нанятых) */
  hiredDaysAgo?: number
  salaryMin: number
  salaryMax: number
}

const NAMED: NamedCandidate[] = [
  // ── Шорт-лист / Интервью / Оффер / Нанят ─────────────────────────────────
  {
    name: "Артём Соколов", firstName: "Артём",
    city: "Краснодар", experienceYears: 6,
    experienceSummary: "B2B SaaS (CRM-системы), 6 лет. Последние 3 года — тёплая база и входящие. План 112%.",
    resumeScore: 94, aiScore: 96,
    stage: "hired", displayStatus: "Нанят (7-й день)",
    interviewDay: "tuesday", interviewTime: "14:00", interviewStatus: "Пройдено",
    hiredDaysAgo: 7, createdDaysAgo: 14, salaryMin: 120000, salaryMax: 150000,
    aiSummary: `🟢 Сильное соответствие (96/100). Опыт B2B-продаж в SaaS напрямую релевантен. Закрывал сделки с средним чеком 180 000 ₽, выполнение плана 112% за последний год. Опыт работы с тёплой базой и входящими — совпадает с форматом вакансии. Готовность к удалёнке подтверждена (последние 2 года работал из дома). Рекомендую в шорт-лист.

Зоны для проверки на интервью: мотивация смены работы, опыт работы с длинным циклом сделки.`,
    resumeText: `2022–2025 — Менеджер по продажам, «КлаудТех» (CRM для ритейла). Тёплая база + входящие. План 112%.
2019–2022 — Старший менеджер, «ПроСофт». B2B-продажи ПО.
2018–2019 — Менеджер по продажам, «ТелекомСервис».
Навыки: amoCRM, Bitrix24, работа с возражениями, длинный цикл сделки, телефония.`,
  },
  {
    name: "Марина Лебедева", firstName: "Марина",
    city: "Новосибирск", experienceYears: 5,
    experienceSummary: "B2C + B2B (финансовые продукты, услуги), 5 лет. Конверсия заявка→сделка 34%.",
    resumeScore: 91, aiScore: 94,
    stage: "hired", displayStatus: "Нанят (10-й день)",
    interviewDay: "tuesday", interviewTime: "16:30", interviewStatus: "Пройдено",
    hiredDaysAgo: 4, createdDaysAgo: 14, salaryMin: 100000, salaryMax: 130000,
    aiSummary: `🟢 Сильное соответствие (94/100). Опыт в B2C и B2B, высокая конверсия из заявки в сделку (по резюме — 34%). Активно работала с CRM и скриптами. Готова к удалёнке. Чуть меньше опыта в SaaS, чем у топ-кандидата, но сильные коммуникативные навыки и стабильный трек. Рекомендую в шорт-лист.`,
    resumeText: `2023–2025 — Менеджер по продажам услуг, «МедиаПлюс». Конверсия заявка→сделка 34%.
2020–2023 — Специалист по продажам, «ФинГрупп». Кредитные продукты.
Навыки: amoCRM, скрипты, работа с входящим потоком, допродажи.`,
  },
  {
    name: "Дмитрий Воронцов", firstName: "Дмитрий",
    city: "Казань", experienceYears: 7,
    experienceSummary: "Оптовые продажи, 7 лет. Выполнение плана 105%. Средний чек 320 000 ₽.",
    resumeScore: 88, aiScore: 91,
    stage: "hired", displayStatus: "Нанят (14-й день)",
    interviewDay: "wednesday", interviewTime: "11:00", interviewStatus: "Пройдено",
    hiredDaysAgo: 0, createdDaysAgo: 14, salaryMin: 140000, salaryMax: 180000,
  },
  {
    name: "Екатерина Жукова", firstName: "Екатерина",
    city: "Самара", experienceYears: 4,
    experienceSummary: "Телеком, 4 года. Входящие заявки, upsell.",
    resumeScore: 85, aiScore: 89,
    stage: "interview", displayStatus: "Интервью назначено",
    interviewDay: "wednesday", interviewTime: "15:00", interviewStatus: "Ожидает подтверждения",
    createdDaysAgo: 12, salaryMin: 95000, salaryMax: 130000,
  },
  {
    name: "Игорь Панкратов", firstName: "Игорь",
    city: "Екатеринбург", experienceYears: 5,
    experienceSummary: "Недвижимость, 5 лет. Сделки с физ.лицами и инвесторами.",
    resumeScore: 83, aiScore: 87,
    stage: "decision", displayStatus: "Шорт-лист",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 11, salaryMin: 110000, salaryMax: 140000,
  },
  {
    name: "Ольга Терентьева", firstName: "Ольга",
    city: "Воронеж", experienceYears: 3,
    experienceSummary: "EdTech, 3 года. Продажи B2C онлайн-курсов.",
    resumeScore: 81, aiScore: 85,
    stage: "decision", displayStatus: "Шорт-лист",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 11, salaryMin: 90000, salaryMax: 120000,
  },
  {
    name: "Сергей Мухин", firstName: "Сергей",
    city: "Пермь", experienceYears: 6,
    experienceSummary: "FMCG, 6 лет. Региональные продажи, дистрибуция.",
    resumeScore: 80, aiScore: 84,
    stage: "decision", displayStatus: "Шорт-лист",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 10, salaryMin: 100000, salaryMax: 130000,
  },
  {
    name: "Алина Гончарова", firstName: "Алина",
    city: "Ростов-на-Дону", experienceYears: 4,
    experienceSummary: "Финансовые услуги, 4 года. Банковские продукты, cross-sell.",
    resumeScore: 79, aiScore: 83,
    stage: "decision", displayStatus: "Шорт-лист",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 10, salaryMin: 95000, salaryMax: 125000,
  },
  {
    name: "Никита Беляев", firstName: "Никита",
    city: "Челябинск", experienceYears: 5,
    experienceSummary: "B2B услуги (аутсорсинг), 5 лет. Тёплые клиенты, renewal.",
    resumeScore: 78, aiScore: 82,
    stage: "decision", displayStatus: "Шорт-лист",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 9, salaryMin: 100000, salaryMax: 130000,
  },
  // ── Тестирование ─────────────────────────────────────────────────────────────
  {
    name: "Виктория Зайцева", firstName: "Виктория",
    city: "Уфа", experienceYears: 4,
    experienceSummary: "Страхование, 4 года.",
    resumeScore: 75, aiScore: 79,
    stage: "test_task_done", displayStatus: "Тестирование — прошла (84%)",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 9, salaryMin: 85000, salaryMax: 115000,
  },
  {
    name: "Павел Морозов", firstName: "Павел",
    city: "Тюмень", experienceYears: 3,
    experienceSummary: "Логистика, 3 года.",
    resumeScore: 73, aiScore: 77,
    stage: "test_task_sent", displayStatus: "Тестирование — ожидание",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 8, salaryMin: 80000, salaryMax: 110000,
  },
  {
    name: "Юлия Савельева", firstName: "Юлия",
    city: "Омск", experienceYears: 2,
    experienceSummary: "Ритейл, 2 года.",
    resumeScore: 72, aiScore: 76,
    stage: "test_task_done", displayStatus: "Тестирование — прошла (71%)",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 7, salaryMin: 75000, salaryMax: 100000,
  },
  {
    name: "Роман Кудрявцев", firstName: "Роман",
    city: "Иркутск", experienceYears: 3,
    experienceSummary: "IT-дистрибуция, 3 года.",
    resumeScore: 70, aiScore: 74,
    stage: "test_task_sent", displayStatus: "Тестирование — ожидание",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 7, salaryMin: 80000, salaryMax: 105000,
  },
  // ── AI-квалификация ───────────────────────────────────────────────────────────
  {
    name: "Анастасия Орлова", firstName: "Анастасия",
    city: "Волгоград", experienceYears: 3,
    experienceSummary: "Консалтинг, 3 года.",
    resumeScore: 68, aiScore: 72,
    stage: "ai_screening", displayStatus: "AI-квалификация — уточняет ожидания по доходу",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 6, salaryMin: 85000, salaryMax: 120000,
  },
  {
    name: "Максим Поляков", firstName: "Максим",
    city: "Барнаул", experienceYears: 2,
    experienceSummary: "Медицинское оборудование, 2 года.",
    resumeScore: 66, aiScore: 70,
    stage: "ai_screening", displayStatus: "AI-квалификация — ответил на 3 из 5 вопросов",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 5, salaryMin: 75000, salaryMax: 100000,
  },
  {
    name: "Светлана Дроздова", firstName: "Светлана",
    city: "Ярославль", experienceYears: 4,
    experienceSummary: "Туризм, 4 года.",
    resumeScore: 64, aiScore: 68,
    stage: "ai_screening", displayStatus: "AI-квалификация — готовность к удалёнке уточняется",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 5, salaryMin: 80000, salaryMax: 110000,
  },
  {
    name: "Денис Кравцов", firstName: "Денис",
    city: "Тольятти", experienceYears: 2,
    experienceSummary: "Авто-дилер, 2 года.",
    resumeScore: 61, aiScore: 65,
    stage: "ai_screening", displayStatus: "AI-квалификация — отвечает",
    interviewDay: null, interviewTime: null, interviewStatus: null,
    createdDaysAgo: 4, salaryMin: 70000, salaryMax: 95000,
  },
]

// ── Переписка Юлии с Артёмом (для ai_chatbot_messages) ───────────────────────
// Формат: { incoming: реплика Артёма, reply: реплика Юлии, minutesAfterStart: смещение }
// Время базовое: суббота 23:41 (смещения в минутах)
const YULIA_DIALOG = [
  {
    incoming: "Добрый вечер, да, конечно",
    reply: "Отлично! Вы сейчас работаете с тёплой базой и входящими заявками или больше с холодным поиском?",
    minutesAfterStart: 7,
  },
  {
    incoming: "Последние 3 года — тёплая база и входящие, холодный обзвон почти не делал",
    reply: "Это прямо в точку — у нас формат такой же, без холода. Подскажите, какой средний чек был по вашим сделкам и как с выполнением плана за последний год?",
    minutesAfterStart: 11,
  },
  {
    incoming: "Средний чек около 180 тысяч, план в прошлом году сделал на 112%",
    reply: "Отличный результат 👍 Формат полностью удалённый — для вас это комфортно? И какие ожидания по доходу?",
    minutesAfterStart: 14,
  },
  {
    incoming: "Удалёнка только в плюс, последние 2 года из дома. По доходу от 120 тысяч рассчитываю",
    reply: "Всё совпадает с нашими условиями. Предлагаю короткое видеоинтервью с руководителем отдела — это займёт 30 минут. Вам удобнее в будни в первой половине дня или после обеда?",
    minutesAfterStart: 17,
  },
  {
    incoming: "После обеда удобнее, во вторник или среду",
    reply: "Записала вас на вторник, 14:00. Пришлю ссылку на встречу и короткое демо о компании — посмотрите перед интервью, чтобы прийти уже в контексте. До встречи, Артём! 🙌",
    minutesAfterStart: 20,
  },
]

// ── Главная функция ───────────────────────────────────────────────────────────

export async function seedDemoSalesRemote(): Promise<void> {
  console.log(`[seed-sales-remote] старт — тенант ${DEMO_COMPANY_ID}`)

  // ── 0. Найти директора ────────────────────────────────────────────────────
  const [dir] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_DIRECTOR_EMAIL))
    .limit(1)
  if (!dir) throw new Error(`Нет пользователя ${DEMO_DIRECTOR_EMAIL}`)
  console.log(`[seed-sales-remote] директор: ${dir.id}`)

  // ── 1. Идемпотентность: найти/создать вакансию ────────────────────────────
  const VAC_TITLE = "Менеджер по продажам на удалёнке — тёплая база, без холодного обзвона"
  const VAC_SLUG  = "demo-sales-manager-remote-2026"

  let vacancyId: string

  const [existingVac] = await db.select({ id: vacancies.id })
    .from(vacancies)
    .where(and(
      eq(vacancies.companyId, DEMO_COMPANY_ID),
      ilike(vacancies.title, "%Менеджер по продажам на удалёнке%"),
    ))
    .limit(1)

  if (existingVac) {
    vacancyId = existingVac.id
    console.log(`[seed-sales-remote] вакансия найдена: ${vacancyId} — чистим её кандидатов`)

    // Удаляем ai_chatbot_messages ПЕРЕД кандидатами (FK candidate_id cascade удалит,
    // но лучше явно — для надёжности при некаскадных конфигурациях)
    await db.execute(sql`
      DELETE FROM ai_chatbot_messages WHERE vacancy_id = ${vacancyId}::uuid
    `)

    // calendar_events кандидатов этой вакансии
    await db.delete(calendarEvents)
      .where(eq(calendarEvents.vacancyId, vacancyId))

    // Кандидаты — CASCADE удалит их follow_up_messages, ai_chatbot_messages (по cascade)
    await db.delete(candidates)
      .where(eq(candidates.vacancyId, vacancyId))

    console.log(`[seed-sales-remote] очищено`)
  } else {
    // Создаём вакансию
    const [newVac] = await db.insert(vacancies).values({
      companyId:          DEMO_COMPANY_ID,
      createdBy:          dir.id,
      title:              VAC_TITLE,
      slug:               VAC_SLUG,
      shortCode:          "D24SR001",
      status:             "published",
      city:               "Удалённо (вся Россия)",
      format:             "remote",
      employment:         "full",
      schedule:           "free",
      salaryMin:          80000,
      salaryMax:          180000,
      requiredExperience: "3-6",
      hiringPlan:         3,
      description:        `Ищем менеджера по продажам в команду, которая работает с входящими заявками и тёплой базой. Без холодных звонков «в никуда» — клиенты уже заинтересованы, ваша задача довести до сделки. CRM, скрипты и обучение предоставляем. Работа из дома, гибкий старт дня.`,
      // Оценка AI-советника вакансии (aiQualityScore)
      aiQualityScore:     92,
      aiQualityDetails:   {
        tips: [
          "✅ В заголовке есть выгода для кандидата («тёплая база, без холодного обзвона») — +18% к откликам",
          "✅ Указан формат (удалённо) в заголовке — кандидаты не отсеиваются на этом этапе",
          "⚠️ Рекомендация: добавить вилку дохода в заголовок — повысит релевантность до 96",
        ],
      },
      aiQualityAnalyzedAt: daysAgo(14),
      aiChatbotEnabled:   false,   // изоляция: бот выключен (демо-компания)
      createdAt:          daysAgo(14),
      updatedAt:          daysAgo(0),
    }).returning({ id: vacancies.id })
    vacancyId = newVac.id
    console.log(`[seed-sales-remote] вакансия создана: ${vacancyId}`)
  }

  // ── 2. Именованные кандидаты ─────────────────────────────────────────────
  const namedIds: Record<string, string> = {}  // name → candidateId
  let seq = 0

  for (const c of NAMED) {
    seq++
    const [row] = await db.insert(candidates).values({
      vacancyId,
      name:             c.name,
      firstNameOverride: c.firstName,
      city:             c.city,
      source:           "hh",
      stage:            c.stage,
      experienceYears:  c.experienceYears,
      experience:       c.experienceSummary,
      resumeScore:      c.resumeScore,
      aiScore:          c.aiScore,
      aiSummary:        c.aiSummary ?? `${c.firstName}: соответствие ${c.aiScore}/100. ${c.experienceSummary}`,
      aiScoredAt:       daysAgo(c.createdDaysAgo - 1),
      // Поля для карточки кандидата
      salaryMin:        c.salaryMin,
      salaryMax:        c.salaryMax,
      workFormat:       "remote",
      educationLevel:   "higher",
      languages:        ["russian"],
      skills:           ["Продажи B2B", "CRM", "Работа с входящим потоком", "Скрипты"],
      keySkills:        ["amoCRM", "Продажи", "Работа с возражениями"],
      relocationReady:  false,
      // Для нанятых — тест сдан
      testInviteSentAt: ["hired","interview","decision"].includes(c.stage)
        ? daysAgo(c.createdDaysAgo - 2)
        : null,
      isFavorite:       c.aiScore >= 90,
      // Резюме в поле experience для карточки
      ...(c.resumeText ? { experience: c.resumeText } : {}),
      stageHistory: buildStageHistory(c.stage, c.createdDaysAgo, c.hiredDaysAgo),
      // Нанятые — demoOpenedAt заполнен
      demoOpenedAt: ["hired","decision","interview"].includes(c.stage)
        ? daysAgo(c.createdDaysAgo - 1)
        : null,
      token:            makeToken(seq),
      shortId:          makeShortId(seq),
      sequenceNumber:   seq,
      createdAt:        daysAgo(c.createdDaysAgo),
      updatedAt:        daysAgo(0),
    }).returning({ id: candidates.id })

    namedIds[c.name] = row.id
    console.log(`[seed-sales-remote] именованный ${seq}/${NAMED.length}: ${c.name} (${c.stage}, ${c.aiScore})`)
  }

  // ── 3. Переписка Юлии с Артёмом → ai_chatbot_messages ─────────────────────
  const artemId = namedIds["Артём Соколов"]
  if (!artemId) throw new Error("Артём Соколов не создан — ошибка логики")

  // Базовое время диалога: суббота 23:41 (ровно 14 дней назад + смещение в ночь)
  const dialogBase = new Date(daysAgo(14))
  dialogBase.setHours(23, 41, 0, 0)

  // Первое «сообщение» — приветствие Юлии (нет incoming — используем служебную запись)
  // ai_chatbot_messages требует incoming_message, поэтому первую реплику Юлии пишем
  // как ответ на «служебное» открытие диалога системой
  await db.execute(sql`
    INSERT INTO ai_chatbot_messages
      (candidate_id, vacancy_id, incoming_message, intent_category, intent_confidence,
       generated_reply, sent_at, escalated_to_hr, escalation_reason, created_at)
    VALUES
      (${artemId}::uuid, ${vacancyId}::uuid,
       '[отклик кандидата на hh.ru]',
       'other', 1.0,
       'Артём, здравствуйте! Спасибо за отклик на вакансию менеджера по продажам на удалёнке. Я Юлия, помогаю с подбором в компании. Можно задать пару вопросов, чтобы понять, насколько мы подходим друг другу?',
       ${dialogBase.toISOString()},
       false, null,
       ${dialogBase.toISOString()})
  `)

  for (const line of YULIA_DIALOG) {
    const msgTime = new Date(dialogBase.getTime() + line.minutesAfterStart * 60000)
    await db.execute(sql`
      INSERT INTO ai_chatbot_messages
        (candidate_id, vacancy_id, incoming_message, intent_category, intent_confidence,
         generated_reply, sent_at, escalated_to_hr, escalation_reason, created_at)
      VALUES
        (${artemId}::uuid, ${vacancyId}::uuid,
         ${line.incoming},
         'other', 0.95,
         ${line.reply},
         ${msgTime.toISOString()},
         false, null,
         ${msgTime.toISOString()})
    `)
  }
  console.log(`[seed-sales-remote] диалог Юлии ↔ Артёму: ${YULIA_DIALOG.length + 1} записей`)

  // ── 4. Интервью (calendar_events) ─────────────────────────────────────────
  const tuesday = nextTuesday()
  const wednesday = new Date(tuesday)
  wednesday.setDate(tuesday.getDate() + 1)

  // Вспомогательная функция: создать Date на конкретный день + время "HH:MM"
  function makeInterviewTime(base: Date, timeStr: string): Date {
    const [h, m] = timeStr.split(":").map(Number)
    const d = new Date(base)
    d.setHours(h, m, 0, 0)
    return d
  }

  const INTERVIEWS: {
    candidateName: string
    day: Date
    timeStr: string
    interviewStatus: string
  }[] = [
    { candidateName: "Артём Соколов",    day: tuesday,   timeStr: "14:00", interviewStatus: "Пройдено" },
    { candidateName: "Марина Лебедева",  day: tuesday,   timeStr: "16:30", interviewStatus: "Пройдено" },
    { candidateName: "Дмитрий Воронцов", day: wednesday, timeStr: "11:00", interviewStatus: "Пройдено" },
    { candidateName: "Екатерина Жукова", day: wednesday, timeStr: "15:00", interviewStatus: "Ожидает подтверждения" },
  ]

  for (const iv of INTERVIEWS) {
    const candidateId = namedIds[iv.candidateName]
    if (!candidateId) {
      console.warn(`[seed-sales-remote] интервью пропущено — кандидат не найден: ${iv.candidateName}`)
      continue
    }
    const startAt = makeInterviewTime(iv.day, iv.timeStr)
    const endAt   = new Date(startAt.getTime() + 30 * 60000)  // 30 минут

    // Подтверждённые интервью помечаем как Пройдено (Артём, Марина, Дмитрий нанятые)
    const evStatus = iv.interviewStatus === "Пройдено" ? "confirmed" : "tentative"

    await db.insert(calendarEvents).values({
      companyId:       DEMO_COMPANY_ID,
      title:           `Интервью · ${iv.candidateName}`,
      type:            "interview",
      startAt,
      endAt,
      createdBy:       dir.id,
      status:          evStatus,
      candidateId,
      vacancyId,
      interviewer:     "Юлия (HR)",
      interviewType:   "HR",
      interviewFormat: "Онлайн",
      interviewStatus: iv.interviewStatus,
      meetingUrl:      "https://meet.google.com/demo-link",
      scope:           "company",
    })
  }
  console.log(`[seed-sales-remote] интервью создано: ${INTERVIEWS.length}`)

  // ── 5. Балк-кандидаты «Новые отклики» (~1117 записей) ────────────────────
  console.log(`[seed-sales-remote] создаём балк-кандидатов: ${BULK_COUNT}...`)

  // Батч по 100 — чтобы не перегружать память одной транзакцией
  const BATCH = 100
  let bulkCount = 0

  for (let start = 0; start < BULK_COUNT; start += BATCH) {
    const end = Math.min(start + BATCH, BULK_COUNT)
    const rows: {
      vacancyId: string; name: string; city: string; source: string; stage: string
      resumeScore: number; token: string; shortId: string; sequenceNumber: number
      workFormat: string; skills: string[]; keySkills: string[]; languages: string[]
      createdAt: Date; updatedAt: Date; stageHistory: object
    }[] = []

    for (let i = start; i < end; i++) {
      seq++
      const female = rnd() > 0.5
      const firstName = pick(female ? BULK_FEM_FIRST : BULK_MALE_FIRST)
      const lastName   = pick(female ? BULK_FEM_LAST  : BULK_LAST)
      const name = `${firstName} ${lastName}`
      // createdAt равномерно распределён за 14 дней
      const createdDaysAgo = rnd() * 14
      const createdAt = new Date(Date.now() - createdDaysAgo * 86400000)

      rows.push({
        vacancyId,
        name,
        city:           pick(BULK_CITIES),
        source:         pick(SOURCES),
        stage:          "new",
        resumeScore:    int(20, 85),
        token:          makeToken(seq),
        shortId:        makeShortId(seq),
        sequenceNumber: seq,
        workFormat:     "remote",
        skills:         [],
        keySkills:      [],
        languages:      ["russian"],
        createdAt,
        updatedAt:      createdAt,
        stageHistory:   [{ stage: "new", date: createdAt.toISOString() }],
      })
    }

    // db.insert принимает массив значений напрямую
    await db.insert(candidates).values(rows)
    bulkCount += rows.length

    if ((start / BATCH) % 5 === 0) {
      console.log(`[seed-sales-remote]   балк: ${bulkCount}/${BULK_COUNT}`)
    }
  }

  console.log(`[seed-sales-remote] балк завершён: ${bulkCount} кандидатов`)

  // ── Итог ──────────────────────────────────────────────────────────────────
  const totalCount = NAMED.length + bulkCount
  console.log(`
[seed-sales-remote] ГОТОВО ✅
  Вакансия    : ${VAC_TITLE}
  vacancyId   : ${vacancyId}
  Именованных : ${NAMED.length}
  Балк (новые): ${bulkCount}
  ИТОГО       : ${totalCount}  (цель ${TARGET_TOTAL})
  Интервью    : ${INTERVIEWS.length}
  Диалог Юлии : ${YULIA_DIALOG.length + 1} сообщений
`)
}

// ── Вспомогательная функция: история стадий ──────────────────────────────────
function buildStageHistory(
  stage: string,
  createdDaysAgo: number,
  hiredDaysAgo?: number,
): object {
  // Упрощённый путь по воронке для продающей демо-вакансии
  const PATH: { stage: string; label: string }[] = [
    { stage: "new",           label: "Новый отклик" },
    { stage: "ai_screening",  label: "AI-квалификация" },
    { stage: "test_task_sent",label: "Тестирование" },
    { stage: "test_task_done",label: "Тест завершён" },
    { stage: "decision",      label: "Шорт-лист" },
    { stage: "interview",     label: "Интервью" },
    { stage: "offer_sent",    label: "Оффер" },
    { stage: "hired",         label: "Нанят" },
  ]

  const stageIdx = PATH.findIndex(p => p.stage === stage)
  const slice = stageIdx >= 0 ? PATH.slice(0, stageIdx + 1) : [PATH[0]]
  const totalDays = createdDaysAgo

  return slice.map((p, i) => {
    // Последняя стадия = время найма (если задано)
    let daysBack: number
    if (i === slice.length - 1 && p.stage === "hired" && hiredDaysAgo !== undefined) {
      daysBack = hiredDaysAgo
    } else {
      // Равномерно распределяем от createdDaysAgo до 0
      daysBack = Math.round(totalDays - (totalDays * i) / Math.max(slice.length - 1, 1))
    }
    return { stage: p.stage, label: p.label, date: daysAgo(daysBack).toISOString() }
  })
}

// ── Автозапуск при прямом вызове (npx tsx scripts/seed-demo-sales-remote.ts) ──
if (process.argv[1]?.includes("seed-demo-sales-remote")) {
  seedDemoSalesRemote()
    .then(async () => {
      await pgClient.end()
      process.exit(0)
    })
    .catch(async (e) => {
      console.error("[seed-sales-remote] ОШИБКА:", e)
      await pgClient.end()
      process.exit(1)
    })
}
