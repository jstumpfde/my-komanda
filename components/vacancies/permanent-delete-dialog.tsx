"use client"

// Подтверждение необратимого удаления вакансии из корзины. Кнопка «Удалить
// навсегда» активна только когда введено точное название вакансии.
// Используется и в шапке вакансии, и в строке списка.

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, Trash } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Impact { title: string; candidates: number; messages: number }

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`
  return `${n} ${many}`
}

export function PermanentDeleteDialog({
  open, onOpenChange, vacancyId, vacancyTitle, onDeleted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  vacancyId: string
  vacancyTitle: string
  onDeleted?: () => void
}) {
  const [impact, setImpact] = useState<Impact | null>(null)
  const [typed, setTyped] = useState("")
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) { setTyped(""); setImpact(null); return }
    fetch(`/api/modules/hr/vacancies/${vacancyId}/delete-impact`)
      .then(r => r.ok ? r.json() : null)
      .then((d: Impact | null) => { if (d) setImpact(d) })
      .catch(() => {})
  }, [open, vacancyId])

  const confirmed = typed.trim() === (vacancyTitle ?? "").trim() && (vacancyTitle ?? "").trim().length > 0

  const handleDelete = async () => {
    if (!confirmed) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/permanent`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Вакансия удалена навсегда")
      onOpenChange(false)
      onDeleted?.()
    } catch {
      toast.error("Не удалось удалить вакансию")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            Удалить вакансию «{vacancyTitle}»?
          </DialogTitle>
          <DialogDescription>Это действие необратимо.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Будет удалено: вакансия
            {impact && (
              <>
                , {plural(impact.candidates, "кандидат", "кандидата", "кандидатов")}
                {" "}(привязанных только к ней)
                , {plural(impact.messages, "сообщение", "сообщения", "сообщений")}
              </>
            )}
            .
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-title" className="text-xs">
              Введите название вакансии для подтверждения:
            </Label>
            <Input
              id="confirm-title"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={vacancyTitle}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Отмена
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!confirmed || deleting} className="gap-1.5">
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash className="size-4" />}
            Удалить навсегда
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
