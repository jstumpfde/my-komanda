"use client"

import { useState, useEffect } from "react"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle } from "@/components/ui/sheet"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { toast } from "sonner"
import { Layers, Plus, Pencil, Loader2, Check, X } from "lucide-react"

type Audience = "partner" | "referral"

interface Level {
  id: string
  name: string
  audience: Audience
  minClients: number | null
  minMrrKopecks: number | null
  commissionPercent: string
  sortOrder: number | null
  isActive: boolean | null
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  partner: "Партнёрские уровни",
  referral: "Реферальные уровни",
}

export default function IntegratorLevelsPage() {
  const [levels, setLevels] = useState<Level[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Level | null>(null)

  const emptyLevel = (audience: Audience): Level => ({
    id: "",
    name: "",
    audience,
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
  const openNew = (audience: Audience) => { setEditing(emptyLevel(audience)); setSheetOpen(true) }

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

  const renderGroup = (audience: Audience) => {
    const groupLevels = levels.filter(l => (l.audience ?? "partner") === audience)
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">{AUDIENCE_LABEL[audience]}</h2>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openNew(audience)}>
            <Plus className="w-4 h-4" />
            Добавить уровень
          </Button>
        </div>
        <TableCard>
          <DataTable>
            <DataHead>
              <DataHeadCell>Название</DataHeadCell>
              <DataHeadCell align="right">Мин. клиентов</DataHeadCell>
              <DataHeadCell align="right">Мин. MRR</DataHeadCell>
              <DataHeadCell align="right">Комиссия</DataHeadCell>
              <DataHeadCell align="center">Активен</DataHeadCell>
              <DataHeadCell align="right" />
            </DataHead>
            <tbody>
              {groupLevels.length === 0 ? (
                <DataRow>
                  <DataCell className="text-muted-foreground text-sm" >
                    Уровней пока нет
                  </DataCell>
                  <DataCell /><DataCell /><DataCell /><DataCell /><DataCell />
                </DataRow>
              ) : groupLevels.map(level => (
                <DataRow key={level.id}>
                  <DataCell>
                    <Badge variant="outline" className="text-xs font-medium">{level.name}</Badge>
                  </DataCell>
                  <DataCell align="right" className="text-muted-foreground">{level.minClients ?? 0}</DataCell>
                  <DataCell align="right" className="text-muted-foreground">
                    {((level.minMrrKopecks ?? 0) / 100).toLocaleString("ru-RU")} ₽
                  </DataCell>
                  <DataCell align="right" className="font-semibold text-emerald-600">{level.commissionPercent}%</DataCell>
                  <DataCell align="center">
                    {level.isActive ? (
                      <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                    )}
                  </DataCell>
                  <DataCell align="right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(level)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </DataCell>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </TableCard>
      </div>
    )
  }

  return (
    <AdminPageLayout>
          <div className="py-6 px-8">
            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <Layers className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Уровни комиссии</h1>
              </div>
              <p className="text-muted-foreground text-sm">
                Раздельные уровни для партнёров (и суб-партнёров) и для рефералов
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {renderGroup("partner")}
                {renderGroup("referral")}
              </>
            )}
          </div>

      {/* Sheet редактирования */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing?.id ? `Редактировать: ${editing.name}` : "Новый уровень"}</SheetTitle>
          </SheetHeader>
          {editing && (
            <SheetBody className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Аудитория</Label>
                <div className="flex gap-2">
                  {(["partner", "referral"] as Audience[]).map(a => (
                    <Button
                      key={a}
                      type="button"
                      variant={editing.audience === a ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setEditing(p => p ? { ...p, audience: a } : null)}
                    >
                      {a === "partner" ? "Партнёрские" : "Реферальные"}
                    </Button>
                  ))}
                </div>
              </div>
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
            </SheetBody>
          )}
        </SheetContent>
      </Sheet>
    </AdminPageLayout>
  )
}
