"use client"

// Придержанные стражем сообщения (Option 2). HR проверяет и решает:
// отправить вручную / отклонить. Ссылка из уведомления «Сообщение придержано».

import { useEffect, useState } from "react"
import { AlertTriangle, Send, X, ShieldAlert, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface HeldRow {
  id: string
  messageText: string
  issues: string[]
  source: string | null
  createdAt: string
  candidateId: string | null
  candidateName: string | null
}

export default function HeldMessagesPage() {
  const [items, setItems] = useState<HeldRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch("/api/modules/hr/held-messages")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: HeldRow[] }) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const act = async (id: string, action: "send" | "dismiss") => {
    setBusy(id)
    try {
      const res = await fetch(`/api/modules/hr/held-messages/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      })
      if (!res.ok) { toast.error(action === "send" ? "Не удалось отправить" : "Не удалось отклонить"); return }
      toast.success(action === "send" ? "Отправлено" : "Отклонено")
      setItems((p) => p.filter((x) => x.id !== id))
    } finally { setBusy(null) }
  }

  return (
    <main className="flex-1 overflow-auto bg-background min-w-0">
      <div className="py-6 px-4 sm:px-14 max-w-3xl">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <h1 className="text-lg font-semibold">Придержанные сообщения</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Сообщения, которые страж не отправил из-за проблемы (сырая переменная / пустой текст). Проверьте и отправьте вручную либо отклоните.</p>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">Придержанных сообщений нет — всё уходит корректно ✓</div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="rounded-lg border border-amber-400/50 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium text-foreground/85">{it.candidateName || "Кандидат"}</span>
                  <span className="text-[11px] text-muted-foreground">{new Date(it.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 mb-2">
                  <AlertTriangle className="w-3 h-3" /> {it.issues.join("; ")}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words bg-background rounded-md border p-2 mb-2">{it.messageText || <span className="text-muted-foreground italic">(пусто)</span>}</p>
                <div className="flex items-center gap-2">
                  <button disabled={busy === it.id} onClick={() => act(it.id, "send")}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs disabled:opacity-50">
                    <Send className="w-3.5 h-3.5" /> Отправить как есть
                  </button>
                  <button disabled={busy === it.id} onClick={() => act(it.id, "dismiss")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted/50 disabled:opacity-50">
                    <X className="w-3.5 h-3.5" /> Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
