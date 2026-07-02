import type { DemoLength } from "@/lib/demo-types"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

export const CLAUDE_MODEL = AI_MODEL_MAIN

export type Tone = "energetic" | "friendly" | "business" | "direct"

export const TONE_META: Record<Tone, { label: string; emoji: string; description: string }> = {
  energetic: { label: "Энергичный",  emoji: "🔥", description: "вызов и драйв" },
  friendly:  { label: "Дружелюбный", emoji: "🤝", description: "тёплый и поддерживающий" },
  business:  { label: "Деловой",     emoji: "💼", description: "факты без эмоций" },
  direct:    { label: "Прямой",      emoji: "🎯", description: "только суть" },
}

export const LENGTH_HINT: Record<DemoLength, string> = {
  short:    "короткая ~6 уроков",
  standard: "стандартная ~15 уроков",
  full:     "полная ~22 урока",
}

export type WorkFormatKey = "office" | "hybrid" | "remote"

export const WORK_FORMATS: { key: WorkFormatKey; label: string; emoji: string }[] = [
  { key: "office", label: "Офис",     emoji: "🏢" },
  { key: "hybrid", label: "Гибрид",   emoji: "🔄" },
  { key: "remote", label: "Удалёнка", emoji: "🏠" },
]

export const WORK_FORMAT_LABEL: Record<WorkFormatKey, string> = WORK_FORMATS.reduce(
  (acc, f) => { acc[f.key] = f.label; return acc },
  {} as Record<WorkFormatKey, string>,
)

export type Market = "B2B" | "B2C" | "B2G"

export const MARKETS: Market[] = ["B2B", "B2C", "B2G"]

export interface PromptParams {
  length: DemoLength
  tone: Tone
  market: Market[]
  company: string
  position: string
  city: string
  salary: string
  workFormat: WorkFormatKey[]
  hiringManager: string
  ceoName: string
}

export interface ClaudeLesson {
  name?: string
  title?: string
  emoji?: string
  content?: string
}

export interface ClaudeUsage {
  input_tokens: number
  output_tokens: number
}

export interface ClaudeResult {
  lessons: ClaudeLesson[]
  usage: ClaudeUsage
}

export function buildPrompt(text: string, params: PromptParams): string {
  const tone = TONE_META[params.tone]
  const lengthLabel = LENGTH_HINT[params.length]

  const withVar = (value: string, variable: string) =>
    value.trim() ? value.trim() : `не указана, используй {{${variable}}}`
  const plain = (value: string) => (value.trim() ? value.trim() : "не указан")

  const company = withVar(params.company, "компания")
  const position = withVar(params.position, "должность")
  const city = withVar(params.city, "город")
  const salary = params.salary.trim() ? params.salary.trim() : "не указана, используй {{зарплата}}"
  const workFormat = params.workFormat.length > 0
    ? params.workFormat.map((k) => WORK_FORMAT_LABEL[k]).join(", ")
    : "не указан"
  const hiringManager = plain(params.hiringManager)
  const ceoName = plain(params.ceoName)

  return `Ты — эксперт по созданию обучающих демонстраций должности для кандидатов.

Разбей следующий документ на уроки (разделы) для демонстрации должности.

Параметры демонстрации:
- Формат: ${lengthLabel}
- Тон: ${tone.label.toLowerCase()} — ${tone.description}
- Тип рынка: ${(params.market.length > 0 ? params.market : ["B2B"]).join(", ")}
- Компания: ${company}
- Должность: ${position}
- Город: ${city}
- Зарплата: ${salary}
- Формат работы: ${workFormat}
- Кто набирает: ${hiringManager}
- Основатель/Генеральный директор: ${ceoName}

Где данные не указаны — используй переменные в двойных фигурных скобках: {{компания}}, {{должность}}, {{город}}, {{зарплата}}, {{имя}}.
Где данные указаны — подставь реальные значения.
{{имя}} всегда оставляй как переменную — она подставится при отправке кандидату.

Правила:
- Сохрани ВЕСЬ контент из документа. Ничего не сокращай, не пропускай, не перефразируй.
- Если текст длинный — это нормально. Лучше длинный полный урок чем короткий обрезанный.
- Каждый логический раздел документа = отдельный урок
- Название урока: краткое, 3-5 слов, с подходящим эмодзи в начале
- Сохрани форматирование: абзацы (разделяй пустой строкой), списки (• ), жирный (**текст**)
- Если есть упоминание видео — вставь placeholder: [ВИДЕО: описание]
- Если указан формат работы, зарплата, кто набирает — используй в соответствующих местах
- Если указан основатель — в уроке "Видео-обращение" используй его имя
- Если указан кто набирает — используй в приветствии и финале
- {{имя}} ВСЕГДА оставляй как переменную
- Последний урок ОБЯЗАТЕЛЬНО: финал с инструкцией что делать дальше (видео-визитка, следующий шаг)
- Соблюдай выбранный тон коммуникации ВО ВСЕХ уроках
- АБЗАЦЫ: Разделяй текст на абзацы пустой строкой (\\n\\n) каждые 2-3 предложения. Никогда не пиши стену текста.
- ТЕСТЫ: В уроках "Проверка понимания" создавай тестовые вопросы. Формат теста в content:
  [ТЕСТ]
  Вопрос: текст вопроса?
  A) вариант 1
  B) вариант 2
  C) вариант 3
  Правильный: B
  [/ТЕСТ]
  Создай 3-5 вопросов на понимание роли и компании на основе материала демонстрации.
- ЗАДАНИЯ: В уроках где кандидат должен ответить или записать видео, используй формат:
  [ЗАДАНИЕ]
  Название: Опыт в продажах
  Описание: Опиши конкретно: в каких ролях работал, с какими продуктами, сколько лет в продажах.
  Тип: текст
  [/ЗАДАНИЕ]
  Создай 2-3 задания для самопрезентации кандидата.
- ВИДЕО-ВИЗИТКА: Последний или предпоследний урок. Кандидат записывает видео 1-2 минуты. Формат:
  [ЗАДАНИЕ]
  Название: Видео-визитка
  Описание: Запиши видео 1-2 минуты. Расскажи почему хочешь работать в {{компания}}, свои сильные стороны для этой роли и почему подходишь лучше других.
  Тип: видео
  [/ЗАДАНИЕ]

Верни ТОЛЬКО JSON массив без markdown backticks:
[
  {
    "name": "👋 Приветствие",
    "emoji": "👋",
    "content": "Текст урока с форматированием..."
  }
]

Документ:
${text}`
}

export function tryParseJsonArray(raw: string): ClaudeLesson[] | null {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* fall through */
  }

  const lastBrace = cleaned.lastIndexOf("}")
  if (lastBrace > 0) {
    try {
      const parsed = JSON.parse(cleaned.substring(0, lastBrace + 1) + "]")
      if (Array.isArray(parsed)) return parsed
    } catch {
      /* fall through */
    }
  }

  const match = cleaned.match(/\[[\s\S]*\]/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) return parsed
    } catch {
      return null
    }
  }

  return null
}
