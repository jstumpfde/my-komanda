"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Plus, Copy, Trash2, Link } from "lucide-react"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

interface TrackingLink {
  id: string
  name: string
  url: string
  clicks: number
  applications: number
  conversion: string
}

interface TrackingLinksProps {
  sourceName: string
  sourceId: string
}

export function TrackingLinks({ sourceName, sourceId }: TrackingLinksProps) {
  const [links, setLinks] = useState<TrackingLink[]>([])
  const [createMode, setCreateMode] = useState(false)
  const [newName, setNewName] = useState("")
  const [newTarget, setNewTarget] = useState("pool")

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(`https://${url}`)
    toast.success("Ссылка скопирована")
  }

  const handleDelete = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id))
  }

  const handleCreate = () => {
    if (!newName.trim()) return
    const slug = newName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
    const srcSlug = sourceName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
    const newLink: TrackingLink = {
      id: `tl-${Date.now()}`,
      name: newName.trim(),
      url: `company24.pro/apply?src=${srcSlug}&place=${slug}`,
      clicks: 0,
      applications: 0,
      conversion: "0%",
    }
    setLinks((prev) => [...prev, newLink])
    setNewName("")
    setNewTarget("pool")
    setCreateMode(false)
    toast.success("Ссылка создана")
  }

  return (
    <div className="space-y-2">
      {links.length > 0 && (
        <TableCard>
          <DataTable>
            <DataHead>
              <DataHeadCell>Название</DataHeadCell>
              <DataHeadCell>Ссылка</DataHeadCell>
              <DataHeadCell align="center">Переходов</DataHeadCell>
              <DataHeadCell align="center">Заявок</DataHeadCell>
              <DataHeadCell align="center">Конв.</DataHeadCell>
              <DataHeadCell></DataHeadCell>
            </DataHead>
            <tbody>
              {links.map((link) => (
                <DataRow key={link.id}>
                  <DataCell className="font-medium">{link.name}</DataCell>
                  <DataCell className="text-[11px] text-muted-foreground truncate max-w-[180px]">{link.url}</DataCell>
                  <DataCell align="center">{link.clicks}</DataCell>
                  <DataCell align="center" className="font-medium">{link.applications}</DataCell>
                  <DataCell align="center" className="text-emerald-600 font-semibold">{link.conversion}</DataCell>
                  <DataCell>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(link.url)}><Copy className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(link.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </DataCell>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </TableCard>
      )}

      {links.length === 0 && !createMode && (
        <p className="text-xs text-muted-foreground py-2">Нет трекинг-ссылок для этого источника</p>
      )}

      {createMode ? (
        <div className="space-y-2 p-3 bg-muted/20 rounded-lg border">
          <div className="grid gap-1">
            <Label className="text-[11px]">Название размещения</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="DevOps Moscow" className="h-7 text-xs" />
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px]">Целевая страница</Label>
            <Select value={newTarget} onValueChange={setNewTarget}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pool">Общая форма резерва</SelectItem>
                <SelectItem value="sales">Менеджер по продажам</SelectItem>
                <SelectItem value="devops">DevOps инженер</SelectItem>
                <SelectItem value="hr">HR-менеджер</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {newName.trim() && (
            <div className="flex items-center gap-1.5 p-2 bg-background rounded border text-[10px] text-muted-foreground">
              <Link className="w-3 h-3 shrink-0" />
              <span className="truncate">company24.pro/apply?src={sourceName.toLowerCase().replace(/\s+/g, "-")}&place={newName.trim().toLowerCase().replace(/\s+/g, "-")}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="h-6 text-[11px]" onClick={handleCreate} disabled={!newName.trim()}>Создать</Button>
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setCreateMode(false)}>Отмена</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 w-full" onClick={() => setCreateMode(true)}>
          <Plus className="w-3 h-3" />Создать ссылку
        </Button>
      )}
    </div>
  )
}
