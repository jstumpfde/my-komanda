import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, demoTemplates, knowledgeArticles } from "@/lib/db/schema"
import { verifyToken } from "../auth/route"

const MAX_PER_TYPE = 20
const EXCERPT_LEN = 300

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function demoExcerpt(sections: unknown): string {
  if (!Array.isArray(sections) || sections.length === 0) return ""
  const first = sections[0] as { blocks?: { content?: string }[] }
  if (!Array.isArray(first?.blocks)) return ""
  return first.blocks
    .map((b) => stripHtml(b.content || ""))
    .filter(Boolean)
    .join(" ")
    .slice(0, EXCERPT_LEN)
}

export async function POST(req: NextRequest) {
  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 })
  }

  if (!body.token) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 })
  }

  const payload = verifyToken(body.token)
  if (!payload || !payload.companyId) {
    return NextResponse.json({ error: "Сессия истекла" }, { status: 401 })
  }

  const companyId = payload.companyId

  const [companyRow] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)
  if (!companyRow) {
    return NextResponse.json({ error: "Компания не найдена" }, { status: 404 })
  }

  const [demos, articles] = await Promise.all([
    db
      .select({ id: demoTemplates.id, name: demoTemplates.name, sections: demoTemplates.sections })
      .from(demoTemplates)
      .where(eq(demoTemplates.tenantId, companyId))
      .orderBy(desc(demoTemplates.updatedAt))
      .limit(MAX_PER_TYPE),
    db
      .select({ id: knowledgeArticles.id, title: knowledgeArticles.title, content: knowledgeArticles.content })
      .from(knowledgeArticles)
      .where(and(
        eq(knowledgeArticles.tenantId, companyId),
        eq(knowledgeArticles.status, "published"),
      ))
      .orderBy(desc(knowledgeArticles.updatedAt))
      .limit(MAX_PER_TYPE),
  ])

  const parts: string[] = []
  const materialsList: { id: string; name: string; type: "demo" | "article" }[] = []
  let idx = 1

  for (const d of demos) {
    parts.push(`[${idx}] «${d.name}» (презентация)\n${demoExcerpt(d.sections) || "(нет содержания)"}`)
    materialsList.push({ id: d.id, name: d.name, type: "demo" })
    idx++
  }
  for (const a of articles) {
    parts.push(`[${idx}] «${a.title}» (статья)\n${stripHtml(a.content || "").slice(0, EXCERPT_LEN) || "(нет содержания)"}`)
    materialsList.push({ id: a.id, name: a.title, type: "article" })
    idx++
  }

  const context = parts.length > 0
    ? parts.join("\n\n")
    : "В базе знаний пока нет материалов."

  // MVP: returning the API key to anonymous (but token-gated) users so the
  // browser can call Anthropic directly. This bypasses the RU-IP block on the
  // server, at the cost of exposing the key to anyone who knows the URL and
  // its password. Replace with a proper proxy on the first production pass.
  const claudeKey = process.env.ANTHROPIC_API_KEY || null

  return NextResponse.json({
    context,
    materialsList,
    companyName: companyRow.name,
    claudeKey,
  })
}
