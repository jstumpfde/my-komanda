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
  RotateCcw,
  ClipboardList,
  Trash2,
  GitCompare,
} from "lucide-react"

export type BulkAction =
  | "reject"
  | "invite"
  | "talent_pool"
  | "set_stage"
  | "toggle_favorite"
  | "restore"
  | "send_test"
  | "compare"         // открыть страницу сравнения ответов
  | "trash"           // в «Корзину» (мягкое удаление)
  | "untrash"         // вернуть из «Корзины»
  | "hard_delete"     // удалить навсегда
  | "hh_broadcast"    // полу-ручная рассылка через hh-чат

interface StageOption {
  id: string
  title: string
}

interface BulkActionsBarProps {
  count: number
  stages: StageOption[]
  onClear: () => void
  onAction: (action: BulkAction, payload?: { stage?: string }) => Promise<void> | void
  /**
   * Если true — все выделенные кандидаты сейчас в стадии 'rejected'.
   * Тогда вместо обычных действий показываем кнопку «Вернуть в воронку».
   * Это единственный признак, что bulk_restore доступен — сервер дополнительно
   * валидирует и вернёт 400 если хоть один не в rejected.
   */
  allRejected?: boolean
  /**
   * Режим «Корзина»: выделены удалённые карточки. Показываем «Восстановить»
   * и «Удалить навсегда» вместо обычных действий.
   */
  trashedView?: boolean
  /**
   * Может ли текущий пользователь удалять кандидатов (админ / менеджер-админ /
   * директор). Если нет — кнопки «Удалить» / «Удалить навсегда» скрыты.
   */
  canDelete?: boolean
}

