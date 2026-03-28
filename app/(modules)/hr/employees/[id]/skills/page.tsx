"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend, Tooltip,
} from "recharts"
import { ArrowLeft, Star, TrendingUp, AlertTriangle, CheckCircle2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface SkillGapItem {
  skillId: string
  skillName: string
  skillCategory: string
  currentScore: number | null
  requiredScore: number | null
  gap: number | null
  hasData: boolean
}

interface GapResponse {
  employeeId: string
  lastAssessmentId: string | null
  skills: SkillGapItem[]
}

interface AssessmentScore {
  skillId: string
  skillName: string
  skillCategory: string
  score: number | null
  comment: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  hard: "Hard", soft: "Soft", tool: "Инструмент", domain: "Домен",
}

function GapBadge({ gap }: { gap: number | null }) {
  if (gap === null) return <span className="text-muted-foreground text-xs">—</span>
  if (gap <= 0) return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="size-3" /> ОК</span>
  if (gap <= 1) return <Badge className="text-[10px] bg-yellow-100 text-yellow-700 border-0">−{gap}</Badge>
  return <Badge className="text-[10px] bg-red-100 text-red-700 border-0">−{gap}</Badge>
}

export default function EmployeeSkillsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: employeeId } = use(params)
  const router = useRouter()
  const [gapData, setGapData] = useState<GapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [assessDialogOpen, setAssessDialogOpen] = useState(false)
  const [currentScores, setCurrentScores] = useState<Record<string, number>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/modules/hr/employees/${employeeId}/skills-gap`)
      .then(r => r.json())
      .then((data: GapResponse) => {
        setGapData(data)
        // pre-fill scores from existing data if any
        const init: Record<string, number> = {}
        for (const s of data.skills) {
          if (s.currentScore !== null) init[s.skillId] = s.currentScore
        }
        setCurrentScores(init)
      })
      .finally(() => setLoading(false))
  }, [employeeId])

  async function handleStartAssessment() {
    // Create self-assessment
    const res = await fetch("/api/modules/hr/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, type: "self" }),
    })
    const a = await res.json()
    setAssessmentId(a.id)
    setAssessDialogOpen(true)
  }

  async function handleSubmitAssessment() {
    if (!assessmentId) return
    setSubmitting(true)
    const scores = Object.entries(currentScores).map(([skillId, score]) => ({
      skillId,
      score,
      comment: comments[skillId] || undefined,
    }))
    await fetch(`/api/modules/hr/assessments/${assessmentId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores }),
    })
    setSubmitting(false)
    setAssessDialogOpen(false)
    setSubmitted(true)
    // Reload gap data
    const r = await fetch(`/api/modules/hr/employees/${employeeId}/skills-gap`)
    setGapData(await r.json())
  }

  const skillsWithData = gapData?.skills.filter(s => s.hasData) ?? []
  const skillsWithGap = gapData?.skills.filter(s => s.gap !== null && s.gap > 0) ?? []

  // Radar data — top 8 skills
  const radarData = skillsWithData.slice(0, 8).map(s => ({
    skill: s.skillName.length > 10 ? s.skillName.slice(0, 10) + "…" : s.skillName,
    current: s.currentScore ?? 0,
    required: s.requiredScore ?? 5,
  }))

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => router.back()}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Профиль навыков</h1>
            <p className="text-sm text-muted-foreground">{employeeId}</p>
          </div>
        </div>
        <Button size="sm" onClick={handleStartAssessment}>
          <Play className="size-4 mr-1" />
          Запустить оценку
        </Button>
      </div>

      {submitted && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 text-green-700 text-sm">
          <CheckCircle2 className="size-4 shrink-0" />
          Оценка отправлена! Данные обновлены.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Radar: текущий vs требуемый</CardTitle>
          </CardHeader>
          <CardContent>
            {radarData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                Нет данных. Запустите оценку.
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10 }} />
                    <Radar name="Текущий" dataKey="current" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                    <Radar name="Требуемый" dataKey="required" stroke="#e11d48" fill="#e11d48" fillOpacity={0.1} strokeDasharray="4 2" />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top gaps */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <AlertTriangle className="size-4 text-orange-500" />
              Зоны роста ({skillsWithGap.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {skillsWithGap.length === 0 ? (
              <div className="py-4 text-sm text-muted-foreground text-center">
                {gapData?.lastAssessmentId ? "Отличный результат!" : "Запустите оценку для анализа"}
              </div>
            ) : (
              <div className="space-y-2">
                {skillsWithGap.slice(0, 6).map(s => (
                  <div key={s.skillId} className="flex items-center justify-between">
                    <span className="text-sm">{s.skillName}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={cn(
                            "size-2.5 rounded-sm",
                            i <= (s.currentScore ?? 0) ? "bg-primary" : i <= (s.requiredScore ?? 0) ? "bg-red-200" : "bg-gray-100"
                          )} />
                        ))}
                      </div>
                      <GapBadge gap={s.gap} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full skills table */}
      <div>
        <h2 className="text-sm font-medium mb-3">Все навыки</h2>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs">Навык</TableHead>
                <TableHead className="text-xs w-24">Категория</TableHead>
                <TableHead className="text-xs w-28">Требуется</TableHead>
                <TableHead className="text-xs w-28">Текущий</TableHead>
                <TableHead className="text-xs w-20">Разрыв</TableHead>
                <TableHead className="text-xs">Рекомендация</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(gapData?.skills ?? []).map(s => (
                <TableRow key={s.skillId}>
                  <TableCell className="text-sm font-medium">{s.skillName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABELS[s.skillCategory] ?? s.skillCategory}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {s.requiredScore !== null
                      ? <StarRow value={s.requiredScore} color="text-orange-400" />
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {s.currentScore !== null
                      ? <StarRow value={s.currentScore} color="text-primary" />
                      : <span className="text-xs text-muted-foreground">Нет данных</span>}
                  </TableCell>
                  <TableCell><GapBadge gap={s.gap} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.gap !== null && s.gap > 0
                      ? `Нужно +${s.gap} ур.`
                      : s.currentScore !== null ? "Норма" : "Пройдите оценку"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Assessment dialog */}
      <Dialog open={assessDialogOpen} onOpenChange={setAssessDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Оценка навыков</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            {(gapData?.skills ?? []).map(s => (
              <div key={s.skillId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{s.skillName}</Label>
                  <span className="text-sm font-bold text-primary">
                    {currentScores[s.skillId] ?? "—"} / 5
                  </span>
                </div>
                <Slider
                  min={1} max={5} step={1}
                  value={[currentScores[s.skillId] ?? 1]}
                  onValueChange={([v]) => setCurrentScores(prev => ({ ...prev, [s.skillId]: v }))}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                  {["Начинающий","","Средний","","Эксперт"].map((l, i) => (
                    <span key={i}>{l}</span>
                  ))}
                </div>
                <Textarea
                  placeholder="Комментарий (необязательно)"
                  rows={1}
                  className="text-xs resize-none"
                  value={comments[s.skillId] ?? ""}
                  onChange={e => setComments(prev => ({ ...prev, [s.skillId]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssessDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSubmitAssessment} disabled={submitting}>
              {submitting ? "Отправка..." : "Отправить оценку"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StarRow({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={cn("size-3", i <= value ? color : "text-muted-foreground/20")} fill={i <= value ? "currentColor" : "none"} />
      ))}
    </div>
  )
}
