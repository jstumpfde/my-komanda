// Одна группа «Точек внимания» — карточка категории со списком строк.
// Server-компонент (без интерактивности), используется только на
// /ai-rop/attention.
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { AttentionItem } from "@/lib/ai-rop/attention"

export function AttentionCategoryCard({
  icon: Icon,
  title,
  items,
}: {
  icon: LucideIcon
  title: string
  items: AttentionItem[]
}) {
  const urgentCount = items.filter((i) => i.urgent).length

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="size-4 text-violet-600" /> {title}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {urgentCount > 0 && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                срочных: {urgentCount}
              </Badge>
            )}
            <span>всего: {items.length}</span>
          </div>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {items.map((it) => (
            <Link
              key={it.id}
              href={it.href}
              className="flex items-start justify-between gap-3 py-2.5 text-sm hover:bg-muted/40 -mx-1 px-1 rounded transition-colors"
            >
              <span className="flex-1">
                {it.text}
                {it.managerName && (
                  <span className="ml-2 text-xs text-muted-foreground">· менеджер: {it.managerName}</span>
                )}
              </span>
              {it.urgent && (
                <Badge variant="outline" className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  срочно
                </Badge>
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
