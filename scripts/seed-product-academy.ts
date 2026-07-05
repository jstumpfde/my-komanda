/**
 * seed-product-academy.ts — «Академия продукта»: внутренний курс для
 * сотрудников компании-владельца платформы (Company24), НЕ клиентов.
 *
 * Определяет тенант владельца по email из lib/owner.ts (OWNER_EMAILS) —
 * первый найденный активный пользователь с таким email задаёт companyId
 * курса (в системе нет отдельного "служебного" tenant для сотрудников
 * Company24, см. разведку — используем реальный companyId владельца).
 *
 * Идемпотентен: при повторном запуске удаляет ранее созданный курс «Обзор
 * HR-платформы Company24» этого тенанта (по названию) вместе с уроками,
 * записями и сертификатами, затем создаёт заново. Другие курсы/тенанты
 * не затрагивает.
 *
 * НЕ запускать против прода напрямую этим скриптом — только
 * staging/локально или через явный approved-запуск (использует DATABASE_URL
 * из окружения, как и остальные scripts/seed-*).
 *
 * Запуск:
 *   npx tsx scripts/seed-product-academy.ts
 */

import { eq, and, inArray } from "drizzle-orm"
import { db, pgClient } from "@/lib/db"
import { users, courses, lessons, courseEnrollments, lessonCompletions, certificates } from "@/lib/db/schema"
import { OWNER_EMAILS } from "@/lib/owner"

const COURSE_TITLE = "Обзор HR-платформы Company24"

// ─── Контент курса ────────────────────────────────────────────────────────
// Уроки — данные (не хардкод в компонентах): модули по реальному функционалу
// платформы (см. CLAUDE.md/lib/db/schema.ts). Порядок = sortOrder.

interface QuizQuestionSeed { q: string; options: string[]; answer: number }
interface LessonSeed {
  title: string
  type: "content" | "quiz"
  durationMin: number
  text?: string
  questions?: QuizQuestionSeed[]
}

