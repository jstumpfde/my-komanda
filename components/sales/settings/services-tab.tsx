"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Plus,
  Trash2,
  Loader2,
  Save,
  ArrowUp,
  ArrowDown,
  Pencil,
  X,
  Check,
  Package,
} from "lucide-react"

// ─── Типы ────────────────────────────────────────────────────────────────────

interface BookingService {
  id: string
  name: string
  description: string | null
  duration: number       // минуты
  price: number | null   // копейки в БД
  currency: string
  color: string
  isActive: boolean
  sortOrder: number
}

// Форма редактирования (цена в рублях для UI)
interface ServiceForm {
  name: string
  description: string
  duration: string       // строка для input
  price: string          // рубли (строка для input)
  color: string
  isActive: boolean
}

const EMPTY_FORM: ServiceForm = {
  name: "",
  description: "",
  duration: "60",
  price: "",
  color: "#3B82F6",
  isActive: true,
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function formToPayload(form: ServiceForm) {
  const priceRub = parseFloat(form.price)
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    duration: Math.max(1, parseInt(form.duration) || 60),
    // цена в копейках; если поле пустое — null
    price: isNaN(priceRub) || form.price.trim() === "" ? null : Math.round(priceRub * 100),
    color: form.color,
    isActive: form.isActive,
  }
}

function serviceToForm(s: BookingService): ServiceForm {
  return {
    name: s.name,
    description: s.description ?? "",
    duration: String(s.duration),
    price: s.price !== null ? String(s.price / 100) : "",
    color: s.color,
    isActive: s.isActive,
  }
}

function formatPrice(kopecks: number | null, currency: string): string {
  if (kopecks === null) return "—"
  const rub = kopecks / 100
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: currency || "RUB", maximumFractionDigits: 0 }).format(rub)
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
}

// ─── Строка услуги (режим просмотра) ─────────────────────────────────────────