export function BulkActionsBar({ count, stages, onClear, onAction, allRejected = false, trashedView = false, canDelete = false }: BulkActionsBarProps) {
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false)
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false)
  const [confirmTrashOpen, setConfirmTrashOpen] = useState(false)
  const [confirmHardDeleteOpen, setConfirmHardDeleteOpen] = useState(false)
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
          "fixed bottom-4 z-40 -translate-x-1/2",
          // Центрируем по ОБЛАСТИ КОНТЕНТА (правее сайдбара), а не по вьюпорту.
          // Бар — sibling после сайдбара-peer, поэтому читаем его состояние через peer-data.
          // Моб.: сайдбар — оверлей, контент на всю ширину → центр вьюпорта.
          "left-1/2",
          "md:left-[calc(50%+var(--sidebar-width)/2)]",
          "md:peer-data-[state=collapsed]:left-[calc(50%+var(--sidebar-width-icon)/2)]",
          // Ширина по контенту, кап — в пределах области контента (чтобы не вылезал за правый край).
          "w-fit overflow-x-auto",
          "max-w-[calc(100%-2rem)]",
          "md:max-w-[calc(100%-var(--sidebar-width)-2rem)]",
          "md:peer-data-[state=collapsed]:max-w-[calc(100%-var(--sidebar-width-icon)-2rem)]",
          // Колонка: «Выделено N · Снять» сверху-слева, кнопки одной строкой под.
          "flex flex-col items-start gap-2 px-3 py-2.5",
          "rounded-xl border border-border shadow-lg",
          "bg-background/85 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70",
        )}
        role="region"
        aria-label="Массовые действия"
      >
        {/* Left: count + clear */}
        <div className="flex items-center gap-1.5 min-w-0">
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
            <span className="hidden lg:inline">Снять выделение</span>
          </Button>
        </div>

        {/* Actions. Если все выделенные в 'rejected' — показываем только
            «Вернуть в воронку», обычный набор скрываем. flex-wrap, чтобы кнопки
            переносились, а не вылезали за бар (и не заезжали под виджет Нэнси). */}
        <div className="flex w-full items-center gap-1.5 flex-nowrap">
          {trashedView ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2.5 gap-1.5 text-sm text-emerald-700 border-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-300 dark:border-emerald-700"
                disabled={!!busy}
                onClick={() => run("untrash")}
              >
                {busy === "untrash" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                <span className="hidden md:inline">Восстановить</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2.5 gap-1.5 text-sm text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                disabled={!!busy}
                onClick={() => setConfirmHardDeleteOpen(true)}
              >
                {busy === "hard_delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                <span className="hidden md:inline">Удалить навсегда</span>
              </Button>
            </>
          ) : allRejected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2.5 gap-1.5 text-sm text-emerald-700 border-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-300 dark:border-emerald-700"
              disabled={!!busy}
              onClick={() => setConfirmRestoreOpen(true)}
            >
              {busy === "restore" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              <span className="hidden md:inline">Вернуть в воронку</span>
            </Button>
          ) : <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 gap-1.5 text-sm text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            disabled={!!busy}
            onClick={() => setConfirmRejectOpen(true)}
          >
            {busy === "reject" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            <span className="hidden md:inline">Отказать</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 gap-1.5 text-sm text-violet-600 border-violet-300 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-300 dark:border-violet-700"
            disabled={!!busy}
            onClick={() => run("invite")}
          >
            {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : <Calendar className="size-4" />}
            <span className="hidden md:inline">Пригласить</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 gap-1.5 text-sm text-teal-600 border-teal-300 hover:bg-teal-500/10 hover:text-teal-700 dark:text-teal-300 dark:border-teal-700"
            disabled={!!busy}
            onClick={() => run("send_test")}
          >
            {busy === "send_test" ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />}
            <span className="hidden md:inline">Отправить тест</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 gap-1.5 text-sm text-blue-600 border-blue-300 hover:bg-blue-500/10 hover:text-blue-700 dark:text-blue-300 dark:border-blue-700"
            disabled={!!busy}
            onClick={() => run("talent_pool")}
          >
            {busy === "talent_pool" ? <Loader2 className="size-4 animate-spin" /> : <BookmarkPlus className="size-4" />}
            <span className="hidden md:inline">В резерв</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2.5 gap-1.5 text-sm"
                disabled={!!busy}
              >
                {busy === "set_stage" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                <span className="hidden md:inline">Сменить стадию</span>
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
            className="h-8 px-2.5 gap-1.5 text-sm text-amber-600 border-amber-300 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-300 dark:border-amber-700"
            disabled={!!busy}
            onClick={() => run("toggle_favorite")}
          >
            {busy === "toggle_favorite" ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4" />}
            <span className="hidden md:inline">В избранное</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 gap-1.5 text-sm text-indigo-600 border-indigo-300 hover:bg-indigo-500/10 hover:text-indigo-700 dark:text-indigo-300 dark:border-indigo-700"
            disabled={!!busy}
            onClick={() => run("compare")}
          >
            {busy === "compare" ? <Loader2 className="size-4 animate-spin" /> : <GitCompare className="size-4" />}
            <span className="hidden md:inline">Сравнить</span>
          </Button>

          {canDelete && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2.5 gap-1.5 text-sm text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              disabled={!!busy}
              onClick={() => setConfirmTrashOpen(true)}
            >
              {busy === "trash" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              <span className="hidden md:inline">Удалить</span>
            </Button>
          )}
          </>}
        </div>
      </div>

      <AlertDialog open={confirmRestoreOpen} onOpenChange={setConfirmRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Вернуть {count} {pluralize(count, "кандидата", "кандидатов", "кандидатов")} в воронку?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Каждый кандидат вернётся на стадию, с которой он был отклонён (по истории).
              Если истории нет — на «Первичный контакт». Авто-обработка останется выключенной.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmRestoreOpen(false); void run("restore") }}
            >
              Вернуть
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmTrashOpen} onOpenChange={setConfirmTrashOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить {count} {pluralize(count, "карточку", "карточки", "карточек")}?</AlertDialogTitle>
            <AlertDialogDescription>
              Карточки переедут в «Корзину»: пропадут из списков и счётчиков, автоматика по ним остановится.
              Их можно вернуть из «Корзины». Окончательное удаление — оттуда же.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmTrashOpen(false); void run("trash") }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmHardDeleteOpen} onOpenChange={setConfirmHardDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить навсегда {count} {pluralize(count, "карточку", "карточки", "карточек")}?</AlertDialogTitle>
            <AlertDialogDescription>
              Карточки и все связанные данные (тесты, ответы, касания дожима) будут удалены безвозвратно.
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmHardDeleteOpen(false); void run("hard_delete") }}
            >
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