const MODULES: LessonSeed[] = [
  {
    title: "1. Вакансии и Портрет",
    type: "content",
    durationMin: 8,
    text: `Вакансия в Company24 — это не просто карточка с текстом, а контейнер для всей воронки найма: описания, критериев отбора, стоп-факторов, демо-презентации и настроек AI. Список вакансий живёт в /hr/vacancies с тремя состояниями жизненного цикла: Активные (active/paused), Архив (закрытые/hh-архив) и Корзина (soft-delete с автоудалением через companies.trash_retention_days, по умолчанию 30 дней).

Портрет (portrait_scoring) — контур точных критериев отбора кандидата: hard/soft-требования с весами и порогами, вынесенные в vacancy_specs. Он определяет три зоны: автоматический отбор (кандидат проходит/не проходит по формальным признакам), критерии для AI-скоринга резюме и текст письма при отказе (spec.rejectLetter). Портрет — это не украшение вакансии, а машиночитаемое ТЗ для всей автоматики ниже по воронке.

Где смотреть: карточка вакансии → вкладка «Спецификация»/«Портрет». Именно оттуда данные растекаются в скоринг резюме, стоп-факторы и авто-отказ.`,
  },
  {
    title: "2. Воронка и стадии",
    type: "content",
    durationMin: 10,
    text: `Воронка (Funnel Builder) — визуальный drag-and-drop конструктор из 17 типов блоков: от AI-скоринга резюме и стоп-факторов до демо, анкеты, AI-анкеты, авто-теста, чат-бота, интервью и оффера. Собирается за флагом vacancy.funnelBuilderEnabled, есть готовые шаблоны (simple/with_test/with_chatbot/full/full_with_test) и возможность сохранить свой шаблон на уровне компании или опубликовать платформенный (Юрий → Platform Admin → Templates).

При сохранении воронки HR-ом происходит dual-write: легаси-поля вакансии (aiChatbotEnabled, aiScoringEnabled и т.п.) обновляются автоматически, поэтому существующие cron-задачи продолжают работать без переделки — это важно понимать при отладке: «старые» и «новые» настройки должны совпадать.

Стоп-факторы (vacancy.stopFactorsJson: город/формат/возраст/опыт/документы/гражданство/зарплата) применяются автоматически ДО AI-скоринга (lib/hh/process-queue.ts → lib/funnel-builder/stop-factors-matcher.ts). При совпадении кандидату уходит отказ через hh (discard_by_employer), стадия помечается rejected, а причина фиксируется как autoProcessingStoppedReason.`,
  },
  {
    title: "3. Демо и анкеты",
    type: "content",
    durationMin: 8,
    text: `Демо-презентация — это интерактивная «визитка» вакансии для кандидата: набор уроков (Lesson) из блоков (Block) разных типов — текст, картинка/видео/аудио, файл, инфо-блок, кнопка, сторис-карусель, PDF-презентация и, главное, task-блок с вопросами. Кандидат проходит демо по публичной ссылке (/demo/[token]), отвечает на анкету внутри неё.

Каждый вопрос анкеты (Question) поддерживает 6 типов ответа: короткий/длинный текст, да/нет, один из списка, несколько из списка, сортировка по порядку. У вопросов можно задать баллы (points) и правильные варианты (correctOptions/correctYesNo/correctSort) — это и есть основа объективного скоринга теста, который проходит кандидат.

Библиотека демо-шаблонов и шаблонов анкет — per-компания с системными шаблонами (is_system=true), доступными всем. HR может собрать демо с нуля или взять готовый шаблон роли (role_templates) — тонкую обёртку над анкетой+демо+критериями+воронкой для типовой позиции (например, «Менеджер по продажам B2B»).`,
  },
  {
    title: "4. Скоринги — Портрет / Анкета / Тест",
    type: "content",
    durationMin: 10,
    text: `В системе три независимых скоринга, и важно не путать их роли:

1. AI-скоринг резюме (Портрет) — двигает воронку: сравнивает резюме кандидата с критериями Портрета (hard/soft-требования), может автоматически продвинуть или отклонить кандидата по порогу. Это единственный из трёх скорингов, который реально влияет на стадию кандидата в воронке.
2. AI-оценка анкеты — считает соответствие ответов кандидата ожиданиям, но НЕ двигает стадию сама по себе — это вспомогательный сигнал для HR.
3. Тест (объективный скоринг, lib/score-test-objective.ts) — кодовый (без AI) расчёт баллов по структурированным вопросам task-блоков: single/multiple/yesno/sort оцениваются по эталону (correctOptions/correctYesNo/correctSort + баллы per-вариант), итог — число 0-100. Субъективные ответы (текст) оценивает AI отдельно.

Практическое следствие: если кандидат прошёл тест на 90%, но у него не совпадают критерии Портрета — воронка всё равно может его отклонить. Три скоринга существуют не для дублирования, а чтобы разделить «формальное отклонение» (Портрет) от «дополнительного сигнала для HR» (Анкета, Тест).`,
  },
  {
    title: "5. Дожимы и каналы",
    type: "content",
    durationMin: 8,
    text: `«Дожим» — автоматическая последовательность сообщений кандидату, который не откликается или не завершает этап воронки (не читает, не открывает демо, застрял на анкете). Каналы отправки — hh-сообщения, Telegram, WhatsApp — выбираются автоматически по доступности у кандидата.

Приоритет исходящих сообщений системный, не хаотичный: hired/оффер/интервью → прошедшие первый этап → новые → дожим «не дочитал» → дожим «не открыл». То есть дожимы НЕ блокируют более приоритетные действия (например, отправку оффера), а сама очередь строится по drag-порядку, настраиваемому HR.

Каждая вакансия может поставить дожимы на паузу (outbound_paused) без остановки набора новых кандидатов — это разные переключатели: пауза дожимов не тормозит приём новых заявок. AI-чат-бот — отдельная 4-уровневая система (Executor → Pre-filter → Post-filter → AI Watcher) с настраиваемой чувствительностью к abuse и таймингами ответов (задержка, короткие «подогревающие» сообщения перед основным ответом), полностью независимая от дожимов.`,
  },
  {
    title: "6. Отчёты",
    type: "content",
    durationMin: 6,
    text: `Отчёт по найму (/hr/report) — сводная аналитика по вакансиям компании: статус (наш цикл + hh-архив + дата закрытия), число заполненных анкет, собеседований, решений, найм, отказы и «самоотказы» кандидатов (когда кандидат отказался сам, а не работодатель).

Причины отказа разделены на автоматические (система сама пометила стоп-фактором или порогом скоринга — с русскими ярлыками) и ручные (HR указал причину из таксономии на карточке кандидата), плюс инициатор отказа (мы или кандидат). Фильтры — по периоду (сегодня/вчера/эта неделя/прошлый месяц/произвольный диапазон) и по конкретной вакансии.

Отчёт можно расшарить внешней ссылкой без логина (report_shares, один активный токен на компанию) — удобно для директора, которому нужно показать цифры руководству без входа в систему. Есть TV-режим (?tv=1) — крупный шрифт, автообновление раз в минуту, для доски в переговорке.`,
  },
  {
    title: "7. Настройки найма",
    type: "content",
    durationMin: 6,
    text: `HR → Настройки найма — компания-уровневые дефолты, которые наследуются всеми новыми вакансиями: колонки карточки кандидата (hiring_defaults_json, настраивает директор), шаблоны отказов, срок хранения корзины вакансий (trash_retention_days), профиль продукта компании и роли/шаблоны для типовых позиций.

Настройки разделены по чувствительности: часть меняет только директор компании (requireDirector) — например, включение AI-чат-бота на уровне компании, глобальный kill switch (companies.ai_chatbot_killed, перекрывает все вакансии разом) и биллинг модулей. Обычный HR-менеджер видит и редактирует операционные настройки конкретных вакансий, но не может выключить AI на всю компанию.

Понимание того, какая настройка на каком уровне (платформа → компания → вакансия) — ключевое: значение может быть переопределено на уровне ниже, но никогда не хардкодится в коде — это всегда данные, которые можно поменять без деплоя.`,
  },
]

