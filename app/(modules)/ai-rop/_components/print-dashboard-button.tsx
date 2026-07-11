"use client"

// «Печать» — заглушка. Реальный серверный PDF-экспорт требует новых npm-пакетов
// (puppeteer-core + @sparticuz/chromium, см. AI-ROP-MODULE-PLAN п.12, «вопрос
// Юрию» №1 — ждёт разрешения). До тех пор — честная заглушка вместо диалога
// печати браузера (которая на дашборде с графиками выглядит плохо).
import { useState } from "react"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PrintDashboardButton() {
  const [note, setNote] = useState(false)
  return (
    <div className="relative inline-block">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setNote((v) => !v)}>
        <Printer className="size-3.5" /> Печать
      </Button>
      {note && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-lg border bg-card p-3 text-xs text-muted-foreground shadow-lg">
          PDF-отчёт скоро — ждёт разрешения на новые пакеты (puppeteer-core).
        </div>
      )}
    </div>
  )
}
