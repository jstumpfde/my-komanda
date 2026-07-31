"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Send } from "lucide-react"

export type DateMode = "exact" | "range"
export type TripClass = "economy" | "business"
export type StopsFilter = "any" | "nonstop" | "max1"
export type TimeOfDay = "morning" | "day" | "evening" | "night"
export type BaggageFilter = "any" | "checked" | "handOnly"

export interface WatchFormValues {
  originIata: string
  destinationIata: string
  dateMode: DateMode
  departDate: string
  departDateTo: string
  tripClass: TripClass
  maxPrice: string
  targetPrice: string
  stops: StopsFilter
  timeOfDay: TimeOfDay[]
  baggage: BaggageFilter
  minBaggageWeightKg: string
  hideUnknownBaggage: boolean
  notifyTelegram: boolean
  telegramChatId: string
}

export const EMPTY_WATCH_FORM: WatchFormValues = {
  originIata: "",
  destinationIata: "",
  dateMode: "exact",
  departDate: "",
  departDateTo: "",
  tripClass: "economy",
  maxPrice: "",
  targetPrice: "",
  stops: "any",
  timeOfDay: [],
  baggage: "any",
  minBaggageWeightKg: "",
  hideUnknownBaggage: false,
  notifyTelegram: false,
  telegramChatId: "",
}

const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: "morning", label: "Утро (06–12)" },
  { value: "day", label: "День (12–18)" },
  { value: "evening", label: "Вечер (18–24)" },
  { value: "night", label: "Ночь (00–06)" },
]

export function toApiFilters(v: WatchFormValues) {
  return {
    maxPriceRub: v.maxPrice ? Number(v.maxPrice) : undefined,
    timeOfDay: v.timeOfDay.length > 0 ? v.timeOfDay : undefined,
    stops: v.stops,
    sortBy: "price" as const,
    baggage: v.baggage,
    minBaggageWeightKg: v.baggage === "checked" && v.minBaggageWeightKg ? Number(v.minBaggageWeightKg) : undefined,
    hideUnknownBaggage: v.hideUnknownBaggage,
  }
}

export function fromWatch(w: {
  originIata: string
  destinationIata: string
  dateMode: string
  departDate: string
  departDateTo: string | null
  tripClass: string
  targetPriceRub: number | null
  notifyTelegram: boolean
  telegramChatId: string | null
  filtersJson?: Record<string, unknown> | null
}): WatchFormValues {
  const f = (w.filtersJson ?? {}) as Partial<{
    maxPriceRub: number
    timeOfDay: TimeOfDay[]
    stops: StopsFilter
    baggage: BaggageFilter
    minBaggageWeightKg: number
    hideUnknownBaggage: boolean
  }>
  return {
    originIata: w.originIata,
    destinationIata: w.destinationIata,
    dateMode: w.dateMode === "range" ? "range" : "exact",
    departDate: w.departDate,
    departDateTo: w.departDateTo ?? "",
    tripClass: w.tripClass === "business" ? "business" : "economy",
    maxPrice: f.maxPriceRub != null ? String(f.maxPriceRub) : "",
    targetPrice: w.targetPriceRub != null ? String(w.targetPriceRub) : "",
    stops: f.stops ?? "any",
    timeOfDay: f.timeOfDay ?? [],
    baggage: f.baggage ?? "any",
    minBaggageWeightKg: f.minBaggageWeightKg != null ? String(f.minBaggageWeightKg) : "",
    hideUnknownBaggage: f.hideUnknownBaggage ?? false,
    notifyTelegram: w.notifyTelegram,
    telegramChatId: w.telegramChatId ?? "",
  }
}

