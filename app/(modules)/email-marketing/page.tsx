"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from "@/components/ui/sheet"
import {
  Database, Upload, Search, Building2, Users, Hash, Loader2, FileSpreadsheet,
  CheckCircle2, AlertCircle, Globe, Phone, Mail, MapPin, User, ChevronRight,
} from "lucide-react"

interface Stats { companies: number; withInn: number; contacts: number }
interface CompanyRow {
  id: string; inn: string | null; name: string | null; region: string | null
  website: string | null; segment: string | null; status: string; enriched: boolean
  contactsCount: number; updatedAt: string | null
}
interface ImportRow {
  id: string; filename: string; sourceType: string; status: string
  rowsTotal: number; rowsCreated: number; rowsMerged: number; rowsSkipped: number
  contactsAdded: number; error: string | null; createdAt: string | null
}
interface DetailContact { id: string; kind: string; value: string; personName: string | null; position: string | null }
// company — полная строка outreach_companies (множество необязательных полей).
type DetailData = { company: Record<string, unknown>; contacts: DetailContact[] }

const SRC_LABEL: Record<string, string> = {
  globusved: "ГлобусВЭД", regional: "Регион + контакты", portal: "Портал",
  egrul: "ЕГРЮЛ", calls: "Звонки", unknown: "—",
}

// Имя приходит вида «ООО X / 7728387846» — ИНН и так в своей колонке, убираем дубль.
function displayName(name: string | null): string {
  if (!name) return "—"
  return name.replace(/\s*\/\s*\d{8,}\s*$/, "").trim() || name
}

const CONTACT_ICON: Record<string, typeof Phone> = { phone: Phone, whatsapp: Phone, telegram: Phone, email: Mail, site: Globe, person: User }
function s(v: unknown): string { return v == null || v === "" ? "" : String(v) }

