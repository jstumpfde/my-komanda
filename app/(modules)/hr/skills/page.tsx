"use client"

import { useEffect, useState } from "react"
import { Plus, Search, Zap, Heart, Wrench, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

interface Skill {
  id: string
  name: string
  category: string
  description: string | null
  tenantId: string | null
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  hard:   { label: "Hard skill",  icon: Zap,    color: "bg-blue-100 text-blue-700" },
  soft:   { label: "Soft skill",  icon: Heart,  color: "bg-pink-100 text-pink-700" },
  tool:   { label: "Инструмент", icon: Wrench, color: "bg-orange-100 text-orange-700" },
  domain: { label: "Домен",      icon: Globe,  color: "bg-purple-100 text-purple-700" },
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: "", category: "soft", description: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/modules/hr/skills")
      .then(r => r.json())
      .then(setSkills)
      .finally(() => setLoading(false))
  }, [])

  const filtered = skills.filter(s => {
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch("/api/modules/hr/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const skill = await res.json()
      setSkills(prev => [skill, ...prev])
      setDialogOpen(false)
      setForm({ name: "", category: "soft", description: "" })
    }
    setSaving(false)
  }

  async function handleSeed() {
    await fetch("/api/dev/seed-skills")
    const res = await fetch("/api/modules/hr/skills")
    setSkills(await res.json())
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Справочник навыков</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{skills.length} навыков</p>
        </div>
        <div className="flex gap-2">
          {skills.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleSeed}>Загрузить системные</Button>
          )}
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4 mr-1" />Добавить навык
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Поиск..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {Object.entries(CATEGORY_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(CATEGORY_META).map(([k, v]) => {
          const cnt = skills.filter(s => s.category === k).length
          const Icon = v.icon
          return (
            <button
              key={k}
              onClick={() => setCategoryFilter(categoryFilter === k ? "all" : k)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                categoryFilter === k ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              )}
            >
              <Icon className="size-3.5" />
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", v.color)}>{v.label}</span>
              <span className="text-muted-foreground font-medium">{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">Навык</TableHead>
              <TableHead className="text-xs w-32">Тип</TableHead>
              <TableHead className="text-xs">Описание</TableHead>
              <TableHead className="text-xs w-24">Источник</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                  Навыки не найдены
                </TableCell>
              </TableRow>
            ) : filtered.map(skill => {
              const meta = CATEGORY_META[skill.category]
              const Icon = meta?.icon ?? Zap
              return (
                <TableRow key={skill.id}>
                  <TableCell className="font-medium text-sm">{skill.name}</TableCell>
                  <TableCell>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 w-fit", meta?.color)}>
                      <Icon className="size-3" />
                      {meta?.label ?? skill.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {skill.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={skill.tenantId ? "secondary" : "outline"} className="text-[10px]">
                      {skill.tenantId ? "Свой" : "Системный"}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новый навык</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Название *</Label>
              <Input
                placeholder="Например: Работа с CRM"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Тип</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Описание</Label>
              <Textarea
                rows={3}
                placeholder="Краткое описание навыка"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? "Сохранение..." : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
    </SidebarInset>
    </SidebarProvider>
  )
}
