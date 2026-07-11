"use client"

// Импорт исторических звонков за период — POST /api/modules/ai-rop/import/bitrix.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Download } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

const PRESETS = [7, 14, 30, 90]
function isoDaysAgo(days: number): string { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10) }
function todayIso(): string { return new Date().toISOString().slice(0, 10) }

type Result =
  | { ok: true; totalFetched: number; inserted: number; skipped: number }
  | { ok: false; error: string }

export function ImportForm() {
  const [fromDate, setFromDate] = useState(isoDaysAgo(7))
  const [toDate, setToDate] = useState(todayIso())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const router = useRouter()

  async function go() {
    setBusy(true); setResult(null)
    try {
      const res = await fetch("/api/modules/ai-rop/import/bitrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate }),
      })
      const data = (await res.json()) as Result
      setResult(data)
      if (data.ok) router.refresh()
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message })
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Download className="size-4 text-violet-600" /> Импорт исторический</CardTitle>
        <CardDescription>Подтянуть звонки из Bitrix за период — скачаем записи, транскрибируем, проанализируем. В Bitrix ничего не пишем.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((d) => (
            <Button key={d} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setFromDate(isoDaysAgo(d)); setToDate(todayIso()) }}>Последние {d} дн.</Button>
          ))}
        </div>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
          <div><Label className="mb-1.5 block text-xs text-muted-foreground">С даты</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} max={toDate} /></div>
          <div><Label className="mb-1.5 block text-xs text-muted-foreground">По дату</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} min={fromDate} max={todayIso()} /></div>
          <Button onClick={go} disabled={busy || !fromDate} className="gap-1.5">{busy && <Loader2 className="size-3.5 animate-spin" />} Импортировать</Button>
        </div>
        {result && (
          result.ok ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              Импорт завершён — получено {result.totalFetched}, добавлено {result.inserted}, пропущено {result.skipped}.
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Ошибка: {result.error}</div>
          )
        )}
      </CardContent>
    </Card>
  )
}
