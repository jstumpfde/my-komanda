"use client"

/**
 * Локальные UI-хелперы страницы «Библиотека возражений» (objections/page.tsx).
 * Только эта страница их использует — не выносить в общие _components модуля.
 *
 * Весь файл клиентский: PeriodTabs и ReclusterButton нуждаются в интерактивности
 * (router.push / fetch); CategoryList/RawObjectionsTable сюда добавлены же для
 * простоты — реального клиентского состояния им не нужно (Accordion/Collapsible
 * из shadcn уже сами "use client" и управляют раскрытием без внешнего стейта).
 */
import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

export type PeriodKey = "7" | "30" | "all"

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "7", label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "all", label: "Всё время" },
]

/** Сегмент-контрол периода — навигация через ?period= (без клиентского fetch). */
export function PeriodTabs({ period }: { period: PeriodKey }) {
  const router = useRouter()
  const pathname = usePathname()

  function onChange(value: string) {
    const q = new URLSearchParams()
    if (value !== "30") q.set("period", value)
    router.push(q.toString() ? `${pathname}?${q.toString()}` : pathname)
  }

  return (
    <Tabs value={period} onValueChange={onChange}>
      <TabsList>
        {PERIOD_OPTIONS.map((o) => (
          <TabsTrigger key={o.value} value={o.value}>{o.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/** Кнопка «Посчитать/Пересчитать категории (AI)» → POST /api/modules/ai-rop/objections/recluster. */
export function ReclusterButton({ hasClusters }: { hasClusters: boolean }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function run() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/modules/ai-rop/objections/recluster", { method: "POST" })
      const data = await res.json().catch(() => ({ ok: false, error: "Пустой ответ сервера" }))
      if (!res.ok || !data.ok) {
        toast.error(data.error || "Не удалось пересчитать категории")
        return
      }
      toast.success(`Готово: ${data.categories} категорий, ${data.phrases} формулировок`)
      router.refresh()
    } catch {
      toast.error("Ошибка запроса")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant={hasClusters ? "outline" : "default"} onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Считаю…" : hasClusters ? "Пересчитать категории" : "Посчитать категории"}
      </Button>
      <span className="text-xs text-muted-foreground whitespace-nowrap">Платный AI-пересчёт</span>
    </div>
  )
}

export interface ObjectionCategory {
  name: string
  count: number
  phrases: { text: string; count: number }[]
}

/** Категории (после AI-кластеризации) — раскрывающиеся карточки с барами и списком формулировок. */
export function CategoryList({ categories }: { categories: ObjectionCategory[] }) {
  const max = Math.max(1, ...categories.map((c) => c.count))
  return (
    <Accordion type="multiple" className="flex flex-col gap-2">
      {categories.map((c) => (
        <AccordionItem key={c.name} value={c.name} className="border rounded-xl bg-card px-5">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium truncate">{c.name}</span>
                <span className="text-sm font-semibold tabular-nums text-violet-600 shrink-0">{c.count}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-600"
                  style={{ width: `${Math.max(4, Math.round((c.count / max) * 100))}%` }}
                />
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <ul className="flex flex-col gap-1.5 pt-1 border-t">
              {c.phrases.slice(0, 20).map((p) => (
                <li key={p.text} className="flex items-center justify-between gap-3 text-sm pt-1.5">
                  <span className="text-muted-foreground truncate" title={p.text}>{p.text}</span>
                  <span className="tabular-nums text-xs text-muted-foreground shrink-0">{p.count}</span>
                </li>
              ))}
            </ul>
            {c.phrases.length > 20 && (
              <p className="text-xs text-muted-foreground pt-2">+ ещё {c.phrases.length - 20} формулировок</p>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

/** Без кластеризации — просто топ сырых формулировок с частотой. */
export function RawObjectionsTable({ rows }: { rows: { text: string; count: number }[] }) {
  return (
    <TableCard>
      <DataTable>
        <DataHead>
          <DataHeadCell width="56px">#</DataHeadCell>
          <DataHeadCell>Формулировка</DataHeadCell>
          <DataHeadCell align="right" width="110px">Частота</DataHeadCell>
        </DataHead>
        <tbody>
          {rows.map((r, i) => (
            <DataRow key={r.text}>
              <DataCell className="text-muted-foreground tabular-nums">{i + 1}</DataCell>
              <DataCell>{r.text}</DataCell>
              <DataCell align="right" className="tabular-nums font-medium">{r.count}</DataCell>
            </DataRow>
          ))}
        </tbody>
      </DataTable>
    </TableCard>
  )
}
