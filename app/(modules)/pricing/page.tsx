"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { LineChart, Building2, Loader2, Plus, Link2, LayoutGrid, Table2, Grid3x3, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { formatRelativeTime, nightsLabel } from "@/components/pricing/format"
import { useResizableColumns, RESIZER_CLASS } from "@/components/pricing/use-resizable-columns"
import type { PriceMonitorObject, OverviewData } from "@/components/pricing/types"

const DEFAULT_PERIOD_OPTIONS = [1, 3, 5, 7, 10, 14, 15, 25, 28, 30]

export default function PriceMonitorObjectsPage() {
  const [objects, setObjects] = useState<PriceMonitorObject[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hostDialogOpen, setHostDialogOpen] = useState(false)
  const [view, setView] = useState<"cards" | "table" | "matrix">("table")
  const [backfilling, setBackfilling] = useState(false)

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [overviewLoaded, setOverviewLoaded] = useState(false)

  const loadOverview = useCallback(async () => {
    setOverviewError(null)
    try {
      const res = await fetch("/api/modules/pricing/overview")
      if (!res.ok) throw new Error("Не удалось загрузить матрицу цен")
      const data = await res.json()
      setOverview(data)
    } catch (e) {
      setOverviewError(e instanceof Error ? e.message : "Не удалось загрузить матрицу цен")
    } finally {
      setOverviewLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (view === "matrix" && !overviewLoaded) {
      loadOverview()
    }
  }, [view, overviewLoaded, loadOverview])

  // Ресайз колонок табличного вида списка объектов (тянем правый край заголовка).
  const tableColumns = useMemo(
    () => [
      { id: "unit", default: 320, min: 160 },
      { id: "zk", default: 150, min: 80 },
      { id: "competitors", default: 120, min: 80 },
      { id: "price", default: 150, min: 100 },
      { id: "checked", default: 160, min: 100 },
      { id: "status", default: 110, min: 80 },
    ],
    [],
  )
  const tableCols = useResizableColumns("pm-objects-cols", tableColumns)

  const matrixPeriods = overview?.periods ?? DEFAULT_PERIOD_OPTIONS
  const matrixColumns = useMemo(
    () => [
      { id: "unit", default: 300, min: 160 },
      { id: "zk", default: 150, min: 80 },
      ...matrixPeriods.map((p) => ({ id: `p${p}`, default: 110, min: 80 })),
      { id: "occ30", default: 110, min: 80 },
      { id: "occ90", default: 110, min: 80 },
      { id: "mocc30", default: 110, min: 80 },
      { id: "mocc90", default: 110, min: 80 },
      { id: "checked", default: 130, min: 100 },
    ],
    [matrixPeriods],
  )
  const matrixCols = useResizableColumns("pm-overview-cols", matrixColumns)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/modules/pricing/objects")
      if (!res.ok) throw new Error("Не удалось загрузить объекты")
      const data = await res.json()
      setObjects(data.objects ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить объекты")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleBackfillComplex = async () => {
    setBackfilling(true)
    try {
      const res = await fetch("/api/modules/pricing/backfill-complex", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось заполнить ЖК")
        return
      }
      toast.success(`ЖК заполнены: объектов ${data.objectsUpdated}, конкурентов ${data.competitorsUpdated}`)
      load()
    } catch {
      toast.error("Не удалось заполнить ЖК")
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 pt-3 pb-2">
                  <LineChart className="h-5 w-5 text-violet-600" />
                  <h1 className="text-lg font-semibold">Мониторинг цен</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Сравнение цен ваших объектов размещения с конкурентами рядом
                </p>
              </div>
              <div className="mt-3 shrink-0 flex items-center gap-2">
                {objects !== null && objects.length > 0 && (
                  <div className="flex items-center rounded-lg border border-border p-0.5 mr-1">
                    <Button
                      type="button"
                      variant={view === "cards" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => setView("cards")}
                      title="Плитками"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={view === "table" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => setView("table")}
                      title="Таблицей"
                    >
                      <Table2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={view === "matrix" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => setView("matrix")}
                      title="Матрица цен"
                    >
                      <Grid3x3 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {objects !== null && objects.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleBackfillComplex}
                    disabled={backfilling}
                    title="Заполнить пустые ЖК эвристикой по названию объявления"
                  >
                    {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Заполнить ЖК автоматически
                  </Button>
                )}
                <Button variant="outline" onClick={() => setHostDialogOpen(true)}>
                  <Link2 className="h-4 w-4" />
                  Привязать аккаунт Airbnb
                </Button>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Добавить объект
                </Button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-4">
                {error}
              </div>
            )}

            {objects === null && !error && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {objects !== null && objects.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card/50">
                <EmptyState
                  icon={Building2}
                  title="Добавьте первый объект"
                  description="Вставьте ссылку на ваше объявление Airbnb — мы найдём конкурентов рядом и начнём сравнивать цены"
                  actionLabel="Добавить объект"
                  onAction={() => setDialogOpen(true)}
                />
                <div className="pb-6 text-center">
                  <button
                    type="button"
                    onClick={() => setHostDialogOpen(true)}
                    className="text-sm text-violet-600 hover:underline"
                  >
                    или привяжите весь аккаунт Airbnb
                  </button>
                </div>
              </div>
            )}

            {objects !== null && objects.length > 0 && view === "table" && (
              <div className="rounded-xl border border-border overflow-x-auto p-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Ширину колонок можно менять — потяните за правый край заголовка.
                </p>
                <Table
                  style={{ tableLayout: "fixed", width: tableCols.totalWidth, minWidth: tableCols.totalWidth }}
                >
                  <colgroup>
                    <col style={{ width: tableCols.widths.unit }} />
                    <col style={{ width: tableCols.widths.zk }} />
                    <col style={{ width: tableCols.widths.competitors }} />
                    <col style={{ width: tableCols.widths.price }} />
                    <col style={{ width: tableCols.widths.checked }} />
                    <col style={{ width: tableCols.widths.status }} />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="relative">
                        Объект
                        <span className={RESIZER_CLASS} onMouseDown={(e) => tableCols.onResizeStart("unit", e)} />
                      </TableHead>
                      <TableHead className="relative">
                        ЖК
                        <span className={RESIZER_CLASS} onMouseDown={(e) => tableCols.onResizeStart("zk", e)} />
                      </TableHead>
                      <TableHead className="text-right relative">
                        Конкурентов
                        <span className={RESIZER_CLASS} onMouseDown={(e) => tableCols.onResizeStart("competitors", e)} />
                      </TableHead>
                      <TableHead className="text-right relative">
                        Наша цена/ночь
                        <span className={RESIZER_CLASS} onMouseDown={(e) => tableCols.onResizeStart("price", e)} />
                      </TableHead>
                      <TableHead className="relative">
                        Проверено
                        <span className={RESIZER_CLASS} onMouseDown={(e) => tableCols.onResizeStart("checked", e)} />
                      </TableHead>
                      <TableHead className="text-right">Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {objects.map((obj) => (
                      <TableRow
                        key={obj.id}
                        className="cursor-pointer"
                        onClick={() => {
                          window.location.href = `/pricing/objects/${obj.id}`
                        }}
                      >
                        <TableCell className="font-medium overflow-hidden">
                          <span className="block truncate" title={obj.name}>{obj.name}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground overflow-hidden">
                          <span className="block truncate" title={obj.complexName ?? undefined}>
                            {obj.complexName ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{obj.competitorsCount}</TableCell>
                        <TableCell className="text-right">
                          {obj.latestOwnPerNight != null
                            ? `${obj.latestOwnPerNight.toLocaleString("ru-RU")} ${obj.currency ?? ""}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {obj.lastCheckedAt ? formatRelativeTime(obj.lastCheckedAt) : "ещё не проверялось"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={obj.isActive ? "default" : "secondary"}>
                            {obj.isActive ? "Активен" : "Выключен"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {objects !== null && objects.length > 0 && view === "matrix" && (
              <div className="rounded-xl border border-border overflow-x-auto p-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Ширину колонок можно менять — потяните за правый край заголовка.
                </p>
                {overviewError && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-4">
                    {overviewError}
                  </div>
                )}
                {overview === null && !overviewError && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {overview !== null && (
                  <Table
                    style={{ tableLayout: "fixed", width: matrixCols.totalWidth, minWidth: matrixCols.totalWidth }}
                  >
                    <colgroup>
                      <col style={{ width: matrixCols.widths.unit }} />
                      <col style={{ width: matrixCols.widths.zk }} />
                      {matrixPeriods.map((p) => (
                        <col key={p} style={{ width: matrixCols.widths[`p${p}`] }} />
                      ))}
                      <col style={{ width: matrixCols.widths.occ30 }} />
                      <col style={{ width: matrixCols.widths.occ90 }} />
                      <col style={{ width: matrixCols.widths.mocc30 }} />
                      <col style={{ width: matrixCols.widths.mocc90 }} />
                      <col style={{ width: matrixCols.widths.checked }} />
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="relative">
                          Объект
                          <span className={RESIZER_CLASS} onMouseDown={(e) => matrixCols.onResizeStart("unit", e)} />
                        </TableHead>
                        <TableHead className="relative">
                          ЖК
                          <span className={RESIZER_CLASS} onMouseDown={(e) => matrixCols.onResizeStart("zk", e)} />
                        </TableHead>
                        {matrixPeriods.map((p) => (
                          <TableHead key={p} className="text-right relative">
                            {p} {nightsLabel(p)}
                            <span
                              className={RESIZER_CLASS}
                              onMouseDown={(e) => matrixCols.onResizeStart(`p${p}`, e)}
                            />
                          </TableHead>
                        ))}
                        <TableHead className="text-right relative" title="Заполняемость (оценка) — занятый день это бронь или ручной блок">
                          Загрузка 30д
                          <span className={RESIZER_CLASS} onMouseDown={(e) => matrixCols.onResizeStart("occ30", e)} />
                        </TableHead>
                        <TableHead className="text-right relative" title="Заполняемость (оценка) — занятый день это бронь или ручной блок">
                          Загрузка 90д
                          <span className={RESIZER_CLASS} onMouseDown={(e) => matrixCols.onResizeStart("occ90", e)} />
                        </TableHead>
                        <TableHead className="text-right relative" title="Средняя заполняемость конкурентов (оценка)">
                          Рынок 30д
                          <span className={RESIZER_CLASS} onMouseDown={(e) => matrixCols.onResizeStart("mocc30", e)} />
                        </TableHead>
                        <TableHead className="text-right relative" title="Средняя заполняемость конкурентов (оценка)">
                          Рынок 90д
                          <span className={RESIZER_CLASS} onMouseDown={(e) => matrixCols.onResizeStart("mocc90", e)} />
                        </TableHead>
                        <TableHead className="relative">
                          Проверено
                          <span className={RESIZER_CLASS} onMouseDown={(e) => matrixCols.onResizeStart("checked", e)} />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.rows.map((row) => (
                        <TableRow
                          key={row.objectId}
                          className="cursor-pointer"
                          onClick={() => {
                            window.location.href = `/pricing/objects/${row.objectId}`
                          }}
                        >
                          <TableCell className="font-medium overflow-hidden">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate" title={row.name}>{row.name}</span>
                              {!row.isActive && (
                                <Badge variant="secondary" className="shrink-0">
                                  Выключен
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground overflow-hidden">
                            <span className="block truncate" title={row.complexName ?? undefined}>
                              {row.complexName ?? "—"}
                            </span>
                          </TableCell>
                          {matrixPeriods.map((p) => {
                            const cell = row.prices[String(p)]
                            return (
                              <TableCell key={p} className="text-right">
                                {cell && cell.perNight != null ? (
                                  <>
                                    <div className="font-medium">
                                      {Math.round(cell.perNight).toLocaleString("ru-RU")} {overview.currency}
                                    </div>
                                    {cell.total != null && (
                                      <div className="text-xs text-muted-foreground">
                                        итого {Math.round(cell.total).toLocaleString("ru-RU")} {overview.currency}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )
                          })}
                          <TableCell className="text-right">
                            <OccupancyValue pct={row.occupancy?.["30"] ?? null} />
                          </TableCell>
                          <TableCell className="text-right">
                            <OccupancyValue pct={row.occupancy?.["90"] ?? null} />
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {row.marketOccupancy?.["30"] != null ? `${row.marketOccupancy["30"]}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {row.marketOccupancy?.["90"] != null ? `${row.marketOccupancy["90"]}%` : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {row.lastCheckedAt ? formatRelativeTime(row.lastCheckedAt) : "ещё не проверялось"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {objects !== null && objects.length > 0 && view === "cards" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {objects.map((obj) => (
                  <Link key={obj.id} href={`/pricing/objects/${obj.id}`} className="block">
                    <Card className="h-full cursor-pointer">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium leading-snug line-clamp-2" title={obj.name}>
                              {obj.name}
                            </div>
                            {obj.complexName && (
                              <div className="text-xs text-muted-foreground truncate mt-0.5">
                                {obj.complexName}
                              </div>
                            )}
                          </div>
                          <Badge variant={obj.isActive ? "default" : "secondary"} className="shrink-0">
                            {obj.isActive ? "Активен" : "Выключен"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Конкурентов</span>
                          <span className="font-medium">{obj.competitorsCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Наша цена/ночь</span>
                          <span className="font-medium">
                            {obj.latestOwnPerNight != null
                              ? `${obj.latestOwnPerNight.toLocaleString("ru-RU")} ${obj.currency ?? ""}`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Проверено</span>
                          <span className="font-medium">
                            {obj.lastCheckedAt ? formatRelativeTime(obj.lastCheckedAt) : "ещё не проверялось"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>

      <AddObjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false)
          load()
        }}
      />

      <HostImportDialog
        open={hostDialogOpen}
        onOpenChange={setHostDialogOpen}
        onImported={() => {
          setHostDialogOpen(false)
          load()
        }}
      />
    </SidebarProvider>
  )
}

function OccupancyValue({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>
  return <span className="font-medium">{pct}%</span>
}

function AddObjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [complexName, setComplexName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName("")
      setUrl("")
      setComplexName("")
    }
  }, [open])

  const handleSubmit = async () => {
    if (!name.trim() || !url.trim()) {
      toast.error("Заполните название и ссылку на Airbnb")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/modules/pricing/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          complexName: complexName.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось добавить объект")
        return
      }
      if (data.warning) {
        toast.warning(data.warning)
      } else {
        toast.success("Объект добавлен")
      }
      onCreated()
    } catch {
      toast.error("Не удалось добавить объект")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить объект</DialogTitle>
          <DialogDescription>
            Вставьте ссылку на объявление Airbnb — мы определим объект и начнём искать конкурентов рядом
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="obj-name">Название*</Label>
            <Input
              id="obj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Апартаменты на Тверской"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obj-url">Ссылка на Airbnb*</Label>
            <Input
              id="obj-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.airbnb.ru/rooms/..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obj-complex">ЖК (опционально)</Label>
            <Input
              id="obj-complex"
              value={complexName}
              onChange={(e) => setComplexName(e.target.value)}
              placeholder="Название жилого комплекса"
            />
          </div>
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

function HostImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  const [url, setUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setUrl("")
    }
  }, [open])

  const handleSubmit = async () => {
    if (!url.trim()) {
      toast.error("Вставьте ссылку на объявление Airbnb")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/modules/pricing/host-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось импортировать объекты")
        return
      }
      if (data.warning) {
        toast.info(data.warning)
      } else {
        toast.success(
          `Импортировано объектов: ${data.imported}${data.skipped ? `, пропущено уже добавленных: ${data.skipped}` : ""}`,
        )
      }
      onImported()
    } catch {
      toast.error("Не удалось импортировать объекты")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Привязать аккаунт Airbnb</DialogTitle>
          <DialogDescription>
            Вставьте ссылку на любое ваше объявление — импортируем все объекты вашего аккаунта
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="host-url">Ссылка на любое ваше объявление</Label>
            <Input
              id="host-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.airbnb.ru/rooms/..."
              disabled={submitting}
            />
          </div>
          {submitting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Импорт может занять до минуты
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Импортировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
