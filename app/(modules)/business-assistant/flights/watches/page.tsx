"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Bell, TrendingUp, TrendingDown, Minus, Trash2, Pencil, RefreshCw, Plane } from "lucide-react"
import {
  FlightWatchForm, EMPTY_WATCH_FORM, toApiFilters, fromWatch,
  type WatchFormValues,
} from "@/components/business-assistant/flight-watch-form"

interface PriceWatch {
  id: string
  originIata: string
  destinationIata: string
  dateMode: string
  departDate: string
  departDateTo: string | null
  tripClass: string
  targetPriceRub: number | null
  lastPriceRub: number | null
  lastCheckedAt: string | null
  bestPriceRub: number | null
  bestPriceAt: string | null
  active: boolean
  notifyTelegram: boolean
  telegramChatId: string | null
  filtersJson: Record<string, unknown> | null
  createdAt: string
}

async function saveWatch(values: WatchFormValues) {
  const res = await fetch("/api/modules/business-assistant/flights/watches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originIata: values.originIata.toUpperCase(),
      destinationIata: values.destinationIata.toUpperCase(),
      dateMode: values.dateMode,
      departDate: values.departDate,
      departDateTo: values.dateMode === "range" ? values.departDateTo : undefined,
      tripClass: values.tripClass,
      filters: toApiFilters(values),
      targetPriceRub: values.targetPrice ? Number(values.targetPrice) : null,
      notifyTelegram: values.notifyTelegram,
      telegramChatId: values.notifyTelegram ? values.telegramChatId.trim() || null : null,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Не удалось сохранить")
  }
}

