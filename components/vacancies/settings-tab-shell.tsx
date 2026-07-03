"use client"

// Пресет-обёртка ширины контента для под-табов вакансии (секция «Настройки»
// и соседние верхние табы). Юрий (03.07): часть табов узкая (~1000px) при
// пустом месте справа на широких экранах — вместо точечных фиксов заводим
// 2-3 пресета ширины и назначаем по смыслу таба.
//
// Выравнивание всегда влево (НЕ mx-auto) — как было раньше у max-w-3xl.

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type SettingsTabWidth = "md" | "lg" | "full"

/** Класс max-width для каждого пресета. Используется и в SettingsTabShell,
 *  и напрямую в VacancyTabFooter (чтобы футер унаследовал ту же ширину,
 *  если он не рендерится физически внутри shell). */
export const SETTINGS_TAB_WIDTH_CLASS: Record<SettingsTabWidth, string> = {
  md: "max-w-4xl",
  lg: "max-w-6xl",
  full: "w-full",
}

export interface SettingsTabShellProps {
  width: SettingsTabWidth
  children: ReactNode
  className?: string
}

export function SettingsTabShell({ width, children, className }: SettingsTabShellProps) {
  return (
    <div className={cn("w-full", SETTINGS_TAB_WIDTH_CLASS[width], className)}>
      {children}
    </div>
  )
}
