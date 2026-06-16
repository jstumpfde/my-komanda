"use client"

// Контролы связи анкеты вакансии с библиотекой шаблонов анкет
// (questionnaire_templates, миграция 0147):
//  • «Загрузить из шаблона» — подставляет вопросы шаблона в редактор (HR дальше
//    правит и сохраняет вакансию как обычно);
//  • «Сохранить как шаблон» — кладёт текущие вопросы в библиотеку.
// Сам редактор и сохранение вакансии не трогаем — работаем только с questions.

import { useState } from "react"
import { Download, Save, Loader2, FileText, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { type Question } from "@/lib/course-types"
import { toast } from "sonner"

interface QTemplate {
  id: string
  name: string
  type: "candidate" | "client" | "post_demo"
  questions: Question[]
  isSystem: boolean
}

const TYPE_LABEL: Record<string, string> = {
  candidate: "Кандидат", client: "Заказчик", post_demo: "После демо",
}

export function AnketaTemplateControls({
  questions, onChange,
  hideButtons = false,
  saveOpen: saveOpenProp,
  onSaveOpenChange,
}: {
  questions: Question[]
  onChange: (q: Question[]) => void
  /** Скрыть инлайн-кнопки — например, когда триггер сохранения снаружи (дропдаун «Действия»). */
  hideButtons?: boolean
  /** Управляемое открытие диалога «Сохранить как шаблон» (если триггерим снаружи). */
  saveOpen?: boolean
  onSaveOpenChange?: (open: boolean) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saveOpenInternal, setSaveOpenInternal] = useState(false)
  const saveOpen = saveOpenProp ?? saveOpenInternal
  const setSaveOpen = onSaveOpenChange ?? setSaveOpenInternal
  const [list, setList] = useState<QTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [saveType, setSaveType] = useState<"candidate" | "client" | "post_demo">("candidate")
  const [saving, setSaving] = useState(false)

  const openPicker = () => {
    setPickerOpen(true)
    setLoading(true)
    fetch("/api/questionnaire-templates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rows = d?.data ?? d
        setList(Array.isArray(rows) ? rows : [])
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  const applyTemplate = (tpl: QTemplate) => {
    const next = Array.isArray(tpl.questions) ? tpl.questions : []
    // Свежие id, чтобы не пересекались с уже существующими в редакторе.
    const stamped = next.map((q, i) => ({ ...q, id: `q-tpl-${Date.now()}-${i}` }))
    onChange(stamped)
    setPickerOpen(false)
    toast.success(`Загружено из шаблона «${tpl.name}» (${stamped.length} вопр.)`)
  }

  const saveAsTemplate = async () => {
    if (!saveName.trim()) { toast.error("Введите название шаблона"); return }
    if (questions.length === 0) { toast.error("Нет вопросов для сохранения"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/questionnaire-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), type: saveType, questions }),
      })
      if (!res.ok) { toast.error("Не удалось сохранить шаблон"); return }
      toast.success("Анкета сохранена в библиотеку")
      setSaveOpen(false)
      setSaveName("")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={hideButtons ? "contents" : "flex flex-wrap items-center gap-2"}>
      {!hideButtons && (
        <>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8" onClick={openPicker}>
            <Download className="h-3.5 w-3.5" />Загрузить из шаблона
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => setSaveOpen(true)}
            disabled={questions.length === 0}
            title={questions.length === 0 ? "Сначала добавьте вопросы" : "Сохранить текущие вопросы как шаблон"}
          >
            <Save className="h-3.5 w-3.5" />Сохранить как шаблон
          </Button>
        </>
      )}

      {/* Picker (только в инлайн-режиме) */}
      {!hideButtons && (
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Загрузить анкету из шаблона</DialogTitle>
            <DialogDescription>
              {questions.length > 0
                ? "Текущие вопросы будут заменены вопросами шаблона."
                : "Вопросы шаблона добавятся в анкету."}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Загрузка...
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Нет шаблонов анкет</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Создайте их в разделе «Библиотека → Анкеты»</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[50vh] overflow-auto">
              {list.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tpl.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABEL[tpl.type] ?? "Анкета"} · {Array.isArray(tpl.questions) ? tpl.questions.length : 0} вопр.
                      {tpl.isSystem ? " · системный" : ""}
                    </p>
                  </div>
                  <Check className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      )}

      {/* Save as template */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Сохранить анкету в библиотеку</DialogTitle>
            <DialogDescription>Текущие {questions.length} вопр. станут переиспользуемым шаблоном.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name" className="text-xs">Название</Label>
              <Input id="tpl-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Например: Анкета менеджера продаж" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Тип</Label>
              <Select value={saveType} onValueChange={(v) => setSaveType(v as typeof saveType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="candidate">Кандидат</SelectItem>
                  <SelectItem value="client">Заказчик</SelectItem>
                  <SelectItem value="post_demo">После демо</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)} disabled={saving}>Отмена</Button>
            <Button size="sm" onClick={saveAsTemplate} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Сохранить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
