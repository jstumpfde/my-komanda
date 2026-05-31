"use client"

// components/vacancies/outbound-sourcing-tab.tsx
//
// Таб «Исходящий подбор» внутри вакансии (Фаза 1). Минималистичный UI:
//   - блок критериев (автозаполнен из вакансии, редактируемый) + «Найти»
//   - полоска статуса: доступ к базе резюме + просмотров сегодня X/50
//   - компактная таблица найденных резюме с AI-score бейджами и чекбоксами
//   - сортировка по AI-score (лучшие сверху)
//   - «Пригласить выбранных» — дизейбл без доступа/при исчерпании лимита
//
// Дедуп: приглашённые помечаются и не предлагаются повторно (по статусу строки).

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Search, Send, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// hh experience ids → человекочитаемо.
const EXPERIENCE_OPTIONS = [
  { value: "any", label: "Любой опыт" },
  { value: "noExperience", label: "Нет опыта" },
  { value: "between1And3", label: "1–3 года" },
  { value: "between3And6", label: "3–6 лет" },
  { value: "moreThan6", label: "Более 6 лет" },
]

// vacancies.required_experience → hh experience id.
function mapVacancyExperience(req?: string | null): string {
  switch (req) {
    case "none": return "noExperience"
    case "1-3": return "between1And3"
    case "3-6": return "between3And6"
    case "6+": return "moreThan6"
    default: return "any"
  }
}

interface OutboundItem {
  id: string
  hhResumeId: string
  title: string | null
  status: string
  aiScore: number | null
  aiReasoning: string | null
  experienceYears: number | null
  area: string | null
  salary: { amount?: number | null; currency?: string | null } | null
}

interface StatusData {
  hhVacancyLinked: boolean
  databaseAccess: { active: boolean; reason: string | null }
  quota: {
    searchLimit: number; viewsFromSearch: number; searchRemaining: number
    totalLimit: number; totalViews: number; totalRemaining: number; exhausted: boolean
  }
  lastRunAt: string | null
}

interface Props {
  vacancyId: string
  // Автозаполнение критериев из вакансии.
  vacancyTitle?: string | null
  vacancyCity?: string | null
  vacancySalaryMin?: number | null
  vacancySalaryMax?: number | null
  vacancyRequiredExperience?: string | null
  vacancyKeywords?: string | null
}

// Цвет AI-score бейджа (та же шкала, что getStageColorClasses в lib/stages —
// зелёное/жёлтое/красное по порогам).
function scoreClasses(score: number | null): string {
  if (score == null) return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800"
  if (score >= 70) return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
  if (score >= 40) return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
  return "bg-destructive/10 text-destructive border-destructive/20"
}

const STATUS_LABEL: Record<string, string> = {
  found: "Найден",
  viewed: "Просмотрен",
  invited: "Приглашён",
  responded: "Ответил",
  skipped: "Пропущен",
}

