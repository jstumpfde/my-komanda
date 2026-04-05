"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Save, Building2 } from "lucide-react"
import type { SourceItem } from "./sources-manager"

// ─── Types ─────────────────────────────────────────────
export interface FormEntry {
  id: string
  name: string
  type: "internal" | "external"
  source: string
  placement: string
  slug: string
  slogan: string
  fields: FormFieldItem[]
  applications: number
  active: boolean
}

export interface FormFieldItem {
  key: string
  label: string
  enabled: boolean
  required: boolean
  locked?: boolean
}

const EXTERNAL_FIELDS: FormFieldItem[] = [
  { key: "firstName", label: "Имя", enabled: true, required: true, locked: true },
  { key: "lastName", label: "Фамилия", enabled: true, required: true, locked: true },
  { key: "email", label: "Email", enabled: true, required: true, locked: true },
  { key: "phone", label: "Телефон", enabled: true, required: false },
  { key: "position", label: "Должность", enabled: false, required: false },
  { key: "company", label: "Компания", enabled: false, required: false },
  { key: "city", label: "Город", enabled: false, required: false },
  { key: "resume", label: "Резюме (файл)", enabled: false, required: false },
  { key: "coverLetter", label: "Сопроводительное письмо", enabled: false, required: false },
  { key: "portfolio", label: "Ссылка на портфолио", enabled: false, required: false },
]

const INTERNAL_FIELDS: FormFieldItem[] = [
  { key: "employee", label: "Поиск сотрудника", enabled: true, required: true, locked: true },
  { key: "position", label: "Должность", enabled: true, required: false },
  { key: "comment", label: "Комментарий", enabled: true, required: false },
]

const REFERRAL_FIELD: FormFieldItem = { key: "referrer", label: "Кто рекомендовал", enabled: true, required: true, locked: true }

interface FormConstructorProps {
  enabledSources: SourceItem[]
  editForm: FormEntry | null
  onSave: (form: FormEntry) => void
}