function ServiceRow({
  service,
  index,
  total,
  onEdit,
  onDelete,
  onMove,
  onToggleActive,
}: {
  service: BookingService
  index: number
  total: number
  onEdit: () => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onToggleActive: (val: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/30">
      {/* Цвет */}
      <div className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: service.color }} />

      {/* Название + описание */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${!service.isActive ? "text-muted-foreground" : "text-foreground"}`}>
          {service.name}
        </p>
        {service.description && (
          <p className="text-xs text-muted-foreground truncate">{service.description}</p>
        )}
      </div>

      {/* Длительность */}
      <div className="hidden sm:block shrink-0 text-right">
        <p className="text-sm text-foreground">{formatDuration(service.duration)}</p>
        <p className="text-xs text-muted-foreground">длительность</p>
      </div>

      {/* Цена */}
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-foreground">{formatPrice(service.price, service.currency)}</p>
        <p className="text-xs text-muted-foreground hidden sm:block">цена</p>
      </div>

      {/* Активность */}
      <Switch
        checked={service.isActive}
        onCheckedChange={onToggleActive}
        title={service.isActive ? "Услуга активна" : "Услуга отключена"}
      />

      {/* Управление порядком */}
      <div className="flex flex-col shrink-0">
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors"
          title="Выше"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className="text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors"
          title="Ниже"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Кнопки действий */}
      <Button variant="ghost" size="icon" onClick={onEdit} title="Редактировать" className="shrink-0">
        <Pencil className="h-4 w-4 text-muted-foreground" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        title="Удалить"
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ─── Форма редактирования / добавления ───────────────────────────────────────

function ServiceFormRow({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  title,
}: {
  form: ServiceForm
  onChange: (patch: Partial<ServiceForm>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  title: string
}) {
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-4">
      <p className="text-sm font-medium text-foreground">{title}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Название */}
        <div className="space-y-1.5">
          <Label htmlFor="svc-name">Название *</Label>
          <Input
            id="svc-name"
            placeholder="Стрижка, маникюр, консультация..."
            value={form.name}
            onChange={e => onChange({ name: e.target.value })}
            autoFocus
          />
        </div>

        {/* Цвет */}
        <div className="space-y-1.5">
          <Label htmlFor="svc-color">Цвет</Label>
          <div className="flex items-center gap-2">
            <input
              id="svc-color"
              type="color"
              value={form.color}
              onChange={e => onChange({ color: e.target.value })}
              className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent p-0.5"
            />
            <span className="text-sm text-muted-foreground">{form.color}</span>
          </div>
        </div>

        {/* Длительность */}
        <div className="space-y-1.5">
          <Label htmlFor="svc-duration">Длительность (мин)</Label>
          <Input
            id="svc-duration"
            type="number"
            min={1}
            max={480}
            placeholder="60"
            value={form.duration}
            onChange={e => onChange({ duration: e.target.value })}
          />
        </div>

        {/* Цена */}
        <div className="space-y-1.5">
          <Label htmlFor="svc-price">Цена (руб.)</Label>
          <Input
            id="svc-price"
            type="number"
            min={0}
            step={0.01}
            placeholder="Оставьте пустым, если нет фиксированной цены"
            value={form.price}
            onChange={e => onChange({ price: e.target.value })}
          />
        </div>

        {/* Описание */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="svc-desc">Описание (необязательно)</Label>
          <Input
            id="svc-desc"
            placeholder="Краткое описание для клиента..."
            value={form.description}
            onChange={e => onChange({ description: e.target.value })}
          />
        </div>

        {/* Активность */}
        <div className="flex items-center gap-2 sm:col-span-2">
          <Switch
            id="svc-active"
            checked={form.isActive}
            onCheckedChange={val => onChange({ isActive: val })}
          />
          <Label htmlFor="svc-active">Услуга активна (видна при записи)</Label>
        </div>
      </div>

      {/* Кнопки */}
      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1" /> Отмена
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving || !form.name.trim()}>
          {saving
            ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            : <Check className="h-4 w-4 mr-1" />}
          Сохранить
        </Button>
      </div>
    </div>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export function ServicesTab() {
  const [services, setServices] = useState<BookingService[]>([])
  const [loading, setLoading] = useState(true)

  // Состояние добавления новой услуги
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState<ServiceForm>(EMPTY_FORM)
  const [addSaving, setAddSaving] = useState(false)

  // Состояние редактирования существующей услуги
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ServiceForm>(EMPTY_FORM)
  const [editSaving, setEditSaving] = useState(false)

  // ── Загрузка ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/booking/services")
      if (!res.ok) throw new Error()
      const json = await res.json()
      const rows: BookingService[] = json?.services ?? json?.data ?? json ?? []
      setServices(Array.isArray(rows) ? rows : [])
    } catch {
      toast.error("Не удалось загрузить список услуг")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ── Добавление ────────────────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    if (!addForm.name.trim()) return
    setAddSaving(true)
    try {
      const payload = {
        ...formToPayload(addForm),
        sortOrder: services.length,
      }
      const res = await fetch("/api/modules/booking/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error || "Ошибка сервера")
      }
      const json = await res.json()
      const created: BookingService = json?.data ?? json
      setServices(prev => [...prev, created])
      setAdding(false)
      setAddForm(EMPTY_FORM)
      toast.success(`Услуга «${created.name}» добавлена`)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось создать услугу")
    } finally {
      setAddSaving(false)
    }
  }, [addForm, services.length])

  // ── Редактирование ────────────────────────────────────────────────────────

  const startEdit = useCallback((service: BookingService) => {
    setEditingId(service.id)
    setEditForm(serviceToForm(service))
    setAdding(false)
  }, [])

  const handleEdit = useCallback(async () => {
    if (!editingId || !editForm.name.trim()) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/modules/booking/services/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(editForm)),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error || "Ошибка сервера")
      }
      const json = await res.json()
      const updated: BookingService = json?.data ?? json
      setServices(prev => prev.map(s => s.id === editingId ? updated : s))
      setEditingId(null)
      toast.success(`Услуга «${updated.name}» обновлена`)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось сохранить изменения")
    } finally {
      setEditSaving(false)
    }
  }, [editingId, editForm])

  // ── Удаление ──────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (service: BookingService) => {
    if (!confirm(`Удалить услугу «${service.name}»? Это действие необратимо.`)) return
    try {
      const res = await fetch(`/api/modules/booking/services/${service.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setServices(prev => prev.filter(s => s.id !== service.id))
      if (editingId === service.id) setEditingId(null)
      toast.success(`Услуга «${service.name}» удалена`)
    } catch {
      toast.error("Не удалось удалить услугу")
    }
  }, [editingId])

  // ── Переключение активности ───────────────────────────────────────────────

  const handleToggleActive = useCallback(async (service: BookingService, isActive: boolean) => {
    // Оптимистичное обновление
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, isActive } : s))
    try {
      const res = await fetch(`/api/modules/booking/services/${service.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error()
      // Ответ сервера применяем молча
      const json = await res.json()
      const updated: BookingService = json?.data ?? json
      setServices(prev => prev.map(s => s.id === service.id ? updated : s))
    } catch {
      // Откат при ошибке
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, isActive: !isActive } : s))
      toast.error("Не удалось изменить активность услуги")
    }
  }, [])

  // ── Изменение порядка ─────────────────────────────────────────────────────

  const handleMove = useCallback(async (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= services.length) return

    const next = [...services]
    ;[next[index], next[j]] = [next[j], next[index]]
    const reordered = next.map((s, idx) => ({ ...s, sortOrder: idx }))
    setServices(reordered)

    // Сохраняем оба затронутых элемента
    const toUpdate = [reordered[index], reordered[j]]
    try {
      await Promise.all(
        toUpdate.map(s =>
          fetch(`/api/modules/booking/services/${s.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: s.sortOrder }),
          })
        )
      )
    } catch {
      // Откат
      setServices(services)
      toast.error("Не удалось изменить порядок услуг")
    }
  }, [services])

  // ── Рендер ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Загрузка услуг…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Справочник услуг</CardTitle>
            {services.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {services.length}
              </span>
            )}
          </div>
          {!adding && (
            <Button
              size="sm"
              onClick={() => { setAdding(true); setEditingId(null) }}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Добавить услугу
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Форма добавления */}
          {adding && (
            <ServiceFormRow
              title="Новая услуга"
              form={addForm}
              onChange={patch => setAddForm(prev => ({ ...prev, ...patch }))}
              onSave={handleAdd}
              onCancel={() => { setAdding(false); setAddForm(EMPTY_FORM) }}
              saving={addSaving}
            />
          )}

          {/* Список услуг */}
          {services.length === 0 && !adding ? (
            <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Package className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Услуг пока нет</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Добавьте первую услугу — бот будет предлагать её клиентам при записи.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Добавить услугу
              </Button>
            </div>
          ) : (
            services.map((service, index) =>
              editingId === service.id ? (
                <ServiceFormRow
                  key={service.id}
                  title={`Редактирование: ${service.name}`}
                  form={editForm}
                  onChange={patch => setEditForm(prev => ({ ...prev, ...patch }))}
                  onSave={handleEdit}
                  onCancel={() => setEditingId(null)}
                  saving={editSaving}
                />
              ) : (
                <ServiceRow
                  key={service.id}
                  service={service}
                  index={index}
                  total={services.length}
                  onEdit={() => startEdit(service)}
                  onDelete={() => handleDelete(service)}
                  onMove={dir => handleMove(index, dir)}
                  onToggleActive={val => handleToggleActive(service, val)}
                />
              )
            )
          )}
        </CardContent>
      </Card>

      {/* Подсказка */}
      {services.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          Активные услуги доступны клиентам при записи через бота.
          Переключатель позволяет временно скрыть услугу без удаления.
        </p>
      )}
    </div>
  )
}
