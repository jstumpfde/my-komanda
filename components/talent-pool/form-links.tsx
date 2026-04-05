"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Link, Plus, Copy, CheckCircle2, Code } from "lucide-react"

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

export function FormLinks() {
  const [links] = useState(MOCK_LINKS)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(`https://company24.pro${url}`)
    setCopiedId(id)
    toast.success("Ссылка скопирована")
    setTimeout(() => setCopiedId(null), 2000)
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

      <Button variant="outline" size="sm" className="text-xs gap-1.5 w-full" onClick={() => toast.info("Конструктор ссылок в разработке")}>
        <Plus className="w-3.5 h-3.5" />Создать ссылку
      </Button>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2.5">Источник</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2.5">Название</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2.5">Короткая ссылка</th>
                <th className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-2.5">👆 Клики</th>
                <th className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-2.5">👤 Кандидаты</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b last:border-0 hover:bg-muted/20">
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
