"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ClipboardList, Plus, Copy, CheckCircle2, ExternalLink } from "lucide-react"
import type { SourceItem } from "./sources-manager"

// ─── Types ─────────────────────────────────────────────
interface FormEntry {
  id: string
  name: string
  type: "internal" | "external"
  source: string
  placement: string
  url: string
  applications: number
  conversion: string
  embedCode?: string
}

interface FormField {
  key: string
  label: string
  enabled: boolean
}

const EXTERNAL_FIELDS: FormField[] = [
  { key: "firstName", label: "Имя", enabled: true },
  { key: "lastName", label: "Фамилия", enabled: true },
  { key: "email", label: "Email", enabled: true },
  { key: "phone", label: "Телефон", enabled: true },
  { key: "position", label: "Должность", enabled: false },
  { key: "resume", label: "Резюме", enabled: false },
]

const INITIAL_FORMS: FormEntry[] = [
  { id: "f1", name: "Общая анкета", type: "external", source: "Сайт компании", placement: "Карьерная страница", url: "company24.pro/form/obshaya-anketa?source=website&place=career", applications: 34, conversion: "6.0%", embedCode: `<iframe src="https://company24.pro/form/obshaya-anketa?source=website&place=career" width="100%" height="480" frameborder="0"></iframe>` },
  { id: "f2", name: "DevOps набор", type: "external", source: "Telegram", placement: "Канал DevOps Moscow", url: "company24.pro/form/devops-nabor?source=telegram&place=devops-moscow", applications: 12, conversion: "8.3%", embedCode: `<iframe src="https://company24.pro/form/devops-nabor?source=telegram&place=devops-moscow" width="100%" height="480" frameborder="0"></iframe>` },
  { id: "f3", name: "Реферал от команды", type: "internal", source: "Реферал", placement: "Внутри платформы", url: "company24.pro/form/referal-ot-komandy?source=referral&place=internal", applications: 5, conversion: "—" },
  { id: "f4", name: "Анкета с конференции", type: "external", source: "QR-код", placement: "Стенд HRTech 2026", url: "company24.pro/form/anketa-konferenciya?source=qr&place=hrtech-2026", applications: 9, conversion: "11.5%", embedCode: `<iframe src="https://company24.pro/form/anketa-konferenciya?source=qr&place=hrtech-2026" width="100%" height="480" frameborder="0"></iframe>` },
]

interface FormsManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  enabledSources: SourceItem[]
}

