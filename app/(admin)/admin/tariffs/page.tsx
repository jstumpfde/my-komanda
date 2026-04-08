"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { DEFAULT_TARIFFS, formatPrice, type Tariff, type TariffFeatures } from "@/lib/tariff-types"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  Plus, Pencil, Trash2, Check, X, Shield, Save, UserPlus, Archive,
} from "lucide-react"

export default function AdminTariffsPage() {
  const [tariffs, setTariffs] = useState<Tariff[]>(DEFAULT_TARIFFS)
  const [editingTariff, setEditingTariff] = useState<Tariff | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [buyCandidatesOpen, setBuyCandidatesOpen] = useState(false)
  const [buyTariffId, setBuyTariffId] = useState<string | null>(null)
  const [buyPackage, setBuyPackage] = useState(10)
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [editingTrialDays, setEditingTrialDays] = useState<Record<string, string>>({})

  const openEdit = (tariff: Tariff) => {
    setEditingTariff({ ...tariff })
    setSheetOpen(true)
  }

  const openNew = () => {
    setEditingTariff({
      id: `tariff-${Date.now()}`,
      name: "",
      price: 0,
      trialDays: 0,
      maxVacancies: 5,
      maxCandidates: 500,
      features: { branding: false, customDomain: false, aiVideoInterview: false, api: false, allowCustomBranding: false, allowCustomColors: false },
      active: true,
    })
    setSheetOpen(true)
  }

  const handleSave = () => {
    if (!editingTariff || !editingTariff.name) {
      toast.error("Заполните название тарифа")
      return
    }
    setTariffs(prev => {
      const existing = prev.findIndex(t => t.id === editingTariff.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = editingTariff
        return next
      }
      return [...prev, editingTariff]
    })
    setSheetOpen(false)
    toast.success("Тариф сохранён")
  }

  const handleDelete = () => {
    if (!editingTariff) return
    setTariffs(prev => prev.filter(t => t.id !== editingTariff.id))
    setSheetOpen(false)
    toast.error("Тариф удалён")
  }

  const updateEditing = (patch: Partial<Tariff>) => {
    setEditingTariff(prev => prev ? { ...prev, ...patch } : null)
  }

  const updateFeature = (key: keyof TariffFeatures, value: boolean) => {
    setEditingTariff(prev => prev ? { ...prev, features: { ...prev.features, [key]: value } } : null)
  }

  const handleArchive = async (tariffId: string) => {
    setArchiving(true)
    try {
      const res = await fetch(`/api/admin/plans/${tariffId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isArchived: true }),
      })
      if (!res.ok) {
        toast.error("Ошибка архивирования")
        return
      }
      setTariffs(prev => prev.map(t => t.id === tariffId ? { ...t, active: false } : t))
      toast.success("Тариф архивирован")
    } catch {
      toast.error("Ошибка архивирования")
    } finally {
      setArchiving(false)
      setArchiveConfirmId(null)
    }
  }

  const handleSaveTrialDays = async (tariffId: string) => {
    const days = parseInt(editingTrialDays[tariffId] ?? "")
    if (isNaN(days)) return
    try {
      const res = await fetch(`/api/admin/plans/${tariffId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ trialDays: days }),
      })
      if (!res.ok) {
        toast.error("Ошибка сохранения")
        return
      }
      setTariffs(prev => prev.map(t => t.id === tariffId ? { ...t, trialDays: days } : t))
      setEditingTrialDays(prev => { const n = { ...prev }; delete n[tariffId]; return n })
      toast.success("Trial дней сохранено")
    } catch {
      toast.error("Ошибка сохранения")
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-5 h-5 text-primary" />
                  <h1 className="text-2xl font-semibold text-foreground">Управление тарифами</h1>
                </div>
                <p className="text-muted-foreground text-sm">Только для администраторов</p>
              </div>
              <Button className="gap-1.5" onClick={openNew}>
                <Plus className="w-4 h-4" />
                Добавить тариф
              </Button>
            </div>

            {/* Таблица тарифов */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Название</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Цена</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Trial дней</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Вакансий</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Кандидатов</th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Брендинг</th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Активен</th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tariffs.map(tariff => {
                        const isArchived = !tariff.active
                        const trialVal = editingTrialDays[tariff.id] ?? String(tariff.trialDays ?? 14)
                        const isEditingTrial = tariff.id in editingTrialDays
                        return (
                        <tr key={tariff.id} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", isArchived && "opacity-60")}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{tariff.name}</span>
                              {tariff.badge && (
                                <Badge className={cn("text-[10px]", tariff.badgeColor || "bg-primary text-primary-foreground")}>
                                  {tariff.badge}
                                </Badge>
                              )}
                              {isArchived && (
                                <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50">
                                  Архив
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="text-right px-4 py-3 text-sm text-foreground font-medium">
                            {tariff.price === 0 ? "0 (бесплатно)" : `${tariff.price.toLocaleString("ru-RU")} ₽`}
                          </td>
                          <td className="text-right px-4 py-3 text-sm text-muted-foreground">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                className="w-14 h-7 text-right text-sm border rounded px-1.5 bg-background"
                                value={trialVal}
                                onChange={e => setEditingTrialDays(prev => ({ ...prev, [tariff.id]: e.target.value }))}
                                onBlur={() => { if (isEditingTrial) handleSaveTrialDays(tariff.id) }}
                                onKeyDown={e => { if (e.key === "Enter") handleSaveTrialDays(tariff.id) }}
                              />
                            </div>
                          </td>
                          <td className="text-right px-4 py-3 text-sm text-foreground">{tariff.maxVacancies === 999 ? "∞" : tariff.maxVacancies}</td>
                          <td className="text-right px-4 py-3 text-sm text-foreground">{tariff.maxCandidates.toLocaleString("ru-RU")}</td>
                          <td className="text-center px-4 py-3">
                            {tariff.features.branding ? (
                              <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </td>
                          <td className="text-center px-4 py-3">
                            {tariff.active ? (
                              <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-red-500 mx-auto" />
                            )}
                          </td>
                          <td className="text-center px-4 py-3">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Редактировать" onClick={() => openEdit(tariff)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              {tariff.id !== "trial" && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Докупить кандидатов" onClick={() => { setBuyTariffId(tariff.id); setBuyPackage(10); setBuyCandidatesOpen(true) }}>
                                  <UserPlus className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {!isArchived && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  title="Архивировать тариф"
                                  onClick={() => setArchiveConfirmId(tariff.id)}
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>

      {/* Dialog: Докупить кандидатов */}
      <Dialog open={buyCandidatesOpen} onOpenChange={setBuyCandidatesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Увеличить лимит кандидатов</DialogTitle></DialogHeader>
          {(() => {
            const t = tariffs.find((x) => x.id === buyTariffId)
            if (!t) return null
            const packages = [
              { count: 10, price: 500 },
              { count: 25, price: 1250 },
              { count: 50, price: 2500 },
              { count: 100, price: 5000 },
              { count: 150, price: 7500 },
              { count: 250, price: 12500 },
              { count: 500, price: 25000 },
            ]
            const selected = packages.find((p) => p.count === buyPackage) || packages[0]
            return (
              <div className="space-y-4 py-2">
                <p className="text-xs text-muted-foreground">Тариф: <span className="font-medium text-foreground">{t.name}</span> · Текущий лимит: <span className="font-medium text-foreground">{t.maxCandidates.toLocaleString("ru-RU")}</span></p>
                <div className="space-y-1.5">
                  {packages.map((p) => (
                    <label key={p.count} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors", buyPackage === p.count ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                      <input type="radio" name="package" checked={buyPackage === p.count} onChange={() => setBuyPackage(p.count)} className="accent-primary" />
                      <span className="flex-1 text-sm font-medium">+{p.count} кандидатов</span>
                      <span className="text-sm font-semibold">{p.price.toLocaleString("ru-RU")} ₽</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Цена за кандидата: 50 ₽</p>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Лимит после покупки:</span>
                  <span className="text-sm font-bold text-foreground">{t.maxCandidates.toLocaleString("ru-RU")} → {(t.maxCandidates + selected.count).toLocaleString("ru-RU")}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setBuyCandidatesOpen(false)}>Отмена</Button>
                  <Button className="flex-1" onClick={() => {
                    setTariffs((prev) => prev.map((x) => x.id === buyTariffId ? { ...x, maxCandidates: x.maxCandidates + selected.count } : x))
                    setBuyCandidatesOpen(false)
                    toast.success(`+${selected.count} кандидатов добавлено к тарифу ${t.name}`)
                  }}>
                    Оплатить {selected.price.toLocaleString("ru-RU")} ₽
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog: Архивировать тариф */}
      <Dialog open={!!archiveConfirmId} onOpenChange={open => !open && setArchiveConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Архивировать тариф</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Тариф будет помечен как устаревший и недоступен для новых клиентов. Существующие подписки не затрагиваются.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setArchiveConfirmId(null)} disabled={archiving}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              disabled={archiving}
              onClick={() => archiveConfirmId && handleArchive(archiveConfirmId)}
            >
              {archiving ? "Архивирование..." : "Архивировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sheet редактирования */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingTariff?.name ? `Редактирование: ${editingTariff.name}` : "Новый тариф"}</SheetTitle>
          </SheetHeader>

          {editingTariff && (
            <div className="space-y-5 mt-6">
              {/* Основные поля */}
              <div className="space-y-1.5">
                <Label className="text-sm">Название</Label>
                <Input value={editingTariff.name} onChange={e => updateEditing({ name: e.target.value })} placeholder="Starter" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Цена (₽/мес)</Label>
                <Input type="number" value={editingTariff.price} onChange={e => updateEditing({ price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Trial дней</Label>
                <Input type="number" value={editingTariff.trialDays} onChange={e => updateEditing({ trialDays: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Макс вакансий</Label>
                <Input type="number" value={editingTariff.maxVacancies} onChange={e => updateEditing({ maxVacancies: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Макс кандидатов</Label>
                <Input type="number" value={editingTariff.maxCandidates} onChange={e => updateEditing({ maxCandidates: Number(e.target.value) })} />
              </div>

              <Separator />

              {/* Функции */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Функции</Label>
                {([
                  { key: "branding" as const, label: "Брендинг" },
                  { key: "customDomain" as const, label: "Кастомный домен" },
                  { key: "aiVideoInterview" as const, label: "AI-видеоинтервью" },
                  { key: "api" as const, label: "API доступ" },
                  { key: "allowCustomBranding" as const, label: "Убрать брендинг платформы" },
                  { key: "allowCustomColors" as const, label: "Кастомные цвета" },
                ]).map(f => (
                  <div key={f.key} className="flex items-center justify-between">
                    <Label className="text-sm">{f.label}</Label>
                    <Switch checked={editingTariff.features[f.key]} onCheckedChange={v => updateFeature(f.key, v)} />
                  </div>
                ))}
              </div>

              <Separator />

              {/* Бейдж */}
              <div className="space-y-1.5">
                <Label className="text-sm">Бейдж</Label>
                <div className="flex flex-wrap gap-1.5">
                  {["", "Популярный", "Лучший выбор"].map(b => (
                    <button
                      key={b}
                      className={cn(
                        "px-3 py-1.5 rounded-md border text-xs font-medium transition-all",
                        editingTariff.badge === b || (!editingTariff.badge && b === "")
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground"
                      )}
                      onClick={() => updateEditing({ badge: b || undefined })}
                    >
                      {b || "Без бейджа"}
                    </button>
                  ))}
                </div>
                <Input
                  value={editingTariff.badge || ""}
                  onChange={e => updateEditing({ badge: e.target.value || undefined })}
                  placeholder="Или свой текст бейджа..."
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm">Активен</Label>
                <Switch checked={editingTariff.active} onCheckedChange={v => updateEditing({ active: v })} />
              </div>

              <Separator />

              {/* Кнопки */}
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gap-1.5" onClick={handleSave}>
                  <Save className="w-4 h-4" />
                  Сохранить
                </Button>
                <Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4" />
                  Удалить
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
