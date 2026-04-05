"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  ClipboardList, Plus, Globe, Code, QrCode, Copy, CheckCircle2,
} from "lucide-react"

// ─── Types ─────────────────────────────────────────────
interface FormField {
  key: string
  label: string
  enabled: boolean
}

interface CollectionForm {
  id: string
  name: string
  active: boolean
  fields: string[]
  placement: "platform" | "embed" | "qr"
  applications: number
  embedCode?: string
}

const PLACEMENT_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  platform: { label: "Платформа", icon: Globe },
  embed: { label: "Embed на сайт", icon: Code },
  qr: { label: "QR-код", icon: QrCode },
}

const ALL_FIELDS: FormField[] = [
  { key: "name", label: "Имя", enabled: true },
  { key: "email", label: "Email", enabled: true },
  { key: "phone", label: "Телефон", enabled: true },
  { key: "position", label: "Должность", enabled: false },
  { key: "company", label: "Компания", enabled: false },
  { key: "resume", label: "Резюме", enabled: false },
]

const INITIAL_FORMS: CollectionForm[] = [
  {
    id: "f1",
    name: "Общая форма Talent Pool",
    active: true,
    fields: ["Имя", "Фамилия", "Email", "Телефон", "Должность", "Резюме"],
    placement: "platform",
    applications: 15,
  },
  {
    id: "f2",
    name: "Экспресс-заявка для сайта",
    active: true,
    fields: ["Имя", "Телефон", "Позиция"],
    placement: "embed",
    applications: 28,
    embedCode: `<iframe src="https://company24.pro/embed/express-form" width="100%" height="400" frameborder="0"></iframe>`,
  },
  {
    id: "f3",
    name: "Анкета с конференции",
    active: false,
    fields: ["Имя", "Email", "Телефон", "Компания"],
    placement: "qr",
    applications: 9,
  },
]

interface FormsManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FormsManager({ open, onOpenChange }: FormsManagerProps) {
  const [forms, setForms] = useState(INITIAL_FORMS)
  const [createMode, setCreateMode] = useState(false)
  const [newName, setNewName] = useState("")
  const [newFields, setNewFields] = useState<FormField[]>(ALL_FIELDS.map((f) => ({ ...f })))
  const [newPlacement, setNewPlacement] = useState<"platform" | "embed" | "qr">("platform")
  const [copiedEmbed, setCopiedEmbed] = useState<string | null>(null)

  const handleCreate = () => {
    if (!newName.trim()) return
    const enabledFields = newFields.filter((f) => f.enabled).map((f) => f.label)
    setForms((prev) => [...prev, {
      id: `f-${Date.now()}`,
      name: newName.trim(),
      active: true,
      fields: enabledFields,
      placement: newPlacement,
      applications: 0,
    }])
    setNewName("")
    setNewFields(ALL_FIELDS.map((f) => ({ ...f })))
    setNewPlacement("platform")
    setCreateMode(false)
    toast.success("Форма создана")
  }

  const handleCopyEmbed = (formId: string, code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedEmbed(formId)
    toast.success("Код скопирован")
    setTimeout(() => setCopiedEmbed(null), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Формы сбора кандидатов
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {forms.map((form) => {
            const placement = PLACEMENT_LABELS[form.placement]
            const PlacementIcon = placement.icon
            return (
              <Card key={form.id} className={cn(!form.active && "opacity-60")}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{form.name}</p>
                      <Badge variant="outline" className={cn("text-[10px]", form.active ? "bg-emerald-500/10 text-emerald-700 border-transparent" : "bg-muted text-muted-foreground border-transparent")}>
                        {form.active ? "Активна" : "Неактивна"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{form.applications} заявок</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <PlacementIcon className="w-3 h-3" />
                      <span>{placement.label}</span>
                    </div>
                    <span>Поля: {form.fields.join(", ")}</span>
                  </div>
                  {form.embedCode && (
                    <div className="flex items-start gap-2 mt-2 p-2 bg-muted/30 rounded border">
                      <code className="flex-1 text-[10px] text-muted-foreground break-all">{form.embedCode}</code>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleCopyEmbed(form.id, form.embedCode!)}>
                        {copiedEmbed === form.id ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {createMode ? (
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
            <p className="text-xs font-semibold text-muted-foreground">Новая форма</p>
            <div className="grid gap-1">
              <Label className="text-xs">Название</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название формы" className="h-8 text-sm" />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Поля формы</Label>
              <div className="grid grid-cols-3 gap-2">
                {newFields.map((field, i) => (
                  <label key={field.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={field.enabled}
                      onCheckedChange={(checked) => {
                        setNewFields((prev) => prev.map((f, j) => j === i ? { ...f, enabled: !!checked } : f))
                      }}
                    />
                    <span className="text-xs">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Тип размещения</Label>
              <div className="flex gap-2">
                {(["platform", "embed", "qr"] as const).map((type) => {
                  const p = PLACEMENT_LABELS[type]
                  const Icon = p.icon
                  return (
                    <button
                      key={type}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-colors",
                        newPlacement === type ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"
                      )}
                      onClick={() => setNewPlacement(type)}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="text-xs" onClick={handleCreate} disabled={!newName.trim()}>Создать</Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => setCreateMode(false)}>Отмена</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="text-xs gap-1.5 w-full" onClick={() => setCreateMode(true)}>
            <Plus className="w-3.5 h-3.5" />Создать форму
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
