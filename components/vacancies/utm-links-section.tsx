"use client"

import { useState, useEffect, useCallback } from "react"
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
import { Link2, Plus, Copy, Loader2, ExternalLink, MousePointerClick, Users } from "lucide-react"
import { toast } from "sonner"

// ─── Типы ────────────────────────────────────────────────────

interface UtmLink {
  id: string
  vacancyId: string
  source: string
  name: string
  slug: string
  clicks: number
  candidatesCount: number
  createdAt: string
}

const UTM_SOURCES = [
  { value: "telegram",  label: "Telegram",  color: "#0088cc" },
  { value: "whatsapp",  label: "WhatsApp",  color: "#25d366" },
  { value: "vk",        label: "ВКонтакте", color: "#4a76a8" },
  { value: "email",     label: "Email",     color: "#ea4335" },
  { value: "site",      label: "Сайт",      color: "#8b5cf6" },
  { value: "qr",        label: "QR-код",    color: "#111827" },
  { value: "agency",    label: "Агентство",  color: "#f59e0b" },
  { value: "other",     label: "Другое",    color: "#6b7280" },
] as const

function getSourceMeta(source: string) {
  return UTM_SOURCES.find((s) => s.value === source) || { value: source, label: source, color: "#6b7280" }
}

// ─── Component ───────────────────────────────────────────────

interface UtmLinksSectionProps {
  vacancyId: string
  vacancySlug: string
}

export function UtmLinksSection({ vacancyId, vacancySlug }: UtmLinksSectionProps) {
  const [links, setLinks] = useState<UtmLink[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newSource, setNewSource] = useState("")
  const [newName, setNewName] = useState("")

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/utm-links`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLinks(Array.isArray(data) ? data : [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [vacancyId])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  const buildUrl = (link: UtmLink) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://mykomanda.ru"
    return `${origin}/v/${link.slug}`
  }

  const copyUrl = (link: UtmLink) => {
    navigator.clipboard.writeText(buildUrl(link))
    toast.success("Ссылка скопирована")
  }

  const handleCreate = async () => {
    if (!newSource) {
      toast.error("Выберите источник")
      return
    }
    if (!newName.trim()) {
      toast.error("Введите название")
      return
    }

    setCreating(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/utm-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: newSource, name: newName.trim() }),
      })
      if (!res.ok) throw new Error()
      const link = await res.json()
      setLinks((prev) => [...prev, link])
      setShowDialog(false)
      setNewSource("")
      setNewName("")
      toast.success("Ссылка создана")
    } catch {
      toast.error("Не удалось создать ссылку")
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Источники и ссылки
            </CardTitle>
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowDialog(true)}>
              <Plus className="w-3.5 h-3.5" />
              Создать ссылку
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Создавайте UTM-ссылки для отслеживания источников кандидатов
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Нет UTM-ссылок. Создайте первую для отслеживания источников.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Источник</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Название</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Ссылка</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">
                      <span className="inline-flex items-center gap-1"><MousePointerClick className="w-3 h-3" />Клики</span>
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">
                      <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />Кандидаты</span>
                    </th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link, i) => {
                    const meta = getSourceMeta(link.source)
                    return (
                      <tr key={link.id} className={`border-b last:border-0 hover:bg-muted/20 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                              style={{ backgroundColor: meta.color }}
                            >
                              {meta.label.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium">{meta.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">{link.name}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-primary font-mono">
                            /v/{link.slug}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{link.clicks}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{link.candidatesCount}</td>
                        <td className="px-4 py-3">
                          <button
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
                            onClick={() => copyUrl(link)}
                          >
                            <Copy className="w-3 h-3" />
                            Скопировать
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Диалог создания ссылки */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать UTM-ссылку</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Источник</Label>
              <Select value={newSource} onValueChange={setNewSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите источник..." />
                </SelectTrigger>
                <SelectContent>
                  {UTM_SOURCES.map((src) => (
                    <SelectItem key={src.value} value={src.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: src.color }}
                        />
                        {src.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Название</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Например: Рассылка апрель 2026"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Поможет отличить ссылки одного источника
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
