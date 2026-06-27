"use client"

// Платформенный обзор ВСЕХ вакансий всех компаний (Юрий 27.06).
// Активные / черновики / корзина — походить, проверить. Вход в компанию для инспекции.

import { useEffect, useState, useCallback } from "react"
import { Search, Loader2, LogIn, Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { enterCompanyAsAdmin } from "@/app/(admin)/admin/admin-impersonation-actions"

interface Row {
  id: string; title: string; companyId: string; company: string
  status: string; rawStatus: string | null; auto: boolean
  hhStatus: string | null; hhLinked: boolean; createdAt: string
}

const TABS = [
  { key: "all", label: "Все" },
  { key: "active", label: "Активные" },
  { key: "draft", label: "Черновики" },
  { key: "trash", label: "Корзина" },
] as const

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:    { label: "активна",    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  published: { label: "активна",    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  paused:    { label: "пауза",      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  draft:     { label: "черновик",   cls: "bg-muted text-muted-foreground" },
  closed:    { label: "закрыта",    cls: "bg-slate-500/10 text-slate-600" },
  trash:     { label: "в корзине",  cls: "bg-red-500/10 text-red-600" },
}

export default function AdminVacanciesPage() {
  const [tab, setTab] = useState<string>("all")
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/admin/vacancies?status=${tab}&q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: Row[] }) => setRows(d.items ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [tab, q])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  return (
    <div className="py-6 px-4 sm:px-8 max-w-6xl">
      <div className="flex items-center gap-2 mb-1">
        <Briefcase className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Вакансии — все компании</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Обзор всех вакансий платформы: активные, черновики, корзина. Зайти в компанию для проверки.</p>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5 text-xs">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn("px-3 py-1.5 rounded-md font-medium transition-colors", tab === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input className="w-full h-8 pl-8 pr-2 text-sm rounded-md border border-border bg-background" placeholder="Поиск по вакансии или компании…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{rows.length}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">Пусто</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Компания</th>
                <th className="text-left font-medium px-3 py-2">Вакансия</th>
                <th className="text-left font-medium px-3 py-2">Статус</th>
                <th className="text-left font-medium px-3 py-2">Разбор</th>
                <th className="text-left font-medium px-3 py-2">hh</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const b = STATUS_BADGE[r.status] ?? STATUS_BADGE.draft
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.company}</td>
                    <td className="px-3 py-2 font-medium text-foreground/85">{r.title}</td>
                    <td className="px-3 py-2"><span className={cn("text-[10px] px-2 py-0.5 rounded-full", b.cls)}>{b.label}</span></td>
                    <td className="px-3 py-2 text-xs">{r.auto ? <span className="text-emerald-600">вкл</span> : <span className="text-muted-foreground">выкл</span>}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.hhLinked ? (r.hhStatus ?? "—") : "нет"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => { void enterCompanyAsAdmin(r.companyId) }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap" title="Войти в компанию и открыть найм">
                        <LogIn className="w-3 h-3" /> войти
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
