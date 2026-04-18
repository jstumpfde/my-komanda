// app/api/companies/demo-profile/route.ts
// API для работы с профилем компании для демонстраций.
// GET  — получить текущий demoProfile
// PUT  — сохранить demoProfile целиком
// POST — AI-мастер: принять текст → разобрать на поля → вернуть предложенные значения

import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { getClaudeMessagesUrl } from "@/lib/claude-proxy"

// ─── СТРУКТУРА ПРОФИЛЯ ДЛЯ ДЕМОНСТРАЦИЙ ─────────────────────────────────────

export interface DemoProfileData {
  // О руководителе
  ceoName?: string
  ceoShortBio?: string
  ceoExperience?: string
  ceoBackground?: string
  ceoAiAttitude?: string
  ceoStyle?: string
  ceoValues?: string
  ceoPhotoUrl?: string
  // О компании
  companyStage?: string
  companyMission?: string
  companyMarket?: string
  companyTeam?: string
  // Типовые цифры для демо
  guarantee?: string
  incomeMedium?: string
  // Метаданные
  updatedAt?: string
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const user = await requireCompany()

    const [company] = await db
      .select({ demoProfile: companies.demoProfile })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    if (!company) {
      return apiError("Company not found", 404)
    }

    return apiSuccess({
      demoProfile: (company.demoProfile as DemoProfileData) || {},
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("GET /api/companies/demo-profile", err)
    return apiError("Internal server error", 500)
  }
}

// ─── PUT ────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as DemoProfileData

    // Санитизация: берём только известные поля
    const allowed: (keyof DemoProfileData)[] = [
      "ceoName",
      "ceoShortBio",
      "ceoExperience",
      "ceoBackground",
      "ceoAiAttitude",
      "ceoStyle",
      "ceoValues",
      "ceoPhotoUrl",
      "companyStage",
      "companyMission",
      "companyMarket",
      "companyTeam",
      "guarantee",
      "incomeMedium",
    ]

    const cleaned: DemoProfileData = { updatedAt: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body && typeof body[key] === "string") {
        cleaned[key] = (body[key] as string).trim()
      }
    }

    await db
      .update(companies)
      .set({ demoProfile: cleaned })
      .where(eq(companies.id, user.companyId))

    return apiSuccess({ demoProfile: cleaned })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("PUT /api/companies/demo-profile", err)
    return apiError("Internal server error", 500)
  }
}

// ─── POST — AI-МАСТЕР ───────────────────────────────────────────────────────

interface AiMasterRequest {
  text: string
}

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
    const body = (await req.json()) as AiMasterRequest

    if (!body.text || body.text.trim().length < 20) {
      return apiError("Текст слишком короткий. Напишите минимум 2-3 предложения о себе и компании.", 400)
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return apiError("ANTHROPIC_API_KEY не настроен", 500)
    }

    const prompt = `Ты помогаешь предпринимателю заполнить профиль его компании и его самого как руководителя. На вход даётся свободный текст от него о себе и компании. Твоя задача — разобрать этот текст и извлечь из него данные в строгом формате JSON.

Текст от руководителя:
"""
${body.text}
"""

Верни ТОЛЬКО JSON-объект со следующими полями (все поля строки, если данных нет — пустая строка ""):

{
  "ceoName": "Имя Фамилия руководителя",
  "ceoShortBio": "1-2 предложения: позиционирование + ключевой проект/регалия",
  "ceoExperience": "Опыт в бизнесе: например 'больше 30 лет' или '15+ лет' или конкретные годы",
  "ceoBackground": "Чем занимался за эти годы (2-4 предложения)",
  "ceoAiAttitude": "Отношение к AI и технологиям (1-2 предложения, если упомянуто)",
  "ceoStyle": "Стиль мышления и работы руководителя (1-2 предложения)",
  "ceoValues": "Что ценит в людях (перечисление через запятую: например 'глубину мышления, способность видеть суть, открытость новому')",
  "companyStage": "Стадия компании: например 'стартап', 'активная фаза роста', 'зрелая' или свободный текст",
  "companyMission": "Миссия компании или ключевая идея продукта (2-3 предложения)",
  "companyMarket": "Рынок, клиенты, цели роста (2-3 предложения)",
  "companyTeam": "Состав команды сейчас (перечисление: кто есть, сколько человек)"
}

ВАЖНО:
- Если данных нет — оставь "" (пустую строку)
- НЕ придумывай факты которых нет в тексте
- НЕ добавляй "будет через год", "планируется"
- Используй ТОЧНЫЕ формулировки из текста где возможно
- Верни ТОЛЬКО JSON, без объяснений до или после, без \`\`\`json обёртки`

    const aiRes = await fetch(getClaudeMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error("[demo-profile/ai-master] Claude HTTP", aiRes.status, errText.slice(0, 300))
      return apiError("AI временно недоступен", 502)
    }

    const data = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> }
    const textBlock = data.content?.find((b) => b.type === "text")
    let rawText = textBlock?.text?.trim() || ""

    // Очистка от markdown-обёртки
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim()

    try {
      const parsed = JSON.parse(rawText) as DemoProfileData
      return apiSuccess({ demoProfile: parsed })
    } catch {
      console.error("[demo-profile/ai-master] JSON parse failed:", rawText.slice(0, 300))
      return apiError("AI вернул некорректный формат. Попробуйте переформулировать описание.", 502)
    }
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/companies/demo-profile", err)
    return apiError("Internal server error", 500)
  }
}
