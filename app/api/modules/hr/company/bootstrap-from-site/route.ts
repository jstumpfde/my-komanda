// Фаза 1 онбординга клиента: POST { url } → забрать текст сайта → AI-извлечение
// профиля компании/продуктов → вернуть ЧЕРНОВИК для ревью (НЕ сохраняем).
// Сохранение делает клиент через существующие эндпоинты после проверки.

import { NextRequest, NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { normalizeUrl, fetchSiteText } from "@/lib/hiring/bootstrap/fetch-site"
import { extractProfileFromSiteText } from "@/lib/hiring/bootstrap/extract-profile"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    await requireCompany()
    const body = (await req.json().catch(() => ({}))) as { url?: string }

    const url = normalizeUrl(body.url ?? "")
    if (!url) {
      return NextResponse.json({ error: "Укажите корректный адрес сайта (http/https, публичный)" }, { status: 400 })
    }

    const site = await fetchSiteText(url)
    if (!site.ok) {
      return NextResponse.json({ error: site.error ?? "Не удалось прочитать сайт" }, { status: 422 })
    }

    const extracted = await extractProfileFromSiteText(site.text)
    if (!extracted.companyDescription && extracted.products.length === 0) {
      return NextResponse.json({ error: "С сайта не удалось извлечь профиль — заполните вручную" }, { status: 422 })
    }

    return NextResponse.json({
      ok: true,
      pages: site.pages,
      companyDescription: extracted.companyDescription,
      products: extracted.products,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[bootstrap-from-site]", err)
    return NextResponse.json({ error: "Ошибка обработки сайта" }, { status: 500 })
  }
}
