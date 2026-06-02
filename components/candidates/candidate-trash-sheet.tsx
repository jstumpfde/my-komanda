"use client"

// Корзина кандидатов вакансии — самодостаточный Sheet поверх списка.
// Источник: GET /api/modules/hr/candidates?vacancy_id=…&trashed=true.
// Действия по строке: «Восстановить» (untrash) и «Удалить навсегда»
// (hard_delete) через bulk-эндпоинт. Права на действия проверяет сервер
// (admin / manager-admin / director) — при отказе показываем ошибку.
import { useEffect, useState, useCallback } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Loader2, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface TrashRow { id: string; name: string | null; stage: string | null; city?: string | null }

export function CandidateTrashSheet({
  vacancyId,
  open,
  onOpenChange,
  onChanged,
}: {
  vacancyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<TrashRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false) // были ли изменения (для onChanged при закрытии)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/modules/hr/candidates?vacancy_id=${encodeURIComponent(vacancyId)}&trashed=true&pageSize=200`)
      const j = await r.json().catch(() => null)
      const list = Array.isArray(j) ? j : Array.isArray(j?.candidates) ? j.candidates : []
      setRows(list.map((c: Record<string, unknown>) => ({
        id: String(c.id),
        name: (c.name as string) ?? null,
        stage: (c.stage as string) ?? null,
        city: (c.city as string) ?? null,
      })))
    } catch {
      toast.error("Не удалось загрузить корзину")
    } finally {
      setLoading(false)
    }
  }, [vacancyId])

  useEffect(() => { if (open) { setDirty(false); load() } }, [open, load])

  const act = async (id: string, action: "untrash" | "hard_delete") => {
    if (action === "hard_delete" && typeof window !== "undefined"
      && !window.confirm("Удалить кандидата НАВСЕГДА? Действие необратимо.")) return
    setBusyId(id)
    try {
      const r = await fetch(`/api/modules/hr/candidates/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: [id], action }),
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e?.error || (r.status === 403 ? "Недостаточно прав" : "Не удалось"))
      }
      setRows((rs) => rs.filter((x) => x.id !== id))
      setDirty(true)
      toast.success(action === "untrash" ? "Восстановлен" : "Удалён навсегда")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setBusyId(null)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && dirty) onChanged?.()
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Trash2 className="size-4" /> Корзина кандидатов{rows.length > 0 ? ` (${rows.length})` : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
              <Loader2 className="size-4 animate-spin" /> Загрузка…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">Корзина пуста</div>
          ) : (
            rows.map((c) => {
              const busy = busyId === c.id
              return (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{c.name?.trim() || "Без имени"}</div>
                    {c.city?.trim() && <div className="text-[11px] text-muted-foreground truncate">{c.city}</div>}
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs shrink-0" disabled={busy}
                    onClick={() => act(c.id, "untrash")}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    Восстановить
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 shrink-0" disabled={busy}
                    title="Удалить навсегда" onClick={() => act(c.id, "hard_delete")}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
