"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Download, Loader2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { CANDIDATE_EXPORT_FIELDS, CANDIDATE_EXPORT_FIELD_KEYS } from "@/lib/candidates-export-fields"
import { ALL_STAGE_SLUGS, getStageLabel } from "@/lib/stages"

interface ExportCandidatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vacancyId: string
  selectedIds: string[]
}

type Scope = "all" | "selected" | "status"

export function ExportCandidatesDialog({ open, onOpenChange, vacancyId, selectedIds }: ExportCandidatesDialogProps) {
  const hasSelection = selectedIds.length > 0
  const [scope, setScope] = useState<Scope>("all")
  const [statuses, setStatuses] = useState<Set<string>>(new Set())
  const [fields, setFields] = useState<Set<string>>(new Set(CANDIDATE_EXPORT_FIELD_KEYS))
  const [busy, setBusy] = useState(false)

  const effectiveScope: Scope = scope === "selected" && !hasSelection ? "all" : scope

  const toggleField = (key: string) => setFields(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })
  const toggleStatus = (s: string) => setStatuses(prev => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n
  })

  const handleExport = async () => {
    if (fields.size === 0) { toast.error("Выберите хотя бы одно поле"); return }
    if (effectiveScope === "status" && statuses.size === 0) { toast.error("Выберите хотя бы один статус"); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/export-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: effectiveScope,
          candidateIds: effectiveScope === "selected" ? selectedIds : undefined,
          statuses: effectiveScope === "status" ? Array.from(statuses) : undefined,
          fields: Array.from(fields),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error || "Не удалось выгрузить")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "candidates.xlsx" // имя из Content-Disposition подставит браузер
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("Экспорт готов")
      onOpenChange(false)
    } catch {
      toast.error("Ошибка сети при экспорте")
    } finally {
      setBusy(false)
    }
  }

  const allFieldsOn = fields.size === CANDIDATE_EXPORT_FIELD_KEYS.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Шире на десктопе (22 колонки в 3 ряда), на мобиле — узкая с 2 рядами */}
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Экспорт кандидатов в Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Охват */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Кого выгружать</p>
            <RadioGroup value={effectiveScope} onValueChange={(v) => setScope(v as Scope)}>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <RadioGroupItem value="all" id="exp-all" />
                <span>Всех кандидатов</span>
              </label>
              <label className={`flex items-center gap-2 text-sm ${hasSelection ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}>
                <RadioGroupItem value="selected" id="exp-sel" disabled={!hasSelection} />
                <span>Только выделенных{hasSelection ? ` (${selectedIds.length})` : " — ничего не выделено"}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <RadioGroupItem value="status" id="exp-status" />
                <span>По статусам</span>
              </label>
            </RadioGroup>

            {effectiveScope === "status" && (
              <div className="mt-2 ml-1 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border p-2.5">
                {ALL_STAGE_SLUGS.map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer text-xs">
                    <Checkbox checked={statuses.has(s)} onCheckedChange={() => toggleStatus(s)} />
                    <span>{getStageLabel(s)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Поля */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Какие колонки</p>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setFields(allFieldsOn ? new Set() : new Set(CANDIDATE_EXPORT_FIELD_KEYS))}
              >
                {allFieldsOn ? "Снять все" : "Выбрать все"}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
              {CANDIDATE_EXPORT_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={fields.has(key)} onCheckedChange={() => toggleField(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Отмена</Button>
          <Button onClick={handleExport} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Выгрузить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
