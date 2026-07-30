"use client"

// Переанализ — массовый сброс звонков в pending для повторного разбора
// актуальными скриптами/чек-листами (POST calls/reanalyze-all, STT повторно
// НЕ запускается — используются сохранённые транскрипты) + пересчёт
// атрибуции менеджеров по RESPONSIBLE_ID активности Bitrix за период
// (POST calls/reattribute-managers). Доступ — карточка видна только в
// requireRopManageViewer-защищённой странице настроек (директор).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw, Loader2, Users as UsersIcon } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Mode = "done" | "failed" | "all"

const MODE_LABEL: Record<Mode, string> = { done: "done", failed: "failed", all: "done + failed" }

export function ReanalyzeCard() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ reset: number; pendingNow: number } | null>(null)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [reattribBusy, setReattribBusy] = useState(false)
  const [reattribResult, setReattribResult] = useState<{ processed: number; updated: number; unchanged: number } | null>(null)
  const router = useRouter()

  async function run(mode: Mode) {
    setBusy(true); setResult(null)
    try {
      // Гард от случайного массового пережога бюджета: сначала dry-run — узнаём
      // РЕАЛЬНОЕ количество звонков и оценку стоимости, показываем в confirm,
      // и только после явного согласия выполняем настоящий сброс+переанализ.
      const dryR = await fetch("/api/modules/ai-rop/calls/reanalyze-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, dryRun: true }),
      })
      const dry = await dryR.json()
      if (!dry.ok) { alert("Ошибка: " + dry.error); return }
      if (dry.count === 0) { alert("Нечего переанализировать — подходящих звонков не найдено."); return }

      const msg =
        `Сбросить ${dry.count} звонков (${MODE_LABEL[mode]}) на переанализ?\n\n` +
        `Каждый будет заново прогнан через AI (STT НЕ запускается — транскрипты уже сохранены).\n` +
        `Оценочная стоимость: ~$${dry.estUsd} (≈$0.01 × ${dry.count} звонков).`
      if (!confirm(msg)) return

      const r = await fetch("/api/modules/ai-rop/calls/reanalyze-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      const data = await r.json()
      if (data.ok) { setResult({ reset: data.reset, pendingNow: data.pendingNow }); router.refresh() }
      else alert("Ошибка: " + data.error)
    } finally { setBusy(false) }
  }

  async function reattribute() {
    if (!fromDate) { alert("Укажите дату начала периода"); return }
    setReattribBusy(true); setReattribResult(null)
    try {
      const r = await fetch("/api/modules/ai-rop/calls/reattribute-managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate: toDate || fromDate }),
      })
      const data = await r.json()
      if (data.ok) { setReattribResult({ processed: data.processed, updated: data.updated, unchanged: data.unchanged }); router.refresh() }
      else alert("Ошибка: " + data.error)
    } finally { setReattribBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><RotateCcw className="size-4 text-violet-600" /> Переанализ</CardTitle>
        <CardDescription>Прогнать звонки с готовыми транскриптами через AI заново — с актуальными скриптами и чек-листами. Полезно после изменения скриптов или порогов.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => run("done")} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Все done
          </Button>
          <Button size="sm" variant="outline" onClick={() => run("failed")} disabled={busy} className="gap-1.5">
            <RotateCcw className="size-3.5" /> Только failed
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run("all")} disabled={busy}>done + failed</Button>
        </div>
        {result && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
            Сброшено в очередь: <b>{result.reset}</b>. Сейчас в pending: <b>{result.pendingNow}</b>. Крон разберёт в течение нескольких минут.
          </div>
        )}

        <div className="border-t pt-3.5">
          <div className="mb-1 text-sm font-medium">Пересчёт атрибуции менеджеров</div>
          <div className="mb-2.5 text-xs text-muted-foreground">
            Подтянуть из Bitrix RESPONSIBLE_ID активности для звонков за период и заменить менеджера в нашей БД — полезно если звонок приходит диспетчеру, а в работу его берёт другой менеджер.
          </div>
          <div className="mb-2.5 grid grid-cols-2 gap-2 sm:max-w-xs">
            <div><Label className="mb-1 block text-xs text-muted-foreground">С даты</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
            <div><Label className="mb-1 block text-xs text-muted-foreground">По дату</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
          </div>
          <Button size="sm" variant="outline" onClick={reattribute} disabled={reattribBusy} className="gap-1.5">
            {reattribBusy ? <Loader2 className="size-3.5 animate-spin" /> : <UsersIcon className="size-3.5" />} Пересчитать атрибуцию
          </Button>
          {reattribResult && (
            <div className="mt-2.5 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-sm">
              Обработано: <b>{reattribResult.processed}</b>. Изменено: <b>{reattribResult.updated}</b>. Без изменений: <b>{reattribResult.unchanged}</b>.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