export function FormConstructor({ enabledSources, editForm, onSave }: FormConstructorProps) {
  const [formType, setFormType] = useState<"internal" | "external">("external")
  const [name, setName] = useState("")
  const [source, setSource] = useState("")
  const [placement, setPlacement] = useState("")
  const [slogan, setSlogan] = useState("")
  const [slug, setSlug] = useState("")
  const [domainType, setDomainType] = useState<"free" | "subdomain" | "custom">("free")
  const [fields, setFields] = useState<FormFieldItem[]>(EXTERNAL_FIELDS.map((f) => ({ ...f })))

  // Load editForm data
  useEffect(() => {
    if (editForm) {
      setFormType(editForm.type)
      setName(editForm.name)
      setSource(editForm.source)
      setPlacement(editForm.placement)
      setSlogan(editForm.slogan)
      setSlug(editForm.slug)
      setFields(editForm.fields.map((f) => ({ ...f })))
    }
  }, [editForm])

  // Reset fields when type changes (only if not loading editForm)
  useEffect(() => {
    if (!editForm) {
      const base = formType === "external" ? EXTERNAL_FIELDS : INTERNAL_FIELDS
      let f = base.map((fi) => ({ ...fi }))
      if (source === "Реферал") f = [...f, { ...REFERRAL_FIELD }]
      setFields(f)
    }
  }, [formType, editForm])

  // Add referral field when source changes
  useEffect(() => {
    setFields((prev) => {
      const hasReferral = prev.some((f) => f.key === "referrer")
      if (source === "Реферал" && !hasReferral) return [...prev, { ...REFERRAL_FIELD }]
      if (source !== "Реферал" && hasReferral) return prev.filter((f) => f.key !== "referrer")
      return prev
    })
  }, [source])

  const autoSlug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "") || "form"

  const handleSave = () => {
    if (!name.trim()) return
    const entry: FormEntry = {
      id: editForm?.id || `f-${Date.now()}`,
      name: name.trim(),
      type: formType,
      source,
      placement: placement.trim() || (formType === "internal" ? "Внутри платформы" : "—"),
      slug: slug || autoSlug,
      slogan,
      fields: fields.filter((f) => f.enabled),
      applications: editForm?.applications || 0,
      active: editForm?.active ?? true,
    }
    onSave(entry)
    toast.success(editForm ? "Форма обновлена" : "Форма создана")
  }

  return (
    <div className="space-y-5">
      {/* Тип формы */}
      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold">Тип формы</Label>
        <div className="flex gap-2">
          {(["external", "internal"] as const).map((type) => (
            <button
              key={type}
              className={cn(
                "flex-1 px-3 py-2.5 rounded-lg border text-xs transition-colors text-center",
                formType === type ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/40"
              )}
              onClick={() => setFormType(type)}
            >
              {type === "external" ? "Внешняя форма" : "Внутренняя форма"}
              <p className="text-[10px] mt-0.5 font-normal text-muted-foreground">
                {type === "external" ? "Сбор данных извне" : "Сотрудник из платформы"}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Название */}
      <div className="grid gap-1">
        <Label className="text-xs font-semibold">Название формы</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Общая анкета Talent Pool" className="h-9 text-sm" />
      </div>

      {/* Источник */}
      <div className="grid gap-1">
        <Label className="text-xs font-semibold">Источник</Label>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Выберите источник" /></SelectTrigger>
          <SelectContent>
            {enabledSources.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Размещение */}
      <div className="grid gap-1">
        <Label className="text-xs font-semibold">Название размещения</Label>
        <Input value={placement} onChange={(e) => setPlacement(e.target.value)} placeholder="Канал DevOps Moscow" className="h-9 text-sm" />
      </div>

      {/* Конструктор полей */}
      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold">Поля формы</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {fields.map((field, i) => (
            <label key={field.key} className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer transition-colors", field.enabled ? "border-border bg-background" : "border-transparent bg-muted/30")}>
              <Checkbox
                checked={field.enabled}
                disabled={field.locked}
                onCheckedChange={(checked) => {
                  setFields((prev) => prev.map((f, j) => j === i ? { ...f, enabled: !!checked } : f))
                }}
              />
              <span className="text-xs flex-1">{field.label}</span>
              {field.required && <Badge variant="outline" className="text-[9px] border-transparent bg-amber-500/10 text-amber-700 px-1.5 py-0">обяз.</Badge>}
            </label>
          ))}
        </div>
      </div>

      {/* Слоган */}
      <div className="grid gap-1">
        <Label className="text-xs font-semibold">Слоган / подзаголовок</Label>
        <Input value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder="Мы строим будущее вместе" className="h-9 text-sm" />
      </div>

      {/* Домен */}
      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold">Домен для публичных страниц</Label>
        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="domain" checked={domainType === "free"} onChange={() => setDomainType("free")} className="mt-1" />
            <div className="flex-1">
              <p className="text-xs font-medium">Бесплатный</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] text-muted-foreground">company24.pro/c/company/</span>
                <Input
                  value={slug || autoSlug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="h-6 text-[11px] w-32 px-1.5"
                />
              </div>
            </div>
          </label>
          <label className="flex items-center gap-2 cursor-pointer opacity-50">
            <input type="radio" name="domain" checked={domainType === "subdomain"} onChange={() => setDomainType("subdomain")} />
            <div>
              <span className="text-xs">Поддомен Company24</span>
              <Badge variant="outline" className="text-[9px] ml-2 border-transparent bg-purple-500/10 text-purple-700">Тариф Бизнес</Badge>
            </div>
          </label>
          <label className="flex items-center gap-2 cursor-pointer opacity-50">
            <input type="radio" name="domain" checked={domainType === "custom"} onChange={() => setDomainType("custom")} />
            <div>
              <span className="text-xs">Свой домен</span>
              <Badge variant="outline" className="text-[9px] ml-2 border-transparent bg-purple-500/10 text-purple-700">Тариф Масштаб</Badge>
            </div>
          </label>
        </div>
      </div>

      {/* Превью шапки */}
      <div className="grid gap-1.5">
        <Label className="text-xs font-semibold">Превью шапки формы</Label>
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Моя Команда</p>
                {slogan && <p className="text-xs text-white/70">{slogan}</p>}
              </div>
            </div>
          </div>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-1">{name || "Название формы"}</p>
            <p className="text-xs text-muted-foreground mb-3">
              {fields.filter((f) => f.enabled).map((f) => f.label).join(" · ")}
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700">Откликнуться</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs">Подробнее</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Сохранить */}
      <Button className="w-full gap-1.5" onClick={handleSave} disabled={!name.trim()}>
        <Save className="w-4 h-4" />
        Сохранить
      </Button>
    </div>
  )
}
