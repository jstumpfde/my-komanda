"use client"

import { useCallback, useEffect, useState } from "react"
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
import { LineChart, Building2, Loader2, Plus, Link2, LayoutGrid, Table2 } from "lucide-react"
import { toast } from "sonner"
import { formatRelativeTime } from "@/components/pricing/format"
import type { PriceMonitorObject } from "@/components/pricing/types"

export default function PriceMonitorObjectsPage() {
  const [objects, setObjects] = useState<PriceMonitorObject[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hostDialogOpen, setHostDialogOpen] = useState(false)
  const [view, setView] = useState<"cards" | "table">("cards")

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
                  </div>
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
              <div className="rounded-xl border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Объект</TableHead>
                      <TableHead>ЖК</TableHead>
                      <TableHead className="text-right">Конкурентов</TableHead>
                      <TableHead className="text-right">Наша цена/ночь</TableHead>
                      <TableHead>Проверено</TableHead>
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
                        <TableCell className="font-medium max-w-[280px]">{obj.name}</TableCell>
                        <TableCell className="text-muted-foreground">{obj.complexName ?? "—"}</TableCell>
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
