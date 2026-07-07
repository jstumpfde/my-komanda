"use client"

// «Настройки очереди» (#36 + #37). Company-level настройки рассылки, показываемые
// в табе «Сообщения» вакансии (применяются ко ВСЕМ вакансиям компании):
//   #36 — окно отправки по типу касания (круглосуточно / по окну) + очерёдность
//        ПО ТИПУ СООБЩЕНИЯ (drag-reorder + стрелки, 07.07) — доп. ключ сортировки
//        внутри группы приоритета кандидата (#37а).
//   #37а — порядок приоритета исходящих ПО ГРУППЕ КАНДИДАТА (drag-reorder + стрелки).
//   #37б — темп между отправками (секунды) — через существующий send-delay API.
//
// НЕ хардкод: все значения приходят/уходят в hiring_defaults_json / companies.
// Дефолты — из lib/messaging/*. Меняет только директор (гейт на API).

import { useEffect, useState } from "react"
import { Loader2, Save, ListOrdered, Clock, ArrowUp, ArrowDown, GripVertical, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

import {
  TOUCH_CATEGORY_LABELS,
  DEFAULT_TOUCH_WINDOWS,
  DEFAULT_MESSAGE_CATEGORY_ORDER,
  normalizeMessageCategoryOrder,
  resolveAllTouchWindowModes,
  type TouchCategory,
  type TouchWindowMode,
  type MessageWindowsConfig,
} from "@/lib/messaging/touch-window"
import {
  DEFAULT_SEND_PRIORITY_ORDER,
  SEND_PRIORITY_LABELS,
  SEND_PRIORITY_DESCRIPTIONS,
  normalizeSendPriorityOrder,
  type SendPriorityGroup,
} from "@/lib/messaging/send-priority"

const MIN_DELAY_SECONDS = 21
const MAX_DELAY_SECONDS = 600
const DEFAULT_DELAY_SECONDS = 31

export function QueueSettingsSection() {
  // #36 окна по типу касания
  const [windows, setWindows] = useState<Record<TouchCategory, TouchWindowMode>>(
    resolveAllTouchWindowModes(null),
  )
  // Очерёдность ПО ТИПУ СООБЩЕНИЯ (07.07) — порядок строк внутри блока «Когда
  // отправлять». Сохраняется вместе с windows (единая кнопка «Сохранить»).
  const [categoryOrder, setCategoryOrder] = useState<TouchCategory[]>(DEFAULT_MESSAGE_CATEGORY_ORDER)
  // #37а порядок приоритета
  const [order, setOrder] = useState<SendPriorityGroup[]>(DEFAULT_SEND_PRIORITY_ORDER)
  // #37б темп отправки
  const [delay, setDelay] = useState<number>(DEFAULT_DELAY_SECONDS)

  const [loaded, setLoaded] = useState(false)
  const [savingWindows, setSavingWindows] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [savingDelay, setSavingDelay] = useState(false)

  // drag state для порядка приоритета
  const [dragGroup, setDragGroup] = useState<SendPriorityGroup | null>(null)
  // drag state для порядка категорий сообщений
  const [dragCategory, setDragCategory] = useState<TouchCategory | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/modules/hr/company/hiring-defaults").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/modules/hr/company/send-delay").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([hd, sd]) => {
      const defaults = (hd?.hiringDefaults ?? {}) as {
        messageWindows?: MessageWindowsConfig
        sendPriorityOrder?: unknown
        messageCategoryOrder?: unknown
      }
      setWindows(resolveAllTouchWindowModes(defaults.messageWindows ?? null))
      setCategoryOrder(normalizeMessageCategoryOrder(defaults.messageCategoryOrder))
      setOrder(normalizeSendPriorityOrder(defaults.sendPriorityOrder))
      if (typeof sd?.sendDelaySeconds === "number") setDelay(sd.sendDelaySeconds)
    }).finally(() => setLoaded(true))
  }, [])

  // ── #36 сохранить окна + порядок категорий ──────────────────────────────
  async function saveWindows() {
    setSavingWindows(true)
    try {
      const res = await fetch("/api/modules/hr/company/hiring-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageWindows: windows, messageCategoryOrder: categoryOrder }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(d?.error || "save_failed")
      }
      toast.success("Окна отправки сохранены")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить")
    } finally {
      setSavingWindows(false)
    }
  }

  // ── reorder helpers (порядок категорий сообщений) ───────────────────────
  function moveCategory(from: number, to: number) {
    if (to < 0 || to >= categoryOrder.length || from === to) return
    setCategoryOrder((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }
  function dropCategoryOn(target: TouchCategory) {
    if (!dragCategory || dragCategory === target) return
    const from = categoryOrder.indexOf(dragCategory)
    const to = categoryOrder.indexOf(target)
    moveCategory(from, to)
    setDragCategory(null)
  }
  function resetWindowsAndOrder() {
    setWindows({ ...DEFAULT_TOUCH_WINDOWS })
    setCategoryOrder(DEFAULT_MESSAGE_CATEGORY_ORDER)
  }

  // ── #37а сохранить порядок ────────────────────────────────────────────
  async function saveOrder() {
    setSavingOrder(true)
    try {
      const res = await fetch("/api/modules/hr/company/hiring-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendPriorityOrder: order }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(d?.error || "save_failed")
      }
      toast.success("Порядок очереди сохранён")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить")
    } finally {
      setSavingOrder(false)
    }
  }

  // ── #37б сохранить темп ───────────────────────────────────────────────
  const delayInvalid = !Number.isInteger(delay) || delay < MIN_DELAY_SECONDS || delay > MAX_DELAY_SECONDS
  async function saveDelay() {
    if (delayInvalid) {
      toast.error(`Задержка должна быть ${MIN_DELAY_SECONDS}–${MAX_DELAY_SECONDS} секунд`)
      return
    }
    setSavingDelay(true)
    try {
      const res = await fetch("/api/modules/hr/company/send-delay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendDelaySeconds: delay }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(d?.error || "save_failed")
      }
      toast.success("Темп отправки сохранён")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить")
    } finally {
      setSavingDelay(false)
    }
  }

  // ── reorder helpers ───────────────────────────────────────────────────
  function moveGroup(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return
    setOrder((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }
  function dropOn(target: SendPriorityGroup) {
    if (!dragGroup || dragGroup === target) return
    const from = order.indexOf(dragGroup)
    const to = order.indexOf(target)
    moveGroup(from, to)
    setDragGroup(null)
  }

  return (
    <div className="space-y-4">
      {/* #36 Окно отправки по типу касания */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Когда отправлять — по типу сообщения
          </CardTitle>
          <CardDescription>
            «Круглосуточно» — сообщение уходит в любое время. «По окну» — только
            в рабочие часы вакансии (расписание). Транзакционные (приглашения,
            подтверждения) обычно круглосуточно; дожимы — по окну. Перетащите
            строки, чтобы задать очерёдность — сверху уходит первым при
            конкуренции за отправку.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {categoryOrder.map((cat, idx) => (
              <div
                key={cat}
                draggable={loaded}
                onDragStart={() => setDragCategory(cat)}
                onDragOver={(e) => { if (dragCategory) e.preventDefault() }}
                onDrop={() => dropCategoryOn(cat)}
                className="flex items-center justify-between gap-3 rounded-md border bg-card px-2.5 py-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
                  <span className="text-xs text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                  <div className="min-w-0">
                    <Label htmlFor={`win-${cat}`} className="text-sm cursor-pointer">
                      {TOUCH_CATEGORY_LABELS[cat]}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {windows[cat] === "always" ? "Круглосуточно" : "Только в рабочие часы вакансии"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col shrink-0">
                  <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0} onClick={() => moveCategory(idx, idx - 1)}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === categoryOrder.length - 1} onClick={() => moveCategory(idx, idx + 1)}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-muted-foreground">По окну</span>
                  <Switch
                    id={`win-${cat}`}
                    checked={windows[cat] === "always"}
                    disabled={!loaded}
                    onCheckedChange={(v) =>
                      setWindows((prev) => ({ ...prev, [cat]: v ? "always" : "window" }))
                    }
                  />
                  <span className="text-[11px] text-muted-foreground">Круглосуточно</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center pt-1">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" disabled={!loaded} onClick={resetWindowsAndOrder}>
              Сбросить по умолчанию
            </Button>
            <Button size="sm" onClick={saveWindows} disabled={savingWindows || !loaded} className="gap-1.5 h-8 text-xs">
              {savingWindows ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* #37а Порядок приоритета исходящих */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListOrdered className="w-4 h-4" />
            Очерёдность отправки
          </CardTitle>
          <CardDescription>
            Кому сообщение уходит первым, когда отправки конкурируют. Перетащите
            группы или используйте стрелки — сверху уходит раньше.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {order.map((group, idx) => (
              <div
                key={group}
                draggable={loaded}
                onDragStart={() => setDragGroup(group)}
                onDragOver={(e) => { if (dragGroup) e.preventDefault() }}
                onDrop={() => dropOn(group)}
                className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-2"
              >
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
                <span className="text-xs text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{SEND_PRIORITY_LABELS[group]}</div>
                  <div className="text-[11px] text-muted-foreground">{SEND_PRIORITY_DESCRIPTIONS[group]}</div>
                </div>
                <div className="flex flex-col shrink-0">
                  <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0} onClick={() => moveGroup(idx, idx - 1)}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === order.length - 1} onClick={() => moveGroup(idx, idx + 1)}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center pt-1">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" disabled={!loaded} onClick={() => setOrder(DEFAULT_SEND_PRIORITY_ORDER)}>
              Сбросить по умолчанию
            </Button>
            <Button size="sm" onClick={saveOrder} disabled={savingOrder || !loaded} className="gap-1.5 h-8 text-xs">
              {savingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* #37б Темп между отправками */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Темп отправки
          </CardTitle>
          <CardDescription>
            Минимальная задержка между отправками сообщений в hh-чат (секунды).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="queue-send-delay" className="text-sm">
              Задержка между отправками (секунд)
            </Label>
            <Input
              id="queue-send-delay"
              type="number"
              min={MIN_DELAY_SECONDS}
              max={MAX_DELAY_SECONDS}
              step={1}
              value={Number.isFinite(delay) ? delay : ""}
              disabled={!loaded}
              onChange={(e) => setDelay(Math.floor(Number(e.target.value)))}
              className="h-9 text-sm"
              aria-invalid={delayInvalid}
            />
            {delayInvalid && (
              <p className="text-[11px] text-destructive">
                Допустимо {MIN_DELAY_SECONDS}–{MAX_DELAY_SECONDS} секунд.
              </p>
            )}
          </div>
          <Alert>
            <AlertDescription className="text-[11px] leading-relaxed">
              Рекомендуем 31 секунду, минимум 21. При меньшем значении растёт риск
              блокировки аккаунта hh.ru за подозрительную активность.
            </AlertDescription>
          </Alert>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveDelay} disabled={savingDelay || !loaded || delayInvalid} className="gap-1.5 h-8 text-xs">
              {savingDelay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
