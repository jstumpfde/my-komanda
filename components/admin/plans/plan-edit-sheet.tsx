"use client"

// Редактор тарифа прямо в боковой панели (без перехода на отдельную страницу).
// Поля + модули через дропдаун-чекбоксы + лимиты включённых модулей + «Сохранить всё».
// Грузит/сохраняет через тот же API, что и страница /admin/plans/[id].

import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Package, Loader2, Save, ChevronDown } from "lucide-react"
import { toast } from "sonner"

// Ярлыки лимитов зависят от модуля: у продаж — воронки/клиенты, не вакансии/кандидаты.
const LIMIT_FIELDS_DEFAULT = [
  { field: "maxVacancies",  label: "Вакансий" },
  { field: "maxCandidates", label: "Кандидатов" },
  { field: "maxEmployees",  label: "Сотрудников" },
  { field: "maxScenarios",  label: "Сценариев" },
  { field: "maxUsers",      label: "Пользователей" },
] as const
const LIMIT_LABELS_BY_MODULE: Record<string, Record<string, string>> = {
  sales:     { maxVacancies: "Воронок",  maxCandidates: "Клиентов" },
  marketing: { maxVacancies: "Кампаний", maxCandidates: "Лидов" },
}
function limitFieldsFor(slug: string) {
  const o = LIMIT_LABELS_BY_MODULE[slug] ?? {}
  return LIMIT_FIELDS_DEFAULT.map(f => ({ ...f, label: o[f.field] ?? f.label }))
}
const toStr = (v: number | null | undefined) => (v == null ? "" : String(v))
const toNum = (s: string): number | null => { const n = parseInt(s); return isNaN(n) ? null : n }

interface ModuleState {
  id: string; slug: string; name: string; icon: string | null; sortOrder: number | null
  isIncluded: boolean
  maxVacancies: string; maxCandidates: string; maxEmployees: string; maxScenarios: string; maxUsers: string
}

export function PlanEditSheet({
  planId, open, onOpenChange, onSaved,
}: {
  planId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [priceStr, setPriceStr] = useState("")
  const [interval, setInterval] = useState("month")
  const [isPublic, setIsPublic] = useState(true)
  const [modules, setModules] = useState<ModuleState[]>([])

  useEffect(() => {
    if (!open || !planId) return
    setLoading(true)
    fetch(`/api/admin/plans/${planId}`)
      .then(r => r.json())
      .then(data => {
        const p = data.plan
        setName(p.name); setSlug(p.slug); setPriceStr(String(p.price / 100))
        setInterval(p.interval ?? "month"); setIsPublic(p.isPublic ?? true)
        setModules((data.modules ?? []).map((m: ModuleState & {
          maxVacancies: number | null; maxCandidates: number | null; maxEmployees: number | null
          maxScenarios: number | null; maxUsers: number | null
        }) => ({
          ...m,
          maxVacancies: toStr(m.maxVacancies), maxCandidates: toStr(m.maxCandidates),
          maxEmployees: toStr(m.maxEmployees), maxScenarios: toStr(m.maxScenarios), maxUsers: toStr(m.maxUsers),
        })))
      })
      .catch(() => toast.error("Не удалось загрузить тариф"))
      .finally(() => setLoading(false))
  }, [open, planId])

  const toggleModule = (id: string, checked: boolean) =>
    setModules(prev => prev.map(m => (m.id === id ? { ...m, isIncluded: checked } : m)))
  const setLimit = (id: string, field: string, value: string) =>
    setModules(prev => prev.map(m => (m.id === id ? { ...m, [field]: value } : m)))

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, slug, price: Math.round(parseFloat(priceStr || "0") * 100), interval, isPublic,
          modules: modules.map(m => ({
            moduleId: m.id, isIncluded: m.isIncluded,
            maxVacancies: toNum(m.maxVacancies), maxCandidates: toNum(m.maxCandidates),
            maxEmployees: toNum(m.maxEmployees), maxScenarios: toNum(m.maxScenarios), maxUsers: toNum(m.maxUsers),
          })),
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Ошибка сохранения"); return }
      toast.success("Тариф сохранён")
      onSaved?.()
      onOpenChange(false)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  const included = modules.filter(m => m.isIncluded)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 pr-6">
            <Package className="h-5 w-5 text-muted-foreground shrink-0" />
            <span className="break-words">Редактировать тариф</span>
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <SheetBody><div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div></SheetBody>
        ) : (
          <SheetBody className="space-y-5">
            {/* Основные поля */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="pe-name">Название</Label>
                <Input id="pe-name" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pe-slug">Slug</Label>
                <Input id="pe-slug" value={slug} onChange={e => setSlug(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pe-price">Цена (₽)</Label>
                <Input id="pe-price" type="number" value={priceStr} onChange={e => setPriceStr(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Интервал</Label>
                <Select value={interval} onValueChange={setInterval}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Месяц</SelectItem>
                    <SelectItem value="year">Год</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 self-end pb-1">
                <Switch checked={isPublic} onCheckedChange={setIsPublic} id="pe-public" />
                <Label htmlFor="pe-public" className="cursor-pointer">Публичный тариф</Label>
              </div>
            </div>

            {/* Модули — дропдаун с чекбоксами */}
            <div className="space-y-2">
              <Label>Модули</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {included.length ? `Выбрано модулей: ${included.length}` : "Выбрать модули"}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72" align="start">
                  <DropdownMenuLabel>Модули в тарифе</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {modules.map(m => (
                    <DropdownMenuCheckboxItem
                      key={m.id}
                      checked={m.isIncluded}
                      onCheckedChange={v => toggleModule(m.id, !!v)}
                      onSelect={e => e.preventDefault()}
                    >
                      {m.name}
                      <code className="ml-auto text-[10px] text-muted-foreground">{m.slug}</code>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {included.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {included.map(m => <Badge key={m.id} variant="secondary" className="text-xs">{m.name}</Badge>)}
                </div>
              )}
            </div>

            {/* Лимиты включённых модулей (подписи зависят от модуля) */}
            {included.map(m => (
              <div key={m.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="text-sm font-medium">{m.name} <span className="text-xs font-normal text-muted-foreground">· лимиты</span></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {limitFieldsFor(m.slug).map(({ field, label }) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input
                        type="number" placeholder="∞" className="h-8 text-sm"
                        value={(m as unknown as Record<string, string>)[field]}
                        onChange={e => setLimit(m.id, field, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </SheetBody>
        )}

        <SheetFooter>
          <Button onClick={save} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Сохранить всё
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