const QUIZ_QUESTIONS: QuizQuestionSeed[] = [
  { q: "Какое состояние НЕ входит в жизненный цикл вакансии?", options: ["Активные", "Архив", "Корзина", "На модерации"], answer: 3 },
  { q: "Что такое «Портрет» вакансии?", options: ["Фото на публичной странице", "Контур точных критериев отбора (hard/soft, пороги)", "Раздел с отзывами сотрудников", "Шаблон письма кандидату"], answer: 1 },
  { q: "Сколько типов блоков в конструкторе воронки (Funnel Builder)?", options: ["5", "10", "17", "25"], answer: 2 },
  { q: "Что делает dual-write при сохранении воронки?", options: ["Дублирует вакансию", "Обновляет легаси-поля вакансии для совместимости с существующими cron-ами", "Создаёт вторую копию кандидата", "Отправляет письмо HR"], answer: 1 },
  { q: "Когда применяются стоп-факторы?", options: ["После найма", "ДО AI-скоринга резюме", "Только вручную по кнопке", "После интервью"], answer: 1 },
  { q: "Сколько типов ответа поддерживает вопрос анкеты (Question)?", options: ["3", "4", "6", "8"], answer: 2 },
  { q: "Какой из трёх скорингов реально двигает стадию кандидата в воронке?", options: ["AI-оценка анкеты", "Тест (объективный скоринг)", "AI-скоринг резюме (Портрет)", "Все три одинаково"], answer: 2 },
  { q: "Чем оценивается тест кандидата по вопросам single/multiple/yesno/sort?", options: ["Только AI, без кода", "Кодовым (объективным) скорингом по эталону, без AI", "Вручную HR-ом", "Случайным числом"], answer: 1 },
  { q: "Что такое «дожим»?", options: ["Ручной звонок HR", "Автоматическая последовательность сообщений неактивному кандидату", "Финальное собеседование", "Отчёт по вакансии"], answer: 1 },
  { q: "Блокирует ли пауза дожимов приём новых кандидатов на вакансию?", options: ["Да, полностью останавливает вакансию", "Нет — это независимые переключатели", "Да, но только на сутки", "Пауза дожимов не существует"], answer: 1 },
  { q: "Сколько уровней в архитектуре AI чат-бота?", options: ["2", "3", "4", "5"], answer: 2 },
  { q: "Что показывает отчёт по найму в разделе «Причины отказа»?", options: ["Только автоматические причины", "Только причины, введённые HR вручную", "Автоматические + ручные причины + инициатора отказа", "Только даты отказов"], answer: 2 },
  { q: "Можно ли поделиться отчётом по найму без входа в систему?", options: ["Нет, только для залогиненных", "Да, через report_shares — одна активная публичная ссылка на компанию", "Только через экспорт в Excel", "Только через API-ключ"], answer: 1 },
  { q: "Кто может выключить AI-чат-бот на ВСЮ компанию разом (kill switch)?", options: ["Любой HR-менеджер", "Только директор компании (companies.ai_chatbot_killed)", "Кандидат через демо", "Это происходит автоматически по расписанию"], answer: 1 },
]

