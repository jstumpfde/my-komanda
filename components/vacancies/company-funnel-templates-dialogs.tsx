"use client"

// Group 15: диалоги управления пер-компанийной библиотекой шаблонов воронки.
// — SaveFunnelTemplateDialog: HR сохраняет текущий config как именованный шаблон.
// — ManageFunnelTemplatesDialog: список шаблонов, переименование, default-toggle, удаление.
// API: /api/modules/hr/company-funnel-templates[/[id]]

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Pencil, Star, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import type { FunnelBlock, FunnelConfig } from "@/lib/funnel-builder/blocks"

export interface CompanyFunnelTemplate {
  id:           string
  name:         string
  description:  string | null
  configJson:   FunnelConfig
  isDefault:    boolean
  createdAt:    string
  updatedAt:    string
}

interface SaveDialogProps {
  open:           boolean
  onOpenChange:   (open: boolean) => void
  currentBlocks:  FunnelBlock[]
  onSaved:        (template: CompanyFunnelTemplate) => void
}

export function SaveFunnelTemplateDialog({ open, onOpenChange, currentBlocks, onSaved }: SaveDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setName("")
      setDescription("")
      setIsDefault(false)
      setSaving(false)
    }
  }, [open])

  const handleSave = async () => {
    if (name.trim().length === 0) {
      toast.error("Введите название шаблона")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/company-funnel-templates", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:        name.trim(),
          description: description.trim() || null,
          configJson:  { blocks: currentBlocks },
          isDefault,
        }),
      })
      const data = await res.json() as { ok?: boolean; template?: CompanyFunnelTemplate; error?: string }
      if (!res.ok || !data.ok || !data.template) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      toast.success("Шаблон создан", { duration: 1500 })
      onSaved(data.template)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось создать шаблон")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Сохранить текущую воронку как шаблон</DialogTitle>
          <DialogDescription>
            Шаблон сохранится на уровне компании и будет доступен из dropdown «Применить шаблон»
            на любой другой вакансии.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cft-name">Название</Label>
            <Input
              id="cft-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Напр. «С AI-чатом для салонов»"
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cft-desc">Описание (необязательно)</Label>
            <Textarea
              id="cft-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Когда использовать этот шаблон"
              rows={3}
              maxLength={1000}
            />
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div>
              <Label className="text-sm">Использовать по умолчанию</Label>
              <p className="text-xs text-muted-foreground">
                Новые вакансии компании будут стартовать с этого шаблона
              </p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ManageDialogProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  onChanged:    () => void
}

export function ManageFunnelTemplatesDialog({ open, onOpenChange, onChanged }: ManageDialogProps) {
  const [templates, setTemplates] = useState<CompanyFunnelTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editDesc, setEditDesc] = useState("")

  const reload = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/modules/hr/company-funnel-templates")
      const data = await res.json() as { templates?: CompanyFunnelTemplate[] }
      setTemplates(data.templates ?? [])
    } catch {
      toast.error("Не удалось загрузить шаблоны")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void reload()
    else setEditingId(null)
  }, [open])

  const startEdit = (t: CompanyFunnelTemplate) => {
    setEditingId(t.id)
    setEditName(t.name)
    setEditDesc(t.description ?? "")
  }

  const saveEdit = async (id: string) => {
    const name = editName.trim()
    if (name.length === 0) {
      toast.error("Название обязательно")
      return
    }
    try {
      const res = await fetch(`/api/modules/hr/company-funnel-templates/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, description: editDesc.trim() || null }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success("Шаблон обновлён", { duration: 1500 })
      setEditingId(null)
      onChanged()
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить")
    }
  }

  const toggleDefault = async (t: CompanyFunnelTemplate) => {
    try {
      const res = await fetch(`/api/modules/hr/company-funnel-templates/${t.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isDefault: !t.isDefault }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success(t.isDefault ? "Снят флаг «по умолчанию»" : "Назначен шаблоном по умолчанию", { duration: 1500 })
      onChanged()
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось обновить")
    }
  }

  const removeTemplate = async (t: CompanyFunnelTemplate) => {
    if (!confirm(`Удалить шаблон «${t.name}»?`)) return
    try {
      const res = await fetch(`/api/modules/hr/company-funnel-templates/${t.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success("Шаблон удалён", { duration: 1500 })
      onChanged()
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Управление шаблонами воронки</DialogTitle>
          <DialogDescription>
            Шаблоны компании. Один из них может быть назначен по умолчанию — новые вакансии
            будут стартовать с него.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {loading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
              Загрузка…
            </div>
          )}
          {!loading && templates.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              У компании ещё нет своих шаблонов. Создайте первый через
              «Сохранить текущую как шаблон…» в dropdown «Применить шаблон».
            </p>
          )}
          {!loading && templates.map((t) => {
            const isEditing = editingId === t.id
            return (
              <div
                key={t.id}
                className="rounded-lg border bg-card px-3 py-2.5"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Название" />
                    <Textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Описание (необязательно)"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4 mr-1" />Отмена
                      </Button>
                      <Button size="sm" onClick={() => void saveEdit(t.id)}>Сохранить</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate">{t.name}</span>
                        {t.isDefault && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Star className="h-3 w-3" />по умолчанию
                          </Badge>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        {(t.configJson?.blocks ?? []).filter((b) => b.enabled).length} блоков включено
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t.isDefault ? "Снять «по умолчанию»" : "Сделать «по умолчанию»"}
                        onClick={() => void toggleDefault(t)}
                      >
                        <Star className={`h-4 w-4 ${t.isDefault ? "fill-amber-400 text-amber-500" : ""}`} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Переименовать"
                        onClick={() => startEdit(t)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Удалить"
                        onClick={() => void removeTemplate(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
