"use client"

// Общая плитка-переключатель (radio-подобная кнопка) для выбора контекста,
// глубины и аудитории разбора на форме /tip. Один активный элемент в группе.

import { cn } from "@/lib/utils"

export function Tile({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-center text-sm font-medium transition-colors",
        active
          ? "border-amber-400 bg-amber-50 text-stone-900 ring-2 ring-amber-300/60"
          : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50",
        className,
      )}
    >
      {children}
    </button>
  )
}
