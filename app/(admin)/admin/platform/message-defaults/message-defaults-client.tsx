"use client"

// Редактор платформенных дефолтных текстов сообщений (эталон для всех компаний).
// НЕ хардкод: правится здесь, наследуется компанией и вакансией.

import { useState } from "react"
import { MessageSquare, Save, Loader2, RotateCcw, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { actionUpdateMessageDefaults } from "../actions"
import type { MessageDefaults } from "@/lib/db/schema"

const DELAY_OPTIONS = [
  { v: 0,   label: "Без задержки" },
  { v: 60,  label: "1 мин" },
  { v: 120, label: "2 мин" },
  { v: 300, label: "5 мин" },
  { v: 600, label: "10 мин" },
  { v: 1800, label: "30 мин" },
]

export function MessageDefaultsClient({ initial, seed }: { initial: MessageDefaults; seed: MessageDefaults }) {
  const [form, setForm] = useState<MessageDefaults>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const set = <K extends keyof MessageDefaults>(k: K, v: MessageDefaults[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  async function save() {
    setSaving(true); setError(""); setSaved(false)
    try {
      await actionUpdateMessageDefaults(form)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-6 px-4 sm:px-8 max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Тексты сообщений по умолчанию</h1>
      </div>
      <div className="flex items-start gap-2 text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Эталон для <b>всех компаний</b> платформы. Компания может перебить его в «Настройки найма → Сообщения», а вакансия — в своих полях. Поддерживаются плейсхолдеры <code className="text-xs">{"{{name}}"}</code>, <code className="text-xs">{"{{vacancy}}"}</code>, <code className="text-xs">{"{{demo_link}}"}</code>, <code className="text-xs">{"{{company}}"}</code>.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Первичное сообщение — рабочее время</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs text-muted-foreground">Отправляется первым, когда кандидат откликнулся в рабочие часы.</Label>
          <Textarea rows={4} value={form.inviteMessage} onChange={e => set("inviteMessage", e.target.value)} className="text-sm resize-none" />
          <div className="flex items-center gap-2 pt-1">
            <Label className="text-xs text-muted-foreground">Пауза перед отправкой:</Label>
            <select
              value={DELAY_OPTIONS.some(o => o.v === form.firstMessageDelaySeconds) ? form.firstMessageDelaySeconds : -1}
              onChange={e => set("firstMessageDelaySeconds", Number(e.target.value))}
              className="h-8 px-2 text-sm rounded-md border border-border bg-background"
            >
              {DELAY_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              {!DELAY_OPTIONS.some(o => o.v === form.firstMessageDelaySeconds) && (
                <option value={form.firstMessageDelaySeconds}>{form.firstMessageDelaySeconds} сек</option>
              )}
            </select>
            <Input
              type="number" min={0} max={3600}
              value={form.firstMessageDelaySeconds}
              onChange={e => set("firstMessageDelaySeconds", Math.max(0, Math.min(3600, Number(e.target.value) || 0)))}
              className="h-8 w-24 text-sm"
            />
            <span className="text-xs text-muted-foreground">сек</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Первичное сообщение — нерабочее время</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs text-muted-foreground">Мягкий автоответ, когда отклик пришёл вне рабочих часов.</Label>
          <Textarea rows={4} value={form.offHoursMessage} onChange={e => set("offHoursMessage", e.target.value)} className="text-sm resize-none" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Текст отказа</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs text-muted-foreground">Используется, когда у вакансии не задан свой текст отказа.</Label>
          <Textarea rows={3} value={form.rejectMessage} onChange={e => set("rejectMessage", e.target.value)} className="text-sm resize-none" />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Сохранить
        </Button>
        <Button variant="outline" onClick={() => setForm(seed)} disabled={saving} className="gap-2" title="Заполнить полями из исходного сида платформы">
          <RotateCcw className="w-3.5 h-3.5" /> Сбросить к стандартным
        </Button>
        {saved && <span className="text-xs text-emerald-600 font-medium">Сохранено</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )
}
