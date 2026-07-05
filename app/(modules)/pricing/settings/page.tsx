"use client"

import { useEffect, useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Settings, Loader2, Plus, Save, X } from "lucide-react"
import type { CompanySettings } from "@/components/pricing/types"

const DEFAULT_PERIOD_OPTIONS = [1, 3, 5, 7, 10, 14, 15, 25, 28, 30]
const INTERVAL_PRESETS = [
  { label: "Каждые 6 часов", minutes: 360 },
  { label: "Каждые 12 часов", minutes: 720 },
  { label: "Раз в сутки", minutes: 1440 },
  { label: "Раз в 2 суток", minutes: 2880 },
]
const CURRENCIES = [
  { value: "RUB", label: "₽ Рубль (RUB)" },
  { value: "EUR", label: "€ Евро (EUR)" },
  { value: "USD", label: "$ Доллар (USD)" },
  { value: "THB", label: "฿ Тайский бат (THB)" },
]

export default function PriceMonitorSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [radiusM, setRadiusM] = useState("1000")
  const [periods, setPeriods] = useState<number[]>([1, 3, 5, 7, 10, 14, 15, 25, 28, 30])
  const [customPeriod, setCustomPeriod] = useState("")
  const [intervalMinutes, setIntervalMinutes] = useState("1440")
  const [runAtTime, setRunAtTime] = useState("06:00")
  const [currency, setCurrency] = useState("RUB")

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/modules/pricing/settings")
        if (!res.ok) throw new Error("Не удалось загрузить настройки")
        const data = await res.json()
        const s: CompanySettings = data.settings
        if (cancelled) return
        setRadiusM(String(s.radiusM))
        setPeriods(s.periods)
        setIntervalMinutes(String(s.intervalMinutes))
        setRunAtTime(s.runAtTime)
        setCurrency(s.currency)
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Не удалось загрузить настройки")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

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

  const intervalSelectValue = INTERVAL_PRESETS.some((p) => String(p.minutes) === intervalMinutes)
    ? intervalMinutes
    : "custom"

  const handleSave = async () => {
    if (periods.length === 0) {
      toast.error("Выберите хотя бы один период проживания")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/modules/pricing/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          radiusM: parseInt(radiusM, 10) || 1000,
          periods,
          intervalMinutes: parseInt(intervalMinutes, 10) || 1440,
          runAtTime,
          currency,
        }),
      })
      if (res.status === 403) {
        toast.error("Настройки может менять только директор")
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось сохранить настройки")
        return
      }
      toast.success("Настройки сохранены")
    } catch {
      toast.error("Не удалось сохранить настройки")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <Settings className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Настройки мониторинга</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Радиус поиска, периоды проживания и расписание прогонов по умолчанию для всех объектов компании
              </p>
            </div>

            {loadError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-4 max-w-2xl">
                {loadError}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card className="max-w-2xl">
                <CardHeader>
                  <CardTitle className="text-base">Дефолты компании</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="radius">Радиус поиска (м)</Label>
                    <Input
                      id="radius"
                      type="number"
                      min={0}
                      value={radiusM}
                      onChange={(e) => setRadiusM(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Периоды проживания (ночей)</Label>
                    <p className="text-xs text-muted-foreground">
                      Активные периоды — нажмите «×», чтобы убрать. Ниже можно добавить.
                    </p>

                    {/* Активные периоды — с кнопкой удаления */}
                    <div className="flex flex-wrap gap-2">
                      {[...periods]
                        .sort((a, b) => a - b)
                        .map((n) => (
                          <span
                            key={n}
                            className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-primary text-primary-foreground"
                          >
                            {n}
                            <button
                              type="button"
                              onClick={() => togglePeriod(n)}
                              className="rounded-full hover:bg-primary-foreground/20 p-0.5"
                              aria-label={`Убрать период ${n}`}
                              title="Убрать"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      {periods.length === 0 && (
                        <span className="text-xs text-muted-foreground">Нет активных периодов</span>
                      )}
                    </div>

                    {/* Быстро добавить стандартные периоды, которых ещё нет */}
                    {DEFAULT_PERIOD_OPTIONS.filter((n) => !periods.includes(n)).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs text-muted-foreground">Добавить:</span>
                        {DEFAULT_PERIOD_OPTIONS.filter((n) => !periods.includes(n)).map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => togglePeriod(n)}
                            className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:bg-muted transition-colors"
                            title={`Добавить период ${n}`}
                          >
                            <Plus className="h-3 w-3" />
                            {n}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Свой период */}
                    <div className="flex items-center gap-2 pt-1">
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
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="interval">Интервал проверки</Label>
                      <Select
                        value={intervalSelectValue}
                        onValueChange={(v) => {
                          if (v !== "custom") setIntervalMinutes(v)
                        }}
                      >
                        <SelectTrigger id="interval" className="w-full">
                          <SelectValue />
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
                      {intervalSelectValue === "custom" && (
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
                      <Label htmlFor="run-at">Время запуска</Label>
                      <Input
                        id="run-at"
                        type="time"
                        value={runAtTime}
                        onChange={(e) => setRunAtTime(e.target.value)}
                        disabled={parseInt(intervalMinutes, 10) < 1440}
                      />
                      <p className="text-xs text-muted-foreground">
                        {parseInt(intervalMinutes, 10) < 1440
                          ? "Не используется при интервале меньше суток"
                          : "МСК"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="currency">Валюта</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger id="currency" className="max-w-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="pt-2">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Сохранить
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
