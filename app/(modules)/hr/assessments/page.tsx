"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { ClipboardCheck, Clock, CheckCircle2, TrendingUp, Plus, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface Assessment {
  id: string
  employeeId: string
  type: string
  status: string
  period: string | null
  createdAt: string
  completedAt: string | null
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:       { label: "Черновик",    color: "bg-gray-100 text-gray-600" },
  in_progress: { label: "В процессе", color: "bg-blue-100 text-blue-700" },
  completed:   { label: "Завершена",  color: "bg-green-100 text-green-700" },
}

const TYPE_LABELS: Record<string, string> = {
  self:    "Самооценка",
  manager: "Менеджер",
  peer:    "Коллеги",
  "360":   "360°",
}

const CATEGORY_COLORS: Record<string, string> = {
  hard:   "#3b82f6",
  soft:   "#ec4899",
  tool:   "#f97316",
  domain: "#8b5cf6",
}

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ employeeId: "", type: "self", period: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/modules/hr/assessments")
      .then(r => r.json())
      .then(setAssessments)
      .finally(() => setLoading(false))
  }, [])

  const inProgress = assessments.filter(a => a.status === "in_progress").length
  const completed = assessments.filter(a => a.status === "completed").length
  const total = assessments.length

  // Mock heatmap data — skills × categories
  const heatmapData = [
    { name: "Продажи",       hard: 3.2, soft: 3.8, tool: 2.9, domain: 3.5 },
    { name: "Маркетинг",     hard: 3.0, soft: 4.1, tool: 3.3, domain: 2.8 },
    { name: "Разработка",    hard: 4.2, soft: 3.1, tool: 4.0, domain: 3.7 },
    { name: "HR",            hard: 2.8, soft: 4.5, tool: 3.0, domain: 3.2 },
  ]

  async function handleCreate() {
    if (!form.employeeId.trim()) return
    setSaving(true)
    const res = await fetch("/api/modules/hr/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, period: form.period || null }),
    })
    if (res.ok) {
      const a = await res.json()
      setAssessments(prev => [a, ...prev])
      setDialogOpen(false)
      setForm({ employeeId: "", type: "self", period: "" })
    }
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Оценка персонала</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Skills assessment & gap analysis</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-1" />Новая оценка
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-9 rounded-lg bg-blue-50">
                <Clock className="size-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{inProgress}</p>
                <p className="text-xs text-muted-foreground">В процессе</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-9 rounded-lg bg-green-50">
                <CheckCircle2 className="size-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completed}</p>
                <p className="text-xs text-muted-foreground">Завершено</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-9 rounded-lg bg-purple-50">
                <TrendingUp className="size-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{total > 0 ? "3.7" : "—"}</p>
                <p className="text-xs text-muted-foreground">Средний уровень</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap — skills by dept */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Уровень навыков по отделам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={heatmapData} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => v.toFixed(1)} />
                <Bar dataKey="hard"   name="Hard skills"  fill={CATEGORY_COLORS.hard}   radius={[3,3,0,0]} />
                <Bar dataKey="soft"   name="Soft skills"  fill={CATEGORY_COLORS.soft}   radius={[3,3,0,0]} />
                <Bar dataKey="tool"   name="Инструменты" fill={CATEGORY_COLORS.tool}   radius={[3,3,0,0]} />
                <Bar dataKey="domain" name="Домен"        fill={CATEGORY_COLORS.domain} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Assessments list */}
      <div>
        <h2 className="text-sm font-medium mb-3">Оценки</h2>
        {assessments.length === 0 ? (
          <div className="border rounded-lg p-8 text-center">
            <ClipboardCheck className="size-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Оценок пока нет</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
              Создать первую оценку
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden divide-y">
            {assessments.map(a => {
              const statusMeta = STATUS_META[a.status]
              return (
                <div key={a.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-8 rounded-full bg-muted">
                      <User className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{a.employeeId}</p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABELS[a.type] ?? a.type}
                        {a.period ? ` · ${a.period}` : ""}
                        {" · "}{new Date(a.createdAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusMeta?.color)}>
                      {statusMeta?.label ?? a.status}
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link href={`/hr/employees/${a.employeeId}/skills`}>Навыки</Link>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новая оценка</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">ID сотрудника *</Label>
              <Input
                placeholder="employee-id или email"
                value={form.employeeId}
                onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Тип оценки</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Период</Label>
                <Input
                  placeholder="2026-Q1"
                  value={form.period}
                  onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={saving || !form.employeeId.trim()}>
              {saving ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
