"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, Plus, Pencil, Trash2, Users, Power } from "lucide-react"

// ─── Типы ────────────────────────────────────────────────────────────────────

type ResourceType = "specialist" | "room" | "equipment"

interface Resource {
  id: string
  name: string
  type: string
  description: string | null
  avatar: string | null
  isActive: boolean
  schedule: unknown | null
  breaks: unknown | null
  createdAt: string
  updatedAt: string
}

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  specialist: "Специалист",
  room:       "Кабинет / зал",
  equipment:  "Оборудование",
}

// ─── Вспомогательные функции ─────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? "Ошибка сервера")
  return (json?.data ?? json) as T
}

// ─── Форма добавления / редактирования ───────────────────────────────────────

interface ResourceFormProps {
  initial?: Resource
  open: boolean
  onClose: () => void
  onSaved: (resource: Resource) => void
}

function ResourceForm({ initial, open, onClose, onSaved }: ResourceFormProps) {
  const isEdit = Boolean(initial)
  const [name, setName] = useState(initial?.name ?? "")
  const [type, setType] = useState<ResourceType>((initial?.type as ResourceType) ?? "specialist")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [saving, setSaving] = useState(false)

  // сброс при открытии новой формы
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "")
      setType((initial?.type as ResourceType) ?? "specialist")
      setDescription(initial?.description ?? "")
    }
  }, [open, initial])

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Введите название")
      return
    }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        type,
        description: description.trim() || null,
      }
      let saved: Resource
      if (isEdit && initial) {
        saved = await apiFetch<Resource>(
          `/api/modules/booking/resources/${initial.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        )
      } else {
        saved = await apiFetch<Resource>("/api/modules/booking/resources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      }
      toast.success(isEdit ? "Мастер обновлён" : "Мастер добавлен")
      onSaved(saved)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }, [name, type, description, isEdit, initial, onSaved, onClose])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать мастера" : "Добавить мастера"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="master-name">Имя / название</Label>
            <Input
              id="master-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иванова Мария"
              disabled={saving}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="master-type">Тип ресурса</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as ResourceType)}
              disabled={saving}
            >
              <SelectTrigger id="master-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(RESOURCE_TYPE_LABELS) as [ResourceType, string][]).map(
                  ([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="master-desc">Специализация / описание <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
            <Input
              id="master-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Маникюр, педикюр, наращивание"
              disabled={saving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Строка мастера ───────────────────────────────────────────────────────────

interface ResourceRowProps {
  resource: Resource
  onEdit: (r: Resource) => void
  onDelete: (r: Resource) => void
  onToggle: (r: Resource) => void
  toggling: boolean
}

function ResourceRow({ resource, onEdit, onDelete, onToggle, toggling }: ResourceRowProps) {
  const typeLabel = RESOURCE_TYPE_LABELS[resource.type as ResourceType] ?? resource.type

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        resource.isActive ? "border-border bg-card" : "border-border/50 bg-muted/30"
      }`}
    >
      {/* Аватар-заглушка */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm select-none">
        {resource.name.trim().charAt(0).toUpperCase()}
      </div>

      {/* Имя + тип + описание */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium truncate ${!resource.isActive ? "text-muted-foreground" : "text-foreground"}`}>
            {resource.name}
          </span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {typeLabel}
          </Badge>
          {!resource.isActive && (
            <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
              Неактивен
            </Badge>
          )}
        </div>
        {resource.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{resource.description}</p>
        )}
      </div>

      {/* Действия */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${resource.isActive ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
          title={resource.isActive ? "Деактивировать" : "Активировать"}
          onClick={() => onToggle(resource)}
          disabled={toggling}
        >
          {toggling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Редактировать"
          onClick={() => onEdit(resource)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          title="Удалить"
          onClick={() => onDelete(resource)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Основной компонент-вкладка ───────────────────────────────────────────────

export function MastersTab() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Resource | undefined>(undefined)
  const [toDelete, setToDelete] = useState<Resource | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Загрузка ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await apiFetch<{ resources: Resource[] }>("/api/modules/booking/resources")
        if (alive) setResources(data.resources ?? [])
      } catch {
        if (alive) toast.error("Не удалось загрузить список мастеров")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // ── Добавление ──
  const openAdd = () => {
    setEditing(undefined)
    setFormOpen(true)
  }

  // ── Редактирование ──
  const openEdit = (r: Resource) => {
    setEditing(r)
    setFormOpen(true)
  }

  // ── После сохранения формы ──
  const handleSaved = useCallback((saved: Resource) => {
    setResources((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved]
    })
  }, [])

  // ── Вкл/Выкл ──
  const handleToggle = useCallback(async (r: Resource) => {
    setTogglingId(r.id)
    try {
      const updated = await apiFetch<Resource>(
        `/api/modules/booking/resources/${r.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !r.isActive }),
        },
      )
      setResources((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      toast.success(updated.isActive ? "Мастер активирован" : "Мастер деактивирован")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось изменить статус")
    } finally {
      setTogglingId(null)
    }
  }, [])

  // ── Удаление ──
  const handleDeleteConfirm = useCallback(async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await apiFetch(`/api/modules/booking/resources/${toDelete.id}`, { method: "DELETE" })
      setResources((prev) => prev.filter((r) => r.id !== toDelete.id))
      toast.success("Мастер удалён")
      setToDelete(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить")
    } finally {
      setDeleting(false)
    }
  }, [toDelete])

  // ── Группировка по активности ──
  const active = resources.filter((r) => r.isActive)
  const inactive = resources.filter((r) => !r.isActive)

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Мастера и ресурсы</CardTitle>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" />
              Добавить
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Загрузка…
              </div>
            ) : resources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Мастера не добавлены</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Добавьте мастеров, кабинеты или оборудование, на которые ведётся запись.
                  </p>
                </div>
                <Button onClick={openAdd} variant="outline">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Добавить первого мастера
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Активные */}
                {active.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                      Активные — {active.length}
                    </p>
                    {active.map((r) => (
                      <ResourceRow
                        key={r.id}
                        resource={r}
                        onEdit={openEdit}
                        onDelete={setToDelete}
                        onToggle={handleToggle}
                        toggling={togglingId === r.id}
                      />
                    ))}
                  </div>
                )}

                {/* Неактивные */}
                {inactive.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                      Неактивные — {inactive.length}
                    </p>
                    {inactive.map((r) => (
                      <ResourceRow
                        key={r.id}
                        resource={r}
                        onEdit={openEdit}
                        onDelete={setToDelete}
                        onToggle={handleToggle}
                        toggling={togglingId === r.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground px-1">
          Мастера используются при записи клиентов на услуги. Деактивированные мастера не отображаются в виджете бронирования.
        </p>
      </div>

      {/* Форма добавления / редактирования */}
      <ResourceForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить мастера?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{toDelete?.name}</span> будет удалён. Это действие нельзя отменить.
              Связанные записи останутся, но без привязки к мастеру.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
