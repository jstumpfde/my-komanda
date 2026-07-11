"use client"

// «Источники» базы знаний — концепт kb-connected-sources, фаза 1: подключение
// Яндекс.Диска компании как живого источника для AI-бота. За фиче-флагом
// knowledgeDriveSourcesEnabled (default OFF, см. lib/knowledge-sources/
// feature-flag.ts) — страница сама решает, показать ли себя.

import { useEffect, useState, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Loader2,
  HardDrive,
  Folder,
  FolderOpen,
  ChevronRight,
  RefreshCw,
  Trash2,
  Calculator,
  AlertTriangle,
  FileWarning,
} from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Audience = "employees" | "department" | "clients" | "partners" | "owner_only"

interface RootFolder {
  path: string
  label?: string
  audience: Audience
  aiOptOut: boolean
}

interface SourceRow {
  id: string
  provider: string
  title: string
  status: "active" | "error" | "paused"
  rootFolders: RootFolder[]
  lastSyncAt: string | null
  lastFullCrawlAt: string | null
  lastError: string | null
  createdAt: string
}

interface SourcesResponse {
  enabled: boolean
  sources: SourceRow[]
}

interface TreeFolder { path: string; name: string }

interface SyncResult {
  filesTouched: number
  indexed: number
  skipped: number
  errors: number
  errorMessages: string[]
}

interface EstimateResult {
  totalFiles: number
  supportedFiles: number
  skippedFiles: number
  estimatedChars: number
  estimatedTokens: number
  truncated: boolean
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  employees: "Сотрудники",
  department: "Отдел",
  clients: "Клиенты",
  partners: "Партнёры",
  owner_only: "Только владелец",
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "ещё не синхронизировано"
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return "только что"
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.round(hours / 24)
  return `${days} дн назад`
}

// ─── Дерево папок диска (ленивая подгрузка) ────────────────────────────────

