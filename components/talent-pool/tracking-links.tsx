"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { Plus, Copy, Trash2, Link } from "lucide-react"

// ─── Mock data ─────────────────────────────────────────
interface TrackingLink {
  id: string
  name: string
  url: string
  clicks: number
  applications: number
  conversion: string
}

const MOCK_LINKS: Record<string, TrackingLink[]> = {
  Telegram: [
    { id: "tl1", name: "DevOps Moscow", url: "company24.pro/apply?src=telegram&place=devops-moscow", clicks: 145, applications: 12, conversion: "8.3%" },
    { id: "tl2", name: "HR Network", url: "company24.pro/apply?src=telegram&place=hr-network", clicks: 89, applications: 5, conversion: "5.6%" },
  ],
  VK: [
    { id: "tl3", name: "Работа в IT", url: "company24.pro/apply?src=vk&place=rabota-it", clicks: 234, applications: 18, conversion: "7.7%" },
  ],
  "Сайт компании": [
    { id: "tl4", name: "Карьерная страница", url: "company24.pro/apply?src=website&place=career", clicks: 567, applications: 34, conversion: "6.0%" },
  ],
  LinkedIn: [
    { id: "tl5", name: "Backend", url: "company24.pro/apply?src=linkedin&place=backend", clicks: 312, applications: 22, conversion: "7.1%" },
  ],
  "QR-код": [
    { id: "tl6", name: "HRTech конференция", url: "company24.pro/apply?src=qr&place=hrtech", clicks: 78, applications: 9, conversion: "11.5%" },
  ],
}

interface TrackingLinksProps {
  sourceName: string
  sourceId: string
}

export function TrackingLinks({ sourceName, sourceId }: TrackingLinksProps) {
  const [links, setLinks] = useState<TrackingLink[]>(MOCK_LINKS[sourceName] || [])
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
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left text-[10px] font-semibold text-muted-foreground px-3 py-2">Название</th>
                  <th className="text-left text-[10px] font-semibold text-muted-foreground px-2 py-2">Ссылка</th>
                  <th className="text-center text-[10px] font-semibold text-muted-foreground px-2 py-2">Переходов</th>
                  <th className="text-center text-[10px] font-semibold text-muted-foreground px-2 py-2">Заявок</th>
                  <th className="text-center text-[10px] font-semibold text-muted-foreground px-2 py-2">Конв.</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs font-medium">{link.name}</td>
                    <td className="px-2 py-2 text-[11px] text-muted-foreground truncate max-w-[180px]">{link.url}</td>
                    <td className="px-2 py-2 text-xs text-center">{link.clicks}</td>
                    <td className="px-2 py-2 text-xs text-center font-medium">{link.applications}</td>
                    <td className="px-2 py-2 text-xs text-center text-emerald-600 font-semibold">{link.conversion}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(link.url)}><Copy className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(link.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
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
                <SelectItem value="pool">Общая форма Talent Pool</SelectItem>
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
