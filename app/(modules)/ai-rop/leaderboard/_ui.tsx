/**
 * Локальные UI-хелперы страницы «Лидерборд» (медаль топ-3, цвет оценки).
 * Не переиспользуются другими страницами модуля — если понадобятся ещё
 * где-то, поднять в _components/ (чужая зона — координатору).
 */
import { Trophy } from "lucide-react"
import { cn } from "@/lib/utils"

const MEDAL_STYLE: Record<number, string> = {
  1: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  2: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-600",
  3: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
}

/** Топ-3 — кружок-медаль с иконкой Trophy, остальные — просто номер места. */
export function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center size-7 rounded-full border font-bold text-xs",
          MEDAL_STYLE[rank],
        )}
      >
        <Trophy className="size-3.5" />
      </span>
    )
  }
  return <span className="inline-flex items-center justify-center size-7 text-sm font-medium text-muted-foreground">{rank}</span>
}

/** Средняя оценка звонка 0..10 — цвет по порогам (та же шкала, что и в Кабинете РОПа). */
export function scoreColorClass(score: number | null): string {
  if (score == null) return "text-muted-foreground"
  if (score >= 8) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 6) return "text-blue-600 dark:text-blue-400"
  if (score >= 4) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}
