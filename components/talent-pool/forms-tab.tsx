"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Plus, FileText } from "lucide-react"
import { FormConstructor, type FormEntry, type FormFieldItem } from "./form-constructor"
import { FormLinks } from "./form-links"
import type { SourceItem } from "./sources-manager"

// ─── Mock forms ────────────────────────────────────────
const INITIAL_FORMS: FormEntry[] = [
  {
    id: "f1", name: "Общая анкета", type: "external", source: "Сайт компании", placement: "Карьерная страница",
    slug: "obshaya-anketa", slogan: "Присоединяйтесь к нашей команде", applications: 34, active: true,
    fields: [
      { key: "firstName", label: "Имя", enabled: true, required: true, locked: true },
      { key: "lastName", label: "Фамилия", enabled: true, required: true, locked: true },
      { key: "email", label: "Email", enabled: true, required: true, locked: true },
      { key: "phone", label: "Телефон", enabled: true, required: false },
      { key: "position", label: "Должность", enabled: true, required: false },
      { key: "resume", label: "Резюме (файл)", enabled: true, required: false },
    ],
  },
  {
    id: "f2", name: "DevOps набор", type: "external", source: "Telegram", placement: "Канал DevOps Moscow",
    slug: "devops-nabor", slogan: "Ищем DevOps-инженеров", applications: 12, active: true,
    fields: [
      { key: "firstName", label: "Имя", enabled: true, required: true, locked: true },
      { key: "lastName", label: "Фамилия", enabled: true, required: true, locked: true },
      { key: "email", label: "Email", enabled: true, required: true, locked: true },
      { key: "phone", label: "Телефон", enabled: true, required: false },
    ],
  },
  {
    id: "f3", name: "Реферал от команды", type: "internal", source: "Реферал", placement: "Внутри платформы",
    slug: "referal-ot-komandy", slogan: "", applications: 5, active: true,
    fields: [
      { key: "employee", label: "Поиск сотрудника", enabled: true, required: true, locked: true },
      { key: "position", label: "Должность", enabled: true, required: false },
      { key: "comment", label: "Комментарий", enabled: true, required: false },
      { key: "referrer", label: "Кто рекомендовал", enabled: true, required: true, locked: true },
    ],
  },
  {
    id: "f4", name: "Анкета с конференции", type: "external", source: "QR-код", placement: "Стенд HRTech 2026",
    slug: "anketa-konferenciya", slogan: "", applications: 9, active: false,
    fields: [
      { key: "firstName", label: "Имя", enabled: true, required: true, locked: true },
      { key: "email", label: "Email", enabled: true, required: true, locked: true },
      { key: "phone", label: "Телефон", enabled: true, required: false },
      { key: "company", label: "Компания", enabled: true, required: false },
    ],
  },
]

interface FormsTabProps {
  enabledSources: SourceItem[]
}

export function FormsTab({ enabledSources }: FormsTabProps) {
  const [forms, setForms] = useState(INITIAL_FORMS)
  const [selectedFormId, setSelectedFormId] = useState<string | null>("f1")

  const selectedForm = forms.find((f) => f.id === selectedFormId) || null

  const handleSave = (form: FormEntry) => {
    setForms((prev) => {
      const exists = prev.find((f) => f.id === form.id)
      if (exists) return prev.map((f) => f.id === form.id ? form : f)
      return [...prev, form]
    })
    setSelectedFormId(form.id)
  }

  const handleCreateNew = () => {
    setSelectedFormId(null)
  }

  return (
    <div className="space-y-4">
      {/* Горизонтальный список форм */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {forms.map((form) => (
          <button
            key={form.id}
            className={cn(
              "shrink-0 text-left p-3 rounded-lg border transition-all w-52",
              selectedFormId === form.id
                ? "border-primary bg-primary/5 shadow-sm"
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
