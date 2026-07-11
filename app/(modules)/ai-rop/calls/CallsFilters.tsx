"use client"

// Фильтры списка звонков AI-РОП: период (пресеты) + поиск по транскрипту +
// тип/тональность/статус/длительность/менеджер. Пишет в query, страница
// (server component) перечитывает при навигации.
import { useEffect, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search } from "lucide-react"
import { isoDate, todayIso } from "../_components/format"

interface Preset { key: string; label: string; range: () => { from: string; to: string } }
function startOfWeek(d: Date): Date { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - (day === 0 ? 6 : day - 1)); return x }
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }

const PRESETS: Preset[] = [
  { key: "today", label: "Сегодня", range: () => ({ from: todayIso(), to: todayIso() }) },
  { key: "yesterday", label: "Вчера", range: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { from: isoDate(d), to: isoDate(d) } } },
  { key: "this_week", label: "Эта неделя", range: () => ({ from: isoDate(startOfWeek(new Date())), to: todayIso() }) },
  { key: "this_month", label: "Этот месяц", range: () => ({ from: isoDate(startOfMonth(new Date())), to: todayIso() }) },
  { key: "all", label: "За всё время", range: () => ({ from: "", to: "" }) },
]

interface ManagerOption { id: string; name: string }

export function CallsFilters({ managers }: { managers?: ManagerOption[] }) {
  const router = useRouter()
  const search = useSearchParams()
  const [, startTransition] = useTransition()

  const fromParam = search.get("from") || ""
  const toParam = search.get("to") || ""
  const allParam = search.get("period") === "all"
  const [q, setQ] = useState(search.get("q") || "")

  useEffect(() => { setQ(search.get("q") || "") }, [search])

  useEffect(() => {
    if (!fromParam && !toParam && !allParam) {
      const t = todayIso()
      const params = new URLSearchParams(search.toString())
      params.set("from", t); params.set("to", t)
      router.replace(`/ai-rop/calls?${params}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set(key: string, value: string) {
    const params = new URLSearchParams(search.toString())
    params.delete("period")
    if (value) params.set(key, value); else params.delete(key)
    startTransition(() => router.push(`/ai-rop/calls?${params}`))
  }

  function applyPreset(key: string) {
    const params = new URLSearchParams(search.toString())
    if (key === "all") {
      params.delete("from"); params.delete("to"); params.set("period", "all")
    } else {
      const r = PRESETS.find((p) => p.key === key)!.range()
      params.delete("period"); params.set("from", r.from); params.set("to", r.to)
    }
    startTransition(() => router.push(`/ai-rop/calls?${params}`))
  }

  function activePreset(): string | null {
    if (allParam) return "all"
    for (const p of PRESETS) {
      if (p.key === "all") continue
      const r = p.range()
      if (r.from === fromParam && r.to === toParam) return p.key
    }
    return null
  }
  const active = activePreset()

  function submitSearch(e: React.FormEvent) { e.preventDefault(); set("q", q) }

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Button key={p.key} size="sm" variant={active === p.key ? "default" : "outline"} className="h-7 text-xs" onClick={() => applyPreset(p.key)}>{p.label}</Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по транскрипту…" className="h-8 pl-7 text-xs" />
          </div>
        </form>
        <Select value={search.get("type") || "__all__"} onValueChange={(v) => set("type", v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Все типы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Все типы</SelectItem>
            <SelectItem value="call">Звонки</SelectItem>
            <SelectItem value="chat">Чаты</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="meeting">Встречи</SelectItem>
          </SelectContent>
        </Select>
        <Select value={search.get("sentiment") || "__all__"} onValueChange={(v) => set("sentiment", v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Все настроения" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Все настроения</SelectItem>
            <SelectItem value="positive">Позитив</SelectItem>
            <SelectItem value="neutral">Нейтрально</SelectItem>
            <SelectItem value="negative">Негатив</SelectItem>
          </SelectContent>
        </Select>
        <Select value={search.get("status") || "__all__"} onValueChange={(v) => set("status", v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Все статусы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Все статусы</SelectItem>
            <SelectItem value="done">Готово</SelectItem>
            <SelectItem value="pending">В очереди</SelectItem>
            <SelectItem value="no_recording">Без записи</SelectItem>
            <SelectItem value="failed">Ошибка</SelectItem>
          </SelectContent>
        </Select>
        {managers && managers.length > 0 && (
          <Select value={search.get("manager_id") || "__all__"} onValueChange={(v) => set("manager_id", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Все менеджеры" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Все менеджеры</SelectItem>
              {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}
