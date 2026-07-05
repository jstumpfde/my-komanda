"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/ui/empty-state"
import { useResizableColumns, RESIZER_CLASS } from "@/components/pricing/use-resizable-columns"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  ExternalLink,
  RefreshCw,
  Settings2,
  Loader2,
  MoreHorizontal,
  EyeOff,
  Eye,
  Trash2,
  Plus,
  BarChart3,
} from "lucide-react"
import { formatDateTime } from "@/components/pricing/format"
import type {
  ObjectDetail,
  ComparisonData,
  ComparisonRow,
  RunResult,
  AttractivenessData,
} from "@/components/pricing/types"

const DEFAULT_PERIOD_OPTIONS = [1, 3, 5, 7, 10, 14, 15, 25, 28, 30]
const INTERVAL_PRESETS = [
  { label: "Каждые 6 часов", minutes: 360 },
  { label: "Каждые 12 часов", minutes: 720 },
  { label: "Раз в сутки", minutes: 1440 },
  { label: "Раз в 2 суток", minutes: 2880 },
]

export default function PriceMonitorObjectDetailPage() {
  const params = useParams<{ id: string }>()
  const objectId = params?.id as string

  const [object, setObject] = useState<ObjectDetail | null>(null)
  const [companySettings, setCompanySettings] = useState<{
    radiusM: number
    periods: number[]
    intervalMinutes: number
    runAtTime: string
    currency: string
  } | null>(null)
  const [effectiveSettings, setEffectiveSettings] = useState<{
    radiusM: number
    periods: number[]
    intervalMinutes: number
    runAtTime: string
    currency: string
    autoDiscover: boolean
    complexFilter: string | null
  } | null>(null)
  const [occupancy, setOccupancy] = useState<Record<string, number | null> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [selectedCapture, setSelectedCapture] = useState<string | undefined>(undefined)

  const [running, setRunning] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addCompetitorOpen, setAddCompetitorOpen] = useState(false)

  const loadObject = useCallback(async () => {
    if (!objectId) return
    setLoadError(null)
    try {
      const res = await fetch(`/api/modules/pricing/objects/${objectId}`)
      if (!res.ok) throw new Error("Не удалось загрузить объект")
      const data = await res.json()
      setObject(data.object)
      setCompanySettings(data.companySettings)
      setEffectiveSettings(data.effectiveSettings)
      setOccupancy(data.occupancy ?? null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не удалось загрузить объект")
    }
  }, [objectId])

  const loadComparison = useCallback(
    async (at?: string) => {
      if (!objectId) return
      setComparisonError(null)
      try {
        const qs = at ? `?at=${encodeURIComponent(at)}` : ""
        const res = await fetch(`/api/modules/pricing/objects/${objectId}/comparison${qs}`)
        if (res.status === 404) {
          setComparison({ capturedAt: "", captures: [], currency: "", periods: [], rows: [], medians: {}, deltas: {} })
          return
        }
        if (!res.ok) throw new Error("Не удалось загрузить сравнение")
        const data = await res.json()
        setComparison(data)
        if (!at) setSelectedCapture(data.capturedAt || undefined)
      } catch (e) {
        setComparisonError(e instanceof Error ? e.message : "Не удалось загрузить сравнение")
      }
    },
    [objectId],
  )

  useEffect(() => {
    loadObject()
    loadComparison()
  }, [loadObject, loadComparison])

  const handleRun = async () => {
    if (!objectId) return
    setRunning(true)
    try {
      const res = await fetch(`/api/modules/pricing/objects/${objectId}/run`, { method: "POST" })
      const data = await res.json()
      if (res.status === 429) {
        toast.warning(data.error ?? "Слишком часто — попробуйте позже")
        return
      }
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось обновить цены")
        return
      }
      const result: RunResult = data.result
      if (result.errors?.length) {
        toast.warning(`Обновлено с предупреждениями: ${result.errors.join("; ")}`)
      } else {
        toast.success(
          `Обновлено: наших срезов ${result.ownSnapshots}, конкурентов ${result.competitorsSeen} (новых ${result.competitorsNew})`,
        )
      }
      loadObject()
      loadComparison()
    } catch {
      toast.error("Не удалось обновить цены")
    } finally {
      setRunning(false)
    }
  }

  const handleCaptureChange = (value: string) => {
    setSelectedCapture(value)
    loadComparison(value)
  }

  const handleToggleIgnore = async (competitorId: string, nextIgnored: boolean) => {
    try {
      const res = await fetch(`/api/modules/pricing/objects/${objectId}/competitors/${competitorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isIgnored: nextIgnored }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Не удалось изменить конкурента")
        return
      }
      toast.success(nextIgnored ? "Скрыт из сравнения" : "Возвращён в сравнение")
      loadComparison(selectedCapture)
    } catch {
      toast.error("Не удалось изменить конкурента")
    }
  }

  const handleDeleteCompetitor = async (competitorId: string) => {
    if (!confirm("Удалить конкурента из мониторинга?")) return
    try {
      const res = await fetch(`/api/modules/pricing/objects/${objectId}/competitors/${competitorId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Не удалось удалить конкурента")
        return
      }
      toast.success("Конкурент удалён")
      loadComparison(selectedCapture)
    } catch {
      toast.error("Не удалось удалить конкурента")
    }
  }

  const periods = comparison?.periods ?? effectiveSettings?.periods ?? DEFAULT_PERIOD_OPTIONS
  const currency = comparison?.currency || effectiveSettings?.currency || ""

  // Ресайз колонок таблицы сравнения (тянем правый край заголовка). Колонка
  // «Объект» широкая по умолчанию (~40%), периоды узкие, тянутся.
  const columns = useMemo(
    () => [
      { id: "unit", default: 340, min: 160 },
      { id: "zk", default: 150, min: 80 },
      { id: "dist", default: 100, min: 60 },
      ...periods.map((p) => ({ id: `p${p}`, default: 120, min: 80 })),
      { id: "actions", default: 48, min: 44 },
    ],
    [periods],
  )
  const { widths, onResizeStart, totalWidth } = useResizableColumns("pm-comparison-cols", columns)

  const sortedRows = useMemo((): {
    ownRow: ComparisonRow | undefined
    active: ComparisonRow[]
    ignored: ComparisonRow[]
  } => {
    if (!comparison) return { ownRow: undefined, active: [], ignored: [] }
    const ownRow = comparison.rows.find((r) => r.kind === "own")
    const competitorRows = comparison.rows.filter((r) => r.kind === "competitor")
    const firstPeriod = periods[0]
    const active = competitorRows
      .filter((r) => !r.isIgnored)
      .sort((a, b) => {
        const pa = firstPeriod != null ? a.prices[String(firstPeriod)]?.perNight : null
        const pb = firstPeriod != null ? b.prices[String(firstPeriod)]?.perNight : null
        if (pa == null && pb == null) return 0
        if (pa == null) return 1
        if (pb == null) return -1
        return pa - pb
      })
    const ignored = competitorRows.filter((r) => r.isIgnored)
    return { ownRow, active, ignored }
  }, [comparison, periods])

  if (loadError) {
    return (
      <PageShell title={object?.name ?? "Объект"}>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      </PageShell>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 pt-3 pb-2">
                  <BarChart3 className="h-5 w-5 text-violet-600" />
                  <h1 className="text-lg font-semibold truncate">
                    {object ? object.name : <span className="inline-block h-5 w-40 rounded bg-muted animate-pulse" />}
                  </h1>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                  {object?.complexName && <span>{object.complexName}</span>}
                  {object?.url && (
                    <a
                      href={object.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-violet-600 hover:underline"
                    >
                      Открыть на Airbnb
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {object && (
                    <Badge variant={object.isActive ? "default" : "secondary"}>
                      {object.isActive ? "Активен" : "Выключен"}
                    </Badge>
                  )}
                </div>
                {object && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Заполняемость (оценка): 30 дн — {occupancy?.["30"] != null ? `${occupancy["30"]}%` : "нет данных"} ·
                    {" "}90 дн — {occupancy?.["90"] != null ? `${occupancy["90"]}%` : "нет данных"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                  <Settings2 className="h-4 w-4" />
                  Настройки объекта
                </Button>
                <Button onClick={handleRun} disabled={running}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Обновить сейчас
                </Button>
              </div>
            </div>

            {comparisonError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-4">
                {comparisonError}
              </div>
            )}

            {comparison === null && !comparisonError && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {comparison !== null && comparison.rows.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card/50">
                <EmptyState
                  icon={BarChart3}
                  title="Данных ещё нет"
                  description='Нажмите «Обновить сейчас», чтобы собрать первые цены нашего объекта и конкурентов рядом'
                  actionLabel="Обновить сейчас"
                  onAction={handleRun}
                />
              </div>
            )}

            {comparison !== null && comparison.rows.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="capture-select" className="text-sm text-muted-foreground">
                      Срез
                    </Label>
                    <Select value={selectedCapture} onValueChange={handleCaptureChange}>
                      <SelectTrigger id="capture-select" className="w-56">
                        <SelectValue placeholder="Выберите срез" />
                      </SelectTrigger>
                      <SelectContent>
                        {comparison.captures.map((c) => (
                          <SelectItem key={c} value={c}>
                            {formatDateTime(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setAddCompetitorOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Добавить конкурента вручную
                  </Button>
                </div>

                <Card>
                  <CardContent className="overflow-x-auto">
                    <p className="text-xs text-muted-foreground mb-2">
                      Ширину колонок можно менять — потяните за правый край заголовка.
                    </p>
                    <Table style={{ tableLayout: "fixed", width: totalWidth, minWidth: totalWidth }}>
                      <colgroup>
                        <col style={{ width: widths.unit }} />
                        <col style={{ width: widths.zk }} />
                        <col style={{ width: widths.dist }} />
                        {periods.map((p) => (
                          <col key={p} style={{ width: widths[`p${p}`] }} />
                        ))}
                        <col style={{ width: widths.actions }} />
                      </colgroup>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="relative">
                            Объект
                            <span className={RESIZER_CLASS} onMouseDown={(e) => onResizeStart("unit", e)} />
                          </TableHead>
                          <TableHead className="relative">
                            ЖК
                            <span className={RESIZER_CLASS} onMouseDown={(e) => onResizeStart("zk", e)} />
                          </TableHead>
                          <TableHead className="relative">
                            Дистанция
                            <span className={RESIZER_CLASS} onMouseDown={(e) => onResizeStart("dist", e)} />
                          </TableHead>
                          {periods.map((p) => (
                            <TableHead key={p} className="text-right relative">
                              {p} {nightsLabel(p)}
                              <span className={RESIZER_CLASS} onMouseDown={(e) => onResizeStart(`p${p}`, e)} />
                            </TableHead>
                          ))}
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedRows.ownRow && (
                          <TableRow className="bg-primary/5">
                            <TableCell className="font-medium overflow-hidden">
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge className="shrink-0">Наш</Badge>
                                <span className="truncate">{sortedRows.ownRow.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground truncate">{sortedRows.ownRow.complexName ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">—</TableCell>
                            {periods.map((p) => (
                              <PriceCell key={p} cell={sortedRows.ownRow!.prices[String(p)]} currency={currency} />
                            ))}
                            <TableCell />
                          </TableRow>
                        )}
                        {sortedRows.ownRow && (
                          <TableRow className="bg-primary/5 border-b-2 border-border">
                            <TableCell colSpan={3} className="text-xs text-muted-foreground">
                              Отклонение от медианы конкурентов
                            </TableCell>
                            {periods.map((p) => (
                              <TableCell key={p} className="text-right">
                                <DeltaBadge delta={comparison.deltas[String(p)] ?? null} />
                              </TableCell>
                            ))}
                            <TableCell />
                          </TableRow>
                        )}

                        <TableRow className="bg-muted/30">
                          <TableCell className="font-medium text-muted-foreground" colSpan={3}>
                            Медиана конкурентов
                          </TableCell>
                          {periods.map((p) => (
                            <TableCell key={p} className="text-right font-medium">
                              {comparison.medians[String(p)] != null
                                ? `${Math.round(comparison.medians[String(p)]!).toLocaleString("ru-RU")} ${currency}`
                                : "—"}
                            </TableCell>
                          ))}
                          <TableCell />
                        </TableRow>

                        {sortedRows.ownRow && (
                          <TableRow className="bg-primary/5 border-b-2 border-border">
                            <TableCell colSpan={3} className="text-xs text-muted-foreground">
                              Наша позиция к рынку
                            </TableCell>
                            {periods.map((p) => (
                              <TableCell key={p} className="text-right">
                                <MarketBandBadge pos={comparison.marketPos?.[String(p)] ?? null} />
                              </TableCell>
                            ))}
                            <TableCell />
                          </TableRow>
                        )}

                        {sortedRows.active?.map((row) => (
                          <CompetitorRow
                            key={row.competitorId}
                            row={row}
                            periods={periods}
                            currency={currency}
                            onToggleIgnore={handleToggleIgnore}
                            onDelete={handleDeleteCompetitor}
                          />
                        ))}

                        {sortedRows.ignored?.map((row) => (
                          <CompetitorRow
                            key={row.competitorId}
                            row={row}
                            periods={periods}
                            currency={currency}
                            onToggleIgnore={handleToggleIgnore}
                            onDelete={handleDeleteCompetitor}
                            muted
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <AttractivenessSection attractiveness={comparison.attractiveness} />
              </>
            )}
          </div>
        </main>
      </SidebarInset>

      <ObjectSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        objectId={objectId}
        object={object}
        companySettings={companySettings}
        onSaved={() => {
          setSettingsOpen(false)
          loadObject()
          loadComparison(selectedCapture)
        }}
      />

      <AddCompetitorDialog
        open={addCompetitorOpen}
        onOpenChange={setAddCompetitorOpen}
        objectId={objectId}
        onAdded={() => {
          setAddCompetitorOpen(false)
          loadComparison(selectedCapture)
        }}
      />
    </SidebarProvider>
  )
}

function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <h1 className="text-lg font-semibold mb-4">{title}</h1>
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function nightsLabel(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "ночь"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "ночи"
  return "ночей"
}

function PriceCell({
  cell,
  currency,
}: {
  cell: { total: number | null; perNight: number | null; available: boolean } | undefined
  currency: string
}) {
  if (!cell || !cell.available || cell.perNight == null) {
    return (
      <TableCell className="text-right">
        <span className="text-muted-foreground">—</span>
      </TableCell>
    )
  }
  return (
    <TableCell className="text-right">
      <div className="font-medium">
        {Math.round(cell.perNight).toLocaleString("ru-RU")} {currency}
      </div>
      {cell.total != null && (
        <div className="text-xs text-muted-foreground">
          итого {Math.round(cell.total).toLocaleString("ru-RU")} {currency}
        </div>
      )}
    </TableCell>
  )
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <Badge variant="secondary">нет данных</Badge>
  }
  const rounded = Math.round(delta)
  if (rounded === 0) {
    return <Badge variant="secondary">на уровне медианы</Badge>
  }
  const isLower = rounded < 0
  return (
    <Badge
      variant="outline"
      className={cn(
        isLower
          ? "text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-500/10"
          : "text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-500/10",
      )}
    >
      {rounded > 0 ? "+" : ""}
      {rounded}% к медиане
    </Badge>
  )
}

const MARKET_BAND_META: Record<
  "low" | "below" | "above" | "high",
  { short: string; full: string; cls: string }
> = {
  low: {
    short: "низ",
    full: "низ рынка (дёшево)",
    cls: "text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-500/10",
  },
  below: {
    short: "ниже",
    full: "ниже среднего",
    cls: "text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800 bg-teal-500/10",
  },
  above: {
    short: "выше",
    full: "выше среднего",
    cls: "text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-500/10",
  },
  high: {
    short: "верх",
    full: "верх рынка (дорого)",
    cls: "text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-500/10",
  },
}

function MarketBandBadge({
  pos,
}: {
  pos: { pricierThanPct: number; band: "low" | "below" | "above" | "high" } | null
}) {
  if (!pos) return <Badge variant="secondary">—</Badge>
  const meta = MARKET_BAND_META[pos.band]
  return (
    <Badge
      variant="outline"
      className={meta.cls}
      title={`${meta.full}: дороже ${pos.pricierThanPct}% конкурентов`}
    >
      {meta.short} · {pos.pricierThanPct}%
    </Badge>
  )
}

function AttractivenessSection({ attractiveness }: { attractiveness?: AttractivenessData }) {
  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Привлекательность — почему показывают чаще</h2>
        </div>

        {(!attractiveness || !attractiveness.hasData) && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
            Данные привлекательности появятся после следующего прогона объекта.
          </div>
        )}

        {attractiveness?.hasData && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Объект</TableHead>
                  <TableHead className="text-right">Фото</TableHead>
                  <TableHead className="text-right">Рейтинг</TableHead>
                  <TableHead className="text-center">Суперхост</TableHead>
                  <TableHead className="text-center">Гость-фаворит</TableHead>
                  <TableHead className="text-right">Удобства</TableHead>
                  <TableHead className="text-right">Индекс</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attractiveness.rows.map((row) => (
                  <TableRow key={row.key} className={cn(row.key === "own" && "bg-primary/5")}>
                    <TableCell className="font-medium overflow-hidden">
                      <div className="flex items-center gap-2 min-w-0">
                        {row.key === "own" && <Badge className="shrink-0">Наш</Badge>}
                        <span className="truncate">{row.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{row.photosCount ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {row.ratingOverall != null ? (
                        <>
                          <div className="font-medium">{row.ratingOverall.toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.reviewCount != null ? `${row.reviewCount} отзывов` : "нет отзывов"}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{row.isSuperHost ? "✓" : "—"}</TableCell>
                    <TableCell className="text-center">{row.isGuestFavorite ? "✓" : "—"}</TableCell>
                    <TableCell className="text-right">{row.amenitiesCount ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="text-base font-semibold px-2.5 py-1">
                        {row.index}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              Индекс — эвристика: рейтинг 40% + фото 35% + отзывы 25%.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CompetitorRow({
  row,
  periods,
  currency,
  onToggleIgnore,
  onDelete,
  muted,
}: {
  row: ComparisonRow
  periods: number[]
  currency: string
  onToggleIgnore: (id: string, next: boolean) => void
  onDelete: (id: string) => void
  muted?: boolean
}) {
  return (
    <TableRow className={cn(muted && "opacity-50")}>
      <TableCell className="overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate">{row.name}</span>
          {row.isIgnored && (
            <Badge variant="secondary" className="shrink-0">
              Скрыт
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground truncate">{row.complexName ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">
        {row.distanceM != null ? `${Math.round(row.distanceM)} м` : "—"}
      </TableCell>
      {periods.map((p) => (
        <PriceCell key={p} cell={row.prices[String(p)]} currency={currency} />
      ))}
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.competitorId && (
              <DropdownMenuItem onClick={() => onToggleIgnore(row.competitorId!, !row.isIgnored)}>
                {row.isIgnored ? (
                  <>
                    <Eye className="h-4 w-4" />
                    Вернуть в сравнение
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4" />
                    Скрыть из сравнения
                  </>
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <a href={row.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Открыть на Airbnb
              </a>
            </DropdownMenuItem>
            {row.competitorId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(row.competitorId!)}
                >
                  <Trash2 className="h-4 w-4" />
                  Удалить
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

function ObjectSettingsSheet({
  open,
  onOpenChange,
  objectId,
  object,
  companySettings,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  objectId: string
  object: ObjectDetail | null
  companySettings: { radiusM: number; periods: number[]; intervalMinutes: number; runAtTime: string; currency: string } | null
  onSaved: () => void
}) {
  const [complexName, setComplexName] = useState("")
  const [radiusM, setRadiusM] = useState("")
  const [periods, setPeriods] = useState<number[]>([])
  const [customPeriod, setCustomPeriod] = useState("")
  const [complexFilter, setComplexFilter] = useState("")
  const [leadDays, setLeadDays] = useState("")
  const [intervalMinutes, setIntervalMinutes] = useState("")
  const [runAtTime, setRunAtTime] = useState("")
  const [autoDiscover, setAutoDiscover] = useState(true)
  const [saving, setSaving] = useState(false)

  // runAtTime работает только при интервале ≥ суток (см. isDue в run-monitor)
  const effectiveInterval = intervalMinutes.trim()
    ? parseInt(intervalMinutes, 10)
    : (companySettings?.intervalMinutes ?? 1440)
  const runAtTimeApplies = !Number.isFinite(effectiveInterval) || effectiveInterval >= 1440

  useEffect(() => {
    if (open && object) {
      const s = object.settingsJson ?? {}
      setComplexName(object.complexName ?? "")
      setRadiusM(s.radiusM != null ? String(s.radiusM) : "")
      setPeriods(s.periods ?? [])
      setComplexFilter(s.complexFilter ?? "")
      setLeadDays(s.leadDays != null ? String(s.leadDays) : "")
      setIntervalMinutes(s.schedule?.intervalMinutes != null ? String(s.schedule.intervalMinutes) : "")
      setRunAtTime(s.schedule?.runAtTime ?? "")
      setAutoDiscover(s.autoDiscover ?? true)
    }
  }, [open, object])

  const togglePeriod = (n: number) => {
    setPeriods((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)))
  }

  const addCustomPeriod = () => {
    const n = parseInt(customPeriod, 10)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Укажите положительное число ночей")
      return
    }
    if (!periods.includes(n)) togglePeriod(n)
    setCustomPeriod("")
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const settingsJson: Record<string, unknown> = {}
      if (radiusM.trim()) settingsJson.radiusM = parseInt(radiusM, 10)
      if (periods.length > 0) settingsJson.periods = periods
      if (leadDays.trim()) settingsJson.leadDays = parseInt(leadDays, 10)
      settingsJson.complexFilter = complexFilter.trim() || null
      settingsJson.autoDiscover = autoDiscover
      const schedule: Record<string, unknown> = {}
      if (intervalMinutes.trim()) schedule.intervalMinutes = parseInt(intervalMinutes, 10)
      if (runAtTime.trim()) schedule.runAtTime = runAtTime.trim()
      settingsJson.schedule = schedule

      const res = await fetch(`/api/modules/pricing/objects/${objectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexName: complexName.trim() || null, settingsJson }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось сохранить настройки")
        return
      }
      toast.success("Настройки сохранены")
      onSaved()
    } catch {
      toast.error("Не удалось сохранить настройки")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Настройки объекта</SheetTitle>
          <SheetDescription>
            Пустые поля — используется значение компании
            {companySettings ? ` (радиус ${companySettings.radiusM} м, периоды ${companySettings.periods.join("/")})` : ""}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="set-complex-name">ЖК (жилой комплекс)</Label>
            <Input
              id="set-complex-name"
              value={complexName}
              onChange={(e) => setComplexName(e.target.value)}
              placeholder="Название жилого комплекса"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-radius">Радиус поиска конкурентов (м)</Label>
            <Input
              id="set-radius"
              type="number"
              min={0}
              value={radiusM}
              onChange={(e) => setRadiusM(e.target.value)}
              placeholder={companySettings ? String(companySettings.radiusM) : "1000"}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Периоды проживания (ночей)</Label>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([...DEFAULT_PERIOD_OPTIONS, ...periods])).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => togglePeriod(n)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    periods.includes(n)
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Input
                type="number"
                min={1}
                value={customPeriod}
                onChange={(e) => setCustomPeriod(e.target.value)}
                placeholder="Свой период"
                className="w-32"
              />
              <Button type="button" variant="outline" size="sm" onClick={addCustomPeriod}>
                <Plus className="h-4 w-4" />
                Добавить
              </Button>
            </div>
            {periods.length === 0 && (
              <p className="text-xs text-muted-foreground">Как у компании — периоды не переопределены</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-complex">Фильтр по ЖК</Label>
            <Input
              id="set-complex"
              value={complexFilter}
              onChange={(e) => setComplexFilter(e.target.value)}
              placeholder="Учитывать только конкурентов в этом ЖК"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-leaddays">Заезд через (дней)</Label>
            <Input
              id="set-leaddays"
              type="number"
              min={0}
              max={90}
              value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">
              За сколько дней вперёд смотреть дату заезда при срезе цен (пусто = 1 день)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-interval">Интервал проверки</Label>
              <Select
                value={intervalSelectValue(intervalMinutes)}
                onValueChange={(v) => {
                  if (v !== "custom") setIntervalMinutes(v)
                }}
              >
                <SelectTrigger id="set-interval" className="w-full">
                  <SelectValue
                    placeholder={
                      companySettings
                        ? `Как у компании (${intervalLabel(companySettings.intervalMinutes)})`
                        : "Выберите интервал"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_PRESETS.map((p) => (
                    <SelectItem key={p.minutes} value={String(p.minutes)}>
                      {p.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Свой интервал (минуты)</SelectItem>
                </SelectContent>
              </Select>
              {intervalSelectValue(intervalMinutes) === "custom" && (
                <Input
                  type="number"
                  min={1}
                  className="mt-1.5"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(e.target.value)}
                  placeholder="Минут"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-time">Время запуска</Label>
              <Input
                id="set-time"
                type="time"
                value={runAtTime}
                onChange={(e) => setRunAtTime(e.target.value)}
                placeholder={companySettings?.runAtTime}
                disabled={!runAtTimeApplies}
              />
              <p className="text-xs text-muted-foreground">
                {runAtTimeApplies ? "МСК" : "Не используется при интервале меньше суток"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="set-autodiscover">Авто-поиск конкурентов</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Искать новых конкурентов рядом при каждом прогоне
              </p>
            </div>
            <Switch id="set-autodiscover" checked={autoDiscover} onCheckedChange={setAutoDiscover} />
          </div>
        </SheetBody>
        <SheetFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function AddCompetitorDialog({
  open,
  onOpenChange,
  objectId,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  objectId: string
  onAdded: () => void
}) {
  const [url, setUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setUrl("")
  }, [open])

  const handleSubmit = async () => {
    if (!url.trim()) {
      toast.error("Укажите ссылку на Airbnb")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/modules/pricing/objects/${objectId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось добавить конкурента")
        return
      }
      toast.success("Конкурент добавлен")
      onAdded()
    } catch {
      toast.error("Не удалось добавить конкурента")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить конкурента вручную</DialogTitle>
          <DialogDescription>Вставьте ссылку на объявление Airbnb конкурента</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="comp-url">Ссылка на Airbnb*</Label>
          <Input
            id="comp-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.airbnb.ru/rooms/..."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function intervalSelectValue(minutes: string): string {
  if (!minutes.trim()) return ""
  return INTERVAL_PRESETS.some((p) => String(p.minutes) === minutes) ? minutes : "custom"
}

function intervalLabel(minutes: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.minutes === minutes)
  if (preset) return preset.label
  return `каждые ${minutes} мин`
}
