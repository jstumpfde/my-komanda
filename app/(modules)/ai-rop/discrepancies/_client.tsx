"use client"

// Клиентские кусочки страницы «Расхождения с CRM»: фильтры (Tabs/Select,
// пишут в GET-query — страница server component перечитывает данные при
// смене URL, как DashboardFilters) + кнопки «Принять»/«Отклонить».
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Loader2, X } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

interface ManagerOption {
  id: string
  name: string | null
}

export function DiscrepancyFilters({
  managers,
  status,
  severity,
  managerId,
}: {
  managers: ManagerOption[]
  status: string
  severity: string
  managerId: string
}) {
  const router = useRouter()

  function navigate(next: { status?: string; severity?: string; managerId?: string }) {
    const nextStatus = next.status ?? status
    const nextSeverity = next.severity ?? severity
    const nextManagerId = next.managerId ?? managerId
    const params = new URLSearchParams()
    if (nextStatus && nextStatus !== "pending") params.set("status", nextStatus)
    if (nextSeverity) params.set("severity", nextSeverity)
    if (nextManagerId) params.set("managerId", nextManagerId)
    router.push(`/ai-rop/discrepancies${params.toString() ? `?${params}` : ""}`)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
      <Tabs value={status} onValueChange={(v) => navigate({ status: v })}>
        <TabsList>
          <TabsTrigger value="pending">Ожидают</TabsTrigger>
          <TabsTrigger value="accepted">Принято</TabsTrigger>
          <TabsTrigger value="rejected">Отклонено</TabsTrigger>
          <TabsTrigger value="all">Все</TabsTrigger>
        </TabsList>
      </Tabs>

      <Select value={severity || "__all__"} onValueChange={(v) => navigate({ severity: v === "__all__" ? "" : v })}>
        <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Важность" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Любая важность</SelectItem>
          <SelectItem value="low">Низкая</SelectItem>
          <SelectItem value="medium">Средняя</SelectItem>
          <SelectItem value="high">Высокая</SelectItem>
        </SelectContent>
      </Select>

      {managers.length > 0 && (
        <Select value={managerId || "__all__"} onValueChange={(v) => navigate({ managerId: v === "__all__" ? "" : v })}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Все менеджеры" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Все менеджеры</SelectItem>
            {managers.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

export function ResolveButtons({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<"accepted" | "rejected" | null>(null)

  // Контракт роута resolve: body { action: "accepted" | "rejected" }.
  async function resolve(action: "accepted" | "rejected") {
    setBusy(action)
    try {
      const res = await fetch(`/api/modules/ai-rop/discrepancies/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        toast.error(data?.error || "Не удалось сохранить решение")
        return
      }
      toast.success(action === "accepted" ? "Расхождение принято" : "Расхождение отклонено")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" className="gap-1.5" onClick={() => resolve("accepted")} disabled={busy !== null}>
        {busy === "accepted" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Принять
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => resolve("rejected")} disabled={busy !== null}>
        {busy === "rejected" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
        Отклонить
      </Button>
    </div>
  )
}
