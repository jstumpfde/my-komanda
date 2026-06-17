"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Save, Loader2, Package, Tag } from "lucide-react"
import Link from "next/link"
import { PricingGrid, type ProductPricingRow, type BundleRow, type PricingGridValue } from "@/components/admin/pricing-grid"

interface ModuleState {
  id: string; slug: string; name: string; icon: string | null; sortOrder: number | null
  isIncluded: boolean
  maxVacancies: string; maxCandidates: string; maxEmployees: string
  maxScenarios: string; maxUsers: string
}

interface PlanData {
  id: string; slug: string; name: string; price: number
  currency: string | null; interval: string | null; isPublic: boolean | null
}

function toStr(v: number | null | undefined) { return v == null ? "" : String(v) }
function toNum(s: string): number | null { const n = parseInt(s); return isNaN(n) ? null : n }

export default function AdminPlanEditPage() {
  const params = useParams()
  const router = useRouter()
  const planId = params.planId as string

  const [plan, setPlan] = useState<PlanData | null>(null)
  const [moduleStates, setModuleStates] = useState<ModuleState[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  // Локальные поля формы
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [priceStr, setPriceStr] = useState("")
  const [interval, setInterval] = useState("month")
  const [isPublic, setIsPublic] = useState(true)

  // Цены и скидки
  const [pricingData, setPricingData] = useState<ProductPricingRow[]>([])
  const [discountsData, setDiscountsData] = useState<BundleRow[]>([])
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingSaving, setPricingSaving] = useState(false)
  const [pricingSaved, setPricingSaved] = useState(false)
  const [pricingError, setPricingError] = useState("")
  const [pendingPricing, setPendingPricing] = useState<PricingGridValue | null>(null)

  useEffect(() => {
    fetch(`/api/admin/plans/${planId}`)
      .then(r => r.json())
      .then(data => {
        const p: PlanData = data.plan
        setPlan(p)
        setName(p.name)
        setSlug(p.slug)
        setPriceStr(String(p.price / 100))
        setInterval(p.interval ?? "month")
        setIsPublic(p.isPublic ?? true)
        setModuleStates(data.modules.map((m: {
          id: string; slug: string; name: string; icon: string | null; sortOrder: number | null
          isIncluded: boolean
          maxVacancies: number | null; maxCandidates: number | null; maxEmployees: number | null
          maxScenarios: number | null; maxUsers: number | null
        }) => ({
          ...m,
          maxVacancies:  toStr(m.maxVacancies),
          maxCandidates: toStr(m.maxCandidates),
          maxEmployees:  toStr(m.maxEmployees),
          maxScenarios:  toStr(m.maxScenarios),
          maxUsers:      toStr(m.maxUsers),
        })))
      })
      .catch(() => setError("Не удалось загрузить данные"))
      .finally(() => setLoading(false))
  }, [planId])

  // Загружаем цены/скидки тарифа
  useEffect(() => {
    setPricingLoading(true)
    fetch(`/api/admin/plans/${planId}/pricing`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setPricingData(data.products ?? [])
          setDiscountsData(data.discounts ?? [])
        }
      })
      .catch(() => {})
      .finally(() => setPricingLoading(false))
  }, [planId])

  function toggleModule(id: string, checked: boolean) {
    setModuleStates(prev => prev.map(m => m.id === id ? { ...m, isIncluded: checked } : m))
  }

  function setLimit(id: string, field: keyof ModuleState, value: string) {
    setModuleStates(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))
  }

  async function handleSave() {
    setSaving(true)
    setError("")
    setSuccess(false)
    try {
      const priceKopecks = Math.round(parseFloat(priceStr) * 100)
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, slug, price: priceKopecks, interval, isPublic,
          modules: moduleStates.map(m => ({
            moduleId: m.id, isIncluded: m.isIncluded,
            maxVacancies:  toNum(m.maxVacancies),
            maxCandidates: toNum(m.maxCandidates),
            maxEmployees:  toNum(m.maxEmployees),
            maxScenarios:  toNum(m.maxScenarios),
            maxUsers:      toNum(m.maxUsers),
          })),
        }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Ошибка"); return }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch {
      setError("Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePricing() {
    const data = pendingPricing ?? { products: pricingData, discounts: discountsData }
    setPricingSaving(true)
    setPricingError("")
    setPricingSaved(false)
    try {
      const res = await fetch(`/api/admin/plans/${planId}/pricing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setPricingError(d.error ?? "Ошибка сохранения")
        return
      }
      const saved = await res.json()
      setPricingData(saved.products ?? data.products)
      setDiscountsData(saved.discounts ?? data.discounts)
      setPendingPricing(null)
      setPricingSaved(true)
      setTimeout(() => setPricingSaved(false), 2500)
    } catch {
      setPricingError("Ошибка сохранения")
    } finally {
      setPricingSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminPageLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminPageLayout>
    )
  }

  // Список модулей для PricingGrid (id + name)
  const moduleList = moduleStates.map(m => ({ id: m.id, name: m.name }))

  return (
    <AdminPageLayout>
          <div className="py-6 space-y-6 px-8">
            {/* Шапка */}
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                <Link href="/admin/plans"><ArrowLeft className="w-4 h-4" /></Link>
              </Button>
              <div>
                <div className="flex items-center gap-2 pt-3 pb-2">
                  <Package className="h-5 w-5 text-violet-600" />
                  <h1 className="text-lg font-semibold">Редактировать тариф</h1>
                </div>
                <p className="text-sm text-muted-foreground">{plan?.name}</p>
              </div>
            </div>

            {/* Табы */}
            <Tabs defaultValue="modules">
              <TabsList className="mb-4">
                <TabsTrigger value="modules" className="gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  Модули и лимиты
                </TabsTrigger>
                <TabsTrigger value="pricing" className="gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  Цены и скидки
                </TabsTrigger>
              </TabsList>

              {/* ─── Таб: Модули и лимиты ─── */}
              <TabsContent value="modules" className="space-y-6">
                {/* Основные поля */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Основные данные</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Название</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Slug</Label>
                        <Input value={slug} onChange={e => setSlug(e.target.value)} className="font-mono text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Цена (₽)</Label>
                        <Input
                          type="number"
                          value={priceStr}
                          onChange={e => setPriceStr(e.target.value)}
                          placeholder="19900"
                        />
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
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={isPublic} onCheckedChange={setIsPublic} id="isPublic" />
                      <Label htmlFor="isPublic" className="cursor-pointer">Публичный тариф</Label>
                    </div>
                  </CardContent>
                </Card>

                {/* Модули */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Модули и лимиты</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {moduleStates.map(mod => (
                      <div key={mod.id} className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id={`mod-${mod.id}`}
                            checked={mod.isIncluded}
                            onCheckedChange={v => toggleModule(mod.id, !!v)}
                          />
                          <Label htmlFor={`mod-${mod.id}`} className="font-medium cursor-pointer">{mod.name}</Label>
                          <code className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {mod.slug}
                          </code>
                        </div>
                        {mod.isIncluded && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pl-7">
                            {[
                              { field: "maxVacancies",  label: "Вакансий" },
                              { field: "maxCandidates", label: "Кандидатов" },
                              { field: "maxEmployees",  label: "Сотрудников" },
                              { field: "maxScenarios",  label: "Сценариев" },
                              { field: "maxUsers",      label: "Пользователей" },
                            ].map(({ field, label }) => (
                              <div key={field} className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{label}</Label>
                                <Input
                                  type="number"
                                  placeholder="∞"
                                  className="h-8 text-sm"
                                  value={(mod as Record<string, string>)[field]}
                                  onChange={e => setLimit(mod.id, field as keyof ModuleState, e.target.value)}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Кнопка сохранить */}
                <div className="flex items-center gap-3">
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Сохранить
                  </Button>
                  {success && <p className="text-sm text-emerald-600 font-medium">Сохранено</p>}
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
              </TabsContent>

              {/* ─── Таб: Цены и скидки ─── */}
              <TabsContent value="pricing" className="space-y-6">
                {pricingLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <PricingGrid
                    modules={moduleList}
                    pricing={pricingData}
                    discounts={discountsData}
                    editable
                    onChange={next => setPendingPricing(next)}
                  />
                )}

                <div className="flex items-center gap-3">
                  <Button onClick={handleSavePricing} disabled={pricingSaving} className="gap-2">
                    {pricingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Сохранить цены
                  </Button>
                  {pricingSaved && <p className="text-sm text-emerald-600 font-medium">Сохранено</p>}
                  {pricingError && <p className="text-sm text-destructive">{pricingError}</p>}
                </div>
              </TabsContent>
            </Tabs>
          </div>
    </AdminPageLayout>
  )
}
