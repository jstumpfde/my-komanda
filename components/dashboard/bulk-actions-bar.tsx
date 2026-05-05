"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  XCircle,
  Calendar,
  BookmarkPlus,
  ArrowRight,
  Star,
  X,
  Loader2,
} from "lucide-react"

export type BulkAction =
  | "reject"
  | "invite"
  | "talent_pool"
  | "set_stage"
  | "toggle_favorite"

interface StageOption {
  id: string
  title: string
}

interface BulkActionsBarProps {
  count: number
  stages: StageOption[]
  onClear: () => void
  onAction: (action: BulkAction, payload?: { stage?: string }) => Promise<void> | void
}

export function BulkActionsBar({ count, stages, onClear, onAction }: BulkActionsBarProps) {
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false)
  const [busy, setBusy] = useState<BulkAction | null>(null)

  if (count === 0) return null

  const run = async (action: BulkAction, payload?: { stage?: string }) => {
    setBusy(action)
    try {
      await onAction(action, payload)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div
        className={cn(
          "fixed bottom-4 left-1/2 -translate-x-1/2 z-40",
          "w-[calc(100%-2rem)] max-w-3xl",
          "flex items-center gap-3 px-4 py-2.5",
          "rounded-xl border border-border shadow-lg",
          "bg-background/85 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70",
        )}
        role="region"
        aria-label="Массовые действия"
      >
        {/* Left: count + clear */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium whitespace-nowrap">
            Выделено {count}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground gap-1"
            onClick={onClear}
          >
            <X className="size-3.5" />
            <span className="hidden sm:inline">Снять выделение</span>
          </Button>
        </div>

        <div className="flex-1" />

        {/* Right: 5 actions */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            disabled={!!busy}
            onClick={() => setConfirmRejectOpen(true)}
          >
            {busy === "reject" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            <span className="hidden sm:inline">Отказать</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-violet-600 border-violet-300 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-300 dark:border-violet-700"
            disabled={!!busy}
            onClick={() => run("invite")}
          >
            {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : <Calendar className="size-4" />}
            <span className="hidden sm:inline">Пригласить</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-500/10 hover:text-blue-700 dark:text-blue-300 dark:border-blue-700"
            disabled={!!busy}
            onClick={() => run("talent_pool")}
          >
            {busy === "talent_pool" ? <Loader2 className="size-4 animate-spin" /> : <BookmarkPlus className="size-4" />}
            <span className="hidden sm:inline">В резерв</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={!!busy}
              >
                {busy === "set_stage" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                <span className="hidden sm:inline">В стейдж</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
              <DropdownMenuLabel>Перевести на этап</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {stages.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onSelect={() => run("set_stage", { stage: s.id })}
                >
                  {s.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-300 dark:border-amber-700"
            disabled={!!busy}
            onClick={() => run("toggle_favorite")}
          >
            {busy === "toggle_favorite" ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4" />}
            <span className="hidden sm:inline">В избранное</span>
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmRejectOpen} onOpenChange={setConfirmRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отказать {count} {pluralize(count, "кандидату", "кандидатам", "кандидатам")}?</AlertDialogTitle>
            <AlertDialogDescription>
              Действие переведёт всех выделенных кандидатов в статус «Отказ» и остановит автоматическую обработку. Отменить можно вручную через карточку кандидата.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmRejectOpen(false); void run("reject") }}
            >
              Отказать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
