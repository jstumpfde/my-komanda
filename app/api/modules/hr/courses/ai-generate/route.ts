import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"

interface QuizQuestion {
  question: string
  options: string[]
  correct: number
}

interface GeneratedLesson {
  title: string
  content: string
  duration_minutes: number
  has_quiz: boolean
  quiz_questions: QuizQuestion[]
}

interface GeneratedCourse {
  title: string
  description: string
  category: string
  difficulty: string
  lessons: GeneratedLesson[]
}

function getMockCourse(filename: string): GeneratedCourse {
  return {
    title: `Курс на основе: ${filename}`,
    description:
      "Этот курс создан на основе загруженного документа. AI-генерация недоступна — используется демо-структура.",
    category: "onboarding",
    difficulty: "beginner",
    lessons: [
      {
        title: "Введение в материал",
        content:
          "## Введение\n\nДобро пожаловать в курс! В этом уроке мы познакомимся с основными темами.\n\n### Цели урока\n- Получить общее представление о теме\n- Изучить ключевые понятия\n- Подготовиться к дальнейшему обучению",
        duration_minutes: 15,
        has_quiz: true,
        quiz_questions: [
          {
            question: "Что является основной целью этого курса?",
            options: [
              "Получить общее представление о теме",
              "Научиться программировать",
              "Изучить иностранный язык",
              "Получить сертификат",
            ],
            correct: 0,
          },
          {
            question: "Сколько уроков содержит этот курс?",
            options: ["1", "3", "5", "10"],
            correct: 2,
          },
        ],
      },
      {
        title: "Основные концепции",
        content:
          "## Основные концепции\n\nВ этом уроке мы разберём ключевые понятия и принципы.\n\n### Ключевые термины\n- **Термин 1** — определение первого термина\n- **Термин 2** — определение второго термина\n- **Термин 3** — определение третьего термина",
        duration_minutes: 20,
        has_quiz: true,
        quiz_questions: [
          {
            question: "Что означает Термин 1?",
            options: [
              "Определение первого термина",
              "Определение второго термина",
              "Определение третьего термина",
              "Ни одно из перечисленных",
            ],
            correct: 0,
          },
          {
            question: "Сколько ключевых терминов упоминается в уроке?",
            options: ["1", "2", "3", "4"],
            correct: 2,
          },
        ],
      },
      {
        title: "Практическое применение",
        content:
          "## Практическое применение\n\nТеперь применим полученные знания на практике.\n\n### Примеры использования\n1. Первый пример применения\n2. Второй пример применения\n3. Третий пример применения",
        duration_minutes: 25,
        has_quiz: true,
        quiz_questions: [
          {
            question: "Сколько примеров использования рассматривается в уроке?",
            options: ["1", "2", "3", "4"],
            correct: 2,
          },
          {
            question: "Какова цель практического применения?",
            options: [
              "Закрепить теоретические знания",
              "Выучить новые термины",
              "Подготовиться к экзамену",
              "Познакомиться с новыми людьми",
            ],
            correct: 0,
          },
        ],
      },
    ],
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { text, filename } = await req.json()

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Текст документа обязателен" }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // Возвращаем mock-структуру в dev-режиме
      console.warn("ANTHROPIC_API_KEY не задан, возвращаем демо-структуру курса")
      return NextResponse.json(getMockCourse(filename || "документ"))
    }

    const prompt = `На основе следующего документа создай структуру учебного курса.

Документ: "${filename || "документ"}"

Содержание:
${text.slice(0, 8000)}

Верни ТОЛЬКО валидный JSON без пояснений:
{
  "title": "Название курса",
  "description": "Описание (2-3 предложения)",
  "category": "onboarding",
  "difficulty": "beginner",
  "lessons": [
    {
      "title": "Название урока",
      "content": "Содержание в Markdown",
      "duration_minutes": 15,
      "has_quiz": true,
      "quiz_questions": [
        {
          "question": "Вопрос",
          "options": ["А", "Б", "В", "Г"],
          "correct": 0
        }
      ]
    }
  ]
}

Требования:
- 5-10 уроков по 10-20 минут каждый
- 2-3 вопроса на тест в каждом уроке
- Язык: русский
- category одно из: onboarding, product, sales, compliance, soft_skills
- difficulty одно из: beginner, intermediate, advanced`

    // Используем fetch напрямую для совместимости (избегаем проблем с импортом SDK)
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        system: "Ты — эксперт по созданию обучающих курсов для корпоративных платформ.",
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!response.ok) {
      // Fallback на claude-3-5-sonnet
      const fallbackResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4096,
          system: "Ты — эксперт по созданию обучающих курсов для корпоративных платформ.",
          messages: [{ role: "user", content: prompt }],
        }),
      })

      if (!fallbackResponse.ok) {
        const errorText = await fallbackResponse.text()
        console.error("Anthropic API error:", errorText)
        return NextResponse.json({ error: "Ошибка AI-генерации. Попробуйте позже." }, { status: 502 })
      }

      const fallbackData = await fallbackResponse.json()
      const content = fallbackData.content?.[0]?.text || ""
      const parsed = parseAIResponse(content, filename)
      return NextResponse.json(parsed)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ""
    const parsed = parseAIResponse(content, filename)
    return NextResponse.json(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка генерации курса"
    console.error("AI generate error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function parseAIResponse(content: string, filename: string): GeneratedCourse {
  try {
    // Убираем markdown-блоки если есть
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned)
    return parsed as GeneratedCourse
  } catch {
    console.error("Failed to parse AI response as JSON:", content.slice(0, 200))
    // Возвращаем mock если парсинг не удался
    return getMockCourse(filename || "документ")
  }
}
