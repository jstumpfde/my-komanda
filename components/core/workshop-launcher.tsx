"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type WorkshopModule =
  | "knowledge"
  | "learning"
  | "hr"
  | "crm"
  | "adaptation"

export interface WorkshopLauncherProps {
  moduleContext: WorkshopModule
  buttonVariant?: "default" | "outline" | "ghost"
  buttonSize?: "default" | "sm" | "lg"
  className?: string
  buttonLabel?: string
}

// Кнопка-ссылка на полноэкранную страницу Мастерской. Никакого
// собственного состояния — вся логика живёт в /workshop. Параметр
// `from` сохраняется в query, чтобы страница знала, куда возвращать
// пользователя и какой модуль считать контекстом сохранения.
export function WorkshopLauncher({
  moduleContext,
  buttonVariant = "default",
  buttonSize = "default",
  className,
  buttonLabel = "Мастерская",
}: WorkshopLauncherProps) {
  return (
    <Button
      asChild
      variant={buttonVariant}
      size={buttonSize}
      className={cn("gap-1.5", className)}
    >
      <Link href={`/workshop?from=${moduleContext}`}>
        <Sparkles className="w-4 h-4" />
        {buttonLabel}
      </Link>
    </Button>
  )
}
