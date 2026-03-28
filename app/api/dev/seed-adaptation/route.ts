import { NextResponse } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, adaptationPlans, adaptationSteps } from "@/lib/db/schema"

// POST /api/dev/seed-adaptation — только в development
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [userRow] = await db
    .select({ id: users.id, companyId: users.companyId })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.companyId)))
    .limit(1)

  if (!userRow?.companyId) {
    return NextResponse.json({ error: "Нет компании. Сначала /api/dev/login" }, { status: 400 })
  }

  // Удаляем старый демо-план если есть
  const existing = await db
    .select({ id: adaptationPlans.id })
    .from(adaptationPlans)
    .where(and(
      eq(adaptationPlans.tenantId, userRow.companyId),
      eq(adaptationPlans.title, "Адаптация менеджера по продажам")
    ))

  for (const p of existing) {
    await db.delete(adaptationPlans).where(eq(adaptationPlans.id, p.id))
  }

  const [plan] = await db.insert(adaptationPlans).values({
    tenantId:    userRow.companyId,
    title:       "Адаптация менеджера по продажам",
    description: "14-дневная программа адаптации для новых менеджеров по продажам",
    durationDays: 14,
    planType:    "onboarding",
    isTemplate:  true,
    isActive:    true,
    createdBy:   userRow.id,
  }).returning()

  const STEPS = [
    {
      dayNumber: 1, sortOrder: 1,
      title: "Добро пожаловать в команду",
      type: "lesson",
      durationMin: 15,
      content: {
        body: "Познакомьтесь с историей компании, её миссией и ценностями. Узнайте о структуре отдела продаж.",
        attachments: [],
      },
    },
    {
      dayNumber: 1, sortOrder: 2,
      title: "Видео: Продукт и его ценность",
      type: "video",
      durationMin: 20,
      content: {
        videoUrl: "https://example.com/product-intro",
        description: "Обзорное видео о продукте компании и ключевых преимуществах для клиентов.",
      },
    },
    {
      dayNumber: 2, sortOrder: 1,
      title: "Знакомство с CRM-системой",
      type: "task",
      durationMin: 30,
      content: {
        description: "Создайте первую сделку в CRM. Заполните профиль клиента и добавьте активность.",
        checklist: ["Войти в CRM", "Создать сделку", "Добавить контакт", "Поставить задачу"],
      },
    },
    {
      dayNumber: 3, sortOrder: 1,
      title: "Тест: Знание продукта",
      type: "quiz",
      durationMin: 10,
      content: {
        questions: [
          {
            text: "Что является ключевым преимуществом нашего продукта?",
            options: ["Цена", "Скорость внедрения", "Функциональность", "Поддержка"],
            correct: 1,
          },
          {
            text: "Сколько дней занимает стандартное внедрение?",
            options: ["3 дня", "7 дней", "14 дней", "30 дней"],
            correct: 1,
          },
        ],
      },
    },
    {
      dayNumber: 5, sortOrder: 1,
      title: "Скрипты продаж: Основы",
      type: "lesson",
      durationMin: 25,
      content: {
        body: "Изучите основные скрипты для первого звонка, работы с возражениями и закрытия сделки.",
        attachments: ["scripts_v3.pdf"],
      },
    },
    {
      dayNumber: 5, sortOrder: 2,
      title: "Встреча с наставником",
      type: "meeting",
      durationMin: 60,
      content: {
        agenda: "Обсуждение первой недели, ответы на вопросы, постановка целей на следующую неделю",
        participants: ["Наставник", "HR"],
      },
    },
    {
      dayNumber: 7, sortOrder: 1,
      title: "Чеклист: Подготовка к первому звонку",
      type: "checklist",
      durationMin: 15,
      content: {
        items: [
          "Изучить профиль клиента в CRM",
          "Подготовить список вопросов",
          "Проверить технику и связь",
          "Согласовать с наставником",
          "Сделать тестовый звонок",
        ],
      },
    },
    {
      dayNumber: 10, sortOrder: 1,
      title: "Видео: Работа с возражениями",
      type: "video",
      durationMin: 18,
      content: {
        videoUrl: "https://example.com/objections",
        description: "Разбор реальных кейсов работы с возражениями клиентов.",
      },
    },
    {
      dayNumber: 12, sortOrder: 1,
      title: "Тест: Итоговая аттестация",
      type: "quiz",
      durationMin: 20,
      content: {
        questions: [
          {
            text: "Как правильно начать холодный звонок?",
            options: [
              "Сразу предложить продукт",
              "Представиться и спросить о времени",
              "Задать вопрос о проблемах",
              "Рассказать об акции",
            ],
            correct: 1,
          },
          {
            text: "Что делать при возражении 'Дорого'?",
            options: [
              "Предложить скидку",
              "Уточнить с чем сравнивает",
              "Завершить разговор",
              "Перенести звонок",
            ],
            correct: 1,
          },
          {
            text: "Норма по звонкам в день для нового менеджера?",
            options: ["10", "20", "30", "50"],
            correct: 1,
          },
        ],
      },
    },
    {
      dayNumber: 14, sortOrder: 1,
      title: "Финальная встреча: Итоги адаптации",
      type: "meeting",
      durationMin: 45,
      content: {
        agenda: "Подведение итогов 2 недель, обсуждение KPI, постановка целей на первый месяц",
        participants: ["Руководитель отдела", "HR", "Наставник"],
      },
    },
  ]

  await db.insert(adaptationSteps).values(
    STEPS.map(s => ({ ...s, planId: plan.id, isRequired: true, channel: "auto" }))
  )

  return NextResponse.json({
    ok: true,
    planId: plan.id,
    planTitle: plan.title,
    stepsCount: STEPS.length,
  })
}