export function FormsManager({ open, onOpenChange, enabledSources }: FormsManagerProps) {
  const [forms, setForms] = useState(INITIAL_FORMS)
  const [createMode, setCreateMode] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Create form state
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState<"internal" | "external">("external")
  const [newSource, setNewSource] = useState("")
  const [newPlacement, setNewPlacement] = useState("")
  const [newFields, setNewFields] = useState<FormField[]>(EXTERNAL_FIELDS.map((f) => ({ ...f })))

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success("Скопировано")
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCreate = () => {
    if (!newName.trim() || !newSource) return
    const slug = newName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
    const srcSlug = newSource.toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
    const placeSlug = newPlacement.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "") || "default"
    const url = `company24.pro/form/${slug}?source=${srcSlug}&place=${placeSlug}`

    const entry: FormEntry = {
      id: `f-${Date.now()}`,
      name: newName.trim(),
      type: newType,
      source: newSource,
      placement: newPlacement.trim() || (newType === "internal" ? "Внутри платформы" : "—"),
      url,
      applications: 0,
      conversion: newType === "internal" ? "—" : "0%",
      embedCode: newType === "external" ? `<iframe src="https://${url}" width="100%" height="480" frameborder="0"></iframe>` : undefined,
    }

    setForms((prev) => [...prev, entry])
    setNewName("")
    setNewType("external")
    setNewSource("")
    setNewPlacement("")
    setNewFields(EXTERNAL_FIELDS.map((f) => ({ ...f })))
    setCreateMode(false)
    toast.success("Форма создана")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Формы сбора кандидатов
          </DialogTitle>
        </DialogHeader>

        {/* Таблица форм */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Название</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Тип</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Источник</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Размещение</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ссылка</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Заявок</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Конв.</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {forms.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5 text-[13px] font-medium">{f.name}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={cn("text-[10px] border-transparent", f.type === "internal" ? "bg-purple-500/10 text-purple-700" : "bg-blue-500/10 text-blue-700")}>
                        {f.type === "internal" ? "Внутренняя" : "Внешняя"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{f.source}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{f.placement}</td>
                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground max-w-[140px] truncate">{f.url}</td>
                    <td className="px-3 py-2.5 text-xs text-center font-medium">{f.applications}</td>
                    <td className="px-3 py-2.5 text-xs text-center font-semibold text-emerald-600">{f.conversion}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Копировать ссылку" onClick={() => handleCopy(f.id, `https://${f.url}`)}>
                          {copiedId === f.id ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </Button>
                        {f.type === "internal" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Открыть форму" onClick={() => toast.info("Форма откроется в платформе")}>
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Embed-код для внешних форм */}
        {forms.filter((f) => f.embedCode).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Embed-код для внешних форм</p>
            {forms.filter((f) => f.embedCode).map((f) => (
              <div key={f.id} className="flex items-start gap-2 p-2 bg-muted/20 rounded border">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium mb-1">{f.name}</p>
                  <code className="text-[10px] text-muted-foreground break-all">{f.embedCode}</code>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleCopy(`embed-${f.id}`, f.embedCode!)}>
                  {copiedId === `embed-${f.id}` ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Создание формы */}
        {createMode ? (
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
            <p className="text-xs font-semibold text-muted-foreground">Новая форма</p>

            <div className="grid gap-1">
              <Label className="text-xs">Название формы</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название формы" className="h-8 text-sm" />
            </div>

            {/* Тип: Внутренняя / Внешняя */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Тип формы</Label>
              <div className="flex gap-2">
                {(["internal", "external"] as const).map((type) => (
                  <button
                    key={type}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md border text-xs transition-colors text-center",
                      newType === type ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/40"
                    )}
                    onClick={() => setNewType(type)}
                  >
                    {type === "internal" ? "Внутренняя" : "Внешняя"}
                    <p className="text-[10px] mt-0.5 font-normal text-muted-foreground">
                      {type === "internal" ? "Сотрудник из платформы" : "Сбор данных извне"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Поля для внешней формы */}
            {newType === "external" && (
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
            )}

            {/* Внутренняя — подсказка */}
            {newType === "internal" && (
              <div className="p-2 bg-purple-50 dark:bg-purple-950/20 rounded border border-purple-200 dark:border-purple-900/30">
                <p className="text-[11px] text-muted-foreground">Внутренняя форма: поиск сотрудника, должность, комментарий. Доступна только авторизованным пользователям платформы.</p>
              </div>
            )}

            {/* Источник */}
            <div className="grid gap-1">
              <Label className="text-xs">Источник</Label>
              <Select value={newSource} onValueChange={setNewSource}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Выберите источник" /></SelectTrigger>
                <SelectContent>
                  {enabledSources.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Название размещения */}
            <div className="grid gap-1">
              <Label className="text-xs">Название размещения</Label>
              <Input value={newPlacement} onChange={(e) => setNewPlacement(e.target.value)} placeholder="Telegram канал DevOps Moscow, Карьерная страница сайта..." className="h-8 text-sm" />
            </div>

            {/* Превью ссылки */}
            {newName.trim() && newSource && (
              <div className="p-2 bg-background rounded border text-[11px] text-muted-foreground truncate">
                company24.pro/form/{newName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")}?source={newSource.toLowerCase().replace(/\s+/g, "-")}&place={newPlacement.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "") || "default"}
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" className="text-xs" onClick={handleCreate} disabled={!newName.trim() || !newSource}>Создать</Button>
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