function FolderTreeNode({
  sourceId,
  path,
  name,
  depth,
  selection,
  onToggle,
}: {
  sourceId: string
  path: string
  name: string
  depth: number
  selection: Map<string, RootFolder>
  onToggle: (path: string, name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<TreeFolder[] | null>(null)
  const [loading, setLoading] = useState(false)
  const checked = selection.has(path)

  async function toggleExpand() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (children !== null) return
    setLoading(true)
    try {
      const res = await fetch(`/api/modules/knowledge/sources/${sourceId}/tree?path=${encodeURIComponent(path)}`)
      const data = await res.json().catch(() => null) as { folders?: TreeFolder[]; error?: string } | null
      if (!res.ok || !data) {
        toast.error(data?.error || "Не удалось загрузить папки")
        setChildren([])
        return
      }
      setChildren(data.folders ?? [])
    } catch {
      toast.error("Ошибка сети")
      setChildren([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        <button type="button" onClick={toggleExpand} className="shrink-0 text-muted-foreground">
          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <Checkbox checked={checked} onCheckedChange={() => onToggle(path, name)} />
        {checked ? <FolderOpen className="w-4 h-4 text-primary shrink-0" /> : <Folder className="w-4 h-4 text-muted-foreground shrink-0" />}
        <span className="text-sm truncate">{name}</span>
      </div>
      {expanded && (
        <div>
          {loading && (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 20 + 20}px` }}>
              <Loader2 className="w-3 h-3 animate-spin" /> Загрузка…
            </div>
          )}
          {!loading && children && children.length === 0 && (
            <p className="text-xs text-muted-foreground py-1" style={{ paddingLeft: `${(depth + 1) * 20 + 20}px` }}>
              Нет вложенных папок
            </p>
          )}
          {!loading && children && children.map((c) => (
            <FolderTreeNode
              key={c.path}
              sourceId={sourceId}
              path={c.path}
              name={c.name}
              depth={depth + 1}
              selection={selection}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Карточка одного источника ──────────────────────────────────────────────

function SourceCard({ source, onChanged }: { source: SourceRow; onChanged: () => void }) {
  const [selection, setSelection] = useState<Map<string, RootFolder>>(
    () => new Map(source.rootFolders.map((f) => [f.path, f])),
  )
  const [rootFolders, setRootFolders] = useState<TreeFolder[] | null>(null)
  const [rootLoading, setRootLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [estimate, setEstimate] = useState<EstimateResult | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    void (async () => {
      setRootLoading(true)
      try {
        const res = await fetch(`/api/modules/knowledge/sources/${source.id}/tree?path=/`)
        const data = await res.json().catch(() => null) as { folders?: TreeFolder[] } | null
        setRootFolders(data?.folders ?? [])
      } catch {
        setRootFolders([])
      } finally {
        setRootLoading(false)
      }
    })()
  }, [source.id])

  function toggleFolder(path: string, name: string) {
    setSelection((prev) => {
      const next = new Map(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.set(path, { path, label: name, audience: "employees", aiOptOut: false })
      }
      return next
    })
    setEstimate(null)
  }

  function updateSelected(path: string, patch: Partial<RootFolder>) {
    setSelection((prev) => {
      const next = new Map(prev)
      const existing = next.get(path)
      if (existing) next.set(path, { ...existing, ...patch })
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/knowledge/sources/${source.id}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders: Array.from(selection.values()) }),
      })
      const data = await res.json().catch(() => null) as { ok?: true; error?: string } | null
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Не удалось сохранить выбор папок")
        return
      }
      toast.success("Папки сохранены")
      onChanged()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  async function handleEstimate() {
    setEstimating(true)
    setEstimate(null)
    try {
      const res = await fetch(`/api/modules/knowledge/sources/${source.id}/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders: Array.from(selection.values()).map((f) => ({ path: f.path })) }),
      })
      const data = await res.json().catch(() => null) as (EstimateResult & { error?: string }) | null
      if (!res.ok || !data) {
        toast.error(data?.error || "Не удалось посчитать смету")
        return
      }
      setEstimate(data)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setEstimating(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/modules/knowledge/sources/${source.id}/sync`, { method: "POST" })
      const data = await res.json().catch(() => null) as (SyncResult & { error?: string }) | null
      if (!res.ok || !data) {
        toast.error(data?.error || "Синхронизация не удалась")
        return
      }
      setSyncResult(data)
      toast.success(`Проиндексировано: ${data.indexed}, пропущено: ${data.skipped}, ошибок: ${data.errors}`)
      onChanged()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm(`Отключить «${source.title}»? Проиндексированные файлы и вектора будут удалены безвозвратно.`)) return
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/modules/knowledge/sources/${source.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Не удалось отключить источник")
        return
      }
      toast.success("Источник отключён")
      onChanged()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setDisconnecting(false)
    }
  }

  const statusMeta = source.status === "active"
    ? { label: "Активен", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" }
    : source.status === "error"
      ? { label: "Ошибка", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" }
      : { label: "Пауза", cls: "bg-muted text-muted-foreground" }

  return (
    <div className="rounded-xl shadow-sm border border-border bg-card overflow-hidden">
      <div className="p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-lg bg-muted p-2 shrink-0">
            <HardDrive className="w-5 h-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-medium truncate">{source.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Синхронизировано: {formatRelativeTime(source.lastSyncAt)}
            </p>
          </div>
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0", statusMeta.cls)}>
            {statusMeta.label}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting} className="shrink-0">
          {disconnecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
          Отключить
        </Button>
      </div>

      {source.lastError && (
        <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {source.lastError}
        </div>
      )}

      <div className="border-t border-border p-6 space-y-4">
        <div>
          <p className="text-sm font-medium mb-1">Выбор папок</p>
          <p className="text-xs text-muted-foreground mb-3">
            Отметьте папки, которые бот может использовать при ответах. Файлы остаются на диске — мы храним только текст-слепок и вектора для поиска.
          </p>
          <div className="rounded-lg border border-border p-2 max-h-72 overflow-y-auto">
            {rootLoading ? (
              <div className="flex items-center gap-2 py-2 px-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Загрузка дерева папок…
              </div>
            ) : rootFolders && rootFolders.length > 0 ? (
              rootFolders.map((f) => (
                <FolderTreeNode
                  key={f.path}
                  sourceId={source.id}
                  path={f.path}
                  name={f.name}
                  depth={0}
                  selection={selection}
                  onToggle={toggleFolder}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-2 px-2">На диске нет папок в корне</p>
            )}
          </div>
        </div>

        {selection.size > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Выбрано ({selection.size})</p>
            <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {Array.from(selection.values()).map((f) => (
                <li key={f.path} className="flex items-center justify-between gap-3 p-3 flex-wrap">
                  <span className="text-sm truncate min-w-0 flex-1">{f.label || f.path}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <Select value={f.audience} onValueChange={(v) => updateSelected(f.path, { audience: v as Audience })}>
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                          <SelectItem key={a} value={a} className="text-xs">{AUDIENCE_LABELS[a]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                      <Switch checked={f.aiOptOut} onCheckedChange={(v) => updateSelected(f.path, { aiOptOut: v })} />
                      Не использовать в AI
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Сохранить выбор
          </Button>
          <Button variant="outline" size="sm" onClick={handleEstimate} disabled={estimating || selection.size === 0}>
            {estimating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5 mr-1.5" />}
            Смета токенов
          </Button>
          <Button size="sm" onClick={handleSync} disabled={syncing || selection.size === 0}>
            {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            {source.lastSyncAt ? "Синхронизировать сейчас" : "Начать индексацию"}
          </Button>
        </div>

        {estimate && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p>
              Файлов: {estimate.totalFiles} (поддерживается {estimate.supportedFiles}, пропущено {estimate.skippedFiles})
              {estimate.truncated && " — оценка по первым файлам, папка больше"}
            </p>
            <p className="font-medium text-foreground">
              ~{estimate.estimatedTokens.toLocaleString("ru-RU")} токенов на индексацию
            </p>
          </div>
        )}

        {syncResult && (
          <div className="rounded-lg border border-border p-3 text-xs space-y-1">
            <p>Затронуто файлов: {syncResult.filesTouched} · проиндексировано: {syncResult.indexed} · пропущено: {syncResult.skipped} · ошибок: {syncResult.errors}</p>
            {syncResult.errorMessages.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-red-600 dark:text-red-400">
                {syncResult.errorMessages.slice(0, 10).map((m, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <FileWarning className="w-3 h-3 shrink-0 mt-0.5" />
                    <span className="truncate">{m}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Страница ────────────────────────────────────────────────────────────

function SourcesPageInner() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [sources, setSources] = useState<SourceRow[]>([])
  const [connecting, setConnecting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/knowledge/sources")
      const data = await res.json().catch(() => null) as SourcesResponse | null
      if (data) {
        setEnabled(data.enabled)
        setSources(data.sources)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const error = searchParams.get("error")
    const connected = searchParams.get("connected")
    if (connected) toast.success("Яндекс.Диск подключён")
    if (error === "invalid_state") toast.error("Не удалось подтвердить подключение — попробуйте снова")
    else if (error === "auth_failed") toast.error("Не удалось авторизоваться в Яндексе")
    else if (error === "key_not_configured") toast.error("Шифрование токенов не настроено на сервере — обратитесь к администратору")
    else if (error) toast.error("Не удалось подключить источник")
  }, [searchParams])

  function handleConnect() {
    setConnecting(true)
    window.location.href = "/api/integrations/yandex-disk/auth"
  }

  const hasYandexDisk = sources.some((s) => s.provider === "yandex_disk")

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 px-4 sm:px-14">
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="mb-4">
                <h1 className="text-lg font-semibold text-foreground mb-1">Источники</h1>
                <p className="text-muted-foreground text-sm">
                  Подключите диск компании — AI-бот будет отвечать по вашим документам, с цитатой на исходный файл
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Загрузка…
                </div>
              ) : !enabled ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2">
                  <HardDrive className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Пока недоступно для вашей компании</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    «Подключённые источники» обкатываются в пилотном режиме. Если хотите попробовать раньше — обратитесь к вашему менеджеру Company24.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 p-4 text-xs text-amber-800 dark:text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Пилотный режим: не подключайте папки с персональными данными — индексация пока идёт через зарубежный AI-провайдер.
                      Файлы остаются на вашем диске, мы храним только текст-слепок и вектора для поиска.
                    </span>
                  </div>

                  {!hasYandexDisk && (
                    <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-muted p-2">
                          <HardDrive className="w-5 h-5 text-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Яндекс.Диск</p>
                          <p className="text-xs text-muted-foreground">Регламенты, прайсы, инструкции — читаем без изменения файлов</p>
                        </div>
                      </div>
                      <Button onClick={handleConnect} disabled={connecting}>
                        {connecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Подключить Яндекс.Диск
                      </Button>
                    </div>
                  )}

                  {sources.map((s) => (
                    <SourceCard key={s.id} source={s} onChanged={load} />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function KnowledgeSourcesPage() {
  return (
    <Suspense fallback={null}>
      <SourcesPageInner />
    </Suspense>
  )
}
