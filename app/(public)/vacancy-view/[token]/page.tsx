"use client"

import { useState, useEffect, use } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, Lock, X, Building2, MapPin, Banknote, Users, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"

interface FunnelStage { stage: string; label: string; count: number }
interface GuestCandidate { id: string; name: string; stage: string; aiScore: number | null; aiVerdict: string | null; source: string | null; createdAt: string | null }
interface VacancyInfo { title: string; status: string; city: string | null; salaryMin: number | null; salaryMax: number | null; createdAt: string | null }
interface PageData { needPassword: boolean; companyName: string; companyLogo?: string | null; vacancy?: VacancyInfo; funnel?: FunnelStage[]; candidates?: GuestCandidate[]; totalCandidates?: number }

type PageState = "loading" | "password" | "dashboard" | "error"

const STATUS_LABELS: Record<string, string> = { draft: "Черновик", active: "Активна", paused: "Приостановлена", closed_success: "Закрыта (найден)", closed_cancelled: "Закрыта" }
const STAGE_COLORS: Record<string, string> = { new: "bg-blue-500", demo: "bg-purple-500", decision: "bg-amber-500", interview: "bg-indigo-500", final_decision: "bg-cyan-500", hired: "bg-emerald-500", rejected: "bg-red-500" }

export default function VacancyViewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<PageState>("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [password, setPassword] = useState("")
  const [data, setData] = useState<PageData | null>(null)

  const fetchData = (pwd?: string) => {
    const headers: Record<string, string> = {}
    if (pwd) headers["x-guest-password"] = pwd

    fetch(`/api/public/vacancy-view/${token}`, { headers })
      .then(res => {
        if (!res.ok && res.status !== 200) throw new Error("Ссылка недействительна")
        return res.json()
      })
      .then((d: PageData) => {
        setData(d)
        if (d.needPassword) setState("password")
        else setState("dashboard")
      })
      .catch(err => {
        setErrorMsg(err.message || "Ошибка загрузки")
        setState("error")
      })
  }

  useEffect(() => { fetchData() }, [token])

  const handlePasswordSubmit = () => {
    if (!password.trim()) return
    setState("loading")
    fetchData(password)
  }

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <X className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">Ссылка недействительна</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state === "password") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="py-8 space-y-4">
            <div className="text-center">
              <Lock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <h2 className="text-lg font-semibold">Доступ по паролю</h2>
            </div>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Пароль" className="h-10"
              onKeyDown={e => { if (e.key === "Enter") handlePasswordSubmit() }} autoFocus />
            <Button className="w-full" onClick={handlePasswordSubmit} disabled={!password.trim()}>Продолжить</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Dashboard
  const v = data?.vacancy
  const funnel = data?.funnel || []
  const candidates = data?.candidates || []
  const maxCount = Math.max(...funnel.map(f => f.count), 1)

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          {data?.companyLogo ? (
            <img src={data.companyLogo} alt={data.companyName} className="h-10 mx-auto mb-3 object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
          )}
          <h1 className="text-xl font-bold">{data?.companyName}</h1>
        </div>

        {/* Vacancy info */}
        {v && (
          <Card>
            <CardContent className="py-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{v.title}</h2>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                    {v.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{v.city}</span>}
                    {(v.salaryMin || v.salaryMax) && (
                      <span className="flex items-center gap-1">
                        <Banknote className="w-3.5 h-3.5" />
                        {v.salaryMin ? `от ${v.salaryMin.toLocaleString("ru")}` : ""}{v.salaryMax ? ` до ${v.salaryMax.toLocaleString("ru")}` : ""} ₽
                      </span>
                    )}
                    {v.createdAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(v.createdAt).toLocaleDateString("ru-RU")}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="secondary">{STATUS_LABELS[v.status] || v.status}</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Funnel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Воронка — {data?.totalCandidates || 0} кандидатов
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {funnel.filter(f => f.stage !== "rejected").map(f => (
              <div key={f.stage} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 text-right">{f.label}</span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", STAGE_COLORS[f.stage] || "bg-gray-400")}
                    style={{ width: `${Math.max((f.count / maxCount) * 100, f.count > 0 ? 8 : 0)}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-8 text-right">{f.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Candidates */}
        {candidates.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Кандидаты</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {candidates.map(c => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.source || "—"}</p>
                    </div>
                    {c.aiScore != null && (
                      <Badge variant="secondary" className={cn(
                        "text-xs shrink-0",
                        c.aiScore >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : c.aiScore >= 40 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                        : "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                      )}>
                        AI {c.aiScore} — {c.aiVerdict}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-[11px] text-muted-foreground/60">Powered by Komanda</p>
      </div>
    </div>
  )
}
