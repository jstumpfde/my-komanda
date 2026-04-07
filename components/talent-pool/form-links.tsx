"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Link, Plus, Copy, CheckCircle2, Code } from "lucide-react"
import { nanoid } from "nanoid"

// ─── Mock data ─────────────────────────────────────────
interface TrackingLink {
  id: string
  source: string
  name: string
  shortUrl: string
  clicks: number
  candidates: number
}

const MOCK_LINKS: TrackingLink[] = [
  { id: "fl1", source: "Telegram", name: "DevOps Moscow", shortUrl: "/f/telegram-devops-mnk123", clicks: 145, candidates: 12 },
  { id: "fl2", source: "VK", name: "Работа в IT", shortUrl: "/f/vk-rabota-it-mnk456", clicks: 234, candidates: 18 },
  { id: "fl3", source: "Сайт", name: "Карьерная страница", shortUrl: "/f/site-career-mnk789", clicks: 567, candidates: 34 },
  { id: "fl4", source: "LinkedIn", name: "Backend пост", shortUrl: "/f/linkedin-backend-mnk012", clicks: 312, candidates: 22 },
  { id: "fl5", source: "QR-код", name: "Стенд HRTech", shortUrl: "/f/qr-hrtech-mnk345", clicks: 78, candidates: 9 },
]

const SOURCE_OPTIONS = ["Telegram", "VK", "LinkedIn", "Сайт", "QR-код", "hh.ru", "Email", "Другой"]

export function FormLinks() {
  const [links, setLinks] = useState(MOCK_LINKS)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [createMode, setCreateMode] = useState(false)
  const [newSource, setNewSource] = useState("")
  const [newName, setNewName] = useState("")

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(`https://company24.pro${url}`)
    setCopiedId(id)
    toast.success("Ссылка скопирована")
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCreate = () => {
    if (!newName.trim() || !newSource) return
    const slug = newName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
    const srcSlug = newSource.toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "")
    const newLink: TrackingLink = {
      id: `fl-${Date.now()}`,
      source: newSource,
      name: newName.trim(),
      shortUrl: `/f/${srcSlug}-${slug}-${nanoid(6)}`,
      clicks: 0,
      candidates: 0,
    }
    setLinks((prev) => [...prev, newLink])
    setNewSource("")
    setNewName("")
    setCreateMode(false)
    toast.success("Ссылка создана")
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link className="w-4 h-4 text-purple-600" />
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
              <Button size="sm" className="text-xs" onClick={handleCreate} disabled={!newName.trim() || !newSource}>Создать</Button>
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
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Источник</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Название</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Короткая ссылка</th>
                <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Клики</th>
                <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Кандидаты</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{link.source}</td>
                  <td className="px-3 py-2 text-xs font-medium">{link.name}</td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground font-mono">{link.shortUrl}</td>
                  <td className="px-2 py-2 text-xs text-center">{link.clicks}</td>
                  <td className="px-2 py-2 text-xs text-center font-semibold">{link.candidates}</td>
                  <td className="px-2 py-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(link.id, link.shortUrl)}>
                      {copiedId === link.id ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* HTML section */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Code className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold">Полная страница (HTML)</span>
            <Badge variant="outline" className="text-[9px] border-transparent bg-blue-500/10 text-blue-700">Способ 4</Badge>
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