export default function EmailMarketingBasePage() {
  const [stats, setStats] = useState<Stats>({ companies: 0, withInn: 0, contacts: 0 })
  const [items, setItems] = useState<CompanyRow[]>([])
  const [total, setTotal] = useState(0)
  const [imports, setImports] = useState<ImportRow[]>([])
  const [q, setQ] = useState("")
  const [innFilter, setInnFilter] = useState("")
  const [regionFilter, setRegionFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [uploadMsg, setUploadMsg] = useState<string>("")
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Боковая панель компании
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async (query: string, inn: string, region: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "100" })
      if (query) params.set("q", query)
      if (inn) params.set("inn", inn)
      if (region) params.set("region", region)
      const [c, h] = await Promise.all([
        fetch(`/api/modules/email-marketing/companies?${params}`).then((r) => r.json()),
        fetch(`/api/modules/email-marketing/imports`).then((r) => r.json()),
      ])
      if (c && !c.error) { setItems(c.items || []); setTotal(c.total || 0); setStats(c.stats || { companies: 0, withInn: 0, contacts: 0 }) }
      if (h && !h.error) setImports(h.items || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load("", "", "") }, [load])
  useEffect(() => {
    const t = setTimeout(() => load(q, innFilter, regionFilter), 300)
    return () => clearTimeout(t)
  }, [q, innFilter, regionFilter, load])

  async function openDetail(id: string) {
    setSheetId(id); setDetail(null); setDetailLoading(true)
    try {
      const d = await fetch(`/api/modules/email-marketing/companies/${id}`).then((r) => r.json())
      if (d && !d.error) setDetail(d)
    } finally { setDetailLoading(false) }
  }

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    const results: string[] = []
    for (const f of Array.from(files)) {
      setUploadMsg(`Загружаю ${f.name}…`)
      const fd = new FormData()
      fd.append("file", f)
      try {
        const r = await fetch("/api/modules/email-marketing/import", { method: "POST", body: fd })
        const d = await r.json()
        if (d.error) results.push(`❌ ${f.name}: ${d.error}`)
        else results.push(`✅ ${f.name} [${SRC_LABEL[d.source] || d.source}]: +${d.created} новых, ${d.merged} слито, +${d.contacts} контактов`)
      } catch (e) {
        results.push(`❌ ${f.name}: ${(e as Error).message}`)
      }
    }
    setUploadMsg(results.join("  •  "))
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
    load(q, innFilter, regionFilter)
  }

  const c = detail?.company

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <Database className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Емайл маркетинг — База</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Единая база компаний с дедупом по ИНН. Грузите xlsx сколько угодно раз — дубли сливаются, данные копятся.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {[
                { label: "Компаний в базе", value: stats.companies, Icon: Building2, bg: "bg-violet-500" },
                { label: "С ИНН", value: stats.withInn, Icon: Hash, bg: "bg-blue-500" },
                { label: "Контактов", value: stats.contacts, Icon: Users, bg: "bg-emerald-500" },
              ].map((card) => (
                <div key={card.label} className={`rounded-xl shadow-sm p-5 text-white ${card.bg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-white/90">{card.label}</span>
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center"><card.Icon className="w-5 h-5" /></div>
                  </div>
                  <p className="text-3xl font-bold tabular-nums">{card.value.toLocaleString("ru")}</p>
                </div>
              ))}
            </div>

            {/* Upload */}
            <div className="rounded-xl border border-border shadow-sm p-5 bg-card mb-6">
              <div className="flex items-center gap-3 flex-wrap">
                <input ref={fileRef} type="file" accept=".xlsx" multiple hidden onChange={(e) => onFiles(e.target.files)} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 transition-colors"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Загрузить xlsx (можно несколько)
                </button>
                <span className="text-xs text-muted-foreground">Распознаём: ГлобусВЭД, региональные с контактами, ЕГРЮЛ, портал, журнал звонков.</span>
              </div>
              {uploadMsg && <div className="mt-3 text-xs rounded-lg bg-muted/50 p-3 leading-relaxed">{uploadMsg}</div>}
            </div>

            {/* Search + filters + table */}
            <div className="rounded-xl border border-border shadow-sm bg-card mb-6">
              <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или ИНН…"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                </div>
                <input value={innFilter} onChange={(e) => setInnFilter(e.target.value)} placeholder="Фильтр по ИНН"
                  className="w-[150px] px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                <input value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} placeholder="Фильтр по городу/региону"
                  className="w-[200px] px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
                {(innFilter || regionFilter || q) && (
                  <button onClick={() => { setQ(""); setInnFilter(""); setRegionFilter("") }} className="text-xs text-muted-foreground hover:text-foreground">Сбросить</button>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{loading ? "загрузка…" : `показано ${items.length} из ${total.toLocaleString("ru")}`}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="px-4 py-2.5 font-medium">Компания</th>
                      <th className="px-4 py-2.5 font-medium">ИНН</th>
                      <th className="px-4 py-2.5 font-medium">Регион</th>
                      <th className="px-4 py-2.5 font-medium">Сайт</th>
                      <th className="px-4 py-2.5 font-medium text-center">Контакты</th>
                      <th className="px-4 py-2.5 font-medium">Статус</th>
                      <th className="px-4 py-2.5 font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r.id} onClick={() => openDetail(r.id)} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer">
                        <td className="px-4 py-2.5 font-medium max-w-[280px] truncate" title={displayName(r.name)}>{displayName(r.name)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{r.inn || "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate" title={r.region || ""}>{r.region || "—"}</td>
                        <td className="px-4 py-2.5">{r.website ? <a href={r.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-violet-600 inline-flex items-center gap-1"><Globe className="w-3.5 h-3.5" />сайт</a> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums">{r.contactsCount}</td>
                        <td className="px-4 py-2.5"><span className="text-xs rounded-full px-2 py-0.5 bg-muted">{r.status}</span></td>
                        <td className="px-4 py-2.5 text-muted-foreground"><ChevronRight className="w-4 h-4" /></td>
                      </tr>
                    ))}
                    {!loading && !items.length && (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Ничего не найдено — измените фильтры или загрузите xlsx выше.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Import history */}
            <div className="rounded-xl border border-border shadow-sm bg-card">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">История загрузок</h3>
              </div>
              <div className="divide-y divide-border/50">
                {imports.map((im) => (
                  <div key={im.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                    {im.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> :
                      im.status === "error" ? <AlertCircle className="w-4 h-4 text-red-500 shrink-0" /> :
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
                    <span className="font-medium max-w-[260px] truncate" title={im.filename}>{im.filename}</span>
                    <span className="text-xs rounded bg-muted px-1.5 py-0.5">{SRC_LABEL[im.sourceType] || im.sourceType}</span>
                    {im.status === "error"
                      ? <span className="text-xs text-red-500">{im.error}</span>
                      : <span className="text-xs text-muted-foreground">{im.rowsTotal} строк → +{im.rowsCreated} новых, {im.rowsMerged} слито, {im.rowsSkipped} пропущено, +{im.contactsAdded} контактов</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{im.createdAt ? new Date(im.createdAt).toLocaleString("ru") : ""}</span>
                  </div>
                ))}
                {!imports.length && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Загрузок ещё не было.</div>}
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* Боковая панель компании — детали + контакты */}
      <Sheet open={!!sheetId} onOpenChange={(o) => { if (!o) { setSheetId(null); setDetail(null) } }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 pr-6">
              <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="break-words">{c ? displayName(s(c.name)) : "Компания"}</span>
            </SheetTitle>
          </SheetHeader>
          {detailLoading || !c ? (
            <SheetBody><div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div></SheetBody>
          ) : (
            <SheetBody className="space-y-5">
              <dl className="divide-y divide-border/60">
                {s(c.fullName) && <Row label="Полное наименование">{s(c.fullName)}</Row>}
                <Row label="ИНН">{s(c.inn) || "—"}</Row>
                {s(c.kpp) && <Row label="КПП">{s(c.kpp)}</Row>}
                {s(c.ogrn) && <Row label="ОГРН">{s(c.ogrn)}</Row>}
                <Row label="Регион">{s(c.region) || "—"}</Row>
                {s(c.address) && <Row label="Адрес">{s(c.address)}</Row>}
                {s(c.website) && <Row label="Сайт"><a href={s(c.website)} target="_blank" rel="noreferrer" className="text-violet-600 inline-flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{s(c.website)}</a></Row>}
                {s(c.okvedName) && <Row label="ОКВЭД">{s(c.okvedCode)} {s(c.okvedName)}</Row>}
                {s(c.segment) && <Row label="Сегмент">{s(c.segment)}</Row>}
                <Row label="Статус">{s(c.status)}</Row>
                {s(c.description) && <Row label="Описание">{s(c.description)}</Row>}
              </dl>

              {/* Контакты */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Контакты {detail!.contacts.length > 0 && <span className="tabular-nums">· {detail!.contacts.length}</span>}
                </div>
                {detail!.contacts.length === 0
                  ? <div className="text-sm text-muted-foreground">—</div>
                  : (
                    <div className="rounded-lg border border-border divide-y divide-border/60">
                      {detail!.contacts.map((ct) => {
                        const Ic = CONTACT_ICON[ct.kind] ?? MapPin
                        return (
                          <div key={ct.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                            <Ic className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <div className="truncate">{ct.value}</div>
                              {(ct.personName || ct.position) && <div className="text-xs text-muted-foreground truncate">{[ct.personName, ct.position].filter(Boolean).join(" · ")}</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
              </div>

              {/* Доп. информация из импорта (data_json) */}
              {!!c.dataJson && typeof c.dataJson === "object" && Object.keys(c.dataJson as object).length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Доп. информация</div>
                  <dl className="divide-y divide-border/60">
                    {Object.entries(c.dataJson as Record<string, unknown>).filter(([, v]) => s(v)).slice(0, 20).map(([k, v]) => (
                      <Row key={k} label={k}>{s(v)}</Row>
                    ))}
                  </dl>
                </div>
              )}
            </SheetBody>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-right break-words min-w-0">{children}</dd>
    </div>
  )
}
