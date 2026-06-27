"use client"

// Раздел «Сообщения» Настроек найма: дефолтные тексты КОМПАНИИ.
// Перебивают платформенный эталон; вакансия перебивает компанию.
// Пустое поле = наследуется с платформы (показываем платформенный текст
// как placeholder). НЕ хардкод — всё редактируемо.

import { useEffect, useState } from "react"
import { MessageSquare, Save, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { CompanyHiringDefaults, MessageDefaults } from "@/lib/db/schema"

interface Props {
  defaults: CompanyHiringDefaults | null
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}

const DELAY_OPTIONS = [
  { v: -1,  label: "Наследовать с платформы" },
  { v: 0,   label: "Без задержки" },
  { v: 60,  label: "1 мин" },
  { v: 120, label: "2 мин" },
  { v: 300, label: "5 мин" },
  { v: 600, label: "10 мин" },
  { v: 1800, label: "30 мин" },
]

export function MessagesSection({ defaults, onPatch }: Props) {
  const md = defaults?.messageDefaults ?? {}
  const [invite, setInvite]       = useState(md.inviteMessage ?? "")
  const [offHours, setOffHours]   = useState(md.offHoursMessage ?? "")
  const [reject, setReject]       = useState(md.rejectMessage ?? "")
  const [delay, setDelay]         = useState<number>(typeof md.firstMessageDelaySeconds === "number" ? md.firstMessageDelaySeconds : -1)
  const [platform, setPlatform]   = useState<MessageDefaults | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState("")

  // Платформенные дефолты — для placeholder «наследуется».
  useEffect(() => {
    fetch("/api/modules/hr/company/message-defaults")
      .then(r => r.ok ? r.json() : null)
      .then((d: { platform?: MessageDefaults } | null) => { if (d?.platform) setPlatform(d.platform) })
      .catch(() => {})
  }, [])

  // Подхватить значения, когда defaults догрузились.
  useEffect(() => {
    const m = defaults?.messageDefaults ?? {}
    setInvite(m.inviteMessage ?? "")
    setOffHours(m.offHoursMessage ?? "")
    setReject(m.rejectMessage ?? "")
    setDelay(typeof m.firstMessageDelaySeconds === "number" ? m.firstMessageDelaySeconds : -1)
  }, [defaults?.messageDefaults])

  async function save() {
    setSaving(true); setError(""); setSaved(false)
    try {
      // Replace-семантика: пустые поля НЕ кладём → наследуются с платформы.
      const next: Partial<MessageDefaults> = {}
      if (invite.trim())   next.inviteMessage   = invite.trim()
      if (offHours.trim()) next.offHoursMessage = offHours.trim()
      if (reject.trim())   next.rejectMessage   = reject.trim()
      if (delay >= 0)      next.firstMessageDelaySeconds = delay
      await onPatch({ messageDefaults: next })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start gap-2 text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Тексты по умолчанию для <b>всех вакансий вашей компании</b>. Пустое поле = наследуется с платформы. Вакансия может перебить их в своих настройках. Плейсхолдеры: <code className="text-xs">{"{{name}}"}</code>, <code className="text-xs">{"{{vacancy}}"}</code>, <code className="text-xs">{"{{demo_link}}"}</code>.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Первичное сообщение — рабочее время</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={4} value={invite} onChange={e => setInvite(e.target.value)}
            placeholder={platform?.inviteMessage ?? "наследуется с платформы…"} className="text-sm resize-none" />
          <div className="flex items-center gap-2 pt-1">
            <Label className="text-xs text-muted-foreground">Пауза перед отправкой:</Label>
            <select value={DELAY_OPTIONS.some(o => o.v === delay) ? delay : delay}
              onChange={e => setDelay(Number(e.target.value))}
              className="h-8 px-2 text-sm rounded-md border border-border bg-background">
              {DELAY_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Первичное сообщение — нерабочее время</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={4} value={offHours} onChange={e => setOffHours(e.target.value)}
            placeholder={platform?.offHoursMessage ?? "наследуется с платформы…"} className="text-sm resize-none" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Текст отказа</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={reject} onChange={e => setReject(e.target.value)}
            placeholder={platform?.rejectMessage ?? "наследуется с платформы…"} className="text-sm resize-none" />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Сохранить
        </Button>
        {saved && <span className="text-xs text-emerald-600 font-medium">Сохранено</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )
}
