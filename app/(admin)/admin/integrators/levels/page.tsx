"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { toast } from "sonner"
import { Layers, Plus, Pencil, Loader2, Check, X } from "lucide-react"

interface Level {
  id: string
  name: string
  minClients: number | null
  minMrrKopecks: number | null
  commissionPercent: string
  sortOrder: number | null
  isActive: boolean | null
}

export default function IntegratorLevelsPage() {
  const [levels, setLevels] = useState<Level[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Level | null>(null)

  const emptyLevel = (): Level => ({
    id: "",
    name: "",
    minClients: 0,
    minMrrKopecks: 0,
    commissionPercent: "10",
    sortOrder: 0,
    isActive: true,
  })

  useEffect(() => {
    fetch("/api/admin/integrators/levels")
      .then(r => r.json())
      .then(data => setLevels(data.levels ?? []))
      .catch(() => toast.error("Ошибка загрузки"))
      .finally(() => setLoading(false))
  }, [])

  const openEdit = (level: Level) => { setEditing({ ...level }); setSheetOpen(true) }
  const openNew = () => { setEditing(emptyLevel()); setSheetOpen(true) }

  const handleSave = async () => {
    if (!editing || !editing.name) { toast.error("Укажите название"); return }
    setSaving(true)
    try {
      if (editing.id) {
        // Update
        const res = await fetch(`/api/admin/integrators/levels?id=${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        })
        if (!res.ok) throw new Error()
        const { level } = await res.json()
        setLevels(prev => prev.map(l => l.id === level.id ? level : l))
        toast.success("Уровень обновлён")
      } else {
        // Create
        const res = await fetch("/api/admin/integrators/levels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        })
        if (!res.ok) throw new Error()
        const { level } = await res.json()
        setLevels(prev => [...prev, level])
        toast.success("Уровень создан")
      }
      setSheetOpen(false)
    } catch {
      toast.error("Ошибка при сохранении")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing?.id) return
    setSaving(true)
    try {
      await fetch(`/api/admin/integrators/levels?id=${editing.id}`, { method: "DELETE" })
      setLevels(prev => prev.filter(l => l.id !== editing.id))
      setSheetOpen(false)
      toast.success("Уровень удалён")
    } catch {
      toast.error("Ошибка при удалении")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-5 h-5 text-primary" />
                  <h1 className="text-2xl font-semibold text-foreground">Уровни интеграторов</h1>
                </div>
                <p className="text-muted-foreground text-sm">Партнёрские уровни и комиссии</p>
              </div>
              <Button className="gap-1.5" onClick={openNew}>
                <Plus className="w-4 h-4" />
                Добавить уровень
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Название</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Мин. клиентов</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Мин. MRR</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Комиссия</th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Активен</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {levels.map(level => (
                        <tr key={level.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs font-medium">{level.name}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-muted-foreground">{level.minClients ?? 0}</td>
                          <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                            {((level.minMrrKopecks ?? 0) / 100).toLocaleString("ru-RU")} ₽
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-right text-emerald-600">{level.commissionPercent}%</td>
                          <td className="px-4 py-3 text-center">
                            {level.isActive ? (
                              <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(level)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* Sheet редактирования */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing?.id ? `Редактировать: ${editing.name}` : "Новый уровень"}</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="space-y-4 mt-6">
              <div className="space-y-1.5">
                <Label className="text-sm">Название</Label>
                <Input value={editing.name} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : null)} placeholder="Bronze" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Мин. клиентов</Label>
                <Input type="number" value={editing.minClients ?? 0} onChange={e => setEditing(p => p ? { ...p, minClients: Number(e.target.value) } : null)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Мин. MRR (₽)</Label>
                <Input
                  type="number"
                  value={(editing.minMrrKopecks ?? 0) / 100}
                  onChange={e => setEditing(p => p ? { ...p, minMrrKopecks: Math.round(parseFloat(e.target.value) * 100) } : null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Комиссия (%)</Label>
                <Input value={editing.commissionPercent} onChange={e => setEditing(p => p ? { ...p, commissionPercent: e.target.value } : null)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Порядок сортировки</Label>
                <Input type="number" value={editing.sortOrder ?? 0} onChange={e => setEditing(p => p ? { ...p, sortOrder: Number(e.target.value) } : null)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Активен</Label>
                <Switch checked={editing.isActive ?? true} onCheckedChange={v => setEditing(p => p ? { ...p, isActive: v } : null)} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Сохранить
                </Button>
                {editing.id && (
                  <Button variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete} disabled={saving}>
                    Удалить
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
