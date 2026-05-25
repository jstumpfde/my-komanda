"use client"

// Унифицированные пункты меню действий над вакансией. Используется и в шапке
// вакансии («Действия»), и в строке списка вакансий («...»). Единый источник
// правды по составу/доступности пунктов, чтобы меню не расходились.
//
// Состав (8 пунктов, всегда в одном порядке; недоступные — серые с тултипом):
//   Дублировать · Экспорт в Excel · Остановить · Возобновить ·
//   Закрыть, в архив · Восстановить · В корзину · Удалить навсегда
//
// Доступность зависит от состояния (lib/vacancies/lifecycle.ts):
//   active / paused / closed / trashed.

import type { ElementType } from "react"
import { Copy, Download, Pause, Play, X, RotateCcw, Trash2, Trash, Loader2 } from "lucide-react"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { type VacancyLifecycle, getLifecycleAdjLabel } from "@/lib/vacancies/lifecycle"

export function ActionMenuItem({
  icon: Icon, label, enabled, onClick, disabledReason, busy, destructive,
}: {
  icon: ElementType
  label: string
  enabled: boolean
  onClick: () => void
  disabledReason: string
  busy?: boolean
  destructive?: boolean
}) {
  if (enabled) {
    return (
      <DropdownMenuItem
        className={`gap-2 cursor-pointer${destructive ? " text-destructive focus:text-destructive" : ""}`}
        disabled={busy}
        onClick={onClick}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
        {label}
      </DropdownMenuItem>
    )
  }
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <div
          aria-disabled="true"
          className="relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground/40 cursor-not-allowed select-none"
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          <Icon className="size-3.5" />{label}
        </div>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </UITooltip>
  )
}

export interface VacancyActionsHandlers {
  onDuplicate:       () => void
  onExport:          () => void
  onPause:           () => void
  onResume:          () => void
  onArchive:         () => void  // Закрыть, в архив
  onRestore:         () => void  // из архива или корзины (вызывающий решает по lifecycle)
  onTrash:           () => void  // В корзину
  onPermanentDelete: () => void  // Удалить навсегда (открывает подтверждение)
}

// Возвращает 8 пунктов меню — вставляются внутрь <DropdownMenuContent>.
// TooltipProvider оборачивает пункты (чистый контекст, без DOM) — чтобы
// тултипы недоступных пунктов работали независимо от родительских провайдеров.
export function VacancyActionsMenuItems({
  lifecycle, duplicating, handlers,
}: {
  lifecycle: VacancyLifecycle
  duplicating?: boolean
  handlers: VacancyActionsHandlers
}) {
  const reason = `Недоступно для ${getLifecycleAdjLabel(lifecycle)} вакансии`
  return (
    <TooltipProvider>
      <ActionMenuItem icon={Copy} label="Дублировать" enabled busy={duplicating}
        onClick={handlers.onDuplicate} disabledReason={reason} />
      <ActionMenuItem icon={Download} label="Экспорт в Excel" enabled
        onClick={handlers.onExport} disabledReason={reason} />
      <DropdownMenuSeparator />
      <ActionMenuItem icon={Pause} label="Остановить"
        enabled={lifecycle === "active"}
        onClick={handlers.onPause} disabledReason={reason} />
      <ActionMenuItem icon={Play} label="Возобновить"
        enabled={lifecycle === "paused"}
        onClick={handlers.onResume} disabledReason={reason} />
      <ActionMenuItem icon={X} label="Закрыть, в архив"
        enabled={lifecycle === "active" || lifecycle === "paused"}
        onClick={handlers.onArchive} disabledReason={reason} />
      <ActionMenuItem icon={RotateCcw} label="Восстановить"
        enabled={lifecycle === "closed" || lifecycle === "trashed"}
        onClick={handlers.onRestore} disabledReason={reason} />
      <DropdownMenuSeparator />
      <ActionMenuItem icon={Trash2} label="В корзину"
        enabled={lifecycle !== "trashed"}
        onClick={handlers.onTrash} disabledReason={reason} />
      <ActionMenuItem icon={Trash} label="Удалить навсегда"
        enabled={lifecycle === "trashed"}
        onClick={handlers.onPermanentDelete} disabledReason={reason} destructive />
    </TooltipProvider>
  )
}
