"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Link, Plus, Copy, CheckCircle2, Code, Trash2 } from "lucide-react"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

interface TrackingLink {
  id: string
  source: string
  name: string
  shortUrl: string
  clicks: number
  candidates: number
}
interface ApiLink { id: string; source: string; name: string; slug: string; clicks: number; candidates: number }

const SOURCE_OPTIONS = ["Telegram", "VK", "LinkedIn", "Сайт", "QR-код", "hh.ru", "Email", "Другой"]

export function FormLinks() {
  const [links, setLinks] = useState<TrackingLink[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [createMode, setCreateMode] = useState(false)
  const [newSource, setNewSource] = useState("")
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/hr/talent-pool/form-links")
      const data = await res.json() as { links?: ApiLink[] }
      setLinks((data.links ?? []).map(l => ({
        id: l.id, source: l.source, name: l.name,
        shortUrl: `/f/${l.slug}`, clicks: l.clicks, candidates: l.candidates,
      })))
    } catch { /* пусто */ }
  }, [])
  useEffect(() => { load() }, [load])

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(`https://company24.pro${url}`)
    setCopiedId(id)
    toast.success("Ссылка скопирована")
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newSource) return
    setSaving(true)
    try {
      const res = await fetch("/api/modules/hr/talent-pool/form-links", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: newSource, name: newName.trim() }),
      })
      if (!res.ok) { toast.error("Не удалось создать ссылку"); return }
      setNewSource(""); setNewName(""); setCreateMode(false)
      toast.success("Ссылка создана")
      await load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/modules/hr/talent-pool/form-links/${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Не удалось удалить"); return }
    setLinks(prev => prev.filter(l => l.id !== id))
    toast.success("Ссылка удалена")
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link className="w-4 h-4 text-violet-600" />
          <h3 className="text-sm font-semibold">Источники и ссылки</h3>
        </div>
        <p className="text-xs text-muted-foreground">Короткие ссылки для отслеживания источников кандидатов</p>
      </div>

      {createMode ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold">Новая ссылка</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-[11px]">Источник</Label>
                <Select value={newSource} onValueChange={setNewSource}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Выберите источник" /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-[11px]">Название размещения</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="DevOps Moscow" className="h-8 text-xs" />
              </div>
            </div>
            {newSource && newName.trim() && (
              <div className="flex items-center gap-1.5 p-2 bg-muted/30 rounded border text-[10px] text-muted-foreground">
                <Link className="w-3 h-3 shrink-0" />
                <span className="truncate">company24.pro/f/{newSource.toLowerCase().replace(/\s+/g, "-")}-{newName.trim().toLowerCase().replace(/\s+/g, "-")}-xxxxxx</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="text-xs" onClick={handleCreate} disabled={!newName.trim() || !newSource || saving}>{saving ? "…" : "Создать"}</Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => { setCreateMode(false); setNewSource(""); setNewName("") }}>Отмена</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="sm" className="text-xs gap-1.5 w-full" onClick={() => setCreateMode(true)}>
          <Plus className="w-3.5 h-3.5" />Создать ссылку
        </Button>
      )}

      {/* Table */}
      <TableCard>
        <DataTable>
          <DataHead>
            <DataHeadCell>Источник</DataHeadCell>
            <DataHeadCell>Название</DataHeadCell>
            <DataHeadCell>Короткая ссылка</DataHeadCell>
            <DataHeadCell align="center">Клики</DataHeadCell>
            <DataHeadCell align="center">Кандидаты</DataHeadCell>
            <DataHeadCell></DataHeadCell>
          </DataHead>
          <tbody>
            {links.map((link) => (
              <DataRow key={link.id}>
                <DataCell className="text-muted-foreground">{link.source}</DataCell>
                <DataCell className="font-medium">{link.name}</DataCell>
                <DataCell className="text-[11px] text-muted-foreground font-mono">{link.shortUrl}</DataCell>
                <DataCell align="center">{link.clicks}</DataCell>
                <DataCell align="center" className="font-semibold">{link.candidates}</DataCell>
                <DataCell>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Копировать" onClick={() => handleCopy(link.id, link.shortUrl)}>
                      {copiedId === link.id ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" title="Удалить" onClick={() => handleDelete(link.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </DataCell>
              </DataRow>
            ))}
            {links.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Пока нет ссылок. Создайте первую для отслеживания источника.</td></tr>
            )}
          </tbody>
        </DataTable>
      </TableCard>

      {/* HTML section */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Code className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold">Полная страница (HTML)</span>
            <Badge variant="secondary" className="text-[9px]">Способ 4</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">Вставьте этот код на вашу HTML-страницу для отображения формы.</p>
          <div className="p-2 bg-muted/30 rounded border">
            <code className="text-[10px] text-muted-foreground break-all">
              {`<iframe src="https://company24.pro/embed/talent-pool-form" width="100%" height="600" frameborder="0" style="border-radius:12px"></iframe>`}
            </code>
          </div>
          <Button variant="ghost" size="sm" className="text-xs mt-2 gap-1" onClick={() => { navigator.clipboard.writeText(`<iframe src="https://company24.pro/embed/talent-pool-form" width="100%" height="600" frameborder="0" style="border-radius:12px"></iframe>`); toast.success("Код скопирован") }}>
            <Copy className="w-3 h-3" />Копировать код
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