async function updateWatch(id: string, values: WatchFormValues) {
  const res = await fetch(`/api/modules/business-assistant/flights/watches/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originIata: values.originIata.toUpperCase(),
      destinationIata: values.destinationIata.toUpperCase(),
      dateMode: values.dateMode,
      departDate: values.departDate,
      departDateTo: values.dateMode === "range" ? values.departDateTo : null,
      tripClass: values.tripClass,
      filters: toApiFilters(values),
      targetPriceRub: values.targetPrice ? Number(values.targetPrice) : null,
      notifyTelegram: values.notifyTelegram,
      telegramChatId: values.notifyTelegram ? values.telegramChatId.trim() || null : null,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Не удалось сохранить")
  }
}

export default function FlightWatchesPage() {
  const [watches, setWatches] = useState<PriceWatch[]>([])
  const [loading, setLoading] = useState(true)
  const [telegramConfigured, setTelegramConfigured] = useState(false)
  const [editingWatch, setEditingWatch] = useState<PriceWatch | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [checkResult, setCheckResult] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/modules/business-assistant/flights/watches")
      const data = (await res.json()) as { watches: PriceWatch[]; telegramConfigured: boolean }
      setWatches(data.watches)
      setTelegramConfigured(data.telegramConfigured)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(values: WatchFormValues) {
    await saveWatch(values)
    await load()
  }

  async function handleUpdate(values: WatchFormValues) {
    if (!editingWatch) return
    await updateWatch(editingWatch.id, values)
    setEditingWatch(null)
    await load()
  }

  async function toggleActive(watch: PriceWatch) {
    setWatches((prev) => prev.map((w) => (w.id === watch.id ? { ...w, active: !w.active } : w)))
    try {
      await fetch(`/api/modules/business-assistant/flights/watches/${watch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !watch.active }),
      })
    } catch {
      load()
    }
  }

  async function deleteWatch(id: string) {
    setWatches((prev) => prev.filter((w) => w.id !== id))
    try {
      await fetch(`/api/modules/business-assistant/flights/watches/${id}`, { method: "DELETE" })
    } catch {
      load()
    }
  }

  async function checkNow(id: string) {
    setCheckingId(id)
    setCheckResult((r) => ({ ...r, [id]: "" }))
    try {
      const res = await fetch(`/api/modules/business-assistant/flights/watches/${id}/check-now`, { method: "POST" })
      const data = (await res.json()) as { newPriceRub: number | null; notified: boolean; telegramSent: boolean | null }
      if (data.newPriceRub == null) {
        setCheckResult((r) => ({ ...r, [id]: "Ничего не найдено" }))
      } else {
        const parts = [`Текущая цена: ${data.newPriceRub.toLocaleString("ru-RU")} ₽`]
        if (data.notified) parts.push("создано уведомление")
        if (data.telegramSent === true) parts.push("отправлено в Telegram")
        if (data.telegramSent === false) parts.push("Telegram не доставлен")
        setCheckResult((r) => ({ ...r, [id]: parts.join(" · ") }))
      }
      await load()
    } catch {
      setCheckResult((r) => ({ ...r, [id]: "Ошибка проверки" }))
    } finally {
      setCheckingId(null)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="p-6 space-y-6 max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Bell className="w-6 h-6" /> Отслеживания цен
            </h1>
            <Button asChild variant="outline" size="sm">
              <Link href="/business-assistant/flights">
                <Plane className="w-4 h-4 mr-1" /> Поиск авиабилетов
              </Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Новое отслеживание</CardTitle>
            </CardHeader>
            <CardContent>
              <FlightWatchForm
                initial={EMPTY_WATCH_FORM}
                telegramConfigured={telegramConfigured}
                onSubmit={handleCreate}
                submitLabel="Создать отслеживание"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Мои отслеживания</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {!loading && watches.length === 0 && (
                <p className="text-sm text-muted-foreground">Пока нет отслеживаний — создайте выше.</p>
              )}
              {watches.map((watch) => {
                const trend =
                  watch.lastPriceRub != null && watch.bestPriceRub != null
                    ? watch.lastPriceRub > watch.bestPriceRub
                      ? "up"
                      : watch.lastPriceRub < watch.bestPriceRub
                        ? "down"
                        : "flat"
                    : null
                const dates =
                  watch.dateMode === "range" && watch.departDateTo
                    ? `${watch.departDate} — ${watch.departDateTo}`
                    : watch.departDate

                return (
                  <div key={watch.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {watch.originIata} → {watch.destinationIata}
                          {watch.notifyTelegram && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">Telegram</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {dates} · {watch.tripClass === "business" ? "бизнес" : "эконом"}
                          {watch.targetPriceRub != null && ` · цель ${watch.targetPriceRub.toLocaleString("ru-RU")} ₽`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right text-sm">
                          <div className="flex items-center gap-1 justify-end">
                            {trend === "up" && <TrendingUp className="w-3 h-3 text-destructive" />}
                            {trend === "down" && <TrendingDown className="w-3 h-3 text-emerald-600" />}
                            {trend === "flat" && <Minus className="w-3 h-3 text-muted-foreground" />}
                            <span className="font-semibold">
                              {watch.lastPriceRub != null ? `${watch.lastPriceRub.toLocaleString("ru-RU")} ₽` : "ещё не проверено"}
                            </span>
                          </div>
                          {watch.bestPriceRub != null && (
                            <div className="text-xs text-muted-foreground">лучшая: {watch.bestPriceRub.toLocaleString("ru-RU")} ₽</div>
                          )}
                        </div>
                        <Switch checked={watch.active} onCheckedChange={() => toggleActive(watch)} />
                        <Button variant="ghost" size="icon" onClick={() => setEditingWatch(watch)} title="Редактировать">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteWatch(watch.id)} title="Удалить">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => checkNow(watch.id)}
                        disabled={checkingId === watch.id}
                      >
                        {checkingId === watch.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 mr-1" />
                        )}
                        Проверить сейчас
                      </Button>
                      {checkResult[watch.id] && (
                        <span className="text-xs text-muted-foreground">{checkResult[watch.id]}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        <Dialog open={editingWatch != null} onOpenChange={(open) => !open && setEditingWatch(null)}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Редактировать отслеживание</DialogTitle>
            </DialogHeader>
            {editingWatch && (
              <FlightWatchForm
                key={editingWatch.id}
                initial={fromWatch(editingWatch)}
                telegramConfigured={telegramConfigured}
                onSubmit={handleUpdate}
                submitLabel="Сохранить"
                onCancel={() => setEditingWatch(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  )
}
