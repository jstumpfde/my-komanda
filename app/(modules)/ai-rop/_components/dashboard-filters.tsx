"use client"

// Фильтры дашборда/списка звонков AI-РОП: период (пресеты, Tabs-сегмент по
// DESIGN-REFERENCE) + менеджер (Select) + «Только с CRM» (chip-тумблер).
// Пишет в query (?from=&to=&manager_id=&with_crm=&period=all), навигация —
// router.push на тот же basePath (страница — server component, перечитывает
// данные при смене query).
import { useEffect, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Filter } from "lucide-react"
import { isoDate, todayIso } from "./format"

interface Preset { key: string; label: string; range: () => { from: string; to: string } }

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1))
  return x
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

const PRESETS: Preset[] = [
  { key: "today", label: "Сегодня", range: () => ({ from: todayIso(), to: todayIso() }) },
  { key: "yesterday", label: "Вчера", range: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { from: isoDate(d), to: isoDate(d) } } },
  { key: "this_week", label: "Эта неделя", range: () => ({ from: isoDate(startOfWeek(new Date())), to: todayIso() }) },
  { key: "last_week", label: "Пр. неделя", range: () => { const s = startOfWeek(new Date()); const lastEnd = new Date(s); lastEnd.setDate(lastEnd.getDate() - 1); return { from: isoDate(startOfWeek(lastEnd)), to: isoDate(lastEnd) } } },
  { key: "this_month", label: "Этот месяц", range: () => ({ from: isoDate(startOfMonth(new Date())), to: todayIso() }) },
  { key: "last_month", label: "Пр. месяц", range: () => { const s = startOfMonth(new Date()); const lastEnd = new Date(s); lastEnd.setDate(lastEnd.getDate() - 1); return { from: isoDate(startOfMonth(lastEnd)), to: isoDate(lastEnd) } } },
  { key: "all", label: "За всё время", range: () => ({ from: "", to: "" }) },
]

interface ManagerOption { id: string; name: string }

export function DashboardFilters({ managers, basePath = "/ai-rop" }: { managers?: ManagerOption[]; basePath?: string }) {
  const router = useRouter()
  const search = useSearchParams()
  const [, startTransition] = useTransition()

  const fromParam = search.get("from") || ""
  const toParam = search.get("to") || ""
  const managerParam = search.get("manager_id") || ""
  const withCrm = search.get("with_crm") === "true"
  const allParam = search.get("period") === "all"
  const [customFrom, setCustomFrom] = useState(fromParam)
  const [customTo, setCustomTo] = useState(toParam)

  useEffect(() => { setCustomFrom(fromParam); setCustomTo(toParam) }, [fromParam, toParam])

  // Дефолт «Сегодня» при первом заходе без параметров периода.
  useEffect(() => {
    if (!fromParam && !toParam && !allParam) {
      const t = todayIso()
      const params = new URLSearchParams()
      params.set("from", t); params.set("to", t)
      if (managerParam) params.set("manager_id", managerParam)
      if (withCrm) params.set("with_crm", "true")
      router.replace(`${basePath}?${params}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function navigate(next: { from?: string; to?: string; managerId?: string; withCrm?: boolean; period?: "all" }) {
    const params = new URLSearchParams()
    if (next.period === "all") {
      params.set("period", "all")
    } else {
      if (next.from) params.set("from", next.from)
      if (next.to) params.set("to", next.to)
    }
    const mgr = next.managerId !== undefined ? next.managerId : managerParam
    if (mgr) params.set("manager_id", mgr)
    const crm = next.withCrm !== undefined ? next.withCrm : withCrm
    if (crm) params.set("with_crm", "true")
    startTransition(() => router.push(`${basePath}${params.toString() ? `?${params}` : ""}`))
  }

  function activePreset(): string | null {
    if (allParam) return "all"
    if (!fromParam && !toParam) return null
    for (const p of PRESETS) {
      if (p.key === "all") continue
      const r = p.range()
      if (r.from === fromParam && r.to === toParam) return p.key
    }
    return null
  }
  const active = activePreset()

  function applyPreset(key: string) {
    const preset = PRESETS.find((p) => p.key === key)
    if (!preset) return
    if (key === "all") { navigate({ period: "all" }); return }
    const r = preset.range()
    navigate({ from: r.from, to: r.to })
  }

  function applyCustomRange() {
    if (customFrom && customTo) navigate({ from: customFrom, to: customTo })
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
      <Tabs value={active ?? ""} onValueChange={applyPreset}>
        <TabsList className="flex-wrap h-auto">
          {PRESETS.map((p) => (
            <TabsTrigger key={p.key} value={p.key} className="text-xs">{p.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-1.5">
        <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-[140px] text-xs" max={todayIso()} />
        <span className="text-xs text-muted-foreground">—</span>
        <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-[140px] text-xs" max={todayIso()} />
        <Button size="sm" variant="outline" className="h-8" onClick={applyCustomRange}>Период</Button>
      </div>

      <Button
        size="sm"
        variant={withCrm ? "default" : "outline"}
        className="h-8 gap-1.5 text-xs"
        onClick={() => navigate({ withCrm: !withCrm })}
        title={withCrm ? "Сейчас показываются только звонки, привязанные к CRM" : "Показать только звонки с привязкой к Сделке/Лиду/Контакту"}
      >
        <Filter className="size-3.5" /> Только с CRM
      </Button>

      {managers && managers.length > 0 && (
        <Select value={managerParam || "__all__"} onValueChange={(v) => navigate({ managerId: v === "__all__" ? "" : v })}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Все менеджеры" /></SelectTrigger>
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
