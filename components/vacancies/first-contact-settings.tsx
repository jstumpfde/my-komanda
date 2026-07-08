"use client"

// Секция «Коммуникации» → блок «Первый контакт» (консолидация 08.07).
//
// Единственный редактор Сообщения 1 (приглашение) и текста нерабочего
// времени — раньше эти поля дублировались в табе «Сообщения» и в Портрете
// (spec-editor.tsx). Хранилище одно (vacancy_specs.spec, с legacy-бэкфиллом,
// если Портрет ни разу не сохранялся) — пишет через точечный
// PATCH /api/core/spec/[vacancyId]/messaging, который синкает те же
// legacy-поля (aiProcessSettings.inviteMessage, firstMessagesChain[0],
// first_message_off_hours_*), что и раньше редактировали отдельно.

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"
import { Loader2, Save, Send } from "lucide-react"
import { toast } from "sonner"
import { DEFAULT_INVITE_MESSAGE, DEFAULT_OFF_HOURS_MESSAGE } from "@/lib/hh/default-messages"

interface Props {
  vacancyId: string
  /** Вызывается после успешного сохранения (например, refetchVacancy). */
  onSaved?: () => void
}

const INVITE_DELAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15,   label: "15 секунд" },
  { value: 30,   label: "30 секунд" },
  { value: 60,   label: "1 минута" },
  { value: 180,  label: "3 минуты" },
  { value: 900,  label: "15 минут" },
  { value: 1800, label: "30 минут" },
  { value: 3600, label: "1 час" },
]

const OFF_HOURS_DELAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0,   label: "Сразу" },
  { value: 15,  label: "15 секунд" },
  { value: 30,  label: "30 секунд" },
  { value: 60,  label: "1 минута" },
  { value: 180, label: "3 минуты" },
]

const PLACEHOLDER_TOKENS = ["name", "vacancy", "company", "demo_link"]

interface State {
  inviteLetter:         string
  offHoursLetter:       string
  inviteDelaySeconds:   number
  offHoursEnabled:      boolean
  offHoursDelaySeconds: number
}

interface SpecApiLike {
  spec?: {
    inviteLetter?: string
    offHoursLetter?: string
    resumeThresholds?: {
      inviteDelaySeconds?: number
      offHoursEnabled?: boolean
      offHoursDelaySeconds?: number
    }
  }
}

export function FirstContactSettings({ vacancyId, onSaved }: Props) {
  const [state, setState] = useState<State | null>(null)
  const [saved, setSaved] = useState<State | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const inviteRef = useRef<HTMLTextAreaElement | null>(null)
  const offHoursRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/core/spec/${vacancyId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: SpecApiLike) => {
        if (cancelled) return
        const spec = data.spec
        const next: State = {
          inviteLetter:         spec?.inviteLetter ?? "",
          offHoursLetter:       spec?.offHoursLetter ?? "",
          inviteDelaySeconds:   spec?.resumeThresholds?.inviteDelaySeconds ?? 180,
          offHoursEnabled:      spec?.resumeThresholds?.offHoursEnabled ?? true,
          offHoursDelaySeconds: spec?.resumeThresholds?.offHoursDelaySeconds ?? 15,
        }
        setState(next)
        setSaved(next)
      })
      .catch(() => { if (!cancelled) toast.error("Не удалось загрузить настройки первого контакта") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vacancyId])

  const dirty = state !== null && saved !== null && JSON.stringify(state) !== JSON.stringify(saved)

  const handleSave = async () => {
    if (!state) return
    setSaving(true)
    try {
      const res = await fetch(`/api/core/spec/${vacancyId}/messaging`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(state),
      })
      const json = await res.json().catch(() => null) as (State & { error?: string }) | null
      if (!res.ok) throw new Error(json?.error || "Не удалось сохранить")
      const next: State = {
        inviteLetter:         json?.inviteLetter ?? state.inviteLetter,
        offHoursLetter:       json?.offHoursLetter ?? state.offHoursLetter,
        inviteDelaySeconds:   json?.inviteDelaySeconds ?? state.inviteDelaySeconds,
        offHoursEnabled:      json?.offHoursEnabled ?? state.offHoursEnabled,
        offHoursDelaySeconds: json?.offHoursDelaySeconds ?? state.offHoursDelaySeconds,
      }
      setState(next)
      setSaved(next)
      onSaved?.()
      toast.success("Первый контакт сохранён")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  if (loading || !state) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center text-muted-foreground text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Send className="w-4 h-4" />
          Сообщение 1 — приглашение
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Уходит кандидату при авто-приглашении на демо (score ≥ порога Портрета).
          Плейсхолдер ссылки на демо обязателен.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs text-muted-foreground">Задержка перед отправкой</Label>
            <Select
              value={String(state.inviteDelaySeconds)}
              onValueChange={v => setState(s => s && { ...s, inviteDelaySeconds: Number(v) })}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_DELAY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <textarea
            ref={inviteRef}
            className="w-full border rounded-lg p-3 text-sm resize-none h-32 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none leading-relaxed"
            value={state.inviteLetter}
            onChange={e => setState(s => s && { ...s, inviteLetter: e.target.value.slice(0, 2000) })}
            placeholder={DEFAULT_INVITE_MESSAGE}
          />
          <PlaceholderBadges
            getTextarea={() => inviteRef.current}
            placeholders={PLACEHOLDER_TOKENS}
            value={state.inviteLetter}
            onValueChange={next => setState(s => s && { ...s, inviteLetter: next })}
          />
        </div>

        <div className="rounded-md border p-3 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Label className="text-xs font-medium">Нерабочее время</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Мягкое подтверждение вместо приглашения, если отклик пришёл вне рабочих часов вакансии.
              </p>
            </div>
            <Switch
              checked={state.offHoursEnabled}
              onCheckedChange={v => setState(s => s && { ...s, offHoursEnabled: v })}
            />
          </div>
          {state.offHoursEnabled && (<>
            <textarea
              ref={offHoursRef}
              className="w-full border rounded-lg p-3 text-sm resize-none h-24 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none leading-relaxed"
              value={state.offHoursLetter}
              onChange={e => setState(s => s && { ...s, offHoursLetter: e.target.value.slice(0, 2000) })}
              placeholder={DEFAULT_OFF_HOURS_MESSAGE}
            />
            <PlaceholderBadges
              getTextarea={() => offHoursRef.current}
              placeholders={["name", "vacancy", "company"]}
              value={state.offHoursLetter}
              onValueChange={next => setState(s => s && { ...s, offHoursLetter: next })}
            />
            <div className="flex items-center gap-2">
              <Label className="text-[11px] shrink-0">Задержка</Label>
              <Select
                value={String(state.offHoursDelaySeconds)}
                onValueChange={v => setState(s => s && { ...s, offHoursDelaySeconds: Number(v) })}
              >
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OFF_HOURS_DELAY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>)}
        </div>

        {dirty && (
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Сохраняем..." : "Сохранить"}
            </Button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Эти же поля видны в Портрете (пороги резюме) — хранилище одно.
        </p>
      </CardContent>
    </Card>
  )
}