export function OutboundSourcingTab({
  vacancyId, vacancyTitle, vacancyCity, vacancySalaryMin, vacancySalaryMax,
  vacancyRequiredExperience, vacancyKeywords,
}: Props) {
  // Критерии (автозаполнены, редактируемы).
  const [text, setText] = useState(vacancyKeywords ?? vacancyTitle ?? "")
  const [area, setArea] = useState(vacancyCity ?? "")
  const [experience, setExperience] = useState(mapVacancyExperience(vacancyRequiredExperience))
  const [salaryFrom, setSalaryFrom] = useState(vacancySalaryMin ? String(vacancySalaryMin) : "")
  const [salaryTo, setSalaryTo] = useState(vacancySalaryMax ? String(vacancySalaryMax) : "")

  const [items, setItems] = useState<OutboundItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<StatusData | null>(null)

  const [searching, setSearching] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [inviting, setInviting] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/modules/hr/outbound/status?vacancyId=${vacancyId}`)
      if (res.ok) setStatus(await res.json())
    } catch { /* статус необязателен для работы поиска */ }
  }, [vacancyId])

  useEffect(() => { loadStatus() }, [loadStatus])

  const ranked = useMemo(
    () => [...items].sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1)),
    [items],
  )

  // Резюме доступные для приглашения (не приглашённые/ответившие).
  const invitable = useMemo(
    () => ranked.filter((i) => i.status !== "invited" && i.status !== "responded"),
    [ranked],
  )

  async function runSearch() {
    setSearching(true)
    try {
      const res = await fetch("/api/modules/hr/outbound/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacancyId,
          criteria: {
            text: text.trim() || undefined,
            // area — пока название города; реальный hh area id маппится позже
            // (Фаза 1: передаём как есть, hh поиск принимает text+area).
            area: area.trim() || undefined,
            experience: experience === "any" ? undefined : experience,
            salaryFrom: salaryFrom ? Number(salaryFrom) : undefined,
            salaryTo: salaryTo ? Number(salaryTo) : undefined,
            period: 30,
            perPage: 50,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка поиска"); return }
      setItems(data.items ?? [])
      setSelected(new Set())
      toast.success(`Найдено резюме: ${data.found ?? data.items?.length ?? 0}`)
      void runScore() // авто-скоринг по сниппетам сразу после поиска
      void loadStatus()
    } catch {
      toast.error("Сеть недоступна")
    } finally {
      setSearching(false)
    }
  }

  async function runScore() {
    setScoring(true)
    try {
      const res = await fetch("/api/modules/hr/outbound/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancyId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка скоринга"); return }
      setItems(data.items ?? [])
    } catch {
      toast.error("Сеть недоступна при скоринге")
    } finally {
      setScoring(false)
    }
  }

  async function runInvite() {
    const hhResumeIds = invitable.filter((i) => selected.has(i.id)).map((i) => i.hhResumeId)
    if (hhResumeIds.length === 0) { toast.error("Не выбрано ни одного резюме"); return }
    setInviting(true)
    try {
      const res = await fetch("/api/modules/hr/outbound/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancyId, hhResumeIds }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка приглашения"); return }
      const ok = data.invited ?? 0
      const limited = (data.results ?? []).filter((r: { status: string }) => r.status === "limit").length
      toast.success(`Приглашено: ${ok}${limited ? `, упёрлись в лимит: ${limited}` : ""}`)
      setSelected(new Set())
      await runScore()   // подтянуть обновлённые статусы
      await loadStatus() // обновить квоту
    } catch {
      toast.error("Сеть недоступна при приглашении")
    } finally {
      setInviting(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === invitable.length ? new Set() : new Set(invitable.map((i) => i.id)),
    )
  }

  const access = status?.databaseAccess
  const quota = status?.quota
  const inviteDisabled =
    inviting ||
    !status?.hhVacancyLinked ||
    !access?.active ||
    !!quota?.exhausted ||
    invitable.filter((i) => selected.has(i.id)).length === 0

  const inviteHint = !status?.hhVacancyLinked
    ? "Вакансия не связана с hh.ru"
    : !access?.active
      ? (access?.reason ?? "Доступ к базе резюме hh не активен")
      : quota?.exhausted
        ? "Дневной лимит просмотров исчерпан"
        : undefined

  return (
    <div className="space-y-4">
      {/* ─── Критерии ─── */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2 space-y-1.5">
            <Label className="text-xs">Ключевые слова</Label>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="напр. менеджер по продажам" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Город</Label>
            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Москва" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Опыт</Label>
            <Select value={experience} onValueChange={setExperience}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPERIENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ЗП от</Label>
            <Input value={salaryFrom} onChange={(e) => setSalaryFrom(e.target.value.replace(/\D/g, ""))} placeholder="—" className="h-8 text-sm" inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ЗП до</Label>
            <Input value={salaryTo} onChange={(e) => setSalaryTo(e.target.value.replace(/\D/g, ""))} placeholder="—" className="h-8 text-sm" inputMode="numeric" />
          </div>
          <div className="flex items-end">
            <Button size="sm" className="h-8 gap-1.5 w-full" onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Найти
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Полоска статуса ─── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1.5">
          {access?.active
            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            : <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
          Доступ к базе резюме:{" "}
          <span className={cn("font-medium", access?.active ? "text-green-600" : "text-amber-600")}>
            {access?.active ? "активен" : "не активен"}
          </span>
        </span>
        {quota && (
          <span className={cn("inline-flex items-center gap-1", quota.exhausted && "text-destructive font-medium")}>
            Просмотров сегодня: {quota.viewsFromSearch}/{quota.searchLimit}
          </span>
        )}
        {scoring && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> AI-скоринг…
          </span>
        )}
      </div>

      {/* ─── Список найденных ─── */}
      {ranked.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <div className="text-xs text-muted-foreground">
              Найдено: <span className="font-medium tabular-nums">{ranked.length}</span>
              {selected.size > 0 && <> · Выбрано: <span className="font-medium tabular-nums">{selected.size}</span></>}
            </div>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={runInvite}
              disabled={inviteDisabled}
              title={inviteHint}
            >
              {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Пригласить выбранных
            </Button>
          </div>
          {inviteHint && (
            <div className="px-3 py-1.5 text-[11px] text-amber-600 bg-amber-500/5 border-b">{inviteHint}</div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="w-8 px-3 py-2">
                  <Checkbox
                    checked={invitable.length > 0 && selected.size === invitable.length}
                    onCheckedChange={toggleAll}
                    aria-label="Выбрать все"
                  />
                </th>
                <th className="px-2 py-2 font-medium">Заголовок резюме</th>
                <th className="px-2 py-2 font-medium w-20">Опыт</th>
                <th className="px-2 py-2 font-medium w-28">Ожид. ЗП</th>
                <th className="px-2 py-2 font-medium w-20">AI-score</th>
                <th className="px-2 py-2 font-medium w-24">Статус</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((i) => {
                const isInvited = i.status === "invited" || i.status === "responded"
                return (
                  <tr key={i.id} className={cn("border-b last:border-0 hover:bg-muted/20", isInvited && "opacity-60")}>
                    <td className="px-3 py-2 align-top">
                      <Checkbox
                        checked={selected.has(i.id)}
                        onCheckedChange={() => toggle(i.id)}
                        disabled={isInvited}
                        aria-label="Выбрать резюме"
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="font-medium leading-tight">{i.title ?? "Без заголовка"}</div>
                      {i.area && <div className="text-xs text-muted-foreground">{i.area}</div>}
                      {i.aiReasoning && (
                        <div className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-2">{i.aiReasoning}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top tabular-nums text-muted-foreground">
                      {i.experienceYears != null ? `${i.experienceYears} л.` : "—"}
                    </td>
                    <td className="px-2 py-2 align-top tabular-nums text-muted-foreground">
                      {i.salary?.amount != null ? `${i.salary.amount.toLocaleString("ru")} ${i.salary.currency ?? ""}`.trim() : "—"}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <span className={cn("inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums", scoreClasses(i.aiScore))}>
                        {i.aiScore != null ? i.aiScore : "—"}
                      </span>
                    </td>
                    <td className="px-2 py-2 align-top text-xs text-muted-foreground">
                      {STATUS_LABEL[i.status] ?? i.status}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {ranked.length === 0 && !searching && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Задайте критерии и нажмите «Найти» — hh подберёт резюме, а AI отранжирует лучших.
        </div>
      )}
    </div>
  )
}
