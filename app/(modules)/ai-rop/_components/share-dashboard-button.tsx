"use client"

// Кнопка «Поделиться» в шапке дашборда AI-РОП — публичная read-only ссылка
// /rop-report/[token] (страница делает параллельный агент — публичный роут вне
// моей зоны). Мутации — через lib/ai-rop/dashboard-share.ts за API
// /api/modules/ai-rop/dashboard-share (POST=перегенерировать, DELETE=отозвать).
import { useEffect, useRef, useState } from "react"
import { Share2, Copy, RotateCw, X, ExternalLink, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ShareDashboardButton({ initialToken, baseUrl }: { initialToken: string | null; baseUrl: string }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(initialToken)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const url = token ? `${baseUrl}/rop-report/${token}` : null

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open])

  async function gen() {
    setBusy(true)
    try {
      const r = await fetch("/api/modules/ai-rop/dashboard-share", { method: "POST" })
      const data = await r.json()
      if (data.ok) setToken(data.token)
    } finally { setBusy(false) }
  }

  async function revoke() {
    if (!confirm("Отозвать ссылку? Все, кто её знают, перестанут видеть дашборд.")) return
    setBusy(true)
    try {
      const r = await fetch("/api/modules/ai-rop/dashboard-share", { method: "DELETE" })
      if (r.ok) setToken(null)
    } finally { setBusy(false) }
  }

  async function copy() {
    if (!url) return
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
        <Share2 className="size-3.5" /> Поделиться
      </Button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[380px] max-w-[calc(100vw-30px)] rounded-lg border bg-card p-4 shadow-lg">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-semibold"><Share2 className="size-3.5" /> Публичная ссылка</div>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => setOpen(false)}><X className="size-3.5" /></Button>
          </div>
          {!token ? (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Любой, кто откроет ссылку, увидит read-only дашборд без логина: KPI и таблицу менеджеров.
              </p>
              <Button size="sm" className="w-full" onClick={gen} disabled={busy}>{busy ? "Создаю…" : "Создать ссылку"}</Button>
            </>
          ) : (
            <>
              <div className="mb-3 flex gap-1">
                <Input readOnly value={url ?? ""} className="h-8 font-mono text-[11px]" onClick={(e) => (e.target as HTMLInputElement).select()} />
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={copy} title="Копировать">
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
                  <a href={url ?? "#"} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /></a>
                </Button>
              </div>
              <div className="flex gap-1 border-t pt-2.5">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={gen} disabled={busy} title="Старая ссылка перестанет работать">
                  <RotateCw className="size-3.5" /> Перегенерировать
                </Button>
                <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-xs text-destructive" onClick={revoke} disabled={busy}>
                  <X className="size-3.5" /> Отозвать
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
