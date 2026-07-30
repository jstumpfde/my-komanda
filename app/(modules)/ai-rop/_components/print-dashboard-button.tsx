"use client"

// «Печать» — серверный PDF-экспорт дашборда (puppeteer-core + @sparticuz/chromium,
// роут /api/modules/ai-rop/reports/dashboard-pdf, план п.12 — разрешение на
// пакеты получено 12.07). Прокидываем текущие query-фильтры дашборда (период/
// менеджер/CRM), чтобы PDF совпадал с тем, что видит пользователь на экране.
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Printer, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function PrintDashboardButton() {
  const [busy, setBusy] = useState(false)
  const search = useSearchParams()

  async function handlePrint() {
    setBusy(true)
    try {
      const qs = new URLSearchParams()
      for (const k of ["from", "to", "manager_id", "with_crm"]) {
        const v = search.get(k)
        if (v) qs.set(k, v)
      }
      const res = await fetch(`/api/modules/ai-rop/reports/dashboard-pdf${qs.toString() ? `?${qs}` : ""}`)
      if (!res.ok) {
        toast.error("Не удалось сформировать PDF")
        return
      }
      const blob = await res.blob()
      const today = new Date().toISOString().slice(0, 10)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `ai-rop-dashboard-${today}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Не удалось сформировать PDF")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint} disabled={busy}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
      {busy ? "Формирую…" : "Печать"}
    </Button>
  )
}
