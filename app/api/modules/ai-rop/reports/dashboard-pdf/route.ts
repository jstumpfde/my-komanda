/**
 * GET /api/modules/ai-rop/reports/dashboard-pdf — серверный экспорт дашборда
 * AI-РОП в PDF.
 *
 * Рендерит СВОЙ же дашборд (/ai-rop) headless-браузером (chromium) и отдаёт
 * готовый A4-PDF с полями — одинаковый результат независимо от настроек
 * диалога печати браузера пользователя (перенесено из call-agent,
 * app/api/reports/dashboard-pdf, см. docs/architecture/AI-ROP-MODULE-PLAN-2026-07.md п.12).
 *
 * Доступ: requireRopTeam — те же роли, кому в UI показана кнопка «Печать»
 * (директор/head/rop_view_team). Обычному менеджеру (личный кабинет) не даём.
 *
 * Параметры периода/фильтров дашборда прокидываются как есть (from/to/manager_id/with_crm).
 */
import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import os from "os"
import path from "path"
import { apiError } from "@/lib/api-helpers"
import { requireRopTeam } from "@/lib/ai-rop/access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Простой in-process замок: не даём запустить два chromium одновременно на
// один процесс (ограниченные CPU/RAM прод-сервера). Второй запрос ждёт
// освобождения предыдущего рендера.
let busy: Promise<void> | null = null

export async function GET(req: NextRequest) {
  try {
    await requireRopTeam()
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[ai-rop/dashboard-pdf] auth error:", err)
    return apiError("Internal server error", 500)
  }

  const cookieHeader = req.headers.get("cookie")
  if (!cookieHeader) return apiError("no session", 401)

  // Пробрасываем только известные фильтры дашборда.
  const src = req.nextUrl.searchParams
  const qs = new URLSearchParams()
  for (const k of ["from", "to", "manager_id", "with_crm"]) {
    const v = src.get(k)
    if (v) qs.set(k, v)
  }
  const port = process.env.PORT || "3000"
  const target = `http://127.0.0.1:${port}/ai-rop${qs.toString() ? `?${qs}` : ""}`

  // Ждём, пока освободится предыдущий рендер (макс. один chromium за раз).
  while (busy) {
    try {
      await busy
    } catch {
      // ignore — предыдущий рендер сам залогировал свою ошибку
    }
  }
  let release!: () => void
  busy = new Promise<void>((r) => (release = r))

  try {
    const pdf = await renderPdf(target, cookieHeader)
    const today = new Date().toISOString().slice(0, 10)
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ai-rop-dashboard-${today}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    console.error("[ai-rop/dashboard-pdf] render failed:", (e as Error).message)
    return apiError("render_failed", 500)
  } finally {
    release()
    busy = null
  }
}

// Путь, куда @sparticuz/chromium распаковывает бинарник (см. node_modules/
// @sparticuz/chromium/build/cjs/index.cjs — executablePath() отдаёт
// path.join(os.tmpdir(), "chromium") если он уже там есть). Готча оригинала
// (call-agent, 04.07): битая/недоступная распаковка (EACCES) валила весь
// запрос без повтора — при такой ошибке чистим папку и пробуем один раз ещё.
const CHROMIUM_TMP_DIR = path.join(os.tmpdir(), "chromium")

async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default
  const chromium = (await import("@sparticuz/chromium")).default
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: "shell",
  })
}

async function renderPdf(url: string, cookieHeader: string): Promise<Buffer> {
  let browser
  try {
    browser = await launchBrowser()
  } catch (e) {
    const msg = (e as Error).message || ""
    if (msg.includes("EACCES") || msg.includes("ENOENT")) {
      console.warn("[ai-rop/dashboard-pdf] chromium launch failed (broken /tmp/chromium?), retrying once:", msg)
      try {
        fs.rmSync(CHROMIUM_TMP_DIR, { force: true, recursive: true })
      } catch (rmErr) {
        console.warn("[ai-rop/dashboard-pdf] failed to clean up chromium tmp dir:", (rmErr as Error).message)
      }
      browser = await launchBrowser() // повторная ошибка пробрасывается как есть
    } else {
      throw e
    }
  }

  try {
    const page = await browser.newPage()
    // Дефолтный viewport puppeteer уже мобильной ширины (< Tailwind md=768px) —
    // без явного desktop-viewport «md:hidden»/«hidden md:block» переключаются
    // на мобильную раскладку (напр. глобальный MobileBottomNav из
    // components/providers.tsx рисуется поверх PDF). Ставим широкий viewport
    // ДО goto, чтобы страница сразу рендерилась в desktop-режиме.
    await page.setViewport({ width: 1440, height: 900 })
    // Форвардим Cookie входящего запроса как есть — не завязываемся на
    // конкретное имя next-auth cookie (меняется между окружениями/версиями).
    await page.setExtraHTTPHeaders({ Cookie: cookieHeader })
    await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 })
    // Дать догрузиться клиентским блокам. Короткая пауза.
    await new Promise((r) => setTimeout(r, 1200))
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      scale: 0.92,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
    })
    return Buffer.from(buf)
  } finally {
    await browser.close()
  }
}