export function FlightWatchForm({
  initial,
  telegramConfigured,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  initial?: WatchFormValues
  telegramConfigured: boolean
  onSubmit: (values: WatchFormValues) => Promise<void>
  submitLabel: string
  onCancel?: () => void
}) {
  const [values, setValues] = useState<WatchFormValues>(initial ?? EMPTY_WATCH_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  function set<K extends keyof WatchFormValues>(key: K, val: WatchFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  function toggleTimeOfDay(value: TimeOfDay) {
    setValues((v) => ({
      ...v,
      timeOfDay: v.timeOfDay.includes(value) ? v.timeOfDay.filter((t) => t !== value) : [...v.timeOfDay, value],
    }))
  }

  async function handleSubmit() {
    setError(null)
    if (!values.originIata || !values.destinationIata || !values.departDate) {
      setError("Заполните откуда, куда и дату вылета")
      return
    }
    if (values.dateMode === "range" && !values.departDateTo) {
      setError("Укажите дату «до» для диапазона")
      return
    }
    if (values.notifyTelegram && values.telegramChatId && !/^-?\d+$/.test(values.telegramChatId.trim())) {
      setError("Chat ID Telegram должен быть числом")
      return
    }
    setSaving(true)
    try {
      await onSubmit(values)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  async function handleTestTelegram() {
    setTestResult(null)
    if (!values.telegramChatId.trim()) {
      setTestResult("Укажите chat ID")
      return
    }
    setTestSending(true)
    try {
      const res = await fetch("/api/modules/business-assistant/flights/watches/test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: values.telegramChatId.trim() }),
      })
      const data = (await res.json()) as { ok: boolean; reason?: string }
      if (data.ok) setTestResult("Отправлено — проверьте Telegram")
      else if (data.reason === "not_configured") setTestResult("Telegram-бот не настроен на сервере")
      else if (data.reason === "invalid_chat_id") setTestResult("Некорректный chat ID")
      else setTestResult("Не доставлено — проверьте chat ID (боту нужно сначала написать /start)")
    } catch {
      setTestResult("Ошибка отправки")
    } finally {
      setTestSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Откуда (IATA)</Label>
          <Input placeholder="MOW" value={values.originIata} onChange={(e) => set("originIata", e.target.value)} />
        </div>
        <div>
          <Label>Куда (IATA)</Label>
          <Input placeholder="LED" value={values.destinationIata} onChange={(e) => set("destinationIata", e.target.value)} />
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Даты</Label>
        <Tabs value={values.dateMode} onValueChange={(v) => set("dateMode", v as DateMode)}>
          <TabsList>
            <TabsTrigger value="exact">Точные даты</TabsTrigger>
            <TabsTrigger value="range">Диапазон дат</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>{values.dateMode === "range" ? "Дата от" : "Дата вылета"}</Label>
          <Input type="date" value={values.departDate} onChange={(e) => set("departDate", e.target.value)} />
        </div>
        {values.dateMode === "range" && (
          <div>
            <Label>Дата до</Label>
            <Input type="date" value={values.departDateTo} onChange={(e) => set("departDateTo", e.target.value)} />
          </div>
        )}
        <div>
          <Label>Класс</Label>
          <Select value={values.tripClass} onValueChange={(v) => set("tripClass", v as TripClass)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="economy">Эконом</SelectItem>
              <SelectItem value="business">Бизнес</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Макс. цена, ₽ (фильтр)</Label>
          <Input type="number" placeholder="Без ограничения" value={values.maxPrice} onChange={(e) => set("maxPrice", e.target.value)} />
        </div>
        <div>
          <Label>Целевая цена, ₽ (уведомить, когда достигнута)</Label>
          <Input type="number" placeholder="Без цели" value={values.targetPrice} onChange={(e) => set("targetPrice", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Пересадки</Label>
          <Select value={values.stops} onValueChange={(v) => set("stops", v as StopsFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Любые</SelectItem>
              <SelectItem value="nonstop">Без пересадок</SelectItem>
              <SelectItem value="max1">До 1 пересадки</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Багаж</Label>
          <Select value={values.baggage} onValueChange={(v) => set("baggage", v as BaggageFilter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Неважно</SelectItem>
              <SelectItem value="checked">С багажом (≥1 место)</SelectItem>
              <SelectItem value="handOnly">Только ручная кладь</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {values.baggage === "checked" && (
        <div>
          <Label>Мин. вес багажа, кг</Label>
          <Input type="number" placeholder="Без ограничения" value={values.minBaggageWeightKg} onChange={(e) => set("minBaggageWeightKg", e.target.value)} />
        </div>
      )}

      <div>
        <Label className="mb-2 block">Время вылета</Label>
        <div className="flex flex-wrap gap-3">
          {TIME_OF_DAY_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={`watch-tod-${opt.value}`}
                checked={values.timeOfDay.includes(opt.value)}
                onCheckedChange={() => toggleTimeOfDay(opt.value)}
              />
              <Label htmlFor={`watch-tod-${opt.value}`} className="font-normal text-sm">{opt.label}</Label>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border/60 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="font-medium">Уведомлять в Telegram</Label>
            <p className="text-xs text-muted-foreground">Дополнительно к колокольчику — сообщение в личный чат.</p>
          </div>
          <Switch checked={values.notifyTelegram} onCheckedChange={(v) => set("notifyTelegram", v)} />
        </div>
        {values.notifyTelegram && (
          <>
            {!telegramConfigured && (
              <p className="text-xs text-amber-600">Telegram-бот не настроен на сервере — уведомления не будут отправлены.</p>
            )}
            <div>
              <Label>Chat ID</Label>
              <Input
                placeholder="Например, 123456789"
                value={values.telegramChatId}
                onChange={(e) => set("telegramChatId", e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Chat ID вашего диалога с ботом компании — напишите боту /start и возьмите ID.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleTestTelegram}
                disabled={testSending || !values.telegramChatId.trim()}
              >
                {testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                Отправить тест
              </Button>
              {testResult && <span className="text-xs text-muted-foreground">{testResult}</span>}
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Отмена
          </Button>
        )}
      </div>
    </div>
  )
}
