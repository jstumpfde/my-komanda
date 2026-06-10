import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, vacancyUtmLinks, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { fetchClaudeMessages } from "@/lib/claude-proxy"

// Формат работы
const FORMAT_LABELS: Record<string, string> = {
  office: "в офисе",
  hybrid: "гибрид",
  remote: "удалённо",
}

// Занятость
const EMPLOYMENT_LABELS: Record<string, string> = {
  full: "полная занятость",
  part: "частичная занятость",
}

function generateShortCode(companyName: string): string {
  const prefix = (companyName || "k")[0].toLowerCase()
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1)
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let suffix = ""
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}${year}${month}${suffix}`
}

/** Шаблонный fallback — не требует AI */
function buildTemplatePost(params: {
  title: string
  city?: string | null
  format?: string | null
  employment?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  companyName: string
  conditions: string[]
  shortUrl: string
}): string {
  const { title, city, format, employment, salaryMin, salaryMax, companyName, conditions, shortUrl } = params

  const parts: string[] = []

  // Заголовок
  parts.push(`💼 *${title}*`)
  parts.push(`📍 Компания: ${companyName}`)

  // Зарплата
  if (salaryMin || salaryMax) {
    const from = salaryMin ? `от ${salaryMin.toLocaleString("ru-RU")} ₽` : ""
    const to = salaryMax ? `до ${salaryMax.toLocaleString("ru-RU")} ₽` : ""
    parts.push(`💰 Зарплата: ${[from, to].filter(Boolean).join(" ")}`)
  }

  // Мета
  const meta: string[] = []
  if (city) meta.push(`📌 ${city}`)
  if (format) meta.push(`🏠 ${FORMAT_LABELS[format] ?? format}`)
  if (employment) meta.push(`⏰ ${EMPLOYMENT_LABELS[employment] ?? employment}`)
  if (meta.length > 0) parts.push(meta.join("  ·  "))

  // Условия
  if (conditions.length > 0) {
    parts.push("")
    parts.push("*Мы предлагаем:*")
    conditions.slice(0, 5).forEach((c) => parts.push(`✅ ${c}`))
  }

  // CTA
  parts.push("")
  parts.push(`👉 Откликнуться: ${shortUrl}`)

  return parts.join("\n")
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vacancy] = await db
      .select()
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Вакансия не найдена", 404)

    const [company] = await db
      .select({ name: companies.name, hiringDefaultsJson: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1)

    const companyName = company?.name ?? "Компания"

    const body = await req.json().catch(() => ({})) as {
      channelName?: string
      useAi?: boolean
    }

    const linkName = body.channelName
      ? `Telegram: ${body.channelName}`
      : "Telegram-постинг"

    // ── Трекинговая ссылка: на пару вакансия+канал — ОДНА (переиспользуем),
    // иначе каждая регенерация поста плодила бы новую запись в «Источниках» ──
    let [utmLink] = await db
      .select()
      .from(vacancyUtmLinks)
      .where(and(
        eq(vacancyUtmLinks.vacancyId, id),
        eq(vacancyUtmLinks.source, "telegram"),
        eq(vacancyUtmLinks.name, linkName),
      ))
      .limit(1)

    if (!utmLink) {
      let slug = ""
      for (let attempt = 0; attempt < 5; attempt++) {
        slug = generateShortCode(companyName)
        const [existing] = await db
          .select({ id: vacancyUtmLinks.id })
          .from(vacancyUtmLinks)
          .where(eq(vacancyUtmLinks.slug, slug))
          .limit(1)
        if (!existing) break
      }

      ;[utmLink] = await db
        .insert(vacancyUtmLinks)
        .values({
          vacancyId: id,
          source: "telegram",
          name: linkName,
          slug,
          destinationUrl: null,
          destinationType: "vacancy",
          createdByUserId: user.id,
        })
        .returning()
    }

    const proto = req.headers.get("x-forwarded-proto") ?? "https"
    const host = req.headers.get("host")
    const origin = host ? `${proto}://${host}` : "https://company24.pro"

    const shortUrl = `${origin}/v/${utmLink.slug}`

    // ── Собираем данные вакансии для поста ──
    const desc = (vacancy.descriptionJson as Record<string, unknown>) ?? {}
    const anketa = (desc.anketa as Record<string, unknown>) ?? {}
    const conditions = Array.isArray(anketa.conditions) ? (anketa.conditions as string[]) : []

    const postParams = {
      title: vacancy.title,
      city: vacancy.city,
      format: vacancy.format,
      employment: vacancy.employment,
      salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax,
      companyName,
      conditions,
      shortUrl,
    }

    // ── Попытка AI-генерации (Haiku), fallback на шаблон ──
    let postText: string
    let usedAi = false

    if (body.useAi !== false && process.env.ANTHROPIC_API_KEY) {
      try {
        const vacancyContext = [
          `Должность: ${vacancy.title}`,
          vacancy.city ? `Город: ${vacancy.city}` : "",
          vacancy.format ? `Формат работы: ${FORMAT_LABELS[vacancy.format] ?? vacancy.format}` : "",
          vacancy.employment ? `Занятость: ${EMPLOYMENT_LABELS[vacancy.employment] ?? vacancy.employment}` : "",
          vacancy.salaryMin || vacancy.salaryMax
            ? `Зарплата: ${vacancy.salaryMin ? "от " + vacancy.salaryMin.toLocaleString("ru-RU") + " ₽" : ""} ${vacancy.salaryMax ? "до " + vacancy.salaryMax.toLocaleString("ru-RU") + " ₽" : ""}`.trim()
            : "",
          conditions.length > 0 ? `Условия: ${conditions.slice(0, 5).join("; ")}` : "",
          `Компания: ${companyName}`,
        ].filter(Boolean).join("\n")

        const prompt = `Напиши пост для Telegram-канала о вакансии. Стиль: живой, привлекательный, не занудный. Используй эмодзи.

ДАННЫЕ:
${vacancyContext}

ОБЯЗАТЕЛЬНАЯ ссылка в конце: ${shortUrl}

СТРУКТУРА:
1. Заголовок с должностью (эмодзи + жирный через *звёздочки*)
2. Зарплата (если есть)
3. Город и формат работы
4. 3–5 коротких буллетов о преимуществах (✅)
5. Призыв к действию со ссылкой ${shortUrl}

ПРАВИЛА:
- Только русский язык
- Длина: 150–250 слов
- Жирный текст через *звёздочки* (Markdown для Telegram)
- Никаких дискриминационных требований (возраст, пол, гражданство)
- Выводи ТОЛЬКО текст поста, без комментариев`

        const { response } = await fetchClaudeMessages({
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 600,
            messages: [{ role: "user", content: prompt }],
          }),
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
        })

        if (response.ok) {
          const data = await response.json() as { content?: Array<{ type: string; text: string }> }
          const aiText = (data.content ?? [])
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("")
            .trim()

          if (aiText.length > 50) {
            postText = aiText
            usedAi = true
          } else {
            postText = buildTemplatePost(postParams)
          }
        } else {
          postText = buildTemplatePost(postParams)
        }
      } catch {
        postText = buildTemplatePost(postParams)
      }
    } else {
      postText = buildTemplatePost(postParams)
    }

    return apiSuccess({
      post: postText,
      usedAi,
      shortUrl,
      utmLinkId: utmLink.id,
      utmSlug: utmLink.slug,
    }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[telegram-post] error:", err)
    return apiError("Ошибка генерации поста", 500)
  }
}
