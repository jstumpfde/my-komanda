"use client"

// Кнопки действий на карточке звонка: Перезапустить обработку / Глубокий
// анализ / Дозагрузить CRM / Отправить в CRM. Мутации — POST на
// /api/modules/ai-rop/calls/[id]/* (роуты — зона API-агента, сигнатуры
// совпадают с оригиналом call-agent /api/calls/:id/*). Видны только
// team-viewer (директор/head/rop_view_team) — не manager.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Microscope, RefreshCcw, Upload, CheckCircle2, XCircle, AlertCircle, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WriteResult {
  action: string
  mode: "dry" | "live"
  status: "sent" | "skipped_dry" | "skipped_duplicate" | "failed" | "no_target"
  entityType: string | null
  entityId: string | null
  payload: unknown
  result?: unknown
  error?: string
}

const STATUS_LABEL: Record<WriteResult["status"], string> = {
  sent: "Отправлено",
  skipped_dry: "Симуляция",
  skipped_duplicate: "Уже отправлено ранее",
  failed: "Ошибка",
  no_target: "Нет цели",
}
const STATUS_CLS: Record<WriteResult["status"], string> = {
  sent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  skipped_dry: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  skipped_duplicate: "border-border bg-muted text-muted-foreground",
  failed: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  no_target: "border-border bg-muted text-muted-foreground",
}

export function ReprocessButton({ callId }: { callId: string }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  async function go() {
    setBusy(true)
    try {
      const r = await fetch(`/api/modules/ai-rop/calls/${callId}/process`, { method: "POST" })
      const data = await r.json().catch(() => ({}))
      if (!data.ok) alert("Ошибка: " + (data.error || "неизвестная"))
      router.refresh()
    } finally { setBusy(false) }
  }
  return <Button size="sm" onClick={go} disabled={busy}><RefreshCw className="size-3.5" /> Перезапустить обработку</Button>
}

export function DeepAnalyzeButton({ callId }: { callId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  async function go() {
    setBusy(true); setError(null)
    try {
      const r = await fetch(`/api/modules/ai-rop/calls/${callId}/deep-analyze`, { method: "POST" })
      const data = await r.json().catch(() => ({}))
      if (!data.ok) setError(data.error || "неизвестная ошибка")
      else router.refresh()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={go} disabled={busy}><Microscope className="size-3.5" /> Глубокий анализ</Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

export function EnrichCrmButton({ callId }: { callId: string }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle")
  const router = useRouter()
  async function go() {
    setBusy(true); setStatus("idle")
    try {
      const r = await fetch(`/api/modules/ai-rop/calls/${callId}/enrich`, { method: "POST" })
      const data = await r.json().catch(() => ({}))
      setStatus(data.ok ? "ok" : "error")
      if (data.ok) router.refresh()
    } catch { setStatus("error") } finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" variant="outline" onClick={go} disabled={busy}><RefreshCcw className="size-3.5" /> Дозагрузить CRM</Button>
      {status === "ok" && <span className="text-xs text-emerald-600">Обновлено</span>}
      {status === "error" && <span className="text-xs text-destructive">Ошибка</span>}
    </span>
  )
}

export function SendToCrmButton({ callId, dryRun }: { callId: string; dryRun: boolean }) {
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<WriteResult[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  async function send() {
    setBusy(true); setErr(null); setResults(null)
    try {
      const r = await fetch(`/api/modules/ai-rop/calls/${callId}/send-to-crm`, { method: "POST" })
      const data = await r.json()
      if (!data.ok) throw new Error(data.error || "unknown")
      setResults(data.results as WriteResult[])
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="mt-4 rounded-lg border bg-card p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Upload className="size-3.5" /> Отправить разбор в Bitrix24
            {dryRun && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">DRY-RUN</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Комментарий в Timeline связанных сущностей (сделка/лид/контакт) + резюме в карточку активности.</div>
        </div>
        <Button size="sm" onClick={send} disabled={busy}>{busy ? "Отправка…" : "Отправить"}</Button>
      </div>

      {err && <div className="mt-2.5 rounded border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{err}</div>}

      {results && results.length === 0 && <div className="mt-2.5 text-sm text-muted-foreground">Нечего отправлять.</div>}

      {results && results.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2">
          {results.map((r, i) => (
            <div key={i} className={`rounded border p-2.5 text-sm ${STATUS_CLS[r.status]}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {r.status === "sent" ? <CheckCircle2 className="size-3.5" /> : r.status === "failed" ? <XCircle className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                  <span className="font-medium">{r.action === "comment" ? "Комментарий в Timeline" : r.action === "activity_update" ? "Описание активности" : "Задача"}</span>
                  <span className="text-muted-foreground">→ {r.entityType && r.entityId ? `${r.entityType} #${r.entityId}` : "—"}</span>
                  <span className="font-semibold">· {STATUS_LABEL[r.status]}</span>
                </div>
                <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
                  <Eye className="size-3" /> {expandedIdx === i ? "скрыть" : "превью"}
                </Button>
              </div>
              {expandedIdx === i && (
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border bg-background p-2.5 text-[11px]">
                  {JSON.stringify(r.payload, null, 2)}
                  {r.result ? "\n\n--- result ---\n" + JSON.stringify(r.result, null, 2) : ""}
                  {r.error ? "\n\n--- error ---\n" + r.error : ""}
                </pre>
              )}
            </div>
          ))}
          {results[0]?.mode === "dry" && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              Это была симуляция — реально в Bitrix ничего не отправлено (включён dry-run). Отключить в{" "}
              <a href="/ai-rop/settings" className="font-medium underline">Настройках → Безопасная запись</a>.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
