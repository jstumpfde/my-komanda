// Витрина клиентских страниц — список и создание.
// Доступ: платформенный оператор (owner / platform_admin / whitelisted email).
// GET  → список опубликованных страниц
// POST → создать новую страницу { slug, html }

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformOperator } from "@/lib/platform/auth"
import {
  listPages,
  writePage,
  pageExists,
  normalizeSlug,
  isValidSlug,
  publicUrl,
  MAX_HTML_BYTES,
} from "@/lib/platform/client-pages"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const pages = await listPages()
    return NextResponse.json({ pages })
  } catch (err) {
    console.error("[platform/client-pages GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { slug?: unknown; html?: unknown }
    const slug = normalizeSlug(typeof body.slug === "string" ? body.slug : "")
    const html = typeof body.html === "string" ? body.html : ""

    if (!isValidSlug(slug)) {
      return NextResponse.json(
        { error: "Некорректный адрес. Разрешены строчные латинские буквы, цифры и дефис." },
        { status: 400 },
      )
    }
    if (html.trim().length === 0) {
      return NextResponse.json({ error: "Пустой HTML" }, { status: 400 })
    }
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return NextResponse.json({ error: "Страница слишком большая (максимум 5 МБ)" }, { status: 413 })
    }
    if (await pageExists(slug)) {
      return NextResponse.json(
        { error: `Адрес /${slug} уже занят. Откройте страницу и отредактируйте её.` },
        { status: 409 },
      )
    }

    await writePage(slug, html)
    return NextResponse.json({ ok: true, slug, url: publicUrl(slug) }, { status: 201 })
  } catch (err) {
    console.error("[platform/client-pages POST]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
