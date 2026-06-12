"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Copy, Check, Pencil, Trash2, Save, BookMarked } from "lucide-react"
import { toast } from "sonner"

interface PresetDTO {
  id: string
  system: boolean
  name: string
  description: string | null
  preset: string
  customDays: number[] | null
  messages: string[] | null
  messagesOpened: string[] | null
  testPreset: string | null
  testMessages: string[] | null
  testMessagesOpened: string[] | null
}

const PRESET_LABEL: Record<string, string> = {
  off: "Выкл", soft: "Мягкий", standard: "Стандартный", aggressive: "Активный",
}

export function FollowupPresetsManager({ vacancyId }: { vacancyId: string }) {
  const [system, setSystem] = useState<PresetDTO[]>([])
  const [own, setOwn] = useState<PresetDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsName, setSaveAsName] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/modules/hr/followup-presets`)
      if (!res.ok) throw new Error()
      const d = (await res.json()) as { data?: { system: PresetDTO[]; own: PresetDTO[] } } & { system?: PresetDTO[]; own?: PresetDTO[] }
      const body = d.data ?? d
      setSystem(body.system ?? [])
      setOwn(body.own ?? [])
    } catch {
      toast.error("Не удалось загрузить пресеты")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function apply(p: PresetDTO) {
    setBusyId(p.id)
    try {
      const res = await fetch(`/api/modules/hr/followup-presets/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancyId, presetId: p.id }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Пресет «${p.name}» применён — обновляю настройки…`)
      setTimeout(() => window.location.reload(), 900)
    } catch {
      toast.error("Не удалось применить пресет")
      setBusyId(null)
    }
  }

  async function copy(p: PresetDTO) {
    setBusyId(p.id)
    try {
      const res = await fetch(`/api/modules/hr/followup-presets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${p.name} (копия)`, description: p.description, preset: p.preset,
          customDays: p.customDays, messages: p.messages, messagesOpened: p.messagesOpened,
          testPreset: p.testPreset, testMessages: p.testMessages, testMessagesOpened: p.testMessagesOpened,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Скопировано в «Мои пресеты»")
      await load()
    } catch {
      toast.error("Не удалось скопировать")
    } finally { setBusyId(null) }
  }

  async function rename(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/modules/hr/followup-presets/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) throw new Error()
      setEditId(null)
      await load()
    } catch {
      toast.error("Не удалось переименовать")
    } finally { setBusyId(null) }
  }

  async function remove(p: PresetDTO) {
    if (!confirm(`Удалить пресет «${p.name}»?`)) return
    setBusyId(p.id)
    try {
      const res = await fetch(`/api/modules/hr/followup-presets/${p.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Пресет удалён")
      await load()
    } catch {
      toast.error("Не удалось удалить")
    } finally { setBusyId(null) }
  }

  async function saveFromVacancy() {
    setBusyId("__save__")
    try {
      const res = await fetch(`/api/modules/hr/followup-presets/save-from-vacancy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancyId, name: saveAsName.trim() }),
      })
      if (!res.ok) throw new Error()
      toast.success("Текущий дожим сохранён как пресет")
      setSaveAsOpen(false); setSaveAsName("")
      await load()
    } catch {
      toast.error("Не удалось сохранить пресет")
    } finally { setBusyId(null) }
  }

  function row(p: PresetDTO) {
    const isEditing = editId === p.id
    return (
      <div key={p.id} className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1.5">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-sm" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") rename(p.id) }} />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => rename(p.id)} disabled={busyId === p.id}>
                <Check className="w-3.5 h-3.5 text-green-600" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{p.name}</span>
              <Badge variant="outline" className="text-[10px] h-4">{PRESET_LABEL[p.preset] ?? p.preset}</Badge>
              {p.system && <Badge variant="secondary" className="text-[10px] h-4">системный</Badge>}
            </div>
          )}
          {!isEditing && p.description && <p className="text-[11px] text-muted-foreground truncate">{p.description}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => apply(p)} disabled={busyId === p.id}>
            {busyId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Применить"}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Копировать в мои" onClick={() => copy(p)} disabled={busyId === p.id}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
          {!p.system && (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Переименовать"
                onClick={() => { setEditId(p.id); setEditName(p.name) }}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" title="Удалить"
                onClick={() => remove(p)} disabled={busyId === p.id}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BookMarked className="w-4 h-4" /> Пресеты дожима
        </CardTitle>
        <CardDescription>
          Готовые наборы расписания и текстов касаний. «Применить» — поставить вакансии,
          «Копировать» — сделать свой на основе любого, «Сохранить текущий» — запомнить
          нынешний дожим вакансии как пресет.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Сохранить текущий как пресет */}
        {saveAsOpen ? (
          <div className="flex items-center gap-1.5">
            <Input value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} placeholder="Название пресета"
              className="h-8 text-sm" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveFromVacancy() }} />
            <Button size="sm" className="h-8 text-xs" onClick={saveFromVacancy} disabled={busyId === "__save__"}>
              {busyId === "__save__" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Сохранить"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSaveAsOpen(false)}>Отмена</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setSaveAsOpen(true)}>
            <Save className="w-3.5 h-3.5" /> Сохранить текущий дожим как пресет
          </Button>
        )}

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {own.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Мои пресеты</p>
                {own.map(row)}
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Системные</p>
              {system.map(row)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
