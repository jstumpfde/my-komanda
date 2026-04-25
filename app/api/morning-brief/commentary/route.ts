import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { goals, users } from "@/lib/db/schema"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = "claude-haiku-4-5-20251001"
const TIMEOUT_MS = 10_000
const FALLBACK =
  "Утренний обзор готов. Посмотрите фокус дня и прогресс по целям ниже."

const FORBIDDEN_WORDS = [
  "claude", "anthropic", "openai", "gpt", "chatgpt",
  "haiku", "sonnet", "нейросеть", "нейросети",
]

const SYSTEM_PROMPT = `Ты — Нэнси, Координатор Целей в бизнес-платформе Company24. Ты помогаешь предпринимателям держать фокус и двигаться к целям.

ТВОЯ РОЛЬ В УТРЕННЕМ ОБЗОРЕ
Клиент открыл свой утренний обзор. Ты видишь его активные цели и прогресс. Напиши ровно 2-3 коротких предложения (всего 30-60 слов), которые:
1. Отмечают что-то конкретное в его прогрессе (цифра, процент, положительный сдвиг)
2. Указывают на риск или возможность если есть
3. Мотивируют на сегодня — без пафоса, по-деловому

СТИЛЬ
— Обращение на "вы"
— Деловой, не инфоцыганский. Не пиши "вы на верном пути!", "вперёд к победе!", "всё получится!"
— Цифры и факты важнее эмоций
— Коротко. Не распыляйся.
— Не используй восклицательные знаки кроме одного в редком случае
— Не используй эмодзи
— Отвечай ТОЛЬКО на русском языке

ЗАПРЕЩЕНО
— Упоминать технологии (Claude, AI, GPT, нейросеть, модель, прокси, Anthropic, Haiku, Sonnet)
— Давать советы вне контекста целей
— Задавать вопросы клиенту (это монолог, не диалог)
— Предлагать конкретные инструменты или модули платформы (только про цели)

ФОРМАТ ВХОДНЫХ ДАННЫХ
Ты получишь JSON с данными пользователя:
{
  "user_name": "Юрий",
  "date": "2026-04-21",
  "focus_today": [...массив целей в фокусе дня...],
  "yearly": [...годовые цели...],
  "monthly": [...месячные...],
  "weekly": [...недельные...]
}
Каждая цель: { title, target_value, target_unit, current_value, progress_percent, deadline, days_left }

ПРИМЕРЫ ХОРОШИХ КОММЕНТАРИЕВ

Пример 1 (есть прогресс):
"Прогресс по квартальной цели — 62%, при норме 58% на эту дату. Идёте чуть впереди графика. На сегодня в фокусе подписание одного контракта — этого достаточно, чтобы сохранить темп."

Пример 2 (отставание):
"По месячной цели сейчас 34%, при норме 65% на 21 число. Отставание четверть плана — критическая зона. Недельная цель закрыта на 50%, до воскресенья осталось два рабочих дня."

Пример 3 (нет целей в фокусе):
"В фокусе дня ни одной цели. Для удержания квартального плана в 12 млн имеет смысл выделить 1-2 конкретные задачи. Средний темп — 400 тыс. в день."

Пример 4 (цель впервые):
"Годовая цель поставлена, декомпозиция в работе. Первый шаг — разбить её на квартальные. Без промежуточных точек управлять 12-месячным горизонтом сложно."

Верни только текст комментария, без приветствий, без "Вот мой комментарий:", без обрамления в кавычки.`

type GoalRow = typeof goals.$inferSelect

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

function summarizeGoal(g: GoalRow, today: Date) {
  const target = g.targetValue != null ? Number(g.targetValue) : null
  const current = g.currentValue != null ? Number(g.currentValue) : 0
  const progress =
    target && target > 0 ? Math.max(0, Math.min(100, Math.floor((current / target) * 100))) : null
  const daysLeft = g.deadline ? daysBetween(new Date(g.deadline), today) : null
  return {
    title: g.title,
    target_value: target,
    target_unit: g.targetUnit,
    current_value: current,
    progress_percent: progress,
    deadline: g.deadline,
    days_left: daysLeft,
  }
}

function sanitize(text: string): string {
  const lower = text.toLowerCase()
  const hit = FORBIDDEN_WORDS.find((w) => lower.includes(w))
  if (hit) return FALLBACK
  return text.trim().replace(/^["«»]|["«»]$/g, "")
}

export async function GET() {
  return handle()
}

export async function POST() {
  return handle()
}

async function handle() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date()
  const iso = today.toISOString().slice(0, 10)

  // Собираем данные
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  const active = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, session.user.id), eq(goals.status, "active")))

  const payload = {
    user_name: user?.name ?? "",
    date: iso,
    focus_today: active.filter((g) => g.isFocusToday).map((g) => summarizeGoal(g, today)),
    yearly: active.filter((g) => g.level === "yearly").map((g) => summarizeGoal(g, today)),
    monthly: active.filter((g) => g.level === "monthly").map((g) => summarizeGoal(g, today)),
    weekly: active.filter((g) => g.level === "weekly").map((g) => summarizeGoal(g, today)),
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ commentary: FALLBACK, generated_at: new Date().toISOString(), fallback: true })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(getClaudeMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 250,
        temperature: 0.4,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: JSON.stringify(payload, null, 2) },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      return NextResponse.json({ commentary: FALLBACK, generated_at: new Date().toISOString(), fallback: true })
    }

    const data = await res.json()
    const text: string =
      data?.content?.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n") || ""
    const cleaned = sanitize(text)
    const commentary = cleaned || FALLBACK

    return NextResponse.json({
      commentary,
      generated_at: new Date().toISOString(),
      fallback: commentary === FALLBACK,
    })
  } catch {
    return NextResponse.json({ commentary: FALLBACK, generated_at: new Date().toISOString(), fallback: true })
  } finally {
    clearTimeout(timer)
  }
}
