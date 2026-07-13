"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from "@/components/ui/sheet"
import {
  Radar, Search, Rows3, LayoutList, Send, Instagram, Inbox, Loader2, ExternalLink,
  Check, X, Clock, Hash, Trash2, Sparkles, FileText,
} from "lucide-react"
import { SOURCE_LABEL, STATUS_LABEL, type RadarItemDTO, type RadarTopicDTO } from "@/lib/radar/types"
import type { RadarSource, RadarItemStatus } from "@/lib/db/schema"

const SOURCE_ICON: Record<RadarSource, typeof Send> = {
  telegram: Send, instagram_saved: Instagram, instagram_dm: Inbox,
}
const STATUS_STYLE: Record<RadarItemStatus, string> = {
  new:   "bg-muted text-muted-foreground",
  apply: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  skip:  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  later: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
}
const ALL_SOURCES: RadarSource[] = ["telegram", "instagram_saved", "instagram_dm"]
const ALL_STATUSES: RadarItemStatus[] = ["new", "apply", "skip", "later"]

interface ApiResp {
  items: RadarItemDTO[]; total: number
  byStatus: Record<string, number>; bySource: Record<string, number>
  topics: RadarTopicDTO[]; uncategorized: number
}

export default function RadarPage() {
  const [view, setView] = useState<"feed" | "table">("feed")
  const [data, setData] = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [source, setSource] = useState<RadarSource | "">("")
  const [status, setStatus] = useState<RadarItemStatus | "">("")
  const [topic, setTopic] = useState<string>("")        // id темы | "none" | ""
  const [active, setActive] = useState<RadarItemDTO | null>(null)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: "100" })
      if (q) p.set("q", q)
      if (source) p.set("source", source)
      if (status) p.set("status", status)
      if (topic) p.set("topic", topic)
      const r = await fetch(`/api/modules/radar/items?${p}`).then((res) => res.json())
      if (!r.error) setData(r)
    } finally { setLoading(false) }
  }, [q, source, status, topic])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  async function setItemStatus(id: string, s: RadarItemStatus) {
    await fetch(`/api/modules/radar/items/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }),
    })
    setActive((a) => (a && a.id === id ? { ...a, status: s } : a))
    load()
  }
  async function remove(id: string) {
    if (!window.confirm("Удалить из базы знаний?")) return
    await fetch(`/api/modules/radar/items/${id}`, { method: "DELETE" })
    setActive(null); load()
  }
  async function seed(fill: boolean) {
    setSeeding(true)
    try {
      await fetch("/api/modules/radar/seed", { method: fill ? "POST" : "DELETE" })
      await load()
    } finally { setSeeding(false) }
  }

  const empty = !loading && data && data.total === 0 && !q && !source && !status && !topic
  const topicsById = new Map((data?.topics || []).map((t) => [t.id, t]))
  const roots = (data?.topics || []).filter((t) => !t.parentId)
  const childrenOf = (id: string) => (data?.topics || []).filter((t) => t.parentId === id)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 40, paddingRight: 40 }}>

            {/* Шапка */}
            <div className="flex items-center gap-3 pt-2 pb-1 flex-wrap">
              <Radar className="h-6 w-6 text-violet-600" />
              <h1 className="text-lg font-semibold">Радар контента</h1>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Что я смотрю → транскрипт → темы → «применяю / не применяю»
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по сути, транскрипту, тегам…"
                    className="w-64 pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                </div>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button onClick={() => setView("feed")} title="Лента"
                    className={`px-2.5 py-2 ${view === "feed" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted/60"}`}><LayoutList className="w-4 h-4" /></button>
                  <button onClick={() => setView("table")} title="Таблица"
                    className={`px-2.5 py-2 ${view === "table" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted/60"}`}><Rows3 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>

            <div className="flex gap-5 mt-5 items-start">
              {/* Левая колонка: источники / темы / статусы */}
              <aside className="w-56 shrink-0 space-y-5 sticky top-2">
                <FilterGroup title="Источники">
                  <Chip active={source === ""} onClick={() => setSource("")} label="Все" />
                  {ALL_SOURCES.map((s) => {
                    const Ic = SOURCE_ICON[s]
                    return <Chip key={s} active={source === s} onClick={() => setSource(source === s ? "" : s)}
                      label={SOURCE_LABEL[s]} icon={<Ic className="w-3.5 h-3.5" />} count={data?.bySource[s]} />
                  })}
                </FilterGroup>

                <FilterGroup title="Темы">
                  <Chip active={topic === ""} onClick={() => setTopic("")} label="Все темы" />
                  {roots.map((t) => (
                    <div key={t.id}>
                      <Chip active={topic === t.id} onClick={() => setTopic(topic === t.id ? "" : t.id)}
                        label={t.name} count={t.count} dot={t.color} />
                      {childrenOf(t.id).map((c) => (
                        <div key={c.id} className="ml-3">
                          <Chip active={topic === c.id} onClick={() => setTopic(topic === c.id ? "" : c.id)}
                            label={c.name} count={c.count} small />
                        </div>
                      ))}
                    </div>
                  ))}
                  {!!data?.uncategorized && (
                    <Chip active={topic === "none"} onClick={() => setTopic(topic === "none" ? "" : "none")}
                      label="Без темы" count={data.uncategorized} />
                  )}
                </FilterGroup>

                <FilterGroup title="Статус">
                  <Chip active={status === ""} onClick={() => setStatus("")} label="Любой" />
                  {ALL_STATUSES.map((s) => (
                    <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? "" : s)}
                      label={STATUS_LABEL[s]} count={data?.byStatus[s]} />
                  ))}
                </FilterGroup>
              </aside>

              {/* Правая колонка: контент */}
              <div className="flex-1 min-w-0">
                {loading && !data ? (
                  <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : empty ? (
                  <EmptyState seeding={seeding} onSeed={() => seed(true)} />
                ) : !data?.items.length ? (
                  <div className="py-24 text-center text-sm text-muted-foreground">Ничего не найдено — измените фильтры.</div>
                ) : view === "feed" ? (
                  <div className="space-y-3 max-w-3xl">
                    {data.items.map((it) => (
                      <FeedCard key={it.id} item={it} topic={it.topicId ? topicsById.get(it.topicId) : undefined}
                        onOpen={() => setActive(it)} onStatus={(s) => setItemStatus(it.id, s)} />
                    ))}
                  </div>
                ) : (
                  <ItemsTable items={data.items} topicsById={topicsById} onOpen={setActive} />
                )}

                {data && data.total > 0 && (
                  <div className="mt-4 text-xs text-muted-foreground flex items-center gap-3">
                    <span>{loading ? "обновляю…" : `показано ${data.items.length} из ${data.total}`}</span>
                    {(data.byStatus["new"] === undefined) && null}
                    <button onClick={() => seed(false)} disabled={seeding}
                      className="ml-auto inline-flex items-center gap-1 hover:text-foreground">
                      <Trash2 className="w-3.5 h-3.5" /> Очистить демо
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Боковая панель единицы контента */}
      <Sheet open={!!active} onOpenChange={(o) => { if (!o) setActive(null) }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 pr-6">
                  <span className="break-words">{active.title || active.summary?.slice(0, 60) || "Контент"}</span>
                </SheetTitle>
              </SheetHeader>
              <SheetBody className="space-y-5">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <SourceBadge source={active.source} />
                  {active.sourceAccount && <span className="text-muted-foreground">{active.sourceAccount}</span>}
                  {active.capturedAt && <span className="text-muted-foreground">· {new Date(active.capturedAt).toLocaleDateString("ru")}</span>}
                  {active.url && <a href={active.url} target="_blank" rel="noreferrer" className="text-violet-600 inline-flex items-center gap-1 ml-auto"><ExternalLink className="w-3.5 h-3.5" />оригинал</a>}
                </div>

                {/* Статус-переключатель «применяю / не применяю» */}
                <div className="flex items-center gap-1.5">
                  <StatusBtn cur={active.status} val="apply"  icon={<Check className="w-3.5 h-3.5" />} onClick={() => setItemStatus(active.id, "apply")} />
                  <StatusBtn cur={active.status} val="later"  icon={<Clock className="w-3.5 h-3.5" />} onClick={() => setItemStatus(active.id, "later")} />
                  <StatusBtn cur={active.status} val="skip"   icon={<X className="w-3.5 h-3.5" />} onClick={() => setItemStatus(active.id, "skip")} />
                  <button onClick={() => remove(active.id)} className="ml-auto text-muted-foreground hover:text-rose-600 p-1.5"><Trash2 className="w-4 h-4" /></button>
                </div>

                {active.summary && (
                  <Section icon={<Sparkles className="w-4 h-4 text-violet-600" />} title="Суть">
                    <p className="leading-relaxed">{active.summary}</p>
                  </Section>
                )}
                {!!active.tags.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {active.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 text-xs rounded-full bg-muted px-2 py-0.5"><Hash className="w-3 h-3" />{t}</span>)}
                  </div>
                )}
                {active.service && active.service !== "—" && (
                  <div className="text-sm"><span className="text-muted-foreground">Сервис/инструмент: </span>{active.service}</div>
                )}
                {active.transcript && (
                  <Section icon={<FileText className="w-4 h-4 text-muted-foreground" />} title="Транскрипт">
                    <p className="leading-relaxed whitespace-pre-wrap text-sm text-muted-foreground">{active.transcript}</p>
                  </Section>
                )}
                {active.pipelineStatus !== "categorized" && (
                  <div className="text-xs text-amber-600 inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5" /> Обработка: {active.pipelineStatus}
                  </div>
                )}
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}

// ── Подкомпоненты ────────────────────────────────────────────────────────────

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Chip({ active, onClick, label, count, icon, dot, small }: {
  active: boolean; onClick: () => void; label: string; count?: number
  icon?: React.ReactNode; dot?: string | null; small?: boolean
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-1.5 rounded-md px-2 ${small ? "py-1 text-xs" : "py-1.5 text-sm"} transition-colors ${
        active ? "bg-violet-600 text-white" : "text-foreground hover:bg-muted/60"}`}>
      {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />}
      {icon}
      <span className="truncate text-left flex-1">{label}</span>
      {count != null && count > 0 && <span className={`text-xs tabular-nums ${active ? "text-white/80" : "text-muted-foreground"}`}>{count}</span>}
    </button>
  )
}

function SourceBadge({ source }: { source: RadarSource }) {
  const Ic = SOURCE_ICON[source]
  return <span className="inline-flex items-center gap-1 text-xs rounded-full bg-muted px-2 py-0.5"><Ic className="w-3 h-3" />{SOURCE_LABEL[source]}</span>
}

function FeedCard({ item, topic, onOpen, onStatus }: {
  item: RadarItemDTO; topic?: RadarTopicDTO; onOpen: () => void; onStatus: (s: RadarItemStatus) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4 hover:border-violet-300 transition-colors">
      <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
        <SourceBadge source={item.source} />
        {item.sourceAccount && <span className="text-muted-foreground">{item.sourceAccount}</span>}
        {topic && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: (topic.color || "#7c3aed") + "20", color: topic.color || "#7c3aed" }}>{topic.name}</span>}
        <span className={`ml-auto rounded-full px-2 py-0.5 ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      </div>
      <button onClick={onOpen} className="block text-left w-full">
        {item.title && <div className="font-medium mb-1">{item.title}</div>}
        {item.summary && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{item.summary}</p>}
      </button>
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        {item.tags.slice(0, 4).map((t) => <span key={t} className="text-xs text-muted-foreground">#{t}</span>)}
        <div className="ml-auto flex items-center gap-1">
          <MiniBtn label="Применяю" active={item.status === "apply"} tone="emerald" onClick={() => onStatus("apply")} icon={<Check className="w-3.5 h-3.5" />} />
          <MiniBtn label="Позже" active={item.status === "later"} tone="amber" onClick={() => onStatus("later")} icon={<Clock className="w-3.5 h-3.5" />} />
          <MiniBtn label="Нет" active={item.status === "skip"} tone="rose" onClick={() => onStatus("skip")} icon={<X className="w-3.5 h-3.5" />} />
        </div>
      </div>
    </div>
  )
}

function MiniBtn({ label, active, tone, onClick, icon }: {
  label: string; active: boolean; tone: "emerald" | "amber" | "rose"; onClick: () => void; icon: React.ReactNode
}) {
  const on = { emerald: "bg-emerald-600 text-white", amber: "bg-amber-500 text-white", rose: "bg-rose-600 text-white" }[tone]
  return (
    <button onClick={onClick} title={label}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${active ? on : "text-muted-foreground hover:bg-muted/60"}`}>
      {icon}<span className="hidden md:inline">{label}</span>
    </button>
  )
}

function ItemsTable({ items, topicsById, onOpen }: {
  items: RadarItemDTO[]; topicsById: Map<string, RadarTopicDTO>; onOpen: (i: RadarItemDTO) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="px-3 py-2.5 font-medium">Источник</th>
            <th className="px-3 py-2.5 font-medium">Откуда</th>
            <th className="px-3 py-2.5 font-medium">Про что</th>
            <th className="px-3 py-2.5 font-medium">Тема</th>
            <th className="px-3 py-2.5 font-medium">Сервис</th>
            <th className="px-3 py-2.5 font-medium">Дата</th>
            <th className="px-3 py-2.5 font-medium">Статус</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const Ic = SOURCE_ICON[it.source]
            const tp = it.topicId ? topicsById.get(it.topicId) : undefined
            return (
              <tr key={it.id} onClick={() => onOpen(it)} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer">
                <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1 text-xs"><Ic className="w-3.5 h-3.5" />{SOURCE_LABEL[it.source].split(" · ")[0]}</span></td>
                <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{it.sourceAccount || "—"}</td>
                <td className="px-3 py-2.5 max-w-[360px] truncate">{it.title || it.summary || "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{tp?.name || "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{it.service && it.service !== "—" ? it.service : "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">{it.capturedAt ? new Date(it.capturedAt).toLocaleDateString("ru") : "—"}</td>
                <td className="px-3 py-2.5"><span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLE[it.status]}`}>{STATUS_LABEL[it.status]}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{icon}{title}</div>
      {children}
    </div>
  )
}

function StatusBtn({ cur, val, icon, onClick }: { cur: RadarItemStatus; val: RadarItemStatus; icon: React.ReactNode; onClick: () => void }) {
  const active = cur === val
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? STATUS_STYLE[val] : "border border-border text-muted-foreground hover:bg-muted/60"}`}>
      {icon}{STATUS_LABEL[val]}
    </button>
  )
}

function EmptyState({ seeding, onSeed }: { seeding: boolean; onSeed: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center max-w-2xl">
      <Radar className="w-10 h-10 text-violet-300 mx-auto mb-3" />
      <h2 className="font-semibold mb-1">База знаний пока пуста</h2>
      <p className="text-sm text-muted-foreground mb-1">
        Сюда будут падать Reels, сторис, посты и гайды из Telegram-каналов и Instagram —
        с транскриптом, сутью и раскладкой по темам.
      </p>
      <p className="text-xs text-muted-foreground mb-5">
        Источники подключаются по фазам (первый — Telegram). Пока можно посмотреть, как это выглядит, на демо-данных.
      </p>
      <button onClick={onSeed} disabled={seeding}
        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5">
        {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Загрузить демо-данные
      </button>
    </div>
  )
}
