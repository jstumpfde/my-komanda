// Витрина клиентских страниц — чтение / обновление / удаление одной страницы.
// Доступ: платформенный оператор.
// GET    → { slug, url, html }
// PUT    → обновить HTML { html }
// DELETE → удалить страницу

import { NextRequest, NextResponse } from "next/server"
import { requirePlatformOperator } from "@/lib/platform/auth"
import {
  readPage,
  writePage,
  deletePage,
  pageExists,
  isValidSlug,
  publicUrl,
  MAX_HTML_BYTES,
} from "@/lib/platform/client-pages"

export const dynamic = "force-dynamic"

async function guard(): Promise<NextResponse | null> {
  try {
    await requirePlatformOperator()
    return null
  } catch (e) {
    if (e instanceof Response) return e as NextResponse
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const { slug } = await ctx.params
  if (!isValidSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 })
  try {
    const html = await readPage(slug)
    if (html === null) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ slug, url: publicUrl(slug), html })
  } catch (err) {
    console.error("[platform/client-pages/:slug GET]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const { slug } = await ctx.params
  if (!isValidSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 })
  try {
    const body = (await req.json().catch(() => ({}))) as { html?: unknown }
    const html = typeof body.html === "string" ? body.html : ""
    if (html.trim().length === 0) {
      return NextResponse.json({ error: "Пустой HTML" }, { status: 400 })
    }
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return NextResponse.json({ error: "Страница слишком большая (максимум 5 МБ)" }, { status: 413 })
    }
    await writePage(slug, html)
    return NextResponse.json({ ok: true, slug, url: publicUrl(slug) })
  } catch (err) {
    console.error("[platform/client-pages/:slug PUT]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const { slug } = await ctx.params
  if (!isValidSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 })
  try {
    if (!(await pageExists(slug))) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    await deletePage(slug)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[platform/client-pages/:slug DELETE]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
