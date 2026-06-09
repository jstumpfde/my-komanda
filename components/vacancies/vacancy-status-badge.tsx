"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Единый словарь статусов вакансии — единственный источник правды для UI.
// БД-значения остаются как есть (draft/active/published/...). Здесь — только
// человекочитаемые подписи и стили бейджа.
export const VACANCY_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:            { label: "Черновик",          color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
  active:           { label: "Активна",           color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" },
  published:        { label: "Активна",           color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" },
  paused:           { label: "Остановлена",       color: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800" },
  closed_success:   { label: "Закрыта (найден)",  color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  closed_cancelled: { label: "Закрыта (отменена)", color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
  archived:         { label: "Архив",             color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-800" },
}

export function getVacancyStatusLabel(status: string | null | undefined): string {
  if (!status) return "Черновик"
  return VACANCY_STATUS_CONFIG[status]?.label ?? status
}

interface VacancyStatusBadgeProps {
  status: string | null | undefined
  className?: string
  size?: "sm" | "md"
}

export function VacancyStatusBadge({ status, className, size = "md" }: VacancyStatusBadgeProps) {
  const s = status ?? "draft"
  const cfg = VACANCY_STATUS_CONFIG[s]
  const label = cfg?.label ?? s
  const color = cfg?.color ?? "bg-gray-500/10 text-gray-700 border-gray-200"
  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs"
  return (
    <Badge variant="outline" className={cn("shrink-0", sizeClass, color, className)}>
      {label}
    </Badge>
  )
}