async function findOwnerCompanyId(): Promise<{ companyId: string; ownerUserId: string } | null> {
  const rows = await db
    .select({ id: users.id, companyId: users.companyId, email: users.email })
    .from(users)
    .where(inArray(users.email, OWNER_EMAILS))

  const withCompany = rows.find((r) => !!r.companyId)
  if (!withCompany || !withCompany.companyId) return null
  return { companyId: withCompany.companyId, ownerUserId: withCompany.id }
}

export async function seedProductAcademy(): Promise<{ courseId: string; lessonsCreated: number } | null> {
  const owner = await findOwnerCompanyId()
  if (!owner) {
    console.log(`Ни один email из OWNER_EMAILS (${OWNER_EMAILS.join(", ")}) не привязан к компании — seed пропущен`)
    return null
  }
  const { companyId, ownerUserId } = owner

  // ── Идемпотентность: чистим прежний seed этого курса в этом тенанте ──────
  const existingCourses = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.tenantId, companyId), eq(courses.title, COURSE_TITLE)))

  for (const c of existingCourses) {
    const enrollments = await db.select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(eq(courseEnrollments.courseId, c.id))
    const enrollmentIds = enrollments.map((e) => e.id)

    if (enrollmentIds.length > 0) {
      await db.delete(lessonCompletions).where(inArray(lessonCompletions.enrollmentId, enrollmentIds))
    }
    await db.delete(courseEnrollments).where(eq(courseEnrollments.courseId, c.id))
    await db.delete(certificates).where(eq(certificates.courseId, c.id))
    await db.delete(lessons).where(eq(lessons.courseId, c.id))
    await db.delete(courses).where(eq(courses.id, c.id))
  }

  // ── Курс ──────────────────────────────────────────────────────────────────
  const totalDurationMin = MODULES.reduce((s, m) => s + m.durationMin, 0) + 10 // +10 на финальный тест
  const [course] = await db.insert(courses).values({
    tenantId: companyId,
    title: COURSE_TITLE,
    description: "Разбор функционала HR-платформы Company24 для сотрудников компании: вакансии и Портрет, воронка и стадии, демо и анкеты, три скоринга, дожимы и каналы, отчёты, настройки найма. В конце — проверочный тест.",
    category: "product",
    difficulty: "beginner",
    durationMin: totalDurationMin,
    isPublished: true,
    isRequired: true,
    passingScorePercent: 70,
    createdBy: ownerUserId,
  }).returning()

  // ── Уроки-модули (контент) ────────────────────────────────────────────────
  let sortOrder = 0
  for (const m of MODULES) {
    await db.insert(lessons).values({
      courseId: course.id,
      title: m.title,
      type: "content",
      content: { text: m.text },
      durationMin: m.durationMin,
      isRequired: true,
      sortOrder: sortOrder++,
    })
  }

  // ── Финальный тест (квиз-урок, порог сдачи — courses.passingScorePercent) ──
  await db.insert(lessons).values({
    courseId: course.id,
    title: "Проверочный тест",
    type: "quiz",
    content: { questions: QUIZ_QUESTIONS },
    durationMin: 10,
    isRequired: true,
    sortOrder: sortOrder++,
  })

  console.log(`Академия продукта: курс «${COURSE_TITLE}» пересоздан для tenant=${companyId} (courseId=${course.id}, уроков=${MODULES.length + 1}, порог сдачи=70%)`)

  return { courseId: course.id, lessonsCreated: MODULES.length + 1 }
}

if (process.argv[1]?.includes("seed-product-academy")) {
  seedProductAcademy()
    .then(async (res) => {
      if (!res) console.log("Seed пропущен (нет владельца с привязанной компанией)")
      await pgClient.end()
      process.exit(0)
    })
    .catch(async (e) => {
      console.error("Ошибка seed-product-academy:", e)
      await pgClient.end()
      process.exit(1)
    })
}
