"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Save, Plus, Trash2, Zap, Info } from "lucide-react"
import type { CrmStage } from "@/lib/crm/deal-stages"

// ── Модель правила автоматизации ─────────────────────────────────────────────

export type AutomationAction =
  | "notify_manager"
  | "create_task"
  | "start_followup"
  | "send_message"

export interface AutomationRule {
  id: string
  enabled: boolean
  stageId: string
  action: AutomationAction
  params?: {
    text?: string
  }
}

// ── Метаданные действий ───────────────────────────────────────────────────────

const ACTION_OPTIONS: { value: AutomationAction; label: string; description: string }[] = [
  {
    value: "notify_manager",
    label: "Уведомить менеджера",
    description: "Менеджер получит уведомление при переходе сделки на стадию",
  },
  {
    value: "create_task",
    label: "Поставить задачу",
    description: "Автоматически создаётся задача для менеджера",
  },
  {
    value: "start_followup",
    label: "Запустить дожим",
    description: "Запускается серия напоминаний и сообщений для клиента",
  },
  {
    value: "send_message",
    label: "Отправить сообщение",
    description: "Клиенту отправляется заданный текст",
  },
]

function getActionLabel(action: AutomationAction): string {
  return ACTION_OPTIONS.find((a) => a.value === action)?.label ?? action
}

// ── Вспомогательные функции ───────────────────────────────────────────────────

function newRule(): AutomationRule {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    stageId: "",
    action: "notify_manager",
    params: {},
  }
}

// ── Компонент ─────────────────────────────────────────────────────────────────

interface SettingsData {
  stages: CrmStage[]
  automations: AutomationRule[] | null
}

export function AutomationsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stages, setStages] = useState<CrmStage[]>([])
  const [rules, setRules] = useState<AutomationRule[]>([])

  // ── Загрузка ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch("/api/modules/sales/settings")
        if (!res.ok) throw new Error()
        const json = await res.json()
        const data = (json?.data ?? json) as SettingsData
        if (!alive) return
        setStages(Array.isArray(data.stages) ? data.stages : [])
        setRules(Array.isArray(data.automations) ? (data.automations as AutomationRule[]) : [])
      } catch {
        if (alive) toast.error("Не удалось загрузить настройки автоматизаций")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // ── Операции над правилами ────────────────────────────────────────────────

  const addRule = () => setRules((prev) => [...prev, newRule()])

  const removeRule = (id: string) =>
    setRules((prev) => prev.filter((r) => r.id !== id))

  const updateRule = (id: string, patch: Partial<AutomationRule>) =>
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )

  const updateParams = (id: string, paramsPatch: Partial<AutomationRule["params"]>) =>
    setRules((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, params: { ...r.params, ...paramsPatch } } : r
      )
    )

  // ── Сохранение ───────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/modules/sales/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automations: rules }),
      })
      if (res.status === 403) {
        toast.error("Изменять автоматизации может только директор компании")
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error)
      }
      const json = await res.json()
      const data = (json?.data ?? json) as SettingsData
      if (Array.isArray(data.automations)) {
        setRules(data.automations as AutomationRule[])
      }
      toast.success("Автоматизации сохранены")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }, [rules])

  // ── Рендер ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Загрузка…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Информационная плашка */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex gap-3 py-4">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Правила срабатывают при переходе сделки на выбранную стадию.
            «Создать задачу» и «Уведомить менеджера» работают сразу. «Написать
            клиенту» и «Запустить дожим» требуют, чтобы у сделки был привязан
            диалог бота (блок «Диалог клиента» в карточке сделки) — иначе действие
            пропускается.
          </p>
        </CardContent>
      </Card>

      {/* Список правил */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Правила автоматизации</CardTitle>
            <CardDescription className="mt-0.5">
              Действия, срабатывающие при переходе сделки на стадию воронки
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addRule}>
            <Plus className="h-4 w-4 mr-1.5" />
            Добавить правило
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Zap className="h-8 w-8 opacity-30" />
              <p className="text-sm">Автоматизаций пока нет</p>
              <Button variant="outline" size="sm" onClick={addRule}>
                <Plus className="h-4 w-4 mr-1.5" />
                Добавить первое правило
              </Button>
            </div>
          ) : (
            rules.map((rule, idx) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={idx}
                stages={stages}
                onToggle={(enabled) => updateRule(rule.id, { enabled })}
                onStageChange={(stageId) => updateRule(rule.id, { stageId })}
                onActionChange={(action) =>
                  updateRule(rule.id, {
                    action,
                    params: action === "send_message" ? { text: "" } : {},
                  })
                }
                onTextChange={(text) => updateParams(rule.id, { text })}
                onRemove={() => removeRule(rule.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Кнопка сохранения */}
      {rules.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Сохранить
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Карточка одного правила ───────────────────────────────────────────────────

interface RuleCardProps {
  rule: AutomationRule
  index: number
  stages: CrmStage[]
  onToggle: (enabled: boolean) => void
  onStageChange: (stageId: string) => void
  onActionChange: (action: AutomationAction) => void
  onTextChange: (text: string) => void
  onRemove: () => void
}

function RuleCard({
  rule,
  index,
  stages,
  onToggle,
  onStageChange,
  onActionChange,
  onTextChange,
  onRemove,
}: RuleCardProps) {
  const stageLabel =
    stages.find((s) => s.id === rule.stageId)?.label ?? null

  return (
    <div
      className={`rounded-lg border p-4 space-y-4 transition-colors ${
        rule.enabled ? "border-border" : "border-border/50 bg-muted/30"
      }`}
    >
      {/* Шапка карточки */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Switch
            checked={rule.enabled}
            onCheckedChange={onToggle}
            aria-label="Включить/выключить правило"
          />
          <span className="text-sm font-medium text-foreground truncate">
            Правило {index + 1}
            {stageLabel && rule.stageId ? (
              <span className="text-muted-foreground font-normal">
                {" "}— {stageLabel} → {getActionLabel(rule.action)}
              </span>
            ) : null}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Удалить правило"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Поля правила */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Стадия */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">При переходе на стадию</Label>
          <Select value={rule.stageId} onValueChange={onStageChange}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите стадию…" />
            </SelectTrigger>
            <SelectContent>
              {stages.length === 0 ? (
                <SelectItem value="__none" disabled>
                  Нет стадий (сначала настройте воронку)
                </SelectItem>
              ) : (
                stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Действие */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Действие</Label>
          <Select value={rule.action} onValueChange={(v) => onActionChange(v as AutomationAction)}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите действие…" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {ACTION_OPTIONS.find((a) => a.value === rule.action)?.description}
          </p>
        </div>
      </div>

      {/* Дополнительные параметры — текст сообщения */}
      {rule.action === "send_message" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Текст сообщения</Label>
          <Textarea
            value={rule.params?.text ?? ""}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Введите текст, который будет отправлен клиенту…"
            className="resize-none min-h-[80px]"
          />
        </div>
      )}
    </div>
  )
}
