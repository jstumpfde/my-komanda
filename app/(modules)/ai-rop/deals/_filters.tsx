"use client"

// Фильтры списка сделок: статус (Tabs), контрагент (Select), канал (Select),
// «Только теневые» (chip), сортировка всегда по последнему касанию (задача Ф1).
// Пишет в query, страница — server component, перечитывает данные при смене query.
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useTransition } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { connectorKindLabel } from "@/lib/salesradar/ui-labels"

interface CounterpartyOption { id: string; name: string }

const STATUS_TABS = [
  { key: "all", label: "Все" },
  { key: "open", label: "Открыта" },
  { key: "won", label: "Выиграна" },
  { key: "lost", label: "Проиграна" },
  { key: "stale", label: "Затихла" },
]

export function DealsFilters({
  counterparties,
  channels,
}: {
  counterparties: CounterpartyOption[]
  channels: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  const status = sp.get("status") || "all"
  const counterpartyId = sp.get("counterparty_id") || "all"
  const channel = sp.get("channel") || "all"
  const shadowOnly = sp.get("shadow") === "1"

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "" || v === "all") params.delete(k)
      else params.set(k, v)
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Tabs value={status} onValueChange={(v) => push({ status: v })}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Select value={counterpartyId} onValueChange={(v) => push({ counterparty_id: v })}>
        <SelectTrigger className="h-9 w-[200px] text-sm">
          <SelectValue placeholder="Контрагент" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все контрагенты</SelectItem>
          {counterparties.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {channels.length > 0 && (
        <Select value={channel} onValueChange={(v) => push({ channel: v })}>
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder="Канал" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все каналы</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c} value={c}>{connectorKindLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        type="button"
        size="sm"
        variant={shadowOnly ? "default" : "outline"}
        className={cn("gap-1.5", shadowOnly && "bg-violet-600 hover:bg-violet-700")}
        onClick={() => push({ shadow: shadowOnly ? null : "1" })}
      >
        <Sparkles className="size-3.5" />
        Только теневые
      </Button>

      {(status !== "all" || counterpartyId !== "all" || channel !== "all" || shadowOnly) && (
        <Button type="button" size="sm" variant="ghost" onClick={() => router.push(pathname)}>
          Сбросить
        </Button>
      )}
    </div>
  )
}
