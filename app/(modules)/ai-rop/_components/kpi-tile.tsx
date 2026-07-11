// KPI-плитка дашборда AI-РОП. «Stretch-flow» компоновка (бэклог ca 10.07,
// см. AI-ROP-MODULE-PLAN п.14 — «группировка 2+3+4»): группы карточек лежат
// в отдельных flex-wrap рядах и растягиваются на всю ширину ряда (flex-1),
// а не сжаты в жёсткую grid-сетку одинакового размера — крупные метрики
// (Всего/Проанализировано) визуально крупнее второстепенных.
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function KpiRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-3 flex flex-wrap gap-3", className)}>{children}</div>
}

export function KpiTile({
  icon: Icon, label, value, color, size = "md",
}: {
  icon: LucideIcon
  label: string
  value: string
  color?: string
  size?: "lg" | "md" | "sm"
}) {
  return (
    <div
      className={cn(
        "min-w-[150px] flex-1 rounded-xl border bg-card p-4",
        size === "lg" && "min-w-[200px] basis-[240px]",
        size === "sm" && "min-w-[120px]"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("size-4 shrink-0", color ?? "text-muted-foreground")} />
      </div>
      <div className={cn("font-bold leading-none tabular-nums", size === "lg" ? "text-3xl" : "text-2xl")}>{value}</div>
    </div>
  )
}
