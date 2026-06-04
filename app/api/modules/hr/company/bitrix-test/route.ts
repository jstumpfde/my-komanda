// O4: «Проверить связь» с Битрикс24 — пингуем webhook методом profile.json.
// Валидный webhook вернёт result; иначе error. Не пишет ничего, только проверка.
import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
    const { url } = await req.json().catch(() => ({})) as { url?: string }
    const base = (url ?? "").trim().replace(/\/+$/, "")
    if (!base || !/^https?:\/\//.test(base)) {
      return NextResponse.json({ ok: false, error: "Укажите корректный Webhook URL" }, { status: 400 })
    }
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(`${base}/profile.json`, { signal: controller.signal })
      clearTimeout(t)
      const data = await res.json().catch(() => null) as { result?: unknown; error?: string; error_description?: string } | null
      if (data && "result" in data && data.result) {
        return NextResponse.json({ ok: true })
      }
      return NextResponse.json({ ok: false, error: data?.error_description || data?.error || "Битрикс не подтвердил связь" })
    } catch {
      clearTimeout(t)
      return NextResponse.json({ ok: false, error: "Не удалось подключиться к Битрикс24" })
    }
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 })
  }
}
