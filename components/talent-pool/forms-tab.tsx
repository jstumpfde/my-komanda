"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Plus, FileText, ChevronDown, ChevronRight, LayoutGrid, List, Trash2 } from "lucide-react"
import { FormConstructor, type FormEntry, type FormFieldItem } from "./form-constructor"
import { FormLinks } from "./form-links"
import type { SourceItem } from "./sources-manager"

// Серверная строка формы → FormEntry для UI.
interface ServerForm {
  id: string; name: string; type: "internal" | "external"; source: string
  placement: string; slug: string; slogan: string
  fieldsJson: FormFieldItem[]; active: boolean; applicationsCount: number
}
function toEntry(r: ServerForm): FormEntry {
  return {
    id: r.id, name: r.name, type: r.type, source: r.source, placement: r.placement,
    slug: r.slug, slogan: r.slogan, fields: Array.isArray(r.fieldsJson) ? r.fieldsJson : [],
    applications: r.applicationsCount ?? 0, active: r.active,
  }
}

interface FormsTabProps {
  enabledSources: SourceItem[]
}

export function FormsTab({ enabledSources }: FormsTabProps) {
  const [forms, setForms] = useState<FormEntry[]>([])
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [formsCollapsed, setFormsCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/hr/talent-pool/forms")
      const data = await res.json() as { forms?: ServerForm[] }
      const mapped = (data.forms ?? []).map(toEntry)
      setForms(mapped)
      setSelectedFormId(prev => prev ?? mapped[0]?.id ?? null)
    } catch { /* пусто */ }
  }, [])

  useEffect(() => { load() }, [load])

  const selectedForm = forms.find((f) => f.id === selectedFormId) || null

  // existsOnServer: форма уже сохранена (id есть в загруженном списке) → PUT, иначе POST.
  const handleSave = async (form: FormEntry) => {
    const existsOnServer = forms.some((f) => f.id === form.id)
    const url = existsOnServer
      ? `/api/modules/hr/talent-pool/forms/${form.id}`
      : "/api/modules/hr/talent-pool/forms"
    const res = await fetch(url, {
      method: existsOnServer ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (!res.ok) { toast.error("Не удалось сохранить форму"); return }
    const data = await res.json() as { form?: ServerForm }
    if (data.form) setSelectedFormId(data.form.id)
    await load()
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/modules/hr/talent-pool/forms/${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Не удалось удалить"); return }
    setForms(prev => prev.filter(f => f.id !== id))
    if (selectedFormId === id) setSelectedFormId(null)
    toast.success("Форма удалена")
  }

  const handleCreateNew = () => {
    setSelectedFormId(null)
  }

  return (
    <div className="space-y-4">
      {/* Заголовок + переключатели */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
          onClick={() => setFormsCollapsed((v) => !v)}
        >
          {formsCollapsed
            ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          }
          Формы
          <span className="text-xs font-normal text-muted-foreground ml-1">{forms.length}</span>
        </button>
        <div className="flex items-center gap-1">
          {selectedForm && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="Удалить форму" onClick={() => handleDelete(selectedForm.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", viewMode === "grid" && "bg-muted")}
            onClick={() => setViewMode("grid")}
            title="Плитки"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", viewMode === "list" && "bg-muted")}
            onClick={() => setViewMode("list")}
            title="Список"
          >
            <List className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Список форм — плитки или список */}
      {!formsCollapsed && (
        viewMode === "grid" ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {forms.map((form) => (
              <button
                key={form.id}
                className={cn(
                  "shrink-0 text-left p-3 rounded-lg border transition-all w-52",
                  selectedFormId === form.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/20"
                )}
                onClick={() => setSelectedFormId(form.id)}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold truncate">{form.name}</p>
                  <Badge variant="outline" className={cn("text-[9px] border-transparent shrink-0 ml-1", form.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>
                    {form.active ? "Активна" : "Неактив."}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className={cn("text-[9px] border-transparent", form.type === "internal" ? "bg-purple-500/10 text-purple-700" : "bg-blue-500/10 text-blue-700")}>
                    {form.type === "internal" ? "Внутр." : "Внешн."}
                  </Badge>
                  <span>{form.source}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{form.applications} заявок</p>
              </button>
            ))}
            <button
              className="shrink-0 flex flex-col items-center justify-center w-40 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-muted/20 transition-colors"
              onClick={handleCreateNew}
            >
              <Plus className="w-5 h-5 text-muted-foreground mb-1" />
              <span className="text-xs text-muted-foreground">Создать новую</span>
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {forms.map((form) => (
              <button
                key={form.id}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left",
                  selectedFormId === form.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/20"
                )}
                onClick={() => setSelectedFormId(form.id)}
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold truncate flex-1">{form.name}</span>
                <Badge variant="outline" className={cn("text-[9px] border-transparent shrink-0", form.type === "internal" ? "bg-purple-500/10 text-purple-700" : "bg-blue-500/10 text-blue-700")}>
                  {form.type === "internal" ? "Внутр." : "Внешн."}
                </Badge>
                <span className="text-[11px] text-muted-foreground shrink-0">{form.source}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{form.applications} заявок</span>
                <Badge variant="outline" className={cn("text-[9px] border-transparent shrink-0", form.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>
                  {form.active ? "Активна" : "Неактив."}
                </Badge>
              </button>
            ))}
            <button
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-muted/20 transition-colors"
              onClick={handleCreateNew}
            >
              <Plus className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Создать новую</span>
            </button>
          </div>
        )
      )}

      {/* Конструктор + Ссылки */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Левая колонка — конструктор */}
        <div className="lg:col-span-3">
          <FormConstructor
            enabledSources={enabledSources}
            editForm={selectedForm}
            onSave={handleSave}
          />
        </div>

        {/* Правая колонка — ссылки */}
        <div className="lg:col-span-2">
          <FormLinks />
        </div>
      </div>
    </div>
  )
}
